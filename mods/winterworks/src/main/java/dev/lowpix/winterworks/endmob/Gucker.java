package dev.lowpix.winterworks.endmob;

import dev.lowpix.winterworks.registry.EndBlocks;
import dev.lowpix.winterworks.registry.EndEntities;
import dev.lowpix.winterworks.registry.EndParticles;
import dev.lowpix.winterworks.registry.EndSounds;
import java.util.EnumSet;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.util.Mth;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityDimensions;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Pose;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.monster.EnderMan;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * The Gucker (docs/END_UPDATE.md section 7): a big salamander-like predator with breathing holes along its back. Idle, it
 * burrows into End stone, End sand or End grass (only its back shows, the vents puffing dust); prey within 7 blocks
 * (Endermen, Endlings, players) makes it burst out and lunge (bite 8). At 6-14 blocks it inflates its throat for 1.2 s and
 * spits a ball of blinding dust ({@link GuckerSpit}).
 */
public class Gucker extends Monster {
    public enum Phase { NORMAL, BURROWED, EMERGING, INFLATING, SPITTING }

    private static final EntityDataAccessor<Byte> PHASE = SynchedEntityData.defineId(Gucker.class, EntityDataSerializers.BYTE);
    public static final byte EVENT_BITE = 70;
    public static final int EMERGE_TICKS = 16, INFLATE_TICKS = 24, SPIT_TICKS = 10;
    public static final double AMBUSH_RANGE = 7.0, SPIT_MIN = 6.0, SPIT_MAX = 14.0;
    /** Idle this long (no target) before it burrows. */
    public static final int BURROW_AFTER = 100;
    private static final EntityDimensions BURROWED_SIZE = EntityDimensions.scalable(1.6f, 0.35f).withEyeHeight(0.3f);

    // client animation state (clips in assets/winterworks/lowpix/gucker.anim.json)
    public final AnimationState idleState = new AnimationState();
    public final AnimationState burrowedState = new AnimationState();
    public final AnimationState emergeState = new AnimationState();
    public final AnimationState biteState = new AnimationState();
    public final AnimationState inflateState = new AnimationState();
    public final AnimationState spitState = new AnimationState();

    private int phaseTicks;
    /** Client: tickCount when the current phase began (for the renderer). */
    public int phaseStartTick;
    private int idleTicks;
    private int spitCooldown = 40;

    public Gucker(EntityType<? extends Monster> type, Level level) {
        super(type, level);
        this.xpReward = 10;
    }

    public static AttributeSupplier.Builder createAttributes() {
        return Monster.createMonsterAttributes().add(Attributes.MAX_HEALTH, 40.0).add(Attributes.MOVEMENT_SPEED, 0.26)
                .add(Attributes.ATTACK_DAMAGE, 8.0).add(Attributes.FOLLOW_RANGE, 20.0).add(Attributes.KNOCKBACK_RESISTANCE, 0.4)
                .add(Attributes.ARMOR, 4.0);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        super.defineSynchedData(builder);
        builder.define(PHASE, (byte) 0);
    }

    @Override
    protected void registerGoals() {
        goalSelector.addGoal(0, new FloatGoal(this));
        goalSelector.addGoal(2, new SpitGoal());
        goalSelector.addGoal(3, new MeleeAttackGoal(this, 1.35, true) {
            @Override
            public boolean canUse() {
                return phase() == Phase.NORMAL && super.canUse();
            }
        });
        goalSelector.addGoal(6, new WaterAvoidingRandomStrollGoal(this, 0.7));
        goalSelector.addGoal(7, new LookAtPlayerGoal(this, Player.class, 8f));
        goalSelector.addGoal(8, new RandomLookAroundGoal(this));
        targetSelector.addGoal(1, new HurtByTargetGoal(this));
        targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(this, Player.class, true));
        targetSelector.addGoal(3, new NearestAttackableTargetGoal<>(this, Endling.class, true));
        targetSelector.addGoal(4, new NearestAttackableTargetGoal<>(this, EnderMan.class, 10, true, false, e -> true));
    }

    // ------------------------------------------------------------------------------------------------ phases

    public Phase phase() {
        return Phase.values()[Mth.clamp(entityData.get(PHASE), 0, Phase.values().length - 1)];
    }

    public void setPhase(Phase p) {
        entityData.set(PHASE, (byte) p.ordinal());
        phaseTicks = 0;
        setPose(p == Phase.BURROWED ? Pose.DIGGING : Pose.STANDING);
    }

    public boolean isBurrowed() {
        return phase() == Phase.BURROWED;
    }

    @Override
    public void onSyncedDataUpdated(EntityDataAccessor<?> key) {
        super.onSyncedDataUpdated(key);
        if (PHASE.equals(key) && level().isClientSide) {
            Phase p = phase();
            phaseStartTick = tickCount;
            burrowedState.animateWhen(p == Phase.BURROWED, tickCount);
            if (p == Phase.EMERGING) {
                emergeState.start(tickCount);
            } else if (p == Phase.INFLATING) {
                inflateState.start(tickCount);
            } else if (p == Phase.SPITTING) {
                inflateState.stop();
                spitState.start(tickCount);
            }
        }
    }

    @Override
    protected EntityDimensions getDefaultDimensions(Pose pose) {
        return pose == Pose.DIGGING ? BURROWED_SIZE : super.getDefaultDimensions(pose);
    }

    /** Burrowed, emerging and spitting it holds still. */
    @Override
    protected boolean isImmobile() {
        return super.isImmobile() || phase() == Phase.BURROWED || phase() == Phase.EMERGING;
    }

    @Override
    public boolean isPushable() {
        return !isBurrowed() && super.isPushable();
    }

    /** What it can burrow into: End stone, End sand, End grass. */
    public static boolean canBurrowInto(BlockState s) {
        return s.is(Blocks.END_STONE) || s.is(EndBlocks.END_SAND) || s.is(EndBlocks.END_GRASS_BLOCK);
    }

    /** Prey it ambushes: Endermen, Endlings and survival players. */
    public static boolean isPrey(Entity e) {
        return e.isAlive() && (e instanceof EnderMan || e instanceof Endling || e instanceof Player p && EndMobFeature.isSurvivalLike(p));
    }

    /** Digs in where it stands (if the ground is right). */
    public boolean burrow() {
        if (!onGround() || !canBurrowInto(getBlockStateOn())) {
            return false;
        }
        getNavigation().stop();
        setTarget(null);
        setPhase(Phase.BURROWED);
        setDeltaMovement(Vec3.ZERO);
        playSound(EndSounds.GUCKER_BURROW, 1.0f, 1.0f);
        level().levelEvent(2001, getBlockPosBelowThatAffectsMyMovement(), Block.getId(getBlockStateOn()));
        return true;
    }

    /** Bursts out of the ground at `prey` (or just out, if null). */
    public void emerge(@Nullable LivingEntity prey) {
        setPhase(Phase.EMERGING);
        if (prey != null) {
            setTarget(prey);
        }
        playSound(EndSounds.GUCKER_EMERGE, 1.2f, 1.0f);
        level().levelEvent(2001, getBlockPosBelowThatAffectsMyMovement(), Block.getId(getBlockStateOn()));
    }

    private void lunge(LivingEntity t) {
        Vec3 d = t.position().subtract(position()).multiply(1, 0, 1);
        if (d.lengthSqr() > 1e-4) {
            d = d.normalize().scale(Math.min(1.1, 0.35 + d.length() * 0.15));
            setDeltaMovement(d.x, 0.42, d.z);
            hasImpulse = true;
            setYRot((float) (Mth.atan2(d.z, d.x) * Mth.RAD_TO_DEG) - 90f);
            yBodyRot = yHeadRot = getYRot();
        }
    }

    // ------------------------------------------------------------------------------------------------ ticking

    @Override
    public void tick() {
        super.tick();
        if (level().isClientSide) {
            clientTick();
            return;
        }
        phaseTicks++;
        if (spitCooldown > 0) {
            spitCooldown--;
        }
        switch (phase()) {
            case BURROWED -> {
                setDeltaMovement(getDeltaMovement().multiply(0, 1, 0));
                if (tickCount % 5 == 0) {
                    List<LivingEntity> prey = level().getEntitiesOfClass(LivingEntity.class, getBoundingBox().inflate(AMBUSH_RANGE),
                            e -> e != this && isPrey(e) && distanceToSqr(e) <= AMBUSH_RANGE * AMBUSH_RANGE);
                    LivingEntity nearest = null;
                    for (LivingEntity e : prey) {
                        if (nearest == null || distanceToSqr(e) < distanceToSqr(nearest)) {
                            nearest = e;
                        }
                    }
                    if (nearest != null) {
                        emerge(nearest);
                    }
                }
                if (random.nextInt(80) == 0) {
                    playSound(EndSounds.GUCKER_BREATHE, 0.5f, 0.8f + random.nextFloat() * 0.3f);
                }
                if (!canBurrowInto(getBlockStateOn()) && onGround()) {
                    emerge(null);   // the ground went
                }
            }
            case EMERGING -> {
                if (phaseTicks >= EMERGE_TICKS) {
                    setPhase(Phase.NORMAL);
                    idleTicks = 0;
                    LivingEntity t = getTarget();
                    if (t != null && t.isAlive()) {
                        lunge(t);
                    }
                }
            }
            case SPITTING -> {
                if (phaseTicks >= SPIT_TICKS) {
                    setPhase(Phase.NORMAL);
                }
            }
            case NORMAL -> {
                LivingEntity t = getTarget();
                boolean idle = (t == null || !t.isAlive()) && getNavigation().isDone();
                idleTicks = idle ? idleTicks + 1 : 0;
                if (idleTicks > BURROW_AFTER && random.nextInt(40) == 0) {
                    burrow();
                }
            }
            default -> {
            }
        }
    }

    private void clientTick() {
        boolean moving = getDeltaMovement().horizontalDistanceSqr() > 1e-4;
        idleState.animateWhen(!moving && phase() == Phase.NORMAL, tickCount);
        // the vents along the back puff dust: often when burrowed, now and then otherwise
        int every = isBurrowed() ? 8 : 40;
        if (random.nextInt(every) == 0) {
            float yaw = yBodyRot * Mth.DEG_TO_RAD;
            double back = -0.1 - random.nextDouble() * 0.6;
            double x = getX() - Mth.sin(yaw) * back, z = getZ() + Mth.cos(yaw) * back;
            double y = getY() + (isBurrowed() ? 0.3 : 0.85);
            level().addParticle(EndParticles.GUCKER_BREATH, x, y, z, (random.nextDouble() - 0.5) * 0.02, 0.04 + random.nextDouble() * 0.03,
                    (random.nextDouble() - 0.5) * 0.02);
        }
    }

    @Override
    public void handleEntityEvent(byte id) {
        if (id == EVENT_BITE) {
            biteState.start(tickCount);
        } else {
            super.handleEntityEvent(id);
        }
    }

    @Override
    public boolean doHurtTarget(Entity target) {
        level().broadcastEntityEvent(this, EVENT_BITE);
        playSound(EndSounds.GUCKER_BITE, 1.0f, 1.0f);
        return super.doHurtTarget(target);
    }

    @Override
    public boolean hurt(DamageSource source, float amount) {
        boolean hurt = super.hurt(source, amount);
        if (hurt && !level().isClientSide && isBurrowed()) {
            emerge(source.getEntity() instanceof LivingEntity le ? le : null);
        }
        return hurt;
    }

    // ------------------------------------------------------------------------------------------------ spitting

    /** Shoots a ball of blinding dust at `t`. */
    public void spitAt(LivingEntity t) {
        GuckerSpit spit = new GuckerSpit(EndEntities.GUCKER_SPIT, level());
        spit.setOwner(this);
        Vec3 mouth = position().add(Vec3.directionFromRotation(0, yBodyRot).scale(1.0)).add(0, 0.6, 0);
        spit.setPos(mouth.x, mouth.y, mouth.z);
        double dx = t.getX() - mouth.x, dz = t.getZ() - mouth.z, dy = t.getY(0.5) - mouth.y;
        double h = Math.sqrt(dx * dx + dz * dz);
        spit.shoot(dx, dy + h * 0.12, dz, 1.1f, 3.0f);
        level().addFreshEntity(spit);
        playSound(EndSounds.GUCKER_SPIT, 1.0f, 1.0f);
    }

    /** At 6-14 blocks: stops, inflates the throat sac for 1.2 s, then spits. */
    class SpitGoal extends Goal {
        SpitGoal() {
            setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
        }

        @Override
        public boolean canUse() {
            LivingEntity t = getTarget();
            if (t == null || !t.isAlive() || phase() != Phase.NORMAL || spitCooldown > 0 || !onGround()) {
                return false;
            }
            double d = distanceTo(t);
            return d >= SPIT_MIN && d <= SPIT_MAX && getSensing().hasLineOfSight(t);
        }

        @Override
        public boolean canContinueToUse() {
            return phase() == Phase.INFLATING && getTarget() != null && getTarget().isAlive();
        }

        @Override
        public boolean requiresUpdateEveryTick() {
            return true;
        }

        @Override
        public void start() {
            getNavigation().stop();
            setPhase(Phase.INFLATING);
            playSound(EndSounds.GUCKER_INFLATE, 1.0f, 1.0f);
        }

        @Override
        public void tick() {
            LivingEntity t = getTarget();
            if (t == null) {
                return;
            }
            getLookControl().setLookAt(t, 30f, 30f);
            getNavigation().stop();
            if (phaseTicks >= INFLATE_TICKS) {
                spitAt(t);
                setPhase(Phase.SPITTING);
                spitCooldown = 60 + random.nextInt(60);
            }
        }

        @Override
        public void stop() {
            if (phase() == Phase.INFLATING) {
                setPhase(Phase.NORMAL);
                spitCooldown = 30;
            }
        }
    }

    // ------------------------------------------------------------------------------------------------ save, sounds

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        tag.putBoolean("Burrowed", isBurrowed());
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        setPhase(tag.getBoolean("Burrowed") ? Phase.BURROWED : Phase.NORMAL);
    }

    @Override
    protected SoundEvent getAmbientSound() {
        return isBurrowed() ? null : EndSounds.GUCKER_AMBIENT;
    }

    @Override
    protected SoundEvent getHurtSound(DamageSource source) {
        return EndSounds.GUCKER_HURT;
    }

    @Override
    protected SoundEvent getDeathSound() {
        return EndSounds.GUCKER_DEATH;
    }

    @Override
    protected void playStepSound(BlockPos pos, BlockState state) {
        playSound(EndSounds.GUCKER_STEP, 0.4f, 1.0f);
    }

    @Override
    public int getMaxHeadYRot() {
        return 40;
    }
}
