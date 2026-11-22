package dev.lowpix.winterworks.oceanmob;

import dev.lowpix.winterworks.registry.OceanSounds;
import java.util.EnumSet;
import java.util.Optional;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.FluidTags;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityDimensions;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.MoverType;
import net.minecraft.world.entity.OwnableEntity;
import net.minecraft.world.entity.PlayerRideableJumping;
import net.minecraft.world.entity.Saddleable;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.control.SmoothSwimmingLookControl;
import net.minecraft.world.entity.ai.control.SmoothSwimmingMoveControl;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.RandomSwimmingGoal;
import net.minecraft.world.entity.ai.goal.TryFindWaterGoal;
import net.minecraft.world.entity.ai.navigation.PathNavigation;
import net.minecraft.world.entity.ai.navigation.WaterBoundPathNavigation;
import net.minecraft.world.entity.animal.WaterAnimal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * The nautilus (docs/OCEAN_UPDATE.md section 4): a big coiled-shell cephalopod of the deep oceans (y below 35) and the
 * underwater mount. Tame it with raw cod or salmon (1 in 3), saddle it, ride it: it swims where its rider looks (fast and
 * smooth, steered by the client like a horse), dashes on jump (a jet from the siphon, the {@code dash} clip; jump is the
 * vanilla riding jump, so the jump bar shows the dash's readiness) and its rider has Water Breathing. Drops a nautilus shell.
 */
public class Nautilus extends WaterAnimal implements OwnableEntity, Saddleable, PlayerRideableJumping {
    /** The rider locator in model pixels (lowpix: y up, +z forward). */
    public static final Vec3 RIDER = new Vec3(0, 25.5, -3);
    public static final double PIVOT_Y = 12.0;
    /** Ridden: acceleration per tick at full input, the drag, the dash impulse and its cooldown (ticks). */
    public static final double RIDDEN_ACCEL = 0.05, RIDDEN_DRAG = 0.9, DASH_IMPULSE = 1.1;
    public static final int DASH_COOLDOWN = 30, DASH_TICKS = 10;
    public static final byte EV_DASH = 100, EV_TAMED = 101, EV_TAME_FAILED = 102;

    private static final EntityDataAccessor<Optional<UUID>> OWNER = SynchedEntityData.defineId(Nautilus.class, EntityDataSerializers.OPTIONAL_UUID);
    private static final EntityDataAccessor<Boolean> SADDLED = SynchedEntityData.defineId(Nautilus.class, EntityDataSerializers.BOOLEAN);

    public final AnimationState dashState = new AnimationState();
    /** Client: 0 hovering .. 1 swimming (eased). */
    public float swimBlend, swimBlendO;
    /** Ticks left of the dash's cooldown (kept on both sides: the rider's client dashes, the server plays it). */
    private int dashCooldown;
    /** Set by the riding client's jump, used up by the next ridden travel tick. */
    private boolean dashPending;
    private int dashTicks;

    public Nautilus(EntityType<? extends WaterAnimal> type, Level level) {
        super(type, level);
        this.moveControl = new SmoothSwimmingMoveControl(this, 85, 10, 0.02f, 0.1f, true);
        this.lookControl = new SmoothSwimmingLookControl(this, 10);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return Mob.createMobAttributes().add(Attributes.MAX_HEALTH, 30.0).add(Attributes.MOVEMENT_SPEED, 0.9).add(Attributes.ARMOR, 6.0)
                .add(Attributes.FOLLOW_RANGE, 20.0);
    }

    /** Natural spawns: deep water below y 35. */
    public static boolean checkSpawnRules(EntityType<Nautilus> type, LevelAccessor level, MobSpawnType reason, BlockPos pos, RandomSource r) {
        return pos.getY() < 35 && pos.getY() > -20 && level.getFluidState(pos).is(FluidTags.WATER)
                && level.getFluidState(pos.above()).is(FluidTags.WATER) && level.getFluidState(pos.above(2)).is(FluidTags.WATER);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder b) {
        super.defineSynchedData(b);
        b.define(OWNER, Optional.empty());
        b.define(SADDLED, false);
    }

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        if (getOwnerUUID() != null) {
            tag.putUUID("Owner", getOwnerUUID());
        }
        tag.putBoolean("Saddle", isSaddled());
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        entityData.set(OWNER, tag.hasUUID("Owner") ? Optional.of(tag.getUUID("Owner")) : Optional.empty());
        entityData.set(SADDLED, tag.getBoolean("Saddle"));
    }

    // ------------------------------------------------------------------------------------------------ taming, saddle

    @Nullable
    @Override
    public UUID getOwnerUUID() {
        return entityData.get(OWNER).orElse(null);
    }

    public boolean isTamed() {
        return getOwnerUUID() != null;
    }

    public void tame(Player owner) {
        entityData.set(OWNER, Optional.of(owner.getUUID()));
        setPersistenceRequired();
        if (owner instanceof net.minecraft.server.level.ServerPlayer sp) {
            net.minecraft.advancements.CriteriaTriggers.TAME_ANIMAL.trigger(sp, null);
        }
    }

    public static boolean isFood(ItemStack s) {
        return s.is(Items.COD) || s.is(Items.SALMON);
    }

    @Override
    public boolean isSaddleable() {
        return isAlive() && isTamed();
    }

    @Override
    public void equipSaddle(ItemStack stack, @Nullable SoundSource source) {
        entityData.set(SADDLED, true);
        if (source != null) {
            level().playSound(null, this, SoundEvents.HORSE_SADDLE, source, 0.6f, 0.8f);
        }
    }

    @Override
    public boolean isSaddled() {
        return entityData.get(SADDLED);
    }

    @Override
    protected InteractionResult mobInteract(Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if (isFood(stack)) {
            if (!isTamed()) {
                stack.consume(1, player);
                if (!level().isClientSide) {
                    playSound(SoundEvents.DOLPHIN_EAT, 1f, 0.7f);
                    if (random.nextInt(3) == 0) {
                        tame(player);
                        level().broadcastEntityEvent(this, EV_TAMED);
                    } else {
                        level().broadcastEntityEvent(this, EV_TAME_FAILED);
                    }
                }
                return InteractionResult.sidedSuccess(level().isClientSide);
            }
            if (getHealth() < getMaxHealth()) {
                stack.consume(1, player);
                if (!level().isClientSide) {
                    heal(4f);
                    playSound(SoundEvents.DOLPHIN_EAT, 1f, 0.8f);
                    level().broadcastEntityEvent(this, EV_TAMED);
                }
                return InteractionResult.sidedSuccess(level().isClientSide);
            }
        }
        if (isTamed() && isSaddled()) {
            if (player.isSecondaryUseActive() && stack.isEmpty() && player.getUUID().equals(getOwnerUUID())) {
                // the owner takes the saddle off (sneak, empty hand)
                if (!level().isClientSide) {
                    entityData.set(SADDLED, false);
                    spawnAtLocation(Items.SADDLE);
                    playSound(SoundEvents.HORSE_SADDLE, 0.5f, 0.6f);
                }
                return InteractionResult.sidedSuccess(level().isClientSide);
            }
            if (!isVehicle() && !player.isSecondaryUseActive() && !stack.is(Items.SADDLE)) {
                if (!level().isClientSide) {
                    player.setYRot(getYRot());
                    player.setXRot(getXRot());
                    if (player.startRiding(this)) {
                        positionRider(player);
                    }
                }
                return InteractionResult.sidedSuccess(level().isClientSide);
            }
        }
        return super.mobInteract(player, hand);
    }

    @Override
    protected void dropEquipment() {
        super.dropEquipment();
        if (isSaddled()) {
            spawnAtLocation(Items.SADDLE);
        }
    }

    @Override
    public boolean requiresCustomPersistence() {
        return super.requiresCustomPersistence() || isTamed() || isSaddled();
    }

    @Override
    public boolean removeWhenFarAway(double d) {
        return !isTamed() && !isSaddled() && !hasCustomName();
    }

    // ------------------------------------------------------------------------------------------------ riding

    @Nullable
    @Override
    public LivingEntity getControllingPassenger() {
        if (isSaddled() && getFirstPassenger() instanceof Player p) {
            return p;
        }
        return super.getControllingPassenger();
    }

    /** The rider sits at the `rider` locator (about 1.6 blocks up, a little back), pitched with the shell. */
    @Override
    protected Vec3 getPassengerAttachmentPoint(Entity passenger, EntityDimensions dims, float scale) {
        return modelPoint(RIDER).subtract(position());
    }

    /** A point given in model pixels, in the world (pitched with the body about {@link #PIVOT_Y}, turned with it). */
    public Vec3 modelPoint(Vec3 px) {
        double s = 1 / 16.0;
        double y = px.y * s, z = px.z * s, pivot = PIVOT_Y * s;
        float pitch = renderPitch(getXRot()) * Mth.DEG_TO_RAD;
        double py = pivot + (y - pivot) * Mth.cos(pitch) - z * Mth.sin(pitch);
        double pz = (y - pivot) * Mth.sin(pitch) + z * Mth.cos(pitch);
        float yaw = getYRot() * Mth.DEG_TO_RAD;
        return position().add(-Mth.sin(yaw) * pz, py, Mth.cos(yaw) * pz);
    }

    /** How far the body is drawn pitched for a given xRot (gentler than the swim direction, so a rider stays on top). */
    public static float renderPitch(float xRot) {
        return Mth.clamp(xRot, -60f, 60f) * 0.5f;
    }

    @Override
    public Vec3 getDismountLocationForPassenger(LivingEntity passenger) {
        Vec3 up = position().add(0, getBbHeight() + 0.2, 0);
        return isInWater() ? up : super.getDismountLocationForPassenger(passenger);
    }

    @Override
    protected void tickRidden(Player rider, Vec3 input) {
        super.tickRidden(rider, input);
        // turn smoothly toward where the rider looks
        float yaw = Mth.approachDegrees(getYRot(), rider.getYRot(), 9f + Math.abs(Mth.wrapDegrees(rider.getYRot() - getYRot())) * 0.25f);
        float pitch = isInWater() ? Mth.approach(getXRot(), Mth.clamp(rider.getXRot(), -70f, 70f), 6f) : Mth.approach(getXRot(), 0f, 4f);
        setRot(yaw, pitch);
        yRotO = yBodyRot = yHeadRot = yaw;
        if (dashCooldown > 0) {
            dashCooldown--;
        }
    }

    @Override
    protected Vec3 getRiddenInput(Player rider, Vec3 input) {
        float forward = rider.zza;
        if (forward < 0) {
            forward *= 0.35f;
        }
        return new Vec3(rider.xxa * 0.6f, 0, forward);
    }

    @Override
    protected float getRiddenSpeed(Player rider) {
        return (float) RIDDEN_ACCEL;
    }

    @Override
    public void travel(Vec3 input) {
        if (getControllingPassenger() instanceof Player rider && isControlledByLocalInstance()) {
            if (isInWater()) {
                swimRidden(rider, input);
                return;
            }
            super.travel(Vec3.ZERO);   // out of the water it can't do much
            return;
        }
        if (isEffectiveAi() && isInWater()) {
            moveRelative(getSpeed(), input);
            move(MoverType.SELF, getDeltaMovement());
            setDeltaMovement(getDeltaMovement().scale(0.9));
            if (getTarget() == null) {
                setDeltaMovement(getDeltaMovement().add(0.0, -0.004, 0.0));
            }
        } else {
            super.travel(input);
        }
    }

    /**
     * One tick of ridden swimming (run by whoever controls it: the rider's client): it swims where the rider looks,
     * forward along the full 3D look and strafing level, smoothly (momentum and drag); a pending dash adds a jet of speed.
     */
    public void swimRidden(Player rider, Vec3 input) {
        Vec3 look = Vec3.directionFromRotation(rider.getXRot(), rider.getYRot());
        Vec3 side = Vec3.directionFromRotation(0, rider.getYRot() - 90f);
        Vec3 push = look.scale(input.z * RIDDEN_ACCEL).add(side.scale(input.x * RIDDEN_ACCEL));
        if (dashPending) {
            dashPending = false;
            push = push.add(look.scale(DASH_IMPULSE));
            dashTicks = DASH_TICKS;
        }
        setDeltaMovement(getDeltaMovement().add(push));
        move(MoverType.SELF, getDeltaMovement());
        double drag = dashTicks > 0 ? 0.93 : RIDDEN_DRAG;
        setDeltaMovement(getDeltaMovement().scale(drag));
        if (dashTicks > 0) {
            dashTicks--;
        }
        calculateEntityAnimation(false);
    }

    // the dash (vanilla's riding jump)

    @Override
    public void onPlayerJump(int power) {
        if (canJump()) {
            dashPending = true;
            dashCooldown = DASH_COOLDOWN;
        }
    }

    @Override
    public boolean canJump() {
        return isSaddled() && isInWater() && dashCooldown <= 0;
    }

    @Override
    public void handleStartJump(int power) {
        dashCooldown = DASH_COOLDOWN;
        dash();
    }

    @Override
    public void handleStopJump() {
    }

    @Override
    public int getJumpCooldown() {
        return dashCooldown;
    }

    /** Server: the dash's clip, sound and bubbles for everyone (the riding client has already moved). */
    public void dash() {
        if (level() instanceof ServerLevel sl) {
            level().broadcastEntityEvent(this, EV_DASH);
            playSound(OceanSounds.NAUTILUS_DASH, 1.4f, 0.9f + random.nextFloat() * 0.2f);
            Vec3 back = modelPoint(new Vec3(0, 10, -14));
            sl.sendParticles(ParticleTypes.BUBBLE, back.x, back.y, back.z, 24, 0.3, 0.3, 0.3, 0.15);
            sl.sendParticles(ParticleTypes.BUBBLE_COLUMN_UP, back.x, back.y, back.z, 8, 0.2, 0.2, 0.2, 0.05);
        }
    }

    // ------------------------------------------------------------------------------------------------ AI, tick

    @Override
    protected void registerGoals() {
        goalSelector.addGoal(0, new TryFindWaterGoal(this));
        goalSelector.addGoal(2, new FollowOwnerGoal());
        goalSelector.addGoal(4, new RandomSwimmingGoal(this, 1.0, 60) {
            @Override
            public boolean canUse() {
                return !isVehicle() && super.canUse();
            }
        });
        goalSelector.addGoal(6, new LookAtPlayerGoal(this, Player.class, 8f) {
            @Override
            public boolean canUse() {
                return !isVehicle() && super.canUse();
            }
        });
    }

    @Override
    protected PathNavigation createNavigation(Level level) {
        return new WaterBoundPathNavigation(this, level);
    }

    @Override
    public int getMaxHeadXRot() {
        return 1;
    }

    @Override
    public int getMaxHeadYRot() {
        return 1;
    }

    @Override
    public void tick() {
        super.tick();
        if (level().isClientSide) {
            swimBlendO = swimBlend;
            double v = new Vec3(getX() - xo, getY() - yo, getZ() - zo).length();
            swimBlend += ((isInWater() && v > 0.03 ? 1f : 0f) - swimBlend) * 0.1f;
            if (dashCooldown > 0 && getControllingPassenger() == null) {
                dashCooldown--;
            }
            return;
        }
        if (dashCooldown > 0 && !isVehicle()) {
            dashCooldown--;
        }
        if (tickCount % 20 == 0) {
            for (Entity e : getPassengers()) {
                if (e instanceof Player p) {   // the rider breathes underwater
                    p.addEffect(new MobEffectInstance(MobEffects.WATER_BREATHING, 60, 0, true, false, true));
                }
            }
        }
    }

    @Override
    public void handleEntityEvent(byte id) {
        switch (id) {
            case EV_DASH -> dashState.start(tickCount);
            case EV_TAMED -> particles(ParticleTypes.HEART);
            case EV_TAME_FAILED -> particles(ParticleTypes.SMOKE);
            default -> super.handleEntityEvent(id);
        }
    }

    private void particles(ParticleOptions p) {
        for (int i = 0; i < 7; i++) {
            level().addParticle(p, getRandomX(1.0), getRandomY() + 0.5, getRandomZ(1.0), random.nextGaussian() * 0.02,
                    random.nextGaussian() * 0.02, random.nextGaussian() * 0.02);
        }
    }

    @Override
    protected SoundEvent getAmbientSound() {
        return isInWater() ? OceanSounds.NAUTILUS_AMBIENT : null;
    }

    @Override
    protected SoundEvent getHurtSound(DamageSource source) {
        return OceanSounds.NAUTILUS_HURT;
    }

    @Override
    protected SoundEvent getDeathSound() {
        return OceanSounds.NAUTILUS_DEATH;
    }

    @Override
    protected SoundEvent getSwimSound() {
        return SoundEvents.DOLPHIN_SWIM;
    }

    @Override
    public int getMaxSpawnClusterSize() {
        return 2;
    }

    /** A tamed nautilus keeps near its owner while they swim. */
    final class FollowOwnerGoal extends Goal {
        @Nullable
        private LivingEntity owner;

        FollowOwnerGoal() {
            setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
        }

        @Override
        public boolean canUse() {
            owner = getOwner();
            return owner != null && !isVehicle() && !isSaddled() && owner.isInWater() && !owner.isSpectator() && distanceToSqr(owner) > 64
                    && distanceToSqr(owner) < 32 * 32;
        }

        @Override
        public boolean canContinueToUse() {
            return owner != null && owner.isInWater() && !isVehicle() && distanceToSqr(owner) > 9 && !getNavigation().isDone();
        }

        @Override
        public void start() {
            if (owner != null) {
                getNavigation().moveTo(owner, 1.3);
            }
        }

        @Override
        public void tick() {
            if (owner != null && tickCount % 10 == 0) {
                getNavigation().moveTo(owner, 1.3);
            }
        }
    }
}
