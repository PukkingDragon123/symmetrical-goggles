package dev.lowpix.winterworks.oceanmob;

import dev.lowpix.winterworks.registry.OceanItems;
import dev.lowpix.winterworks.registry.OceanSounds;
import java.util.EnumSet;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerPlayer;
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
import net.minecraft.world.entity.EntitySelector;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.MoverType;
import net.minecraft.world.entity.Shearable;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.control.SmoothSwimmingLookControl;
import net.minecraft.world.entity.ai.control.SmoothSwimmingMoveControl;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.goal.RandomSwimmingGoal;
import net.minecraft.world.entity.ai.goal.TryFindWaterGoal;
import net.minecraft.world.entity.ai.navigation.PathNavigation;
import net.minecraft.world.entity.ai.navigation.WaterBoundPathNavigation;
import net.minecraft.world.entity.animal.Cod;
import net.minecraft.world.entity.animal.TropicalFish;
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
 * The lionfish (docs/OCEAN_UPDATE.md section 4): a striped, frilled reef fish with venomous spines. It hunts smaller fish
 * (cod, tropical fish), flares its spines when a player comes close or hurts it, and touching it poisons (Poison 4 s).
 * Shears take 2-3 {@code lionfish_dart}s; the spines grow back over 5 minutes, in stages (synced, so they render short
 * and grow back), and a sheared lionfish can't sting until they are half grown.
 */
public class Lionfish extends WaterAnimal implements Shearable {
    public static final int REGROW_TICKS = 6000;
    /** Spine growth stages: 0 just sheared .. FULL grown. */
    public static final int FULL = 4;
    public static final int POISON_TICKS = 80;
    public static final byte EV_HUNT = 100, EV_FLARE = 101;

    private static final EntityDataAccessor<Byte> SPINES = SynchedEntityData.defineId(Lionfish.class, EntityDataSerializers.BYTE);

    public final AnimationState huntState = new AnimationState();
    public final AnimationState flareState = new AnimationState();
    /** Client: 0 hovering .. 1 swimming (eased). */
    public float swimBlend, swimBlendO;
    private int regrowTicks, flareCooldown, huntCooldown;

    public Lionfish(EntityType<? extends WaterAnimal> type, Level level) {
        super(type, level);
        this.moveControl = new SmoothSwimmingMoveControl(this, 85, 10, 0.02f, 0.1f, true);
        this.lookControl = new SmoothSwimmingLookControl(this, 10);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return Mob.createMobAttributes().add(Attributes.MAX_HEALTH, 6.0).add(Attributes.MOVEMENT_SPEED, 0.9)
                .add(Attributes.ATTACK_DAMAGE, 2.0);
    }

    public static boolean checkSpawnRules(EntityType<Lionfish> type, LevelAccessor level, MobSpawnType reason, BlockPos pos, RandomSource r) {
        return pos.getY() > 40 && level.getFluidState(pos).is(FluidTags.WATER) && level.getFluidState(pos.above()).is(FluidTags.WATER);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder b) {
        super.defineSynchedData(b);
        b.define(SPINES, (byte) FULL);
    }

    public int spineStage() {
        return entityData.get(SPINES);
    }

    /** 0 (sheared) .. 1 (full spines). */
    public float spineGrowth() {
        return spineStage() / (float) FULL;
    }

    public boolean isSheared() {
        return spineStage() < FULL;
    }

    public int regrowTicks() {
        return regrowTicks;
    }

    /** Sets how long until the spines are grown back (0: full spines now). */
    public void setRegrowTicks(int ticks) {
        regrowTicks = Math.max(0, ticks);
        int stage = regrowTicks <= 0 ? FULL : Mth.clamp(FULL - Mth.ceil(regrowTicks * (float) FULL / REGROW_TICKS), 0, FULL - 1);
        if (stage != spineStage()) {
            entityData.set(SPINES, (byte) stage);
        }
    }

    /** Venomous enough to sting: unsheared, or regrown at least half way. */
    public boolean canSting() {
        return spineStage() >= FULL / 2;
    }

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        tag.putInt("SpineRegrow", regrowTicks);
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        setRegrowTicks(tag.getInt("SpineRegrow"));
    }

    // ------------------------------------------------------------------------------------------------ shearing

    @Override
    public boolean readyForShearing() {
        return isAlive() && !isSheared();
    }

    @Override
    public void shear(SoundSource source) {
        level().playSound(null, this, SoundEvents.SHEEP_SHEAR, source, 1f, 1.3f);
        level().playSound(null, this, OceanSounds.LIONFISH_FLARE, source, 0.8f, 1.2f);
        setRegrowTicks(REGROW_TICKS);
        int n = 2 + random.nextInt(2);
        spawnAtLocation(new ItemStack(OceanItems.LIONFISH_DART, n), 0.2f);
    }

    @Override
    protected InteractionResult mobInteract(Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if (stack.is(Items.SHEARS)) {
            if (!readyForShearing()) {
                return InteractionResult.PASS;
            }
            if (!level().isClientSide) {
                shear(SoundSource.PLAYERS);
                gameEvent(GameEvent.SHEAR, player);
                stack.hurtAndBreak(1, player, getSlotForHand(hand));
            }
            return InteractionResult.sidedSuccess(level().isClientSide);
        }
        return super.mobInteract(player, hand);
    }

    // ------------------------------------------------------------------------------------------------ venom

    /** Touching it poisons (Poison 4 s), with a small sting, like a pufferfish. */
    @Override
    public void playerTouch(Player player) {
        sting(player);
    }

    /** Stings `player` if it can (not again while they are still well poisoned): a 1-damage prick and Poison 4 s. */
    public boolean sting(Player player) {
        if (!(player instanceof ServerPlayer sp) || !isAlive() || !canSting() || sp.isSpectator() || sp.getAbilities().invulnerable) {
            return false;
        }
        MobEffectInstance cur = sp.getEffect(MobEffects.POISON);
        if (cur != null && cur.getDuration() > POISON_TICKS / 2) {
            return false;
        }
        sp.hurt(damageSources().mobAttack(this), 1f);   // the prick (none on peaceful); the venom works regardless
        sp.addEffect(new MobEffectInstance(MobEffects.POISON, POISON_TICKS, 0), this);
        playSound(SoundEvents.PUFFER_FISH_STING, 0.8f, 1.3f);
        flare();
        return true;
    }

    /** Spines out (the flare clip), with its sound; not more than once every few seconds. */
    public void flare() {
        if (level().isClientSide || flareCooldown > 0) {
            return;
        }
        flareCooldown = 60 + random.nextInt(40);
        level().broadcastEntityEvent(this, EV_FLARE);
        playSound(OceanSounds.LIONFISH_FLARE, 0.9f, 0.9f + random.nextFloat() * 0.2f);
    }

    @Override
    public boolean hurt(DamageSource source, float amount) {
        boolean hit = super.hurt(source, amount);
        if (hit && !level().isClientSide) {
            flare();
            if (source.getDirectEntity() instanceof Player p && canSting()) {
                sting(p);   // grabbing at it with bare hands hurts
            }
        }
        return hit;
    }

    @Override
    public void handleEntityEvent(byte id) {
        switch (id) {
            case EV_HUNT -> huntState.start(tickCount);
            case EV_FLARE -> flareState.start(tickCount);
            default -> super.handleEntityEvent(id);
        }
    }

    // ------------------------------------------------------------------------------------------------ AI

    @Override
    protected void registerGoals() {
        goalSelector.addGoal(0, new TryFindWaterGoal(this));
        goalSelector.addGoal(1, new FlareGoal());
        goalSelector.addGoal(2, new HuntFishGoal());
        goalSelector.addGoal(4, new RandomSwimmingGoal(this, 1.0, 40));
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
            setDeltaMovement(getDeltaMovement().scale(0.9));
            if (getTarget() == null) {
                setDeltaMovement(getDeltaMovement().add(0.0, -0.004, 0.0));
            }
        } else {
            super.travel(input);
        }
    }

    @Override
    public void aiStep() {
        if (!isInWater() && onGround() && verticalCollision) {
            setDeltaMovement(getDeltaMovement().add((random.nextFloat() * 2f - 1f) * 0.05f, 0.4f, (random.nextFloat() * 2f - 1f) * 0.05f));
            setOnGround(false);
            hasImpulse = true;
            makeSound(OceanSounds.LIONFISH_FLOP);
        }
        super.aiStep();
    }

    @Override
    public void tick() {
        super.tick();
        if (level().isClientSide) {
            swimBlendO = swimBlend;
            double v = new Vec3(getX() - xo, getY() - yo, getZ() - zo).length();
            swimBlend += ((isInWater() && v > 0.01 ? 1f : 0f) - swimBlend) * 0.1f;
            return;
        }
        if (flareCooldown > 0) {
            flareCooldown--;
        }
        if (huntCooldown > 0) {
            huntCooldown--;
        }
        if (regrowTicks > 0) {
            setRegrowTicks(regrowTicks - 1);
        }
    }

    @Override
    protected SoundEvent getHurtSound(DamageSource source) {
        return OceanSounds.LIONFISH_HURT;
    }

    @Override
    protected SoundEvent getDeathSound() {
        return OceanSounds.LIONFISH_DEATH;
    }

    @Override
    protected SoundEvent getSwimSound() {
        return SoundEvents.FISH_SWIM;
    }

    @Override
    public int getMaxSpawnClusterSize() {
        return 3;
    }

    @Override
    public boolean removeWhenFarAway(double d) {
        return !hasCustomName();
    }

    /** Fans its spines out at a player who swims up close. */
    final class FlareGoal extends Goal {
        @Override
        public boolean canUse() {
            if (flareCooldown > 0 || random.nextInt(5) != 0) {
                return false;
            }
            Player p = level().getNearestPlayer(Lionfish.this, 3.0);
            return p != null && EntitySelector.NO_CREATIVE_OR_SPECTATOR.test(p);
        }

        @Override
        public boolean canContinueToUse() {
            return false;
        }

        @Override
        public void start() {
            Player p = level().getNearestPlayer(Lionfish.this, 3.0);
            if (p != null) {
                getLookControl().setLookAt(p);
            }
            flare();
        }
    }

    /** Stalks a small fish (cod, tropical fish) and snaps it up. */
    final class HuntFishGoal extends Goal {
        @Nullable
        private LivingEntity prey;
        private int time;

        HuntFishGoal() {
            setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
        }

        @Override
        public boolean canUse() {
            if (huntCooldown > 0 || !isInWater() || random.nextInt(20) != 0) {
                return false;
            }
            List<LivingEntity> fish = level().getEntitiesOfClass(LivingEntity.class, getBoundingBox().inflate(8, 4, 8),
                    e -> isPrey(e) && hasLineOfSight(e));
            if (fish.isEmpty()) {
                return false;
            }
            prey = fish.get(random.nextInt(fish.size()));
            return true;
        }

        @Override
        public boolean canContinueToUse() {
            return prey != null && prey.isAlive() && time < 200 && distanceToSqr(prey) < 14 * 14;
        }

        @Override
        public void start() {
            time = 0;
        }

        @Override
        public void stop() {
            prey = null;
            huntCooldown = 400 + random.nextInt(400);
            getNavigation().stop();
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
            time++;
            getLookControl().setLookAt(prey, 30f, 30f);
            getNavigation().moveTo(prey, 1.4);
            if (distanceToSqr(prey) < 1.2) {
                level().broadcastEntityEvent(Lionfish.this, EV_HUNT);
                playSound(SoundEvents.GENERIC_EAT, 0.4f, 1.7f);
                prey.hurt(damageSources().mobAttack(Lionfish.this), 100f);
                heal(1f);
                prey = null;
            }
        }
    }

    /** What a lionfish hunts: cod and tropical fish. */
    public static boolean isPrey(LivingEntity e) {
        return e.isAlive() && e.isInWater() && (e instanceof Cod || e instanceof TropicalFish);
    }
}
