package dev.lowpix.winterworks.endmob;

import dev.lowpix.winterworks.end.Eclipse;
import dev.lowpix.winterworks.registry.EndEffects;
import dev.lowpix.winterworks.registry.EndParticles;
import dev.lowpix.winterworks.registry.EndSounds;
import java.util.EnumSet;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.util.Mth;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.control.FlyingMoveControl;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.ai.navigation.FlyingPathNavigation;
import net.minecraft.world.entity.ai.navigation.PathNavigation;
import net.minecraft.world.entity.ai.util.AirAndWaterRandomPos;
import net.minecraft.world.entity.ai.util.HoverRandomPos;
import net.minecraft.world.entity.animal.FlyingAnimal;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.level.pathfinder.PathType;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * The Enderfly (docs/END_UPDATE.md section 4): a moth-like evolution of the Endermite, born from mature Chorus Cocoons.
 * It flutters about and teleports at random, dodges 3 in 4 projectiles by teleporting away, and dives into players: on
 * contact the player is thrown up to 12 blocks away (chorus-fruit style) and takes 1 damage, and the Enderfly flutters
 * off (10 s before it dives again). During an eclipse it swarms round open End Blooms (24 blocks); secretly, it goes for
 * players who glow with End Glow from 32 blocks away, swarm or not.
 */
public class Enderfly extends Monster implements FlyingAnimal {
    private static final EntityDataAccessor<Boolean> DIVING = SynchedEntityData.defineId(Enderfly.class, EntityDataSerializers.BOOLEAN);
    public static final byte EVENT_TELEPORT = 70;
    public static final int DIVE_COOLDOWN = 200, FLEE_TICKS = 50;
    public static final double THROW_RANGE = 12.0, GLOW_RANGE = 32.0, BLOOM_RANGE = 24.0;
    public static final float DODGE_CHANCE = 0.75f;

    // client animation state (clips in assets/winterworks/lowpix/enderfly.anim.json)
    public final AnimationState flyState = new AnimationState();
    public final AnimationState hoverState = new AnimationState();
    public final AnimationState diveState = new AnimationState();
    public final AnimationState teleportState = new AnimationState();

    private int diveCooldown;
    private int fleeTicks;
    private int teleportCooldown = 100;
    @Nullable
    private Vec3 fleeFrom;
    @Nullable
    private BlockPos bloom;

    public Enderfly(EntityType<? extends Monster> type, Level level) {
        super(type, level);
        this.moveControl = new FlyingMoveControl(this, 20, true);
        this.xpReward = 3;
        setPathfindingMalus(PathType.DANGER_FIRE, -1.0f);
        setPathfindingMalus(PathType.WATER, -1.0f);
        setPathfindingMalus(PathType.WATER_BORDER, 16.0f);
        setPathfindingMalus(PathType.FENCE, -1.0f);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return Monster.createMonsterAttributes().add(Attributes.MAX_HEALTH, 10.0).add(Attributes.FLYING_SPEED, 0.55)
                .add(Attributes.MOVEMENT_SPEED, 0.3).add(Attributes.ATTACK_DAMAGE, 1.0).add(Attributes.FOLLOW_RANGE, 16.0);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        super.defineSynchedData(builder);
        builder.define(DIVING, false);
    }

    @Override
    protected PathNavigation createNavigation(Level level) {
        FlyingPathNavigation nav = new FlyingPathNavigation(this, level) {
            @Override
            public boolean isStableDestination(BlockPos pos) {
                return !this.level.getBlockState(pos.below()).isAir();
            }
        };
        nav.setCanOpenDoors(false);
        nav.setCanFloat(false);
        nav.setCanPassDoors(true);
        return nav;
    }

    @Override
    protected void registerGoals() {
        goalSelector.addGoal(0, new FloatGoal(this));
        goalSelector.addGoal(1, new DiveGoal());
        goalSelector.addGoal(2, new FleeGoal());
        goalSelector.addGoal(3, new SwarmBloomGoal());
        goalSelector.addGoal(5, new HoverWanderGoal());
        goalSelector.addGoal(7, new LookAtPlayerGoal(this, Player.class, 8.0f));
        goalSelector.addGoal(8, new RandomLookAroundGoal(this));
        targetSelector.addGoal(0, new HurtByTargetGoal(this));
        // the secret: End Glow draws them from twice as far, and over any bloom
        targetSelector.addGoal(1, new NearestAttackableTargetGoal<>(this, Player.class, 10, true, false, Enderfly::glows) {
            @Override
            protected double getFollowDistance() {
                return GLOW_RANGE;
            }
        });
        targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(this, Player.class, 10, true, false, p -> !isSwarming()));
    }

    /** End Glow (from eating an End Bulb). */
    public static boolean glows(@Nullable LivingEntity e) {
        return e != null && e.hasEffect(EndEffects.END_GLOW);
    }

    public boolean isDiving() {
        return entityData.get(DIVING);
    }

    private void setDiving(boolean diving) {
        entityData.set(DIVING, diving);
    }

    /** Swarming an open End Bloom during an eclipse (then it leaves players alone, unless they glow). */
    public boolean isSwarming() {
        return bloom != null;
    }

    @Nullable
    public BlockPos swarmBloom() {
        return bloom;
    }

    private boolean wantsToDive(@Nullable LivingEntity t) {
        return t != null && t.isAlive() && (glows(t) || !isSwarming()) && !(t instanceof Player p && !EndMobFeature.isSurvivalLike(p));
    }

    // ------------------------------------------------------------------------------------------------- ticking

    @Override
    public void tick() {
        super.tick();
        if (level().isClientSide) {
            clientTick();
            return;
        }
        if (diveCooldown > 0) {
            diveCooldown--;
        }
        if (fleeTicks > 0) {
            fleeTicks--;
        }
        if (teleportCooldown > 0) {
            teleportCooldown--;
        } else if (random.nextInt(240) == 0 && !isDiving() && !isNoAi()) {
            teleportCooldown = 120 + random.nextInt(200);
            teleportAway(8);   // they blink about at random
        }
        if (!onGround() && random.nextInt(40) == 0) {
            playSound(EndSounds.ENDERFLY_FLUTTER, 0.25f, 0.9f + random.nextFloat() * 0.3f);
        }
    }

    private void clientTick() {
        boolean moving = getDeltaMovement().lengthSqr() > 2.5e-4 || !onGround() && getDeltaMovement().y < -0.01;
        flyState.animateWhen(moving && !isDiving(), tickCount);
        hoverState.animateWhen(!moving && !isDiving(), tickCount);
        if (isDiving() && !diveState.isStarted()) {
            diveState.start(tickCount);
        } else if (!isDiving()) {
            diveState.stop();
        }
        if (random.nextInt(30) == 0) {
            level().addParticle(EndParticles.ENDERFLY_SCALE, getRandomX(0.4), getRandomY(), getRandomZ(0.4), 0, -0.02, 0);
        }
    }

    @Override
    public void handleEntityEvent(byte id) {
        if (id == EVENT_TELEPORT) {
            teleportState.start(tickCount);
            for (int i = 0; i < 8; i++) {   // scales shed where it was
                level().addParticle(EndParticles.ENDERFLY_SCALE, getRandomX(0.5), getRandomY(), getRandomZ(0.5),
                        (random.nextDouble() - 0.5) * 0.08, 0.02, (random.nextDouble() - 0.5) * 0.08);
            }
        } else {
            super.handleEntityEvent(id);
        }
    }

    /** Blinks to a free spot in the air up to `range` blocks away. */
    public boolean teleportAway(double range) {
        if (level().isClientSide || !isAlive()) {
            return false;
        }
        Vec3 from = position();
        for (int i = 0; i < 24; i++) {
            double x = getX() + (random.nextDouble() - 0.5) * 2 * range;
            double y = Mth.clamp(getY() + (random.nextDouble() - 0.4) * range, level().getMinBuildHeight() + 1, level().getMaxBuildHeight() - 2);
            double z = getZ() + (random.nextDouble() - 0.5) * 2 * range;
            BlockPos at = BlockPos.containing(x, y, z);
            if (!level().hasChunkAt(at) || !level().getFluidState(at).isEmpty()) {
                continue;
            }
            AABB box = getBoundingBox().move(x - getX(), y - getY(), z - getZ());
            if (!level().noCollision(this, box) || level().containsAnyLiquid(box) || !groundBelow(at, 12)) {
                continue;
            }
            level().broadcastEntityEvent(this, EVENT_TELEPORT);
            teleportTo(x, y, z);
            getNavigation().stop();
            level().gameEvent(GameEvent.TELEPORT, from, GameEvent.Context.of(this));
            level().playSound(null, from.x, from.y, from.z, EndSounds.ENDERFLY_TELEPORT, getSoundSource(), 0.8f, 1.2f);
            playSound(EndSounds.ENDERFLY_TELEPORT, 0.8f, 1.4f);
            if (level() instanceof ServerLevel server) {
                server.sendParticles(ParticleTypes.PORTAL, from.x, from.y + 0.3, from.z, 12, 0.2, 0.2, 0.2, 0.3);
            }
            return true;
        }
        return false;
    }

    /** Some ground within `depth` blocks below (so they don't blink out over the void). */
    private boolean groundBelow(BlockPos at, int depth) {
        BlockPos.MutableBlockPos m = at.mutable();
        for (int i = 0; i < depth && m.getY() > level().getMinBuildHeight(); i++) {
            m.move(0, -1, 0);
            if (!level().getBlockState(m).isAir()) {
                return true;
            }
        }
        return false;
    }

    // ------------------------------------------------------------------------------------------------- combat

    @Override
    public boolean hurt(DamageSource source, float amount) {
        if (!level().isClientSide && !isInvulnerableTo(source) && source.is(DamageTypeTags.IS_PROJECTILE)
                && random.nextFloat() < DODGE_CHANCE && teleportAway(10)) {
            return false;   // dodged: it's gone before the arrow lands
        }
        return super.hurt(source, amount);
    }

    /** The dive's hit: the target is thrown up to 12 blocks away and stung for 1; the Enderfly flutters off. */
    public void strike(LivingEntity target) {
        target.hurt(damageSources().mobAttack(this), 1.0f);
        chorusTeleport(target, THROW_RANGE);
        playSound(EndSounds.ENDERFLY_DIVE, 1.0f, 1.2f);
        diveCooldown = DIVE_COOLDOWN;
        fleeTicks = FLEE_TICKS;
        fleeFrom = target.position();
        setDiving(false);
    }

    /** Chorus fruit's teleport, at most `range` blocks away, onto safe ground. */
    public static boolean chorusTeleport(LivingEntity e, double range) {
        Level level = e.level();
        if (level.isClientSide) {
            return false;
        }
        Vec3 from = e.position();
        for (int i = 0; i < 24; i++) {
            double x = e.getX() + (e.getRandom().nextDouble() - 0.5) * 2 * range * 0.8;
            double y = Mth.clamp(e.getY() + (e.getRandom().nextInt(13) - 6), level.getMinBuildHeight(),
                    level.getMinBuildHeight() + ((ServerLevel) level).getLogicalHeight() - 1);
            double z = e.getZ() + (e.getRandom().nextDouble() - 0.5) * 2 * range * 0.8;
            if (e.isPassenger()) {
                e.stopRiding();
            }
            if (e.randomTeleport(x, y, z, true)) {
                if (e.position().distanceTo(from) > range) {
                    e.teleportTo(from.x, from.y, from.z);   // fell too far down a cliff: try another spot
                    continue;
                }
                level.gameEvent(GameEvent.TELEPORT, from, GameEvent.Context.of(e));
                level.playSound(null, from.x, from.y, from.z, SoundEvents.CHORUS_FRUIT_TELEPORT, SoundSource.PLAYERS, 1.0f, 1.0f);
                e.playSound(SoundEvents.CHORUS_FRUIT_TELEPORT, 1.0f, 1.0f);
                e.resetFallDistance();
                return true;
            }
        }
        return false;
    }

    // ------------------------------------------------------------------------------------------------- flight

    @Override
    public boolean isFlying() {
        return !onGround();
    }

    @Override
    public boolean causeFallDamage(float distance, float multiplier, DamageSource source) {
        return false;
    }

    @Override
    protected void checkFallDamage(double y, boolean onGround, BlockState state, BlockPos pos) {
    }

    @Override
    public float getWalkTargetValue(BlockPos pos, LevelReader level) {
        return level.getBlockState(pos).isAir() ? 10.0f : 0.0f;
    }

    // ------------------------------------------------------------------------------------------------- save, sounds

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        tag.putInt("DiveCooldown", diveCooldown);
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        diveCooldown = tag.getInt("DiveCooldown");
    }

    @Override
    protected SoundEvent getAmbientSound() {
        return EndSounds.ENDERFLY_AMBIENT;
    }

    @Override
    protected SoundEvent getHurtSound(DamageSource source) {
        return EndSounds.ENDERFLY_HURT;
    }

    @Override
    protected SoundEvent getDeathSound() {
        return EndSounds.ENDERFLY_DEATH;
    }

    @Override
    protected float getSoundVolume() {
        return 0.6f;
    }

    // ------------------------------------------------------------------------------------------------- goals

    /** Flies straight at the target; on contact, {@link #strike}. */
    class DiveGoal extends Goal {
        DiveGoal() {
            setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
        }

        @Override
        public boolean canUse() {
            return diveCooldown <= 0 && fleeTicks <= 0 && wantsToDive(getTarget());
        }

        @Override
        public boolean canContinueToUse() {
            return canUse() && distanceToSqr(getTarget()) < 40 * 40;
        }

        @Override
        public void stop() {
            setDiving(false);
        }

        @Override
        public boolean requiresUpdateEveryTick() {
            return true;
        }

        @Override
        public void tick() {
            LivingEntity t = getTarget();
            if (t == null) {
                return;
            }
            getLookControl().setLookAt(t, 30f, 30f);
            double d = distanceToSqr(t);
            boolean close = d < 5 * 5;
            moveControl.setWantedPosition(t.getX(), t.getY(0.6), t.getZ(), close ? 2.2 : 1.3);
            if (close && !isDiving()) {
                setDiving(true);
                playSound(EndSounds.ENDERFLY_DIVE, 0.8f, 1.0f);
            }
            if (getBoundingBox().inflate(0.3).intersects(t.getBoundingBox())) {
                strike(t);
            }
        }
    }

    /** After a dive: flutters up and away for a moment. */
    class FleeGoal extends Goal {
        FleeGoal() {
            setFlags(EnumSet.of(Flag.MOVE));
        }

        @Override
        public boolean canUse() {
            return fleeTicks > 0;
        }

        @Override
        public void start() {
            Vec3 from = fleeFrom != null ? fleeFrom : position();
            Vec3 away = position().subtract(from).multiply(1, 0, 1);
            away = away.lengthSqr() < 1e-4 ? new Vec3(random.nextDouble() - 0.5, 0, random.nextDouble() - 0.5) : away;
            Vec3 to = position().add(away.normalize().scale(8)).add(0, 3 + random.nextInt(3), 0);
            moveControl.setWantedPosition(to.x, to.y, to.z, 1.6);
        }
    }

    /** During an eclipse: circles the nearest open End Bloom within 24 blocks, like moths round a lamp. */
    class SwarmBloomGoal extends Goal {
        private int search, waypoint;
        private float angle;

        SwarmBloomGoal() {
            setFlags(EnumSet.of(Flag.MOVE));
        }

        @Override
        public boolean canUse() {
            if (fleeTicks > 0 || !Eclipse.isActive(level()) || !(level() instanceof ServerLevel server)) {
                bloom = null;
                return false;
            }
            if (bloom != null && isOpenBloom(bloom)) {
                return !glows(getTarget());
            }
            bloom = null;
            if (--search > 0) {
                return false;
            }
            search = 40 + random.nextInt(20);
            bloom = EndMobFeature.findOpenBloom(server, blockPosition(), (int) BLOOM_RANGE);
            return bloom != null && !glows(getTarget());
        }

        @Override
        public boolean canContinueToUse() {
            return bloom != null && fleeTicks <= 0 && Eclipse.isActive(level()) && isOpenBloom(bloom) && !glows(getTarget());
        }

        private boolean isOpenBloom(BlockPos pos) {
            BlockState s = level().getBlockState(pos);
            return s.getBlock() instanceof EndBloomBlock && s.getValue(EndBloomBlock.OPEN);
        }

        @Override
        public void start() {
            angle = random.nextFloat() * Mth.TWO_PI;
            waypoint = 0;
            if (getTarget() != null && !glows(getTarget())) {
                setTarget(null);   // the bloom is more interesting
            }
        }

        @Override
        public void stop() {
            if (!Eclipse.isActive(level())) {
                bloom = null;
            }
        }

        @Override
        public void tick() {
            if (bloom == null || --waypoint > 0) {
                return;
            }
            waypoint = 8 + random.nextInt(8);
            angle += 0.7f + random.nextFloat() * 0.5f;
            double r = 1.0 + random.nextDouble() * 1.6;
            moveControl.setWantedPosition(bloom.getX() + 0.5 + Mth.cos(angle) * r, bloom.getY() + 0.8 + random.nextDouble() * 1.8,
                    bloom.getZ() + 0.5 + Mth.sin(angle) * r, 0.7);
        }
    }

    /** Bee-style hovering wander. */
    class HoverWanderGoal extends Goal {
        HoverWanderGoal() {
            setFlags(EnumSet.of(Flag.MOVE));
        }

        @Override
        public boolean canUse() {
            return getNavigation().isDone() && random.nextInt(10) == 0;
        }

        @Override
        public boolean canContinueToUse() {
            return getNavigation().isInProgress();
        }

        @Override
        public void start() {
            Vec3 dir = getViewVector(0.0f);
            Vec3 to = HoverRandomPos.getPos(Enderfly.this, 8, 7, dir.x, dir.z, Mth.HALF_PI, 3, 1);
            if (to == null) {
                to = AirAndWaterRandomPos.getPos(Enderfly.this, 8, 4, -2, dir.x, dir.z, Mth.HALF_PI);
            }
            if (to != null) {
                getNavigation().moveTo(getNavigation().createPath(BlockPos.containing(to), 1), 1.0);
            }
        }
    }
}
