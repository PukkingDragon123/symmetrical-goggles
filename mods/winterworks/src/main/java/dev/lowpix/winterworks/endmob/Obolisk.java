package dev.lowpix.winterworks.endmob;

import dev.lowpix.winterworks.registry.EndEntities;
import dev.lowpix.winterworks.registry.EndSounds;
import java.util.EnumSet;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.tags.ItemTags;
import net.minecraft.util.Mth;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.SpawnGroupData;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.ServerLevelAccessor;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * The Obolisk (docs/END_UPDATE.md section 9): a living 2 x 4 block of obsidian with a grumpy carved face. It lies
 * disguised as an obsidian pillar (leaning, brow shut, not moving) and rises (2 s) when a survival player comes within
 * 6 blocks or it is hit; with no target for 30 s it settles back down (1.5 s). It slams (range 3.5): 14 damage, heavy
 * knockback, and the blocks round the impact break (radius 2: hardness under 50, not
 * `#winterworks:obolisk_unbreakable`, if mobGriefing). Only a melee pickaxe hit does full damage; everything else does
 * 15%.
 */
public class Obolisk extends Monster {
    public enum Phase { DISGUISED, RISING, AWAKE, SLAMMING, SETTLING }

    private static final EntityDataAccessor<Byte> PHASE = SynchedEntityData.defineId(Obolisk.class, EntityDataSerializers.BYTE);
    public static final int RISE_TICKS = 40, SETTLE_TICKS = 30, SLAM_TICKS = 24, SLAM_IMPACT = 14, SETTLE_AFTER = 600;
    public static final double WAKE_RANGE = 6.0, SLAM_RANGE = 3.5;
    public static final float SLAM_DAMAGE = 14f, OTHER_DAMAGE = 0.15f;
    public static final int BREAK_RADIUS = 2;
    public static final float BREAK_HARDNESS = 50f;

    // client animation state (clips in assets/winterworks/lowpix/obolisk.anim.json)
    public final AnimationState disguisedState = new AnimationState();
    public final AnimationState riseState = new AnimationState();
    public final AnimationState idleState = new AnimationState();
    public final AnimationState slamState = new AnimationState();
    public final AnimationState settleState = new AnimationState();

    private int phaseTicks;
    /** Client: tickCount when the current phase began (for the renderer). */
    public int phaseStartTick;
    private int noTargetTicks;
    private int slamCooldown;
    @Nullable
    private LivingEntity waker;

    public Obolisk(EntityType<? extends Monster> type, Level level) {
        super(type, level);
        this.xpReward = 20;
    }

    public static AttributeSupplier.Builder createAttributes() {
        return Monster.createMonsterAttributes().add(Attributes.MAX_HEALTH, 100.0).add(Attributes.ARMOR, 15.0)
                .add(Attributes.MOVEMENT_SPEED, 0.2).add(Attributes.ATTACK_DAMAGE, SLAM_DAMAGE).add(Attributes.FOLLOW_RANGE, 24.0)
                .add(Attributes.KNOCKBACK_RESISTANCE, 1.0).add(Attributes.STEP_HEIGHT, 1.0);
    }

    // ------------------------------------------------------------------------------------------------ the API

    /** Spawns a disguised Obolisk (an obsidian rock) at `pos`; structures and the bosses use this. */
    public static Obolisk spawnDisguised(ServerLevel level, BlockPos pos) {
        Obolisk o = create(level, pos, MobSpawnType.STRUCTURE);
        if (o != null) {
            o.setPhase(Phase.DISGUISED);
            o.setPersistenceRequired();
            level.addFreshEntityWithPassengers(o);
        }
        return o;
    }

    /** Spawns an Obolisk already risen and hunting `target` (may be null). */
    public static Obolisk spawnAwake(ServerLevel level, BlockPos pos, @Nullable LivingEntity target) {
        Obolisk o = create(level, pos, MobSpawnType.MOB_SUMMONED);
        if (o != null) {
            o.setPhase(Phase.AWAKE);
            o.setPersistenceRequired();
            if (target != null) {
                o.setTarget(target);
            }
            level.addFreshEntityWithPassengers(o);
        }
        return o;
    }

    @Nullable
    private static Obolisk create(ServerLevel level, BlockPos pos, MobSpawnType reason) {
        Obolisk o = EndEntities.OBOLISK.create(level);
        if (o == null) {
            return null;
        }
        // disguised rocks lie square to the world
        o.moveTo(pos.getX() + 0.5, pos.getY(), pos.getZ() + 0.5, level.random.nextInt(4) * 90f, 0f);
        o.setYHeadRot(o.getYRot());
        o.yBodyRot = o.getYRot();
        o.finalizeSpawn(level, level.getCurrentDifficultyAt(pos), reason, null);
        return o;
    }

    @Override
    public SpawnGroupData finalizeSpawn(ServerLevelAccessor level, DifficultyInstance difficulty, MobSpawnType reason,
                                        @Nullable SpawnGroupData data) {
        setPhase(Phase.DISGUISED);   // natural spawns (and eggs) start as a rock
        float yaw = Math.round(getYRot() / 90f) * 90f;
        setYRot(yaw);
        yBodyRot = yHeadRot = yaw;
        return super.finalizeSpawn(level, difficulty, reason, data);
    }

    // ------------------------------------------------------------------------------------------------ phases

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        super.defineSynchedData(builder);
        builder.define(PHASE, (byte) Phase.AWAKE.ordinal());
    }

    public Phase phase() {
        return Phase.values()[Mth.clamp(entityData.get(PHASE), 0, Phase.values().length - 1)];
    }

    public void setPhase(Phase p) {
        entityData.set(PHASE, (byte) p.ordinal());
        phaseTicks = 0;
        if (p == Phase.AWAKE) {
            noTargetTicks = 0;
        }
    }

    public boolean isDisguised() {
        return phase() == Phase.DISGUISED;
    }

    @Override
    public void onSyncedDataUpdated(EntityDataAccessor<?> key) {
        super.onSyncedDataUpdated(key);
        if (PHASE.equals(key) && level().isClientSide) {
            Phase p = phase();
            phaseStartTick = tickCount;
            disguisedState.animateWhen(p == Phase.DISGUISED, tickCount);
            switch (p) {
                case RISING -> riseState.start(tickCount);
                case SLAMMING -> slamState.start(tickCount);
                case SETTLING -> settleState.start(tickCount);
                default -> {
                }
            }
            if (p != Phase.RISING) {
                riseState.stop();
            }
            if (p != Phase.SETTLING) {
                settleState.stop();
            }
            if (p != Phase.SLAMMING) {
                slamState.stop();
            }
        }
    }

    /** Only awake does it move (disguised it is a rock; rising, slamming and settling it is busy). */
    @Override
    protected boolean isImmobile() {
        return super.isImmobile() || phase() != Phase.AWAKE;
    }

    @Override
    public boolean isPushable() {
        return phase() == Phase.AWAKE && super.isPushable();
    }

    /** Starts rising (and remembers who woke it, to go after them). */
    public void wake(@Nullable LivingEntity by) {
        Phase p = phase();
        if (p == Phase.DISGUISED || p == Phase.SETTLING) {
            waker = by;
            setPhase(Phase.RISING);
            playSound(EndSounds.OBOLISK_RISE, 2.0f, 1.0f);
            if (level() instanceof ServerLevel server) {
                server.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.OBSIDIAN.defaultBlockState()),
                        getX(), getY() + 0.2, getZ(), 30, 0.9, 0.2, 0.9, 0.1);
            }
        }
    }

    /** Settles back down into a rock. */
    public void settle() {
        if (phase() == Phase.AWAKE) {
            setTarget(null);
            getNavigation().stop();
            setPhase(Phase.SETTLING);
            playSound(EndSounds.OBOLISK_SETTLE, 1.5f, 1.0f);
        }
    }

    @Override
    public void tick() {
        super.tick();
        if (level().isClientSide) {
            idleState.animateWhen(phase() == Phase.AWAKE && getDeltaMovement().horizontalDistanceSqr() < 1e-4, tickCount);
            return;
        }
        phaseTicks++;
        if (slamCooldown > 0) {
            slamCooldown--;
        }
        switch (phase()) {
            case DISGUISED -> {
                setDeltaMovement(getDeltaMovement().multiply(0, 1, 0));
                if (tickCount % 5 == 0) {
                    Player p = level().getNearestPlayer(getX(), getY(), getZ(), WAKE_RANGE,
                            e -> e instanceof Player pl && EndMobFeature.isSurvivalLike(pl));
                    if (p != null) {
                        wake(p);
                    }
                }
            }
            case RISING -> {
                if (phaseTicks >= RISE_TICKS) {
                    setPhase(Phase.AWAKE);
                    if (waker != null && waker.isAlive()) {
                        setTarget(waker);
                    }
                    waker = null;
                }
            }
            case SETTLING -> {
                if (phaseTicks >= SETTLE_TICKS) {
                    setPhase(Phase.DISGUISED);
                    float yaw = Math.round(getYRot() / 90f) * 90f;
                    setYRot(yaw);
                    yBodyRot = yHeadRot = yaw;
                }
            }
            case SLAMMING -> {
                if (phaseTicks == SLAM_IMPACT) {
                    slamImpact();
                }
                if (phaseTicks >= SLAM_TICKS) {
                    setPhase(Phase.AWAKE);
                }
            }
            case AWAKE -> {
                LivingEntity t = getTarget();
                noTargetTicks = t == null || !t.isAlive() ? noTargetTicks + 1 : 0;
                if (noTargetTicks >= SETTLE_AFTER) {
                    settle();
                }
            }
        }
    }

    // ------------------------------------------------------------------------------------------------ the slam

    /** Rears up and slams down (the impact comes {@link #SLAM_IMPACT} ticks in). */
    public void startSlam() {
        if (phase() == Phase.AWAKE) {
            getNavigation().stop();
            setPhase(Phase.SLAMMING);
            slamCooldown = 40;
        }
    }

    /** Where the slam lands: just in front of it. */
    public Vec3 impactPoint() {
        return position().add(Vec3.directionFromRotation(0, yBodyRot).scale(1.6));
    }

    private void slamImpact() {
        if (!(level() instanceof ServerLevel level)) {
            return;
        }
        Vec3 at = impactPoint();
        playSound(EndSounds.OBOLISK_SLAM, 2.5f, 0.9f + random.nextFloat() * 0.15f);
        level.sendParticles(ParticleTypes.EXPLOSION, at.x, at.y + 0.3, at.z, 2, 0.6, 0.1, 0.6, 0);
        level.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, getBlockStateOn()), at.x, at.y + 0.2, at.z, 60, 1.5, 0.2, 1.5, 0.2);
        for (LivingEntity e : level.getEntitiesOfClass(LivingEntity.class, getBoundingBox().inflate(SLAM_RANGE + 1),
                e -> e != this && e.isAlive() && !(e instanceof Obolisk))) {
            double d = Math.min(e.position().distanceTo(at), e.distanceTo(this) - getBbWidth() / 2);
            if (d > SLAM_RANGE || e instanceof Player p && p.isSpectator()) {
                continue;
            }
            if (e.hurt(damageSources().mobAttack(this), SLAM_DAMAGE)) {
                Vec3 push = e.position().subtract(at).multiply(1, 0, 1);
                push = push.lengthSqr() < 1e-4 ? Vec3.directionFromRotation(0, yBodyRot) : push.normalize();
                double k = 2.2 * Math.max(0.0, 1.0 - e.getAttributeValue(Attributes.KNOCKBACK_RESISTANCE));
                e.setDeltaMovement(e.getDeltaMovement().add(push.x * k, 0.6 * Math.max(0.3, k / 2.2), push.z * k));
                e.hurtMarked = true;
            }
        }
        if (level.getGameRules().getBoolean(GameRules.RULE_MOBGRIEFING)) {
            breakBlocks(level, BlockPos.containing(at));
        }
    }

    /** Breaks the blocks within {@link #BREAK_RADIUS} of `center` that a slam can break. */
    public int breakBlocks(ServerLevel level, BlockPos center) {
        int broken = 0;
        for (BlockPos p : BlockPos.betweenClosed(center.offset(-BREAK_RADIUS, -BREAK_RADIUS, -BREAK_RADIUS),
                center.offset(BREAK_RADIUS, BREAK_RADIUS, BREAK_RADIUS))) {
            if (p.distSqr(center) > BREAK_RADIUS * BREAK_RADIUS) {
                continue;
            }
            BlockState s = level.getBlockState(p);
            if (canBreak(s, level, p) && level.destroyBlock(p, true, this)) {
                broken++;
            }
        }
        return broken;
    }

    public static boolean canBreak(BlockState s, ServerLevel level, BlockPos p) {
        if (s.isAir() || !s.getFluidState().isEmpty() && s.getFluidState().isSource()) {
            return false;
        }
        float hardness = s.getDestroySpeed(level, p);
        return hardness >= 0 && hardness < BREAK_HARDNESS && !s.is(EndMobFeature.OBOLISK_UNBREAKABLE);
    }

    // ------------------------------------------------------------------------------------------------ damage

    /** A melee hit with a pickaxe: full damage. Anything else: 15%. */
    public static boolean isPickaxeHit(DamageSource source) {
        return source.getEntity() instanceof LivingEntity attacker && source.getDirectEntity() == attacker && !source.is(DamageTypeTags.IS_PROJECTILE)
                && attacker.getMainHandItem().is(ItemTags.PICKAXES);
    }

    @Override
    public boolean hurt(DamageSource source, float amount) {
        if (level().isClientSide || isInvulnerableTo(source)) {
            return super.hurt(source, amount);
        }
        if (!source.is(DamageTypeTags.BYPASSES_INVULNERABILITY) && !isPickaxeHit(source)) {
            amount *= OTHER_DAMAGE;
        }
        boolean hurt = super.hurt(source, amount);
        if (!isDeadOrDying()) {
            wake(source.getEntity() instanceof LivingEntity le ? le : null);
        }
        return hurt;
    }

    @Override
    public boolean doHurtTarget(net.minecraft.world.entity.Entity target) {
        startSlam();
        return false;
    }

    // ------------------------------------------------------------------------------------------------ goals

    @Override
    protected void registerGoals() {
        goalSelector.addGoal(1, new SlamGoal());
        goalSelector.addGoal(6, new WaterAvoidingRandomStrollGoal(this, 0.6));
        goalSelector.addGoal(7, new LookAtPlayerGoal(this, Player.class, 10f));
        goalSelector.addGoal(8, new RandomLookAroundGoal(this));
        targetSelector.addGoal(1, new HurtByTargetGoal(this, Obolisk.class));
        targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(this, Player.class, true));
    }

    /** Walks up to the target and slams when it is within 3.5 blocks. */
    class SlamGoal extends Goal {
        private int repath;

        SlamGoal() {
            setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
        }

        @Override
        public boolean canUse() {
            LivingEntity t = getTarget();
            return phase() == Phase.AWAKE && t != null && t.isAlive();
        }

        @Override
        public boolean requiresUpdateEveryTick() {
            return true;
        }

        @Override
        public void stop() {
            getNavigation().stop();
        }

        @Override
        public void tick() {
            LivingEntity t = getTarget();
            if (t == null) {
                return;
            }
            getLookControl().setLookAt(t, 20f, 20f);
            double d = distanceTo(t) - getBbWidth() / 2;
            if (d <= SLAM_RANGE && slamCooldown <= 0 && hasLineOfSight(t)) {
                setYRot((float) (Mth.atan2(t.getZ() - getZ(), t.getX() - getX()) * Mth.RAD_TO_DEG) - 90f);
                yBodyRot = getYRot();
                startSlam();
            } else if (--repath <= 0) {
                repath = 10;
                getNavigation().moveTo(t, 1.0);
            }
        }
    }

    // ------------------------------------------------------------------------------------------------ save, sounds

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        Phase p = phase();
        tag.putBoolean("Disguised", p == Phase.DISGUISED || p == Phase.SETTLING);
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        setPhase(tag.getBoolean("Disguised") ? Phase.DISGUISED : Phase.AWAKE);
    }

    @Override
    protected SoundEvent getAmbientSound() {
        return phase() == Phase.AWAKE ? EndSounds.OBOLISK_AMBIENT : null;
    }

    @Override
    protected SoundEvent getHurtSound(DamageSource source) {
        return EndSounds.OBOLISK_HURT;
    }

    @Override
    protected SoundEvent getDeathSound() {
        return EndSounds.OBOLISK_DEATH;
    }

    @Override
    protected void playStepSound(BlockPos pos, BlockState state) {
        playSound(EndSounds.OBOLISK_STEP, 0.8f, 0.8f);
    }

    @Override
    protected float getSoundVolume() {
        return 1.5f;
    }

    @Override
    public int getMaxHeadYRot() {
        return 20;
    }
}
