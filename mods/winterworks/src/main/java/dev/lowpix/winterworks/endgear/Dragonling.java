package dev.lowpix.winterworks.endgear;

import dev.lowpix.winterworks.mixin.endgear.EndGearLivingEntityAccessor;
import dev.lowpix.winterworks.registry.EndEntities;
import dev.lowpix.winterworks.registry.EndSounds;
import java.util.List;
import java.util.Set;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageTypes;
import net.minecraft.world.entity.AgeableMob;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityDimensions;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.MoverType;
import net.minecraft.world.entity.OwnableEntity;
import net.minecraft.world.entity.Pose;
import net.minecraft.world.entity.TamableAnimal;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.control.FlyingMoveControl;
import net.minecraft.world.entity.ai.control.MoveControl;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.FollowOwnerGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.SitWhenOrderedToGoal;
import net.minecraft.world.entity.ai.goal.TemptGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomFlyingGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.ai.navigation.FlyingPathNavigation;
import net.minecraft.world.entity.ai.navigation.GroundPathNavigation;
import net.minecraft.world.entity.animal.Animal;
import net.minecraft.world.entity.animal.FlyingAnimal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemUtils;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.pathfinder.PathType;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * The Dragonling (docs/END_UPDATE.md section 13): one entity with two synced stages.
 * <ul>
 * <li><b>Baby</b> (0.8 x 0.7, 20 health; the EntityType's size): hatched from a cracked Dragon Egg. Chorus fruit tames
 * it (1 in 3). Tamed babies follow their owner, sit when told, and hunt Endermites and small mobs (silverfish, chickens,
 * rabbits, bats, enderflies; never pets or players). Each meal grows them (Endermite 4, others 2); at 40 they're teens.
 * <li><b>Teen</b> (2.2 x 1.6, 60 health): sits / follows and flies after its owner; wears iron, golden or diamond
 * horse armour (body slot) and a saddle. Ridden, it flies where the rider looks (jump climbs, sneak dismounts) and
 * breathes dragon fire on the rider's key (key.winterworks.dragon_breath, C2S EndGearPayloads.DragonBreath): an
 * 8-block cone, 6 damage and fire, one charge each. A Dragon's Breath bottle gives 6 charges (max 24).
 * </ul>
 * Shears take the armour off, then the saddle. Ridden flight runs on the rider's client like any player-steered mount.
 */
public class Dragonling extends TamableAnimal implements FlyingAnimal {
    private static final EntityDataAccessor<Boolean> TEEN = SynchedEntityData.defineId(Dragonling.class, EntityDataSerializers.BOOLEAN);
    private static final EntityDataAccessor<Integer> GROWTH = SynchedEntityData.defineId(Dragonling.class, EntityDataSerializers.INT);
    private static final EntityDataAccessor<Integer> BREATH = SynchedEntityData.defineId(Dragonling.class, EntityDataSerializers.INT);
    private static final EntityDataAccessor<Boolean> SADDLED = SynchedEntityData.defineId(Dragonling.class, EntityDataSerializers.BOOLEAN);
    private static final EntityDataAccessor<Boolean> HATCHING = SynchedEntityData.defineId(Dragonling.class, EntityDataSerializers.BOOLEAN);

    public static final int TEEN_AT = 40, BREATH_PER_BOTTLE = 6, MAX_BREATH = 24;
    public static final double BABY_HEALTH = 20, TEEN_HEALTH = 60;
    public static final EntityDimensions TEEN_SIZE = EntityDimensions.scalable(2.2f, 1.6f).withEyeHeight(1.35f);
    public static final double BREATH_RANGE = 8.0, BREATH_CONE_COS = 0.82;
    public static final float BREATH_DAMAGE = 6f;
    public static final int BREATH_COOLDOWN = 20, HATCH_TICKS = 30;
    static final double FLY_SPEED = 0.85, CLIMB_SPEED = 0.4, WALK_SPEED = 0.28;
    /** What a tamed baby hunts. */
    public static final Set<EntityType<?>> PREY = Set.of(EntityType.ENDERMITE, EntityType.SILVERFISH, EntityType.CHICKEN,
            EntityType.RABBIT, EntityType.BAT, EndEntities.ENDERFLY);
    static final byte EV_EAT = 70, EV_BREATH = 71;

    public final AnimationState eatState = new AnimationState();
    public final AnimationState breathState = new AnimationState();
    public final AnimationState hatchState = new AnimationState();
    private int appliedStage = -1;
    private int breathCooldown, hatchTicks;

    public Dragonling(EntityType<? extends TamableAnimal> type, Level level) {
        super(type, level);
        setPathfindingMalus(PathType.DANGER_FIRE, -1.0f);
        setPathfindingMalus(PathType.DAMAGE_FIRE, -1.0f);
        applyStage();
    }

    public static AttributeSupplier.Builder createAttributes() {
        return Animal.createMobAttributes().add(Attributes.MAX_HEALTH, BABY_HEALTH).add(Attributes.MOVEMENT_SPEED, 0.3)
                .add(Attributes.FLYING_SPEED, 0.6).add(Attributes.ATTACK_DAMAGE, 3.0).add(Attributes.FOLLOW_RANGE, 20.0);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder b) {
        super.defineSynchedData(b);
        b.define(TEEN, false);
        b.define(GROWTH, 0);
        b.define(BREATH, 0);
        b.define(SADDLED, false);
        b.define(HATCHING, false);
    }

    // ------------------------------------------------------------------------------------------------ stage

    public boolean isTeen() {
        return entityData.get(TEEN);
    }

    public int getGrowth() {
        return entityData.get(GROWTH);
    }

    public int getBreath() {
        return entityData.get(BREATH);
    }

    public void setBreath(int charges) {
        entityData.set(BREATH, Mth.clamp(charges, 0, MAX_BREATH));
    }

    public boolean isSaddled() {
        return entityData.get(SADDLED);
    }

    public void setSaddled(boolean saddled) {
        entityData.set(SADDLED, saddled);
    }

    public boolean isHatching() {
        return entityData.get(HATCHING);
    }

    /** Just out of the egg: plays the hatch clip. */
    public void setHatching() {
        entityData.set(HATCHING, true);
        hatchTicks = HATCH_TICKS;
    }

    /** Becomes a teen now (60 health, full; 2.2 x 1.6; flies). */
    public void growUp() {
        if (isTeen()) {
            return;
        }
        entityData.set(TEEN, true);
        entityData.set(GROWTH, Math.max(getGrowth(), TEEN_AT));
        applyStage();
        setHealth(getMaxHealth());
        if (level() instanceof ServerLevel level) {
            level.playSound(null, getX(), getY(), getZ(), EndSounds.DRAGONLING_ROAR, getSoundSource(), 1.5f, 1.0f);
            level.sendParticles(ParticleTypes.REVERSE_PORTAL, getX(), getY(0.5), getZ(), 60, 1.0, 0.6, 1.0, 0.1);
            level.sendParticles(ParticleTypes.DRAGON_BREATH, getX(), getY(0.5), getZ(), 30, 0.8, 0.5, 0.8, 0.02);
        }
    }

    /** A meal: grows a tamed baby (Endermite 4, others 2) and heals a little. */
    public void eat(EntityType<?> prey) {
        int gain = prey == EntityType.ENDERMITE ? 4 : 2;
        heal(3f);
        if (!level().isClientSide) {
            level().broadcastEntityEvent(this, EV_EAT);
            playSound(EndSounds.DRAGONLING_EAT, 1.0f, getVoicePitch());
        }
        if (!isTeen()) {
            entityData.set(GROWTH, getGrowth() + gain);
            if (getGrowth() >= TEEN_AT) {
                growUp();
            }
        }
    }

    /** Navigation, movement, goals, health and size for the current stage (servers rebuild the AI on change). */
    private void applyStage() {
        int stage = isTeen() ? 1 : 0;
        if (stage == appliedStage) {
            return;
        }
        appliedStage = stage;
        refreshDimensions();
        AttributeInstance hp = getAttribute(Attributes.MAX_HEALTH);
        double max = stage == 1 ? TEEN_HEALTH : BABY_HEALTH;
        if (hp != null && hp.getBaseValue() != max) {
            hp.setBaseValue(max);
        }
        if (level().isClientSide) {
            return;
        }
        goalSelector.removeAllGoals(g -> true);
        targetSelector.removeAllGoals(g -> true);
        if (stage == 1) {
            moveControl = new TeenMoveControl(this);
            FlyingPathNavigation nav = new FlyingPathNavigation(this, level());
            nav.setCanOpenDoors(false);
            nav.setCanFloat(true);
            nav.setCanPassDoors(true);
            navigation = nav;
            goalSelector.addGoal(0, new FloatGoal(this));
            goalSelector.addGoal(1, new SitWhenOrderedToGoal(this));
            goalSelector.addGoal(2, new FollowOwnerGoal(this, 1.0, 10.0f, 3.0f));
            goalSelector.addGoal(3, new WaterAvoidingRandomFlyingGoal(this, 0.8));
            goalSelector.addGoal(4, new LookAtPlayerGoal(this, Player.class, 10.0f));
            goalSelector.addGoal(5, new RandomLookAroundGoal(this));
        } else {
            moveControl = new MoveControl(this);
            navigation = new GroundPathNavigation(this, level());
            goalSelector.addGoal(0, new FloatGoal(this));
            goalSelector.addGoal(1, new SitWhenOrderedToGoal(this));
            goalSelector.addGoal(2, new TamableAnimal.TamableAnimalPanicGoal(1.4));
            goalSelector.addGoal(3, new MeleeAttackGoal(this, 1.25, true));
            goalSelector.addGoal(4, new TemptGoal(this, 1.1, s -> s.is(Items.CHORUS_FRUIT), false));
            goalSelector.addGoal(5, new FollowOwnerGoal(this, 1.1, 7.0f, 2.0f));
            goalSelector.addGoal(6, new WaterAvoidingRandomStrollGoal(this, 0.9));
            goalSelector.addGoal(7, new LookAtPlayerGoal(this, Player.class, 8.0f));
            goalSelector.addGoal(8, new RandomLookAroundGoal(this));
            targetSelector.addGoal(1, new HuntGoal(this));
        }
    }

    @Override
    protected void registerGoals() {}   // applyStage() sets the goals for the stage

    @Override
    public EntityDimensions getDefaultDimensions(Pose pose) {
        return isTeen() ? TEEN_SIZE : super.getDefaultDimensions(pose);
    }

    @Override
    public void onSyncedDataUpdated(EntityDataAccessor<?> key) {
        super.onSyncedDataUpdated(key);
        if (TEEN.equals(key)) {
            applyStage();
        }
    }

    /** A teen's FlyingMoveControl, idle while a rider steers (so it doesn't drop gravity back on under them). */
    static final class TeenMoveControl extends FlyingMoveControl {
        TeenMoveControl(Dragonling d) {
            super(d, 12, false);
        }

        @Override
        public void tick() {
            if (!mob.isVehicle()) {
                super.tick();
            }
        }
    }

    /** Tamed, awake babies hunt small prey. */
    static final class HuntGoal extends NearestAttackableTargetGoal<LivingEntity> {
        private final Dragonling d;

        HuntGoal(Dragonling d) {
            super(d, LivingEntity.class, 10, true, false, Dragonling::isPrey);
            this.d = d;
        }

        @Override
        public boolean canUse() {
            return d.isTame() && !d.isTeen() && !d.isOrderedToSit() && super.canUse();
        }

        @Override
        public boolean canContinueToUse() {
            return d.isTame() && !d.isTeen() && !d.isOrderedToSit() && super.canContinueToUse();
        }
    }

    /** Small prey, never a pet or a player. */
    public static boolean isPrey(LivingEntity e) {
        return PREY.contains(e.getType()) && !(e instanceof OwnableEntity pet && pet.getOwnerUUID() != null) && !(e instanceof Player);
    }

    @Override
    public boolean killedEntity(ServerLevel level, LivingEntity victim) {
        if (isTame() && PREY.contains(victim.getType())) {
            eat(victim.getType());
        }
        return super.killedEntity(level, victim);
    }

    // ------------------------------------------------------------------------------------------------ interaction

    @Override
    public InteractionResult mobInteract(Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        boolean owner = isTame() && isOwnedBy(player);
        if (level().isClientSide) {
            return (!isTame() && stack.is(Items.CHORUS_FRUIT)) || owner ? InteractionResult.SUCCESS : InteractionResult.PASS;
        }
        if (!isTame() && stack.is(Items.CHORUS_FRUIT)) {
            stack.consume(1, player);
            playSound(EndSounds.DRAGONLING_EAT, 1.0f, getVoicePitch());
            if (random.nextInt(3) == 0) {
                tame(player);
                navigation.stop();
                setTarget(null);
                setOrderedToSit(false);
                level().broadcastEntityEvent(this, (byte) 7);
            } else {
                level().broadcastEntityEvent(this, (byte) 6);
            }
            return InteractionResult.SUCCESS;
        }
        if (!owner) {
            return super.mobInteract(player, hand);
        }
        if (isTeen()) {
            if (stack.is(Items.DRAGON_BREATH) && getBreath() < MAX_BREATH) {
                setBreath(getBreath() + BREATH_PER_BOTTLE);
                player.setItemInHand(hand, ItemUtils.createFilledResult(stack, player, new ItemStack(Items.GLASS_BOTTLE)));
                playSound(SoundEvents.BOTTLE_EMPTY, 1.0f, 1.0f);
                playSound(EndSounds.DRAGONLING_EAT, 1.0f, getVoicePitch());
                level().broadcastEntityEvent(this, EV_EAT);
                player.displayClientMessage(Component.translatable("message.winterworks.dragonling.breath", getBreath(), MAX_BREATH), true);
                return InteractionResult.SUCCESS;
            }
            if (stack.is(Items.SADDLE) && !isSaddled()) {
                setSaddled(true);
                stack.consume(1, player);
                playSound(SoundEvents.HORSE_SADDLE, 1.0f, 1.0f);
                return InteractionResult.SUCCESS;
            }
            if (isBodyArmorItem(stack) && getBodyArmorItem().isEmpty()) {
                setBodyArmorItem(stack.copyWithCount(1));
                setGuaranteedDrop(EquipmentSlot.BODY);
                stack.consume(1, player);
                playSound(SoundEvents.HORSE_ARMOR, 1.0f, 1.0f);
                return InteractionResult.SUCCESS;
            }
            if (stack.is(Items.SHEARS) && (!getBodyArmorItem().isEmpty() || isSaddled())) {
                if (!getBodyArmorItem().isEmpty()) {
                    spawnAtLocation(getBodyArmorItem().copy());
                    setBodyArmorItem(ItemStack.EMPTY);
                } else {
                    setSaddled(false);
                    spawnAtLocation(Items.SADDLE);
                }
                stack.hurtAndBreak(1, player, getSlotForHand(hand));
                playSound(SoundEvents.SHEEP_SHEAR, 1.0f, 1.0f);
                return InteractionResult.SUCCESS;
            }
            if (isSaddled() && !player.isSecondaryUseActive() && !isVehicle() && !stack.is(Items.CHORUS_FRUIT)) {
                setOrderedToSit(false);
                setInSittingPose(false);
                navigation.stop();
                player.setYRot(getYRot());
                player.setXRot(getXRot());
                player.startRiding(this);
                return InteractionResult.SUCCESS;
            }
        }
        InteractionResult r = super.mobInteract(player, hand);
        if (r.consumesAction()) {
            return r;
        }
        setOrderedToSit(!isOrderedToSit());
        jumping = false;
        navigation.stop();
        setTarget(null);
        return InteractionResult.SUCCESS_NO_ITEM_USED;
    }

    @Override
    public boolean isFood(ItemStack stack) {
        return false;
    }

    @Override
    public boolean isBodyArmorItem(ItemStack stack) {
        return stack.is(Items.IRON_HORSE_ARMOR) || stack.is(Items.GOLDEN_HORSE_ARMOR) || stack.is(Items.DIAMOND_HORSE_ARMOR);
    }

    @Override
    public boolean canUseSlot(EquipmentSlot slot) {
        return slot == EquipmentSlot.BODY ? isTeen() : super.canUseSlot(slot);
    }

    /** Which armour texture to draw: "iron", "gold", "diamond", or null. */
    @Nullable
    public String armorVariant() {
        ItemStack a = getBodyArmorItem();
        return a.is(Items.IRON_HORSE_ARMOR) ? "iron" : a.is(Items.GOLDEN_HORSE_ARMOR) ? "gold" : a.is(Items.DIAMOND_HORSE_ARMOR) ? "diamond" : null;
    }

    @Override
    protected void dropEquipment() {
        super.dropEquipment();
        if (isSaddled()) {
            spawnAtLocation(Items.SADDLE);
        }
    }

    // ------------------------------------------------------------------------------------------------ riding

    @Nullable
    @Override
    public LivingEntity getControllingPassenger() {
        if (isTeen() && isSaddled() && getFirstPassenger() instanceof Player p) {
            return p;
        }
        return super.getControllingPassenger();
    }

    @Override
    protected void tickRidden(Player rider, Vec3 input) {
        super.tickRidden(rider, input);
        setRot(rider.getYRot(), rider.getXRot() * 0.5f);
        yRotO = yBodyRot = yHeadRot = getYRot();
    }

    @Override
    protected Vec3 getRiddenInput(Player rider, Vec3 input) {
        return new Vec3(rider.xxa * 0.6, 0, rider.zza < 0 ? rider.zza * 0.4 : rider.zza);
    }

    @Override
    protected float getRiddenSpeed(Player rider) {
        return (float) getAttributeValue(Attributes.MOVEMENT_SPEED);
    }

    @Override
    public void travel(Vec3 input) {
        if (isVehicle() && getControllingPassenger() instanceof Player rider && isControlledByLocalInstance()) {
            flyRidden(rider, input, ((EndGearLivingEntityAccessor) rider).ww$jumping());
            return;
        }
        super.travel(input);
    }

    /** A rider steering: on the ground it walks, in the air it flies where the rider looks; jump climbs (and takes off). */
    void flyRidden(Player rider, Vec3 input, boolean jump) {
        float yaw = getYRot() * Mth.DEG_TO_RAD;
        Vec3 forward = new Vec3(-Mth.sin(yaw), 0, Mth.cos(yaw));
        Vec3 left = new Vec3(Mth.cos(yaw), 0, Mth.sin(yaw));
        Vec3 v = getDeltaMovement();
        if (!onGround() || jump) {
            Vec3 look = rider.getLookAngle();
            Vec3 target = look.scale(input.z * FLY_SPEED).add(left.scale(input.x * FLY_SPEED))
                    .add(0, jump ? CLIMB_SPEED : (input.z == 0 ? -0.04 : 0), 0);
            v = v.add(target.subtract(v).scale(0.12));
            resetFallDistance();
        } else {
            Vec3 target = forward.scale(input.z * WALK_SPEED).add(left.scale(input.x * WALK_SPEED));
            v = new Vec3(v.x + (target.x - v.x) * 0.4, -0.08, v.z + (target.z - v.z) * 0.4);
        }
        setDeltaMovement(v);
        move(MoverType.SELF, v);
        calculateEntityAnimation(true);
    }

    @Override
    protected Vec3 getPassengerAttachmentPoint(Entity passenger, EntityDimensions dims, float scale) {
        return new Vec3(0.0, dims.height() * 0.72, -0.1 * dims.width()).yRot(-getYRot() * Mth.DEG_TO_RAD);
    }

    @Override
    protected void positionRider(Entity passenger, MoveFunction move) {
        super.positionRider(passenger, move);
        if (passenger instanceof LivingEntity l) {
            l.yBodyRot = yBodyRot;
        }
    }

    @Override
    public boolean causeFallDamage(float distance, float multiplier, DamageSource source) {
        return false;
    }

    @Override
    public boolean isFlying() {
        return isTeen() && !onGround();
    }

    @Override
    protected boolean canFlyToOwner() {
        return isTeen();
    }

    // ------------------------------------------------------------------------------------------------ fire breath

    /** The rider's breath key (server). False if it didn't breathe (not a teen, cooling down, or out of charges). */
    public boolean breathe(Player rider) {
        if (!isTeen() || breathCooldown > 0 || !(level() instanceof ServerLevel level)) {
            return false;
        }
        if (getBreath() <= 0) {
            rider.displayClientMessage(Component.translatable("message.winterworks.dragonling.no_breath"), true);
            return false;
        }
        setBreath(getBreath() - 1);
        breathCooldown = BREATH_COOLDOWN;
        Vec3 dir = rider.getLookAngle();
        Vec3 mouth = mouth();
        DamageSource src = damageSources().source(DamageTypes.DRAGON_BREATH, this, rider);
        List<LivingEntity> victims = level.getEntitiesOfClass(LivingEntity.class, getBoundingBox().inflate(BREATH_RANGE + 1),
                e -> e != this && e != rider && e.isAlive() && !e.isSpectator() && inCone(mouth, dir, e) && !isAlliedTo(e)
                        && !(e instanceof OwnableEntity pet && rider.getUUID().equals(pet.getOwnerUUID())));
        for (LivingEntity e : victims) {
            e.hurt(src, BREATH_DAMAGE);
            e.igniteForSeconds(5);
        }
        level.playSound(null, mouth.x, mouth.y, mouth.z, EndSounds.DRAGONLING_BREATH, getSoundSource(), 1.5f, 0.9f + random.nextFloat() * 0.2f);
        level.broadcastEntityEvent(this, EV_BREATH);   // the clip and the fire, drawn by every client (breathParticles)
        rider.displayClientMessage(Component.translatable("message.winterworks.dragonling.breath", getBreath(), MAX_BREATH), true);
        return true;
    }

    /** Where the fire comes from: in front of the head (the teen's long neck carries it well forward). */
    public Vec3 mouth() {
        float yaw = getYRot() * Mth.DEG_TO_RAD;
        double ahead = isTeen() ? 1.7 : 0.55, up = isTeen() ? 1.5 : 0.45;
        return position().add(-Mth.sin(yaw) * ahead, up, Mth.cos(yaw) * ahead);
    }

    /** Client: a gout of dragon fire from the mouth along the rider's look, carried along with the Dragonling. */
    private void breathParticles() {
        Vec3 dir = (getFirstPassenger() instanceof Player rider ? rider : this).getViewVector(1f);
        Vec3 from = mouth();
        Vec3 carry = new Vec3(getX() - xo, getY() - yo, getZ() - zo);
        for (int i = 0; i < 60; i++) {
            Vec3 d = dir.add((random.nextDouble() - 0.5) * 0.35, (random.nextDouble() - 0.5) * 0.35, (random.nextDouble() - 0.5) * 0.35)
                    .normalize().scale(0.3 + random.nextDouble() * 0.5).add(carry);
            level().addParticle(i % 6 == 0 ? ParticleTypes.FLAME : ParticleTypes.DRAGON_BREATH, from.x, from.y, from.z, d.x, d.y, d.z);
        }
    }

    /** Within 8 blocks of the mouth and inside the cone, and in sight. */
    boolean inCone(Vec3 mouth, Vec3 dir, LivingEntity e) {
        Vec3 to = e.getBoundingBox().getCenter().subtract(mouth);
        double dist = to.length();
        if (dist > BREATH_RANGE + e.getBbWidth() * 0.5) {
            return false;
        }
        if (dist > 1.0 && to.scale(1.0 / dist).dot(dir) < BREATH_CONE_COS) {
            return false;
        }
        return hasLineOfSight(e) || dist < 2.0;
    }

    // ------------------------------------------------------------------------------------------------ ticking

    @Override
    public void tick() {
        super.tick();
        if (level().isClientSide) {
            if (isHatching()) {
                hatchState.startIfStopped(tickCount);
            } else {
                hatchState.stop();
            }
        } else {
            if (breathCooldown > 0) {
                breathCooldown--;
            }
            if (hatchTicks > 0 && --hatchTicks == 0) {
                entityData.set(HATCHING, false);
            }
            if (isTeen() && isVehicle()) {
                setNoGravity(true);   // the rider's client flies it; a floating vehicle must not look like a flight hack
            }
        }
    }

    @Override
    protected void removePassenger(Entity passenger) {
        super.removePassenger(passenger);
        if (!level().isClientSide && !isVehicle()) {
            setNoGravity(false);
        }
    }

    @Override
    public void handleEntityEvent(byte id) {
        if (id == EV_EAT) {
            eatState.start(tickCount);
        } else if (id == EV_BREATH) {
            breathState.start(tickCount);
            breathParticles();
        } else {
            super.handleEntityEvent(id);
        }
    }

    // ------------------------------------------------------------------------------------------------ save

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        tag.putBoolean("Teen", isTeen());
        tag.putInt("Growth", getGrowth());
        tag.putInt("Breath", getBreath());
        tag.putBoolean("Saddled", isSaddled());
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        entityData.set(TEEN, tag.getBoolean("Teen"));
        entityData.set(GROWTH, tag.getInt("Growth"));
        setBreath(tag.getInt("Breath"));
        setSaddled(tag.getBoolean("Saddled"));
        applyStage();
    }

    // ------------------------------------------------------------------------------------------------ sounds

    @Override
    protected SoundEvent getAmbientSound() {
        return EndSounds.DRAGONLING_AMBIENT;
    }

    @Override
    protected SoundEvent getHurtSound(DamageSource source) {
        return EndSounds.DRAGONLING_HURT;
    }

    @Override
    protected SoundEvent getDeathSound() {
        return EndSounds.DRAGONLING_DEATH;
    }

    @Override
    public float getVoicePitch() {
        return (isTeen() ? 1.0f : 1.45f) + (random.nextFloat() - random.nextFloat()) * 0.15f;
    }

    @Override
    public SoundSource getSoundSource() {
        return SoundSource.NEUTRAL;
    }

    @Nullable
    @Override
    public AgeableMob getBreedOffspring(ServerLevel level, AgeableMob other) {
        return null;
    }
}
