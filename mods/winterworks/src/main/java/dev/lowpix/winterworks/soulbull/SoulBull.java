package dev.lowpix.winterworks.soulbull;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.curse.Curses;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageTypes;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.AgeableMob;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySelector;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.SpawnGroupData;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.animal.horse.AbstractHorse;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.entity.monster.WitherSkeleton;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemUtils;
import net.minecraft.world.item.Items;
import net.minecraft.world.Difficulty;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.ServerLevelAccessor;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.pathfinder.PathType;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * The Soul Bull (docs/FIXES_0_4.md "The Soul Bull"): a charcoal skeleton bull kept alive by the soul fire in its ribs
 * and skull. Its health is its soul energy: water and rain hurt it like a blaze; soul torches, lanterns and campfires
 * (used on it, or drained from nearby along with soul fire) recharge it.
 * <ul>
 * <li>Wild: hostile. It rams, catches its victim on its horns and pins it ({@link #PIN_TICKS}), soul-burning it. The
 * Soul Sand Valley bulls are unarmoured, and Wither Skeletons ride them; the armoured variant (+8 armour, +50% health)
 * lives with the piglins, round bastions and Hex Fortresses, sometimes ridden by a piglin or a brute.</li>
 * <li>Tamed (fed a soul source when below half health, 1 in 3; or revived from its skull): horse armour, a saddle, and
 * riding like a horse. The jump key charges a ram that costs soul energy ({@link #ramCost}); an Elixir Bottle draws a
 * Soul Elixir for a quarter of its soul energy.</li>
 * </ul>
 * Modes (synced; each plays its clip): ram (1.0 s), pin (1.5 s), drain (souls flowing in), revive (2.0 s).
 */
public class SoulBull extends AbstractHorse {
    public static final byte MODE_NONE = 0, MODE_RAM = 1, MODE_PIN = 2, MODE_DRAIN = 3, MODE_REVIVE = 4;
    /** The ram clip is 1.0 s: it rears for {@link #RAM_WINDUP} ticks, then lunges. */
    public static final int RAM_TICKS = 20, RAM_WINDUP = 5;
    /** A ridden ram stays open this long at most: the rider's client drives the dash and may run a few ticks behind. */
    public static final int RIDDEN_RAM_MAX = 40;
    /** The pin clip is 1.5 s; the head tosses the victim off at 1.3 s. */
    public static final int PIN_TICKS = 30, PIN_TOSS = 26;
    public static final int DRAIN_TICKS = 40, REVIVE_TICKS = 40;
    /** Soul fire a pinned victim catches (ticks). */
    public static final int SOUL_FIRE_TICKS = 100;
    public static final double BASE_HEALTH = 40, BASE_ARMOR = 4, ARMORED_ARMOR_BONUS = 8, ARMORED_HEALTH_BONUS = 0.5;
    /** How far a wild bull's ram reaches: it starts a ram at its target from this close. */
    public static final double RAM_RANGE = 7.0;
    /** Chances of a rider: a Wither Skeleton on a Soul Sand Valley bull; a piglin (or, 3 in 10 of those, a brute) on an armoured one. */
    public static final float WITHER_RIDER_CHANCE = 0.2f, PIGLIN_RIDER_CHANCE = 0.25f, BRUTE_SHARE = 0.3f;

    private static final EntityDataAccessor<Boolean> ARMORED = SynchedEntityData.defineId(SoulBull.class, EntityDataSerializers.BOOLEAN);
    private static final EntityDataAccessor<Byte> MODE = SynchedEntityData.defineId(SoulBull.class, EntityDataSerializers.BYTE);
    private static final EntityDataAccessor<Long> RAM_READY = SynchedEntityData.defineId(SoulBull.class, EntityDataSerializers.LONG);
    private static final EntityDataAccessor<Optional<BlockPos>> DRAIN_FROM = SynchedEntityData.defineId(SoulBull.class,
            EntityDataSerializers.OPTIONAL_BLOCK_POS);
    private static final ResourceLocation ARMORED_HEALTH_ID = Winterworks.id("soul_bull_armored_health");
    private static final ResourceLocation ARMORED_ARMOR_ID = Winterworks.id("soul_bull_armored_armor");

    public final AnimationState idleState = new AnimationState();
    public final AnimationState ramState = new AnimationState();
    public final AnimationState pinState = new AnimationState();
    public final AnimationState drainState = new AnimationState();
    public final AnimationState reviveState = new AnimationState();

    // server
    private int modeTicks;
    private float ramPower = 1f;
    private Vec3 ramDir = Vec3.ZERO;
    /** The way it faces through a ram and its pin (set at the ram's start). */
    private float ramYaw;
    @Nullable
    private Vec3 ramLastPos;
    private int ramSlowTicks;
    private boolean ramStopped;
    @Nullable
    private LivingEntity pinned;
    @Nullable
    private Player pinCredit;
    private int drainCooldown;
    // client: the rider's own ram dash (a ridden bull moves on its rider's client)
    private float pendingRam;
    private float dashPower;
    private int dashTicks = -1;
    /** Client: the way a ridden bull faces while it holds a victim (the rider can't swing it round). */
    private float pinYaw;
    /** Client: the last tick soul flames were drawn (the renderer draws them once a tick). */
    public int lastFxTick;

    public SoulBull(EntityType<? extends SoulBull> type, Level level) {
        super(type, level);
        setPathfindingMalus(PathType.WATER, -1f);
        setPathfindingMalus(PathType.WATER_BORDER, 8f);
        setPathfindingMalus(PathType.DANGER_FIRE, 0f);
        setPathfindingMalus(PathType.DAMAGE_FIRE, 0f);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return Mob.createMobAttributes()
                .add(Attributes.MAX_HEALTH, BASE_HEALTH)
                .add(Attributes.ARMOR, BASE_ARMOR)
                .add(Attributes.ATTACK_DAMAGE, 7.0)
                .add(Attributes.ATTACK_KNOCKBACK, 1.0)
                .add(Attributes.MOVEMENT_SPEED, 0.27)
                .add(Attributes.KNOCKBACK_RESISTANCE, 0.6)
                .add(Attributes.FOLLOW_RANGE, 24.0)
                .add(Attributes.JUMP_STRENGTH, 0.5)
                .add(Attributes.STEP_HEIGHT, 1.0)
                .add(Attributes.SAFE_FALL_DISTANCE, 6.0)
                .add(Attributes.FALL_DAMAGE_MULTIPLIER, 0.5);
    }

    /**
     * Natural spawns, never in peaceful: on soul sand or soul soil (the Soul Sand Valleys), or on any ground in and around
     * the piglins' structures (SoulBullFeature.PIGLIN_LANDS).
     */
    public static boolean checkSoulBullSpawnRules(EntityType<SoulBull> type, ServerLevelAccessor level, MobSpawnType reason, BlockPos pos,
                                                  RandomSource random) {
        if (level.getDifficulty() == Difficulty.PEACEFUL || !Mob.checkMobSpawnRules(type, level, reason, pos, random)) {
            return false;
        }
        return reason == MobSpawnType.SPAWNER || level.getBlockState(pos.below()).is(net.minecraft.tags.BlockTags.SOUL_FIRE_BASE_BLOCKS)
                || (level instanceof ServerLevel sl && SoulBullFeature.inPiglinLands(sl, pos));
    }

    /**
     * A bull for a structure to place (the Hex Fortress pens): hostile, persistent, armoured or not; add it with
     * addFreshEntityWithPassengers. Works in world generation too (no structure lookups).
     */
    public static SoulBull createPenBull(ServerLevelAccessor level, double x, double y, double z, float yaw, boolean armored) {
        SoulBull b = dev.lowpix.winterworks.registry.WWEntities.SOUL_BULL.create(level.getLevel());
        b.moveTo(x, y, z, yaw, 0f);
        b.setYHeadRot(yaw);
        b.setYBodyRot(yaw);
        b.setArmored(armored);
        b.setHealth(b.getMaxHealth());
        b.setPersistenceRequired();
        return b;
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder b) {
        super.defineSynchedData(b);
        b.define(ARMORED, false);
        b.define(MODE, MODE_NONE);
        b.define(RAM_READY, 0L);
        b.define(DRAIN_FROM, Optional.empty());
    }

    @Override
    protected void registerGoals() {
        goalSelector.addGoal(0, new FloatGoal(this));
        goalSelector.addGoal(1, new SoulBullRamGoal(this));
        goalSelector.addGoal(6, new WaterAvoidingRandomStrollGoal(this, 0.8));
        goalSelector.addGoal(7, new LookAtPlayerGoal(this, Player.class, 8f));
        goalSelector.addGoal(8, new RandomLookAroundGoal(this));
        targetSelector.addGoal(1, new HurtByTargetGoal(this, SoulBull.class, WitherSkeleton.class,
                net.minecraft.world.entity.monster.piglin.AbstractPiglin.class) {
            @Override
            public boolean canUse() {
                return !isTamed() && super.canUse();
            }
        }.setAlertOthers());   // the herd joins in
        targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(this, Player.class, 10, true, false, e -> !isTamed()));
    }

    @Override
    protected void addBehaviourGoals() {}

    // ------------------------------------------------------------------------------------------------ state

    public boolean isArmored() {
        return entityData.get(ARMORED);
    }

    /** The natural armoured variant: blackstone plates bolted to its bones (more armour, +50% health). */
    public void setArmored(boolean armored) {
        entityData.set(ARMORED, armored);
        applyArmoredStats(armored);
    }

    private void applyArmoredStats(boolean armored) {
        AttributeInstance hp = getAttribute(Attributes.MAX_HEALTH), armor = getAttribute(Attributes.ARMOR);
        if (hp == null || armor == null) {
            return;
        }
        if (armored) {
            if (!hp.hasModifier(ARMORED_HEALTH_ID)) {
                hp.addPermanentModifier(new AttributeModifier(ARMORED_HEALTH_ID, ARMORED_HEALTH_BONUS, AttributeModifier.Operation.ADD_MULTIPLIED_BASE));
            }
            if (!armor.hasModifier(ARMORED_ARMOR_ID)) {
                armor.addPermanentModifier(new AttributeModifier(ARMORED_ARMOR_ID, ARMORED_ARMOR_BONUS, AttributeModifier.Operation.ADD_VALUE));
            }
        } else {
            hp.removeModifier(ARMORED_HEALTH_ID);
            armor.removeModifier(ARMORED_ARMOR_ID);
            if (getHealth() > getMaxHealth()) {
                setHealth(getMaxHealth());
            }
        }
    }

    public byte mode() {
        return entityData.get(MODE);
    }

    private void setMode(byte m) {
        entityData.set(MODE, m);
        modeTicks = 0;
        if (m != MODE_DRAIN) {
            entityData.set(DRAIN_FROM, Optional.empty());
        }
    }

    public boolean isReviving() {
        return mode() == MODE_REVIVE;
    }

    public boolean isRamming() {
        return mode() == MODE_RAM;
    }

    public boolean isPinning() {
        return mode() == MODE_PIN;
    }

    public boolean isDraining() {
        return mode() == MODE_DRAIN;
    }

    @Nullable
    public LivingEntity pinned() {
        return pinned;
    }

    public Optional<BlockPos> drainSource() {
        return entityData.get(DRAIN_FROM);
    }

    /** Soul energy, 0..1 (its health). */
    public float soulEnergy() {
        return Mth.clamp(getHealth() / getMaxHealth(), 0f, 1f);
    }

    /** Ticks before it can ram again (the rider's jump bar waits for it). */
    public int ramCooldown() {
        return (int) Math.max(0L, entityData.get(RAM_READY) - level().getGameTime());
    }

    private void setRamCooldown(int ticks) {
        entityData.set(RAM_READY, level().getGameTime() + ticks);
    }

    /** A jump-bar charge (0..100 from the client) as ram power, 0.2..1. */
    public static float ramPower(int charge) {
        return charge >= 90 ? 1f : Mth.clamp(charge / 90f, 0.2f, 1f);
    }

    /** Soul energy a tamed bull's ram burns: 12% of its soul at the lightest tap, 25% fully charged. */
    public float ramCost(float power) {
        return getMaxHealth() * (0.12f + 0.13f * Mth.clamp(power, 0f, 1f));
    }

    public boolean canAffordRam(float power) {
        return getHealth() - ramCost(power) >= 1f;
    }

    /** Soul energy milking takes (a quarter of its soul), and it refuses at or below that. */
    public float milkCost() {
        return getMaxHealth() / 4f;
    }

    public Vec3 forward() {
        return Vec3.directionFromRotation(0f, getYRot());
    }

    /** How big this bull is next to the first, 1.6-block-tall one (the model is 1.6x that): its reach, horns and chest scale with it. */
    public float bodyScale() {
        return getBbHeight() / 1.6f;
    }

    /** Where a pinned victim's feet are held: on the horns, out in front of its lowered head. */
    public Vec3 hornHold() {
        float k = bodyScale();
        return position().add(forward().scale(getBbWidth() * 0.5 + 1.05 * k)).add(0, 0.45 * k, 0);
    }

    // ------------------------------------------------------------------------------------------------ spawning

    @Nullable
    @Override
    public SpawnGroupData finalizeSpawn(ServerLevelAccessor level, DifficultyInstance difficulty, MobSpawnType reason,
                                        @Nullable SpawnGroupData data) {
        SpawnGroupData out = super.finalizeSpawn(level, difficulty, reason, data == null ? new AgeableMob.AgeableMobGroupData(false) : data);
        setAge(0);
        if (reason == MobSpawnType.JOCKEY) {
            return out;
        }
        RandomSource r = level.getRandom();
        Mob rider = null;
        if (level instanceof ServerLevel sl && SoulBullFeature.inPiglinLands(sl, blockPosition())) {
            setArmored(true);   // the piglins' bulls wear blackstone plates, and now and then a piglin or a brute rides one
            setHealth(getMaxHealth());
            if (r.nextFloat() < PIGLIN_RIDER_CHANCE) {
                rider = r.nextFloat() < BRUTE_SHARE ? EntityType.PIGLIN_BRUTE.create(sl) : EntityType.PIGLIN.create(sl);
            }
        } else if (r.nextFloat() < WITHER_RIDER_CHANCE) {
            rider = EntityType.WITHER_SKELETON.create(level.getLevel());   // the wild valley bulls carry Wither Skeletons
        }
        if (rider != null) {
            rider.moveTo(getX(), getY(), getZ(), getYRot(), 0f);
            rider.finalizeSpawn(level, difficulty, MobSpawnType.JOCKEY, null);
            rider.startRiding(this, true);
        }
        return out;
    }

    @Override
    public boolean removeWhenFarAway(double distance) {
        return !isTamed() && !isSaddled();
    }

    @Override
    public boolean shouldDespawnInPeaceful() {
        return !isTamed();
    }

    @Override
    public int getMaxSpawnClusterSize() {
        return 3;
    }

    @Override
    protected int getBaseExperienceReward() {
        return isArmored() ? 15 : 10;
    }

    // ------------------------------------------------------------------------------------------------ nature

    /** Water and rain hurt it like a blaze. */
    @Override
    public boolean isSensitiveToWater() {
        return true;
    }

    @Override
    public boolean canBeAffected(MobEffectInstance effect) {
        return !effect.is(MobEffects.WITHER) && super.canBeAffected(effect);
    }

    @Override
    public boolean hurt(DamageSource source, float amount) {
        if (isReviving() && !source.is(net.minecraft.tags.DamageTypeTags.BYPASSES_INVULNERABILITY)) {
            return false;
        }
        return super.hurt(source, amount);
    }

    @Override
    public boolean isImmobile() {
        return super.isImmobile() || isReviving();
    }

    @Override
    protected boolean canPerformRearing() {
        return false;
    }

    @Override
    public boolean canEatGrass() {
        return false;
    }

    @Override
    public boolean isFood(ItemStack stack) {
        return false;
    }

    @Override
    public boolean canMate(net.minecraft.world.entity.animal.Animal other) {
        return false;
    }

    @Nullable
    @Override
    public AgeableMob getBreedOffspring(ServerLevel level, AgeableMob other) {
        return null;
    }

    @Override
    public boolean canUseSlot(EquipmentSlot slot) {
        return true;
    }

    /** Horse armour (iron, gold and diamond: the ones it has art for). */
    @Override
    public boolean isBodyArmorItem(ItemStack stack) {
        return stack.is(Items.IRON_HORSE_ARMOR) || stack.is(Items.GOLDEN_HORSE_ARMOR) || stack.is(Items.DIAMOND_HORSE_ARMOR);
    }

    @Override
    public void containerChanged(net.minecraft.world.Container container) {
        ItemStack before = getBodyArmorItem();
        super.containerChanged(container);
        if (tickCount > 20 && isBodyArmorItem(getBodyArmorItem()) && before != getBodyArmorItem()) {
            playSound(net.minecraft.sounds.SoundEvents.HORSE_ARMOR, 0.5f, 0.8f);
        }
    }

    /** Only a player on a saddled, tamed bull steers it; a Wither Skeleton rider just rides along and fights. */
    @Nullable
    @Override
    public LivingEntity getControllingPassenger() {
        return isTamed() && isSaddled() && getFirstPassenger() instanceof Player p ? p : null;
    }

    // ------------------------------------------------------------------------------------------------ sounds

    @Override
    protected SoundEvent getAmbientSound() {
        return random.nextInt(3) == 0 ? WWSounds.SOUL_BULL_SNORT : WWSounds.SOUL_BULL_AMBIENT;
    }

    @Override
    protected SoundEvent getHurtSound(DamageSource source) {
        return WWSounds.SOUL_BULL_HURT;
    }

    @Override
    protected SoundEvent getDeathSound() {
        return WWSounds.SOUL_BULL_DEATH;
    }

    @Nullable
    @Override
    protected SoundEvent getAngrySound() {
        return WWSounds.SOUL_BULL_SNORT;
    }

    @Override
    protected void playStepSound(BlockPos pos, BlockState state) {
        if (!state.liquid()) {
            playSound(WWSounds.SOUL_BULL_STEP, isVehicle() ? 0.5f : 0.35f, 0.9f + random.nextFloat() * 0.2f);
        }
    }

    @Override
    protected void playGallopSound(SoundType type) {
        playSound(WWSounds.SOUL_BULL_STEP, 0.6f, 1.1f);
    }

    @Override
    public int getAmbientSoundInterval() {
        return 240;
    }

    // ------------------------------------------------------------------------------------------------ interaction

    @Override
    public InteractionResult mobInteract(Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if (isReviving()) {
            return InteractionResult.PASS;
        }
        float refill = SoulSources.itemRefill(stack);
        if (refill > 0f && !(isVehicle() && player.isSecondaryUseActive())) {
            return feed(player, stack, refill);
        }
        if (!isTamed()) {
            return InteractionResult.PASS;   // wild: no riding, no milking
        }
        if (stack.is(WWItems.ELIXIR_BOTTLE)) {
            return milk(player, hand, stack);
        }
        if (isVehicle()) {
            return InteractionResult.PASS;
        }
        if (player.isSecondaryUseActive()) {
            openCustomInventoryScreen(player);
            return InteractionResult.sidedSuccess(level().isClientSide);
        }
        if (!stack.isEmpty()) {
            InteractionResult r = stack.interactLivingEntity(player, this, hand);   // the saddle
            if (r.consumesAction()) {
                return r;
            }
            if (isBodyArmorItem(stack) && !isWearingBodyArmor()) {
                equipBodyArmor(player, stack);
                return InteractionResult.sidedSuccess(level().isClientSide);
            }
        }
        doPlayerRide(player);
        return InteractionResult.sidedSuccess(level().isClientSide);
    }

    /**
     * A soul torch, lantern or campfire used on it. Tamed: a big refill (refused when full). Wild: it only eats when
     * below half its soul energy, and then 1 in 3 tames it to the feeder (else it gets a little energy back).
     */
    public InteractionResult feed(Player player, ItemStack stack, float refill) {
        boolean weak = getHealth() < getMaxHealth() * 0.5f;
        if (isTamed() ? getHealth() >= getMaxHealth() : !weak) {
            if (!level().isClientSide) {
                makeSound(WWSounds.SOUL_BULL_SNORT);
            }
            return InteractionResult.PASS;
        }
        if (level().isClientSide) {
            return InteractionResult.SUCCESS;
        }
        stack.consume(1, player);
        soulBurst(14);
        playSound(WWSounds.SOUL_BULL_DRAIN, 1.0f, 1.2f);
        if (isTamed()) {
            heal(refill);
        } else if (random.nextInt(3) == 0) {
            heal(refill);
            tame(player);
        } else {
            heal(3f);
            level().broadcastEntityEvent(this, (byte) 6);   // smoke: not this time
            makeSound(WWSounds.SOUL_BULL_SNORT);
        }
        return InteractionResult.SUCCESS;
    }

    /** Tames it to a player: it stops fighting and throws off any Wither Skeleton rider. */
    public void tame(Player player) {
        tameWithName(player);
        setPersistenceRequired();
        setTarget(null);
        navigation.stop();
        for (Entity e : List.copyOf(getPassengers())) {
            if (!(e instanceof Player)) {
                e.stopRiding();
            }
        }
        if (mode() == MODE_RAM || mode() == MODE_PIN) {
            releasePin(false);
            setMode(MODE_NONE);
        }
    }

    /** An Elixir Bottle draws a Soul Elixir from its soul fire for a quarter of its soul energy (it refuses below that). */
    public InteractionResult milk(Player player, InteractionHand hand, ItemStack stack) {
        float cost = milkCost();
        if (getHealth() <= cost) {
            if (!level().isClientSide) {
                makeSound(WWSounds.SOUL_BULL_SNORT);
                level().broadcastEntityEvent(this, (byte) 6);
                player.displayClientMessage(Component.translatable("message.winterworks.soul_bull.milk_refused"), true);
            }
            return InteractionResult.sidedSuccess(level().isClientSide);
        }
        if (!level().isClientSide) {
            setHealth(getHealth() - cost);
            player.setItemInHand(hand, ItemUtils.createFilledResult(stack, player, new ItemStack(WWItems.SOUL_ELIXIR)));
            playSound(net.minecraft.sounds.SoundEvents.BOTTLE_FILL_DRAGONBREATH, 1.0f, 0.8f);
            playSound(WWSounds.SOUL_BULL_DRAIN, 0.7f, 0.7f);
            soulBurst(10);
        }
        return InteractionResult.sidedSuccess(level().isClientSide);
    }

    private void soulBurst(int n) {
        if (level() instanceof ServerLevel sl) {
            sl.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, getX(), getY() + 1.0, getZ(), n, 0.4, 0.3, 0.4, 0.03);
            sl.sendParticles(ParticleTypes.SOUL, getX(), getY() + 1.1, getZ(), n / 2, 0.3, 0.3, 0.3, 0.02);
        }
    }

    // ------------------------------------------------------------------------------------------------ the ram

    /**
     * Starts a ram along `dir` (server). A tamed bull pays for it in soul energy ({@link #ramCost}); a wild one rams for
     * free. Returns false if it can't (busy, cooling down, or too little soul energy).
     */
    public boolean startRam(float power, Vec3 dir) {
        if (level().isClientSide || mode() != MODE_NONE || ramCooldown() > 0) {
            return false;
        }
        if (isTamed()) {
            if (!canAffordRam(power)) {
                makeSound(WWSounds.SOUL_BULL_SNORT);
                level().broadcastEntityEvent(this, (byte) 6);
                if (getControllingPassenger() instanceof Player p) {
                    p.displayClientMessage(Component.translatable("message.winterworks.soul_bull.ram_weak"), true);
                }
                return false;
            }
            setHealth(getHealth() - ramCost(power));
        }
        ramPower = Mth.clamp(power, 0.2f, 1f);
        Vec3 flat = new Vec3(dir.x, 0, dir.z);
        ramDir = flat.lengthSqr() < 1.0e-6 ? forward() : flat.normalize();
        ramYaw = (float) (Mth.atan2(ramDir.z, ramDir.x) * Mth.RAD_TO_DEG) - 90f;
        ramStopped = false;
        ramLastPos = null;
        ramSlowTicks = 0;
        setMode(MODE_RAM);
        playSound(WWSounds.SOUL_BULL_SNORT, 1.2f, 0.9f);
        playSound(WWSounds.SOUL_BULL_RAM, 1.4f, 0.95f + random.nextFloat() * 0.1f);
        return true;
    }

    private int dashEnd(float power) {
        return RAM_WINDUP + 6 + Math.round(8 * power);
    }

    private void tickRam() {
        boolean riderDriven = getControllingPassenger() instanceof Player;   // the rider's client moves it
        int end = dashEnd(ramPower);
        if (!riderDriven) {
            faceRam();
        }
        if (!riderDriven && !ramStopped) {
            Vec3 v = getDeltaMovement();
            if (modeTicks < RAM_WINDUP) {
                setDeltaMovement(v.x * 0.4, v.y, v.z * 0.4);   // rears back
            } else if (modeTicks <= end) {
                double s = 0.38 + 0.22 * ramPower;
                setDeltaMovement(ramDir.x * s, v.y, ramDir.z * s);
                if (horizontalCollision && modeTicks > RAM_WINDUP + 1) {
                    ramStopped = true;
                    playSound(WWSounds.SOUL_BULL_PIN, 0.8f, 0.6f);
                }
            }
        }
        Vec3 from = ramLastPos == null ? position() : ramLastPos;
        double moved = position().subtract(from).horizontalDistance();
        ramLastPos = position();
        boolean open, over;
        if (riderDriven) {   // open for as long as the rider's dash is still charging along
            ramSlowTicks = moved < 0.12 ? ramSlowTicks + 1 : 0;
            open = modeTicks >= RAM_WINDUP - 1;
            over = modeTicks >= RIDDEN_RAM_MAX || (modeTicks > end && ramSlowTicks >= 4);
        } else {
            open = modeTicks >= RAM_WINDUP - 1 && modeTicks <= end + 2;
            over = modeTicks >= RAM_TICKS;
        }
        if (open) {
            LivingEntity victim = findVictim(from);
            if (victim != null) {
                startPin(victim);
                return;
            }
        }
        if (over) {
            setMode(MODE_NONE);
            setRamCooldown(isTamed() ? 10 : 30);
        }
    }

    private void faceRam() {
        setYRot(ramYaw);
        yRotO = ramYaw;
        yBodyRot = yHeadRot = ramYaw;
        setXRot(0f);
    }

    /**
     * The first living thing its horns swept through since `from` (its position last tick: a ridden bull's moves arrive
     * from its rider's client and can jump a few blocks at once), never its rider, its kin or, when tame, its owner.
     */
    @Nullable
    private LivingEntity findVictim(Vec3 from) {
        if (from.distanceToSqr(position()) > 100) {
            from = position();   // teleported, not charged
        }
        float k = bodyScale();
        double r = 0.85 * k;
        Vec3 f = forward().scale(getBbWidth() * 0.5 + 0.8 * k);
        Vec3 c = from.add(f), d = position().add(f);
        AABB box = new AABB(Math.min(c.x, d.x) - r, getY() + 0.1, Math.min(c.z, d.z) - r, Math.max(c.x, d.x) + r, getY() + 1.7 * k,
                Math.max(c.z, d.z) + r);
        List<LivingEntity> hits = level().getEntitiesOfClass(LivingEntity.class, box, e -> e != this && e.isAlive() && e.attackable()
                && !(e instanceof ArmorStand) && !(e instanceof SoulBull) && !hasPassenger(e) && e.getVehicle() != this
                && EntitySelector.NO_CREATIVE_OR_SPECTATOR.test(e) && !isFriend(e));
        return hits.stream().min(Comparator.comparingDouble(e -> e.distanceToSqr(c))).orElse(null);
    }

    private boolean isFriend(LivingEntity e) {
        if (!isTamed()) {
            return e instanceof WitherSkeleton || e instanceof net.minecraft.world.entity.monster.piglin.AbstractPiglin;
        }
        if (getOwnerUUID() != null && getOwnerUUID().equals(e.getUUID())) {
            return true;
        }
        return e instanceof net.minecraft.world.entity.OwnableEntity o && getOwnerUUID() != null && getOwnerUUID().equals(o.getOwnerUUID());
    }

    /** Caught on the horns: hurt, set alight with soul fire, and held for the pin. */
    private void startPin(LivingEntity victim) {
        pinned = victim;
        pinCredit = getControllingPassenger() instanceof Player p ? p : null;
        setMode(MODE_PIN);
        float dmg = (float) getAttributeValue(Attributes.ATTACK_DAMAGE) * (0.7f + 0.6f * ramPower);
        DamageSource src = pinCredit != null ? damageSources().source(DamageTypes.MOB_ATTACK, this, pinCredit) : damageSources().mobAttack(this);
        victim.hurt(src, dmg);
        Curses.soulIgnite(victim, SOUL_FIRE_TICKS);
        if (pinCredit == null) {
            setLastHurtMob(victim);
        }
        playSound(WWSounds.SOUL_BULL_PIN, 1.5f, 0.9f + random.nextFloat() * 0.15f);
        if (level() instanceof ServerLevel sl) {
            Vec3 h = hornHold();
            sl.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, h.x, h.y + 0.6, h.z, 18, 0.35, 0.4, 0.35, 0.06);
            sl.sendParticles(ParticleTypes.SOUL, h.x, h.y + 0.6, h.z, 8, 0.3, 0.3, 0.3, 0.05);
        }
    }

    private void tickPin() {
        LivingEntity v = pinned;
        if (v == null || !v.isAlive() || v.isRemoved() || v.level() != level() || v.distanceToSqr(this) > 64 || modeTicks > PIN_TICKS) {
            releasePin(false);
            endPin();
            return;
        }
        if (!(getControllingPassenger() instanceof Player)) {
            faceRam();   // it doesn't look away from what it holds
            Vec3 m = getDeltaMovement();
            setDeltaMovement(m.x * 0.2, m.y, m.z * 0.2);   // braced, shoving
        }
        if (modeTicks < PIN_TOSS) {
            Vec3 hold = hornHold();
            if (v instanceof Player) {   // players move on their own client: pull them onto the horns
                v.setDeltaMovement(hold.subtract(v.position()).scale(0.55));
                v.hurtMarked = true;
            } else {
                v.setPos(hold.x, hold.y, hold.z);
                v.setDeltaMovement(Vec3.ZERO);
            }
            v.resetFallDistance();
            if (modeTicks % 10 == 5) {
                Curses.soulIgnite(v, SOUL_FIRE_TICKS);   // the horns grind the soul fire in
            }
        } else if (modeTicks == PIN_TOSS) {
            releasePin(true);
        }
        if (modeTicks >= PIN_TICKS) {
            endPin();
        }
    }

    /** Lets go of the victim; `toss` flings it off the horns. */
    private void releasePin(boolean toss) {
        LivingEntity v = pinned;
        pinned = null;
        if (v != null && toss && v.isAlive()) {
            Vec3 f = forward();
            v.setDeltaMovement(f.x * 0.9, 0.55, f.z * 0.9);
            v.hurtMarked = true;
            v.hasImpulse = true;
            playSound(WWSounds.SOUL_BULL_SNORT, 1.0f, 1.1f);
        }
    }

    private void endPin() {
        pinned = null;
        pinCredit = null;
        setMode(MODE_NONE);
        setRamCooldown(isTamed() ? 10 : 40);
    }

    // ------------------------------------------------------------------------------------------------ draining souls

    private void tickDrainSearch() {
        if (drainCooldown > 0) {
            drainCooldown--;
            return;
        }
        if (getHealth() >= getMaxHealth() || isInWaterRainOrBubble()) {
            drainCooldown = 20;
            return;
        }
        if (getTarget() != null && getHealth() > getMaxHealth() * 0.5f) {
            drainCooldown = 20;   // busy fighting
            return;
        }
        BlockPos src = SoulSources.nearest(level(), BlockPos.containing(getX(), getY() + 0.5, getZ()), 6, 3);
        if (src == null) {
            drainCooldown = 30;
            return;
        }
        setMode(MODE_DRAIN);
        entityData.set(DRAIN_FROM, Optional.of(src));
        playSound(WWSounds.SOUL_BULL_DRAIN, 1.0f, 0.9f);
    }

    private void tickDrain() {
        BlockPos src = drainSource().orElse(null);
        if (src == null || SoulSources.blockRefill(level().getBlockState(src)) <= 0f || src.distToCenterSqr(position()) > 100) {
            setMode(MODE_NONE);
            drainCooldown = 10;
            return;
        }
        if (!(getControllingPassenger() instanceof Player)) {
            navigation.stop();
            getLookControl().setLookAt(src.getX() + 0.5, src.getY() + 0.5, src.getZ() + 0.5, 30f, 30f);
        }
        if (modeTicks % 20 == 10) {
            playSound(WWSounds.SOUL_BULL_DRAIN, 0.8f, 0.8f + random.nextFloat() * 0.3f);
        }
        if (modeTicks >= DRAIN_TICKS && level() instanceof ServerLevel sl) {
            heal(SoulSources.drain(sl, src));
            setMode(MODE_NONE);
            drainCooldown = 40;
        }
    }

    // ------------------------------------------------------------------------------------------------ revival

    /** Rebuilt from its skull: plays the revive clip (immobile and unhurt meanwhile). */
    public void startRevive() {
        setMode(MODE_REVIVE);
    }

    // ------------------------------------------------------------------------------------------------ ticking

    @Override
    public void aiStep() {
        super.aiStep();
        if (level().isClientSide) {
            return;
        }
        if (isTamed() && getTarget() != null) {
            setTarget(null);
        }
        modeTicks++;
        switch (mode()) {
            case MODE_RAM -> tickRam();
            case MODE_PIN -> tickPin();
            case MODE_DRAIN -> tickDrain();
            case MODE_REVIVE -> {
                if (modeTicks >= REVIVE_TICKS) {
                    setMode(MODE_NONE);
                }
            }
            default -> tickDrainSearch();
        }
    }

    @Override
    public void tick() {
        super.tick();
        if (level().isClientSide) {
            idleState.startIfStopped(tickCount);
            if (isDraining()) {
                drainFx();
            }
        }
    }

    /** Souls stream out of the source into its ribs. */
    private void drainFx() {
        BlockPos src = drainSource().orElse(null);
        if (src == null) {
            return;
        }
        Vec3 chest = position().add(forward().scale(0.35 * bodyScale())).add(0, 1.05 * bodyScale(), 0);
        for (int i = 0; i < 2; i++) {
            Vec3 from = Vec3.atCenterOf(src).add((random.nextDouble() - 0.5) * 0.5, (random.nextDouble() - 0.3) * 0.5,
                    (random.nextDouble() - 0.5) * 0.5);
            Vec3 v = chest.subtract(from).scale(1.0 / 14.0);
            level().addParticle(i == 0 ? ParticleTypes.SOUL : ParticleTypes.SOUL_FIRE_FLAME, from.x, from.y, from.z, v.x, v.y, v.z);
        }
    }

    @Override
    public void onSyncedDataUpdated(EntityDataAccessor<?> key) {
        super.onSyncedDataUpdated(key);
        if (MODE.equals(key) && level().isClientSide) {
            ramState.stop();
            pinState.stop();
            drainState.stop();
            reviveState.stop();
            switch (mode()) {
                case MODE_RAM -> ramState.start(tickCount);
                case MODE_PIN -> pinState.start(tickCount);
                case MODE_DRAIN -> drainState.start(tickCount);
                case MODE_REVIVE -> reviveState.start(tickCount);
                default -> { }
            }
            if (mode() == MODE_PIN) {
                dashTicks = -1;   // caught something: the dash ends on the horns
                pinYaw = getYRot();
            }
        }
    }

    // ------------------------------------------------------------------------------------------------ riding: the jump key rams

    /** The jump key charges a ram, so the bar (the soul bar) is up whenever it is saddled. */
    @Override
    public boolean canJump() {
        return isSaddled();
    }

    @Override
    public int getJumpCooldown() {
        return mode() == MODE_NONE ? ramCooldown() : Math.max(1, ramCooldown());
    }

    /** Client: the rider let go of the jump key; the dash starts on the next ridden tick. */
    @Override
    public void onPlayerJump(int charge) {
        if (!isSaddled() || charge <= 0 || mode() != MODE_NONE) {
            return;
        }
        float p = ramPower(charge);
        if (canAffordRam(p)) {
            pendingRam = p;
        }
    }

    /** Server: the rider let go of the jump key. */
    @Override
    public void handleStartJump(int charge) {
        if (getControllingPassenger() instanceof Player p) {
            startRam(ramPower(charge), Vec3.directionFromRotation(0f, p.getYRot()));
        }
    }

    @Override
    public void handleStopJump() {}

    @Override
    protected void executeRidersJump(float scale, Vec3 input) {}   // no jumping: the jump key rams

    @Override
    protected void tickRidden(Player player, Vec3 input) {
        super.tickRidden(player, input);
        if (isControlledByLocalInstance()) {
            if (pendingRam > 0f && onGround()) {
                dashPower = pendingRam;
                dashTicks = 0;
                pendingRam = 0f;
            } else if (dashTicks >= 0) {
                dashTicks++;
                if (dashTicks > dashEnd(dashPower) || mode() == MODE_PIN || (horizontalCollision && dashTicks > RAM_WINDUP + 1)) {
                    dashTicks = -1;
                }
            }
        }
    }

    @Override
    protected net.minecraft.world.phys.Vec2 getRiddenRotation(LivingEntity rider) {
        return isPinning() ? new net.minecraft.world.phys.Vec2(getXRot(), pinYaw) : super.getRiddenRotation(rider);
    }

    @Override
    protected Vec3 getRiddenInput(Player player, Vec3 input) {
        if (isPinning() || isReviving()) {
            return Vec3.ZERO;
        }
        if (dashTicks >= 0) {
            return dashTicks < RAM_WINDUP ? new Vec3(0, 0, 0.15) : new Vec3(0, 0, 1);
        }
        return super.getRiddenInput(player, input);
    }

    @Override
    protected float getRiddenSpeed(Player player) {
        float s = super.getRiddenSpeed(player);
        return dashTicks >= RAM_WINDUP ? s * (2.0f + 0.8f * dashPower) : s;
    }

    /** True while the local rider's dash is under way (for the camera and HUD). */
    public boolean isDashing() {
        return dashTicks >= 0;
    }

    // ------------------------------------------------------------------------------------------------ saving

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        tag.putBoolean("Armored", isArmored());
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        entityData.set(ARMORED, tag.getBoolean("Armored"));
        applyArmoredStats(isArmored());
    }
}
