package dev.lowpix.winterworks.oceanmob;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.registry.OceanItems;
import dev.lowpix.winterworks.registry.OceanSounds;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NbtUtils;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.tags.FluidTags;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityDimensions;
import net.minecraft.world.entity.EntitySelector;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.MoverType;
import net.minecraft.world.entity.Pose;
import net.minecraft.world.entity.SpawnGroupData;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.control.SmoothSwimmingLookControl;
import net.minecraft.world.entity.ai.control.SmoothSwimmingMoveControl;
import net.minecraft.world.entity.ai.goal.AvoidEntityGoal;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.goal.PanicGoal;
import net.minecraft.world.entity.ai.goal.RandomSwimmingGoal;
import net.minecraft.world.entity.ai.goal.TryFindWaterGoal;
import net.minecraft.world.entity.ai.navigation.PathNavigation;
import net.minecraft.world.entity.ai.navigation.WaterBoundPathNavigation;
import net.minecraft.world.entity.animal.Bucketable;
import net.minecraft.world.entity.animal.WaterAnimal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.ServerLevelAccessor;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.LightBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.loot.LootTable;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * The anglerfish (docs/OCEAN_UPDATE.md section 3): one entity, two variants (synced).
 * <ul>
 * <li><b>Males</b> (common, below y 20): tiny (0.4 blocks, the model drawn at 1/7), harmless, flee players, bucketable.</li>
 * <li><b>Females</b> (rare, below y -10): 3 x 2 blocks, 80 health. They hang in the dark with the lure flaring, lunge at a
 * swimming player and grab them in the jaws (the player rides her, head held in the jaws at {@link #HOLD}, the mouth
 * locator brought forward to the fangs, for {@link #HOLD_TICKS}, taking
 * {@link #HOLD_DAMAGE} a second; hitting her frees you), and swallow small mobs whole.</li>
 * </ul>
 * The lure really lights the water: a waterlogged vanilla light block kept in the water at the {@link #LURE} locator while a
 * player is near, moved when the lure is more than a block from it, and always put back to water (on moving, death, removal,
 * unload; a light left in a chunk that unloaded first is cleared when the fish loads again, from its saved position).
 */
public class Anglerfish extends WaterAnimal implements Bucketable {
    /** The model is built at the female's size; males are drawn this much smaller. */
    public static final float MALE_SCALE = 1f / 7f;
    public static final EntityDimensions FEMALE_SIZE = EntityDimensions.scalable(3.0f, 2.0f).withEyeHeight(1.1f);
    public static final EntityDimensions MALE_SIZE = EntityDimensions.scalable(0.4f, 0.35f).withEyeHeight(0.2f);
    /** Locators in model pixels at the female's size (lowpix: y up, +z forward, feet at y 0). */
    public static final Vec3 MOUTH = new Vec3(0, 10, 12), LURE = new Vec3(0, 32.8, 19.5);
    /**
     * Where a held player's eyes are: the mouth locator's height, brought forward between the fangs (a player is far taller
     * than her gape, so the head is held in the jaws and the body hangs out under the chin; from inside, the player looks
     * out between her teeth at the lure).
     */
    public static final Vec3 HOLD = new Vec3(0, 10, 19);
    /** The body pitches about this height (model pixels). */
    public static final double PIVOT_Y = 16.0;
    /** Females live below this, males below {@link #MALE_DEPTH}. */
    public static final int FEMALE_DEPTH = -10, MALE_DEPTH = 20;
    public static final int HOLD_TICKS = 60;
    public static final float HOLD_DAMAGE = 4f;
    public static final float FEMALE_HEALTH = 80f, MALE_HEALTH = 3f;
    /** Light levels of the lure's light block, and how near a player must be for it to be there. */
    public static final int FEMALE_LIGHT = 15, MALE_LIGHT = 9;
    public static final double LIGHT_PLAYER_RANGE = 48;

    public static final byte EV_LUNGE = 100, EV_BITE = 101, EV_FLASH = 102, EV_SWALLOW = 103;

    private static final EntityDataAccessor<Boolean> FEMALE = SynchedEntityData.defineId(Anglerfish.class, EntityDataSerializers.BOOLEAN);
    private static final EntityDataAccessor<Boolean> FROM_BUCKET = SynchedEntityData.defineId(Anglerfish.class, EntityDataSerializers.BOOLEAN);
    private static final EntityDataAccessor<Boolean> HUNTING = SynchedEntityData.defineId(Anglerfish.class, EntityDataSerializers.BOOLEAN);
    private static final EntityDataAccessor<Integer> HELD = SynchedEntityData.defineId(Anglerfish.class, EntityDataSerializers.INT);

    // client: one-shot clips (the loops are driven by the renderer from how fast it swims)
    public final AnimationState lungeState = new AnimationState();
    public final AnimationState biteState = new AnimationState();
    public final AnimationState flashState = new AnimationState();
    /** Client: 0 hanging still .. 1 swimming, eased (blends the idle and swim loops). */
    public float swimBlend, swimBlendO;

    @Nullable
    private BlockPos lightPos;
    private int heldTicks, huntCooldown;
    /** GameTests: let the hunt happen in a tiny test pool, in any light, without the usual waits. */
    public static boolean eager;

    public Anglerfish(EntityType<? extends WaterAnimal> type, Level level) {
        super(type, level);
        this.moveControl = new SmoothSwimmingMoveControl(this, 85, 10, 0.02f, 0.1f, true);
        this.lookControl = new SmoothSwimmingLookControl(this, 10);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return Mob.createMobAttributes().add(Attributes.MAX_HEALTH, MALE_HEALTH).add(Attributes.MOVEMENT_SPEED, 1.0)
                .add(Attributes.ATTACK_DAMAGE, HOLD_DAMAGE).add(Attributes.FOLLOW_RANGE, 24.0);
    }

    // ------------------------------------------------------------------------------------------------ variant

    public boolean isFemale() {
        return entityData.get(FEMALE);
    }

    /** Sets the variant: size, health and speed follow (the female is slow, heavy and dangerous). */
    public void setFemale(boolean female) {
        getAttribute(Attributes.MAX_HEALTH).setBaseValue(female ? FEMALE_HEALTH : MALE_HEALTH);
        getAttribute(Attributes.MOVEMENT_SPEED).setBaseValue(female ? 0.6 : 1.0);
        applyVariant(female);
        setHealth(getMaxHealth());
    }

    private void applyVariant(boolean female) {
        entityData.set(FEMALE, female);
        xpReward = female ? 20 : 1;
        refreshDimensions();
    }

    /** Model scale (female 1, male 1/7). */
    public float modelScale() {
        return isFemale() ? 1f : MALE_SCALE;
    }

    @Override
    public EntityDimensions getDefaultDimensions(Pose pose) {
        return isFemale() ? FEMALE_SIZE : MALE_SIZE;
    }

    @Override
    public void onSyncedDataUpdated(EntityDataAccessor<?> key) {
        super.onSyncedDataUpdated(key);
        if (FEMALE.equals(key)) {
            refreshDimensions();
        }
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder b) {
        super.defineSynchedData(b);
        b.define(FEMALE, false);
        b.define(FROM_BUCKET, false);
        b.define(HUNTING, false);
        b.define(HELD, -1);
    }

    @Override
    public SpawnGroupData finalizeSpawn(ServerLevelAccessor level, DifficultyInstance difficulty, MobSpawnType reason,
                                        @Nullable SpawnGroupData data) {
        boolean female = reason != MobSpawnType.BUCKET && blockPosition().getY() < FEMALE_DEPTH
                && level.getRandom().nextFloat() < (reason == MobSpawnType.NATURAL || reason == MobSpawnType.CHUNK_GENERATION ? 0.2f : 0.5f);
        setFemale(female);
        return super.finalizeSpawn(level, difficulty, reason, data);
    }

    /** Natural spawns: in water below y 20 (the female's depth is decided in finalizeSpawn). */
    public static boolean checkSpawnRules(EntityType<Anglerfish> type, LevelAccessor level, MobSpawnType reason, BlockPos pos, RandomSource r) {
        return pos.getY() < MALE_DEPTH && level.getFluidState(pos).is(FluidTags.WATER) && level.getFluidState(pos.above()).is(FluidTags.WATER);
    }

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        tag.putString("Variant", isFemale() ? "female" : "male");
        tag.putBoolean("FromBucket", fromBucket());
        if (lightPos != null) {
            tag.put("LureLight", NbtUtils.writeBlockPos(lightPos));
        }
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        boolean female = "female".equals(tag.getString("Variant"));
        if (!tag.contains("attributes")) {   // e.g. /summon with {Variant:"female"}: a fresh one of that variant
            setFemale(female);
        } else {
            applyVariant(female);
        }
        setFromBucket(tag.getBoolean("FromBucket"));
        // a light left behind when this fish's chunk unloaded before the light's: cleared on the first tick here
        lightPos = NbtUtils.readBlockPos(tag, "LureLight").orElse(null);
    }

    // ------------------------------------------------------------------------------------------------ bucket (males)

    @Override
    public boolean fromBucket() {
        return entityData.get(FROM_BUCKET);
    }

    @Override
    public void setFromBucket(boolean b) {
        entityData.set(FROM_BUCKET, b);
    }

    @Override
    public void saveToBucketTag(ItemStack stack) {
        Bucketable.saveDefaultDataToBucketTag(this, stack);
    }

    @Override
    public void loadFromBucketTag(CompoundTag tag) {
        Bucketable.loadDefaultDataFromBucketTag(this, tag);
    }

    @Override
    public ItemStack getBucketItemStack() {
        return new ItemStack(OceanItems.ANGLERFISH_BUCKET);
    }

    @Override
    public SoundEvent getPickupSound() {
        return SoundEvents.BUCKET_FILL_FISH;
    }

    @Override
    protected InteractionResult mobInteract(Player player, InteractionHand hand) {
        if (!isFemale()) {
            return Bucketable.bucketMobPickup(player, hand, this).orElse(super.mobInteract(player, hand));
        }
        return super.mobInteract(player, hand);
    }

    @Override
    public boolean requiresCustomPersistence() {
        return super.requiresCustomPersistence() || fromBucket();
    }

    @Override
    public boolean removeWhenFarAway(double dist) {
        return !fromBucket() && !hasCustomName() && heldPlayer() == null;
    }

    @Override
    public int getMaxSpawnClusterSize() {
        return 3;
    }

    // ------------------------------------------------------------------------------------------------ loot, sounds

    @Override
    public ResourceKey<LootTable> getDefaultLootTable() {
        return isFemale() ? OceanMobFeature.ANGLERFISH_FEMALE_LOOT : getType().getDefaultLootTable();
    }

    @Override
    protected SoundEvent getAmbientSound() {
        return isInWater() ? OceanSounds.ANGLERFISH_AMBIENT : null;
    }

    @Override
    protected SoundEvent getHurtSound(DamageSource source) {
        return OceanSounds.ANGLERFISH_HURT;
    }

    @Override
    protected SoundEvent getDeathSound() {
        return OceanSounds.ANGLERFISH_DEATH;
    }

    @Override
    protected SoundEvent getSwimSound() {
        return SoundEvents.FISH_SWIM;
    }

    @Override
    public float getVoicePitch() {
        return isFemale() ? 0.85f + random.nextFloat() * 0.1f : 1.5f + random.nextFloat() * 0.2f;
    }

    @Override
    protected float getSoundVolume() {
        return isFemale() ? 1.4f : 0.5f;
    }

    @Override
    public int getAmbientSoundInterval() {
        return isFemale() ? 200 : 300;
    }

    @Override
    public boolean shouldRenderAtSqrDistance(double d) {
        double r = isFemale() ? 160 : 64;   // the lure is seen from far away in dark water
        return d < r * r;
    }

    // ------------------------------------------------------------------------------------------------ state

    public boolean isHunting() {
        return entityData.get(HUNTING);
    }

    void setHunting(boolean b) {
        entityData.set(HUNTING, b);
    }

    /** The id of the player held in the jaws, or -1. */
    public int heldId() {
        return entityData.get(HELD);
    }

    public boolean isHolding() {
        return heldId() >= 0;
    }

    @Nullable
    public Player heldPlayer() {
        return heldId() >= 0 && level().getEntity(heldId()) instanceof Player p ? p : null;
    }

    public int huntCooldown() {
        return huntCooldown;
    }

    // ------------------------------------------------------------------------------------------------ locators

    /** A point given in model pixels (lowpix coordinates), in the world: scaled, pitched with the body, turned with it. */
    public Vec3 modelPoint(Vec3 px, float partial) {
        double s = modelScale() / 16.0;
        double y = px.y * s, z = px.z * s, pivot = PIVOT_Y * s;
        float pitch = Mth.lerp(partial, xRotO, getXRot()) * Mth.DEG_TO_RAD;
        double py = pivot + (y - pivot) * Mth.cos(pitch) - z * Mth.sin(pitch);
        double pz = (y - pivot) * Mth.sin(pitch) + z * Mth.cos(pitch);
        float yaw = Mth.rotLerp(partial, yBodyRotO, yBodyRot) * Mth.DEG_TO_RAD;
        double fx = -Mth.sin(yaw), fz = Mth.cos(yaw);
        double rx = -fz, rz = fx;   // the model's +x side
        Vec3 base = new Vec3(Mth.lerp(partial, xo, getX()), Mth.lerp(partial, yo, getY()), Mth.lerp(partial, zo, getZ()));
        return base.add(fx * pz + rx * px.x * s, py, fz * pz + rz * px.x * s);
    }

    public Vec3 lurePos() {
        return modelPoint(LURE, 1f);
    }

    public Vec3 mouthPos() {
        return modelPoint(MOUTH, 1f);
    }

    /** Where a held player's eyes are, in the world. */
    public Vec3 holdPos() {
        return modelPoint(HOLD, 1f);
    }

    /** A held player rides with their eyes at {@link #HOLD}. */
    @Override
    protected Vec3 getPassengerAttachmentPoint(Entity passenger, EntityDimensions dims, float scale) {
        return holdPos().subtract(position()).subtract(0, passenger.getEyeHeight(), 0).add(passenger.getVehicleAttachmentPoint(this));
    }

    @Override
    public Vec3 getDismountLocationForPassenger(LivingEntity passenger) {
        Vec3 m = mouthPos();
        Vec3 f = Vec3.directionFromRotation(0, yBodyRot);
        return m.add(f.scale(isFemale() ? 1.6 : 0.3)).add(0, -0.4, 0);
    }

    /** The held player is never in control. */
    @Override
    public LivingEntity getControllingPassenger() {
        return null;
    }

    // ------------------------------------------------------------------------------------------------ AI

    @Override
    protected void registerGoals() {
        goalSelector.addGoal(0, new TryFindWaterGoal(this));
        goalSelector.addGoal(1, new HuntGoal());
        goalSelector.addGoal(2, new PanicGoal(this, 1.3) {
            @Override
            public boolean canUse() {
                return !isFemale() && super.canUse();
            }
        });
        goalSelector.addGoal(3, new AvoidEntityGoal<>(this, Player.class, 6f, 1.4, 1.6, EntitySelector.NO_SPECTATORS::test) {
            @Override
            public boolean canUse() {
                return !isFemale() && super.canUse();
            }
        });
        goalSelector.addGoal(5, new RandomSwimmingGoal(this, 1.0, 40) {
            @Override
            public boolean canUse() {
                return !isHolding() && (!isFemale() || random.nextInt(3) == 0) && super.canUse();
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
    public void travel(Vec3 input) {
        if (isEffectiveAi() && isInWater()) {
            moveRelative(getSpeed(), input);
            move(MoverType.SELF, getDeltaMovement());
            setDeltaMovement(getDeltaMovement().scale(isFemale() ? 0.86 : 0.9));
            if (getTarget() == null && !isHunting()) {
                setDeltaMovement(getDeltaMovement().add(0.0, -0.004, 0.0));
            }
        } else {
            super.travel(input);
        }
    }

    @Override
    public void aiStep() {
        if (!isInWater() && onGround() && verticalCollision) {
            setDeltaMovement(getDeltaMovement().add((random.nextFloat() * 2f - 1f) * 0.05f, isFemale() ? 0.25f : 0.4f,
                    (random.nextFloat() * 2f - 1f) * 0.05f));
            setOnGround(false);
            hasImpulse = true;
            makeSound(OceanSounds.ANGLERFISH_FLOP);
        }
        super.aiStep();
    }

    @Override
    public void tick() {
        super.tick();
        if (level().isClientSide) {
            swimBlendO = swimBlend;
            double v = getDeltaMovement().length() + new Vec3(getX() - xo, getY() - yo, getZ() - zo).length();
            float want = isInWater() && v > (isFemale() ? 0.02 : 0.008) ? 1f : 0f;
            swimBlend += (want - swimBlend) * 0.08f;
            return;
        }
        if (huntCooldown > 0) {
            huntCooldown--;
        }
        tickHold();
        if ((tickCount + getId()) % 2 == 0) {
            updateLight((ServerLevel) level());
        }
    }

    // ------------------------------------------------------------------------------------------------ grab and swallow

    /** Grabs `p` in the jaws: they ride the mouth for {@link #HOLD_TICKS}, bitten every second, until they hit back. */
    public void grab(Player p) {
        if (level().isClientSide || isHolding() || !p.isAlive()) {
            return;
        }
        if (p.isPassenger()) {
            p.stopRiding();
        }
        if (!p.startRiding(this, true)) {
            return;
        }
        positionRider(p);
        entityData.set(HELD, p.getId());
        heldTicks = HOLD_TICKS;
        setHunting(false);
        getNavigation().stop();
        level().broadcastEntityEvent(this, EV_BITE);
        playSound(OceanSounds.ANGLERFISH_BITE, 1.6f, 0.9f + random.nextFloat() * 0.15f);
        p.hurt(damageSources().mobAttack(this), HOLD_DAMAGE);
    }

    /** Keeps the held player for `ticks` more (screenshots, tests). */
    public void holdFor(int ticks) {
        if (isHolding()) {
            heldTicks = ticks;
        }
    }

    /** Lets go of the held player and spits them out forward; `struggled`: they fought free (a shorter wait to hunt again). */
    public void release(boolean struggled) {
        Player p = heldPlayer();
        entityData.set(HELD, -1);
        heldTicks = 0;
        huntCooldown = struggled ? 100 : 160;
        if (p != null) {
            if (p.getVehicle() == this) {
                p.stopRiding();
            }
            Vec3 f = Vec3.directionFromRotation(0, yBodyRot);
            p.setDeltaMovement(f.scale(0.7).add(0, 0.25, 0));
            p.hurtMarked = true;
        }
        setDeltaMovement(getDeltaMovement().add(Vec3.directionFromRotation(0, yBodyRot).scale(-0.3)));
    }

    private void tickHold() {
        if (!isHolding()) {
            return;
        }
        Player p = heldPlayer();
        if (p == null || !p.isAlive() || p.isSpectator() || p.getAbilities().invulnerable || !isAlive()) {
            release(false);
            return;
        }
        if (p.getVehicle() != this) {   // sneaking doesn't get you out: only hitting her does
            if (p.distanceToSqr(this) > 36 || !p.startRiding(this, true)) {
                release(false);
                return;
            }
        }
        getNavigation().stop();
        setDeltaMovement(getDeltaMovement().scale(0.6));
        heldTicks--;
        if (heldTicks > 0 && heldTicks % 20 == 0) {
            p.hurt(damageSources().mobAttack(this), HOLD_DAMAGE);
            playSound(OceanSounds.ANGLERFISH_BITE, 0.9f, 0.8f + random.nextFloat() * 0.2f);
        }
        if (heldTicks <= 0) {
            release(false);
        }
    }

    /** Swallows a small mob whole. */
    public void swallow(LivingEntity mob) {
        if (level().isClientSide || !mob.isAlive()) {
            return;
        }
        level().broadcastEntityEvent(this, EV_SWALLOW);
        playSound(OceanSounds.ANGLERFISH_BITE, 1.4f, 0.8f);
        if (level() instanceof ServerLevel sl) {
            Vec3 m = mouthPos();
            sl.sendParticles(ParticleTypes.BUBBLE, m.x, m.y, m.z, 12, 0.4, 0.3, 0.4, 0.05);
        }
        mob.discard();
        heal(4f);
        huntCooldown = 80;
    }

    /** Players she goes after: not spectators, not creative (by abilities, so it holds for any kind of player). */
    public static boolean isHuntable(Player p) {
        return !p.isSpectator() && !p.getAbilities().instabuild && !p.getAbilities().invulnerable;
    }

    /** In the water (by its state, or by the block it is in for one whose state isn't ticked). */
    static boolean inWater(Entity e) {
        return e.isInWater() || e.level().getFluidState(e.blockPosition()).is(FluidTags.WATER);
    }

    /** Small mobs a female swallows: fish, squid and the like (not players, not other anglerfish). */
    public static boolean isSwallowable(LivingEntity e) {
        return e.isAlive() && !(e instanceof Player) && !(e instanceof Anglerfish) && e.getBbWidth() <= 0.9f && e.getBbHeight() <= 0.95f
                && !(e instanceof net.minecraft.world.entity.OwnableEntity o && o.getOwnerUUID() != null);
    }

    @Override
    public boolean hurt(DamageSource source, float amount) {
        Player held = heldPlayer();
        boolean hit = super.hurt(source, amount);
        if (!level().isClientSide && held != null && source.getEntity() == held) {
            release(true);   // struggling: hitting her frees you
        }
        return hit;
    }

    @Override
    public void die(DamageSource source) {
        if (!level().isClientSide) {
            clearLight((ServerLevel) level());
            if (isHolding()) {
                release(false);
            }
        }
        super.die(source);
    }

    @Override
    public void remove(RemovalReason reason) {
        if (level() instanceof ServerLevel sl) {
            clearLight(sl);
        }
        super.remove(reason);
    }

    @Override
    public void handleEntityEvent(byte id) {
        switch (id) {
            case EV_LUNGE -> lungeState.start(tickCount);
            case EV_BITE, EV_SWALLOW -> biteState.start(tickCount);
            case EV_FLASH -> flashState.start(tickCount);
            default -> super.handleEntityEvent(id);
        }
    }

    // ------------------------------------------------------------------------------------------------ the lure's light

    /** The light block at the lure, if this fish has one out. */
    @Nullable
    public BlockPos lightPos() {
        return lightPos;
    }

    public static boolean isLureLight(BlockState s) {
        return s.is(Blocks.LIGHT) && s.getValue(LightBlock.WATERLOGGED);
    }

    private static boolean isOpenWater(BlockState s) {
        return s.is(Blocks.WATER) && s.getFluidState().isSource();
    }

    private static boolean chunkLoaded(ServerLevel level, BlockPos pos) {
        return level.getChunkSource().getChunkNow(pos.getX() >> 4, pos.getZ() >> 4) != null;
    }

    private void updateLight(ServerLevel level) {
        boolean wanted = isAlive() && isInWater() && level.getNearestPlayer(getX(), getY(), getZ(), LIGHT_PLAYER_RANGE,
                EntitySelector.NO_SPECTATORS) != null;
        if (!wanted) {
            clearLight(level);
            return;
        }
        Vec3 lure = lurePos();
        if (lightPos != null && chunkLoaded(level, lightPos) && !isLureLight(level.getBlockState(lightPos))) {
            lightPos = null;   // someone replaced it
        }
        if (lightPos != null && lure.distanceToSqr(Vec3.atCenterOf(lightPos)) <= 1.0) {
            return;   // moved less than a block
        }
        BlockPos target = BlockPos.containing(lure);
        if (target.equals(lightPos)) {
            return;
        }
        if (!chunkLoaded(level, target) || !isOpenWater(level.getBlockState(target))) {
            if (lightPos != null && lure.distanceToSqr(Vec3.atCenterOf(lightPos)) > 4.0) {
                clearLight(level);
            }
            return;
        }
        clearLight(level);
        level.setBlock(target, Blocks.LIGHT.defaultBlockState().setValue(LightBlock.LEVEL, isFemale() ? FEMALE_LIGHT : MALE_LIGHT)
                .setValue(LightBlock.WATERLOGGED, true), Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE);
        lightPos = target;
    }

    /**
     * Puts the lure's light block back to water. Only touches a chunk that is still in memory (never loads one, so it is safe
     * while chunks unload); if the light's chunk is already gone the position stays saved with the fish for next time.
     */
    public void clearLight(ServerLevel level) {
        if (lightPos == null) {
            return;
        }
        if (!chunkLoaded(level, lightPos)) {
            return;
        }
        try {
            if (isLureLight(level.getBlockState(lightPos))) {
                level.setBlock(lightPos, Blocks.WATER.defaultBlockState(), Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE);
            }
        } catch (RuntimeException e) {
            Winterworks.LOG.warn("anglerfish light at {} not cleared: {}", lightPos, e.toString());
        }
        lightPos = null;
    }

    // ------------------------------------------------------------------------------------------------ the hunt

    /**
     * A female's hunt: pick a swimming player (or a small mob) in sight, hang still and flare the lure while it comes near
     * (drifting closer), then lunge; the jaws grab a player or swallow a small mob. A miss waits a moment, then she lures again.
     */
    final class HuntGoal extends Goal {
        private static final int STALK = 0, LUNGE = 1;
        @Nullable
        private LivingEntity prey;
        private int phase, timer, misses;
        private Vec3 lungeDir = Vec3.ZERO;

        HuntGoal() {
            setFlags(java.util.EnumSet.of(Flag.MOVE, Flag.LOOK));
        }

        @Override
        public boolean canUse() {
            if (!isFemale() || isHolding() || huntCooldown > 0 || !isInWater()) {
                return false;
            }
            if (!eager && random.nextInt(10) != 0) {
                return false;
            }
            prey = findPrey();
            return prey != null;
        }

        @Override
        public boolean canContinueToUse() {
            return prey != null && prey.isAlive() && !isHolding() && isInWater() && distanceToSqr(prey) < 26 * 26
                    && !(prey instanceof Player p && !isHuntable(p));
        }

        @Nullable
        private LivingEntity findPrey() {
            AABB box = getBoundingBox().inflate(20, 12, 20);
            Player best = null;
            double bestD = Double.MAX_VALUE;
            for (Player p : level().getEntitiesOfClass(Player.class, box, p -> p.isAlive() && isHuntable(p) && inWater(p)
                    && !p.isPassenger() && hasLineOfSight(p))) {
                double d = distanceToSqr(p);
                if (d < bestD) {
                    best = p;
                    bestD = d;
                }
            }
            if (best != null) {
                return best;
            }
            List<LivingEntity> small = level().getEntitiesOfClass(LivingEntity.class, getBoundingBox().inflate(10, 6, 10),
                    e -> isSwallowable(e) && inWater(e) && hasLineOfSight(e));
            if (!small.isEmpty() && (eager || random.nextInt(4) == 0)) {
                return small.get(random.nextInt(small.size()));
            }
            return null;
        }

        @Override
        public void start() {
            phase = STALK;
            timer = 0;
            misses = 0;
            setHunting(true);
            level().broadcastEntityEvent(Anglerfish.this, EV_FLASH);
        }

        @Override
        public void stop() {
            setHunting(false);
            prey = null;
            getNavigation().stop();
            if (huntCooldown <= 0 && !isHolding()) {
                huntCooldown = 60;
            }
        }

        @Override
        public boolean requiresUpdateEveryTick() {
            return true;
        }

        @Override
        public void tick() {
            if (prey == null) {
                return;
            }
            timer++;
            Vec3 aim = prey.position().add(0, prey.getBbHeight() * 0.45, 0);
            getLookControl().setLookAt(aim.x, aim.y, aim.z, 6f, 6f);
            double dist = mouthPos().distanceTo(aim);
            if (phase == STALK) {
                // hang in the dark, flaring the lure; drift closer, then lunge
                if (dist > 5.0) {
                    getNavigation().moveTo(prey, 0.7);
                } else {
                    getNavigation().stop();
                }
                turnTowards(aim, 4f);
                if (timer % 30 == 0) {
                    level().broadcastEntityEvent(Anglerfish.this, EV_FLASH);
                }
                if ((dist < 6.5 && timer > (eager ? 10 : 30)) || (timer > 200 && dist < 9)) {
                    phase = LUNGE;
                    timer = 0;
                    lungeDir = aim.subtract(mouthPos()).normalize();
                    getNavigation().stop();
                    level().broadcastEntityEvent(Anglerfish.this, EV_LUNGE);
                    playSound(OceanSounds.ANGLERFISH_LUNGE, 1.8f, 0.9f + random.nextFloat() * 0.2f);
                } else if (timer > 400) {
                    prey = null;   // gave up
                }
                return;
            }
            // LUNGE (the clip is 0.6 s): a burst along the line to the prey, steering a little
            turnTowards(aim, 12f);
            lungeDir = lungeDir.scale(0.8).add(aim.subtract(mouthPos()).normalize().scale(0.2)).normalize();
            double speed = timer < 4 ? 0.25 + timer * 0.12 : 0.6;
            setDeltaMovement(lungeDir.scale(speed));
            double reach = 1.1 + prey.getBbWidth() * 0.5;
            if (dist < reach || getBoundingBox().inflate(0.2).intersects(prey.getBoundingBox()) && dist < reach + 1.0) {
                if (prey instanceof Player p) {
                    grab(p);
                } else {
                    swallow(prey);
                }
                prey = null;
                return;
            }
            if (timer >= 12) {   // missed
                setDeltaMovement(getDeltaMovement().scale(0.3));
                phase = STALK;
                timer = 0;
                huntCooldown = 0;
                if (++misses >= 3) {
                    prey = null;
                    huntCooldown = 100;
                }
            }
        }

        private void turnTowards(Vec3 at, float maxDeg) {
            double dx = at.x - getX(), dz = at.z - getZ(), dy = at.y - (getY() + getBbHeight() * 0.5);
            float yaw = (float) (Mth.atan2(dz, dx) * Mth.RAD_TO_DEG) - 90f;
            float pitch = (float) -(Mth.atan2(dy, Math.sqrt(dx * dx + dz * dz)) * Mth.RAD_TO_DEG);
            setYRot(Mth.approachDegrees(getYRot(), yaw, maxDeg));
            yBodyRot = getYRot();
            yHeadRot = getYRot();
            setXRot(Mth.approachDegrees(getXRot(), Mth.clamp(pitch, -45f, 45f), maxDeg * 0.5f));
        }
    }
}
