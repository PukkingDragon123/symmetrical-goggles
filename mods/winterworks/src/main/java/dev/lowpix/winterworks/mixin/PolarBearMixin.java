package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.bear.BearFeature;
import dev.lowpix.winterworks.bear.BearFishGoal;
import dev.lowpix.winterworks.bear.BearHuntGoal;
import dev.lowpix.winterworks.bear.BearLeapGoal;
import dev.lowpix.winterworks.bear.BearRoarGoal;
import dev.lowpix.winterworks.bear.BearSitGoal;
import dev.lowpix.winterworks.bear.BearState;
import dev.lowpix.winterworks.bear.BearSwipeGoal;
import dev.lowpix.winterworks.bear.EatDroppedSalmonGoal;
import dev.lowpix.winterworks.bear.RemadePolarBear;
import dev.lowpix.winterworks.bear.SalmonTemptGoal;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.registry.WWParticles;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.Tag;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.BlockTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.AgeableMob;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.NeutralMob;
import net.minecraft.world.entity.Shearable;
import net.minecraft.world.entity.SpawnGroupData;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.animal.Animal;
import net.minecraft.world.entity.animal.PolarBear;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.ShearsItem;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.ServerLevelAccessor;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Polar bears remade (docs/COLD_UPDATE.md section 3), for every vanilla polar bear: 40 hp / 8 attack / 0.28 speed,
 * hostile adults (16 blocks; not to a player holding salmon unless that player hurt it), a first-sight roar, the swipe and
 * the charge-jump (bear.BearRoarGoal, BearSwipeGoal, BearLeapGoal, shared with the zombie polar bear), calming with salmon
 * (5 within 60 s: calm for 5 minutes, hearts, sits, gives away the fish it carries), shearing a calm bear (2-3 fur, shorn
 * for 5 minutes), fishing (bear.BearFishGoal), jockey mounts that still fight. State is reached through {@link RemadePolarBear}.
 */
@Mixin(PolarBear.class)
public abstract class PolarBearMixin extends Animal implements RemadePolarBear, Shearable {
    /** Synced flags: what clients draw. */
    @Unique
    private static final EntityDataAccessor<Byte> WW_FLAGS = SynchedEntityData.defineId(PolarBear.class, EntityDataSerializers.BYTE);
    /** The fish in its mouth (BearFeature.carryId: 0 nothing, 1 salmon, 2 cod). */
    @Unique
    private static final EntityDataAccessor<Byte> WW_CARRY = SynchedEntityData.defineId(PolarBear.class, EntityDataSerializers.BYTE);
    @Unique
    private static final int F_CALM = 1, F_SHORN = 2, F_SITTING = 8;

    @Unique
    private BearState ww$state;
    @Unique
    private int ww$calmTicks, ww$shornTicks, ww$wetTicks;
    @Unique
    private boolean ww$jockey, ww$sitRequest, ww$fishRequest;
    /** Game times of the salmon eaten lately (the 60 s calming window). */
    @Unique
    private final List<Long> ww$fed = new ArrayList<>();
    /** The last player who hurt it: holding salmon doesn't save them. */
    @Unique
    @Nullable
    private UUID ww$grudge;

    protected PolarBearMixin(EntityType<? extends Animal> type, Level level) {
        super(type, level);
    }

    @Shadow
    public abstract void setStanding(boolean standing);

    // ----------------------------------------------------------------------------------------- stats, spawning, goals

    @Inject(method = "createAttributes", at = @At("RETURN"))
    private static void ww$stats(CallbackInfoReturnable<AttributeSupplier.Builder> cir) {
        cir.getReturnValue().add(Attributes.MAX_HEALTH, 40.0).add(Attributes.ATTACK_DAMAGE, 8.0).add(Attributes.MOVEMENT_SPEED, 0.28);
    }

    /** Extra spawns in snowy biomes land on snow, ice, stone and sand too (vanilla wants grass, or ice on frozen oceans). */
    @Inject(method = "checkPolarBearSpawnRules", at = @At("RETURN"), cancellable = true)
    private static void ww$coldGround(EntityType<PolarBear> type, LevelAccessor level, MobSpawnType reason, BlockPos pos,
                                      RandomSource random, CallbackInfoReturnable<Boolean> cir) {
        if (cir.getReturnValueZ()) {
            return;
        }
        BlockState below = level.getBlockState(pos.below());
        boolean ground = below.is(Blocks.SNOW_BLOCK) || below.is(Blocks.SNOW) || below.is(BlockTags.ICE) || below.is(BlockTags.SAND)
                || below.is(Blocks.GRAVEL) || below.is(Blocks.STONE) || below.is(Blocks.GRASS_BLOCK);
        if (ground && Animal.isBrightEnoughToSpawn(level, pos) && level.getBiome(pos).value().coldEnoughToSnow(pos)) {
            cir.setReturnValue(true);
        }
    }

    @Inject(method = "defineSynchedData", at = @At("TAIL"))
    private void ww$defineData(SynchedEntityData.Builder builder, CallbackInfo ci) {
        builder.define(WW_FLAGS, (byte) 0);
        builder.define(WW_CARRY, (byte) 0);
    }

    @Inject(method = "registerGoals", at = @At("TAIL"))
    private void ww$goals(CallbackInfo ci) {
        // the vanilla swipe (no wind-up) and "only near cubs" targeting make way for ours
        goalSelector.removeAllGoals(g -> g instanceof MeleeAttackGoal);
        targetSelector.removeAllGoals(g -> g instanceof NearestAttackableTargetGoal && g.getClass() != NearestAttackableTargetGoal.class);
        goalSelector.addGoal(1, new BearRoarGoal(this));
        goalSelector.addGoal(1, new BearLeapGoal(this));
        goalSelector.addGoal(1, new EatDroppedSalmonGoal(this));
        goalSelector.addGoal(2, new BearSwipeGoal(this, 1.25));
        goalSelector.addGoal(3, new SalmonTemptGoal(this));
        goalSelector.addGoal(4, new BearFishGoal(this));
        goalSelector.addGoal(4, new BearSitGoal(this));
        targetSelector.addGoal(2, new BearHuntGoal(this, e -> ww$hunts(e)));
    }

    /** Hunts players, except those holding salmon who never hurt it. */
    @Unique
    private boolean ww$hunts(LivingEntity e) {
        return e instanceof Player p && ww$mayFight() && (!BearFeature.holdsSalmon(p) || p.getUUID().equals(ww$grudge));
    }

    @Inject(method = "finalizeSpawn", at = @At("RETURN"))
    private void ww$spawned(ServerLevelAccessor level, DifficultyInstance difficulty, MobSpawnType reason, @Nullable SpawnGroupData data,
                            CallbackInfoReturnable<SpawnGroupData> cir) {
        if (!isBaby() && level.getRandom().nextFloat() < SALMON_CARRY_CHANCE) {
            ww$setCarried(Items.SALMON);
        }
    }

    // ----------------------------------------------------------------------------------------- ticking

    @Inject(method = "tick", at = @At("TAIL"))
    private void ww$tick(CallbackInfo ci) {
        BearState s = ww$bear();
        if (level().isClientSide) {
            s.clientTick(this, ww$isSitting());
            ww$breathe();
            return;
        }
        s.serverTick(this);
        if (ww$calmTicks > 0) {
            if (--ww$calmTicks == 0) {
                ww$setFlag(F_CALM, false);
                ww$setFlag(F_SITTING, false);
            } else if (random.nextInt(160) == 0) {
                level().broadcastEntityEvent(this, BearState.EV_HEARTS);
            }
        }
        if (ww$shornTicks > 0 && --ww$shornTicks == 0) {   // the fur has grown back: a good shake
            ww$setFlag(F_SHORN, false);
            level().broadcastEntityEvent(this, BearState.EV_SHAKE);
            playSound(SoundEvents.WOOL_PLACE, 1.0f, 0.7f);
            ((ServerLevel) level()).sendParticles(WWParticles.FUR_TUFT, getX(), getY() + getBbHeight() * 0.7, getZ(), 12, 0.6, 0.3, 0.6, 0.02);
        }
        LivingEntity target = getTarget();
        if (target != null) {
            // calm bears and cubs don't fight; holding out salmon ends a fight with a bear you never hurt
            boolean spare = !ww$mayFight() || (target instanceof Player p && BearFeature.holdsSalmon(p) && !p.getUUID().equals(ww$grudge));
            if (spare) {
                setTarget(null);
                ((NeutralMob) this).stopBeingAngry();
            }
        } else if (getFirstPassenger() instanceof Mob rider && rider.getTarget() != null && rider.getTarget().isAlive() && ww$mayFight()
                && !(rider.getTarget() instanceof Player p && BearFeature.holdsSalmon(p) && !p.getUUID().equals(ww$grudge))) {
            setTarget(rider.getTarget());   // a jockey's bear fights what its rider fights
        }
        // out of the water after a swim: shake it off
        if (isInWater()) {
            ww$wetTicks++;
        } else if (ww$wetTicks > 0) {
            if (ww$wetTicks > 30 && onGround() && getTarget() == null) {
                level().broadcastEntityEvent(this, BearState.EV_SHAKE_WET);
                playSound(SoundEvents.WOLF_SHAKE, 1.0f, 0.6f);
            }
            ww$wetTicks = onGround() ? 0 : ww$wetTicks;
        }
    }

    /** Client: puffs of breath now and then in the cold. */
    @Unique
    private void ww$breathe() {
        if (random.nextInt(70) != 0 || !BearFeature.isColdPlace(level(), blockPosition())) {
            return;
        }
        Vec3 m = BearState.mouth(this), f = BearState.forward(this);
        for (int i = 0; i < 3; i++) {
            level().addParticle(WWParticles.FROST_BREATH, m.x, m.y, m.z, f.x * 0.04 + (random.nextDouble() - 0.5) * 0.02, 0.01,
                    f.z * 0.04 + (random.nextDouble() - 0.5) * 0.02);
        }
    }

    // ----------------------------------------------------------------------------------------- overrides (not declared by PolarBear)

    @Override
    public void handleEntityEvent(byte id) {
        if (!ww$bear().handleEvent(this, id)) {
            super.handleEntityEvent(id);
        }
    }

    @Override
    public InteractionResult mobInteract(Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if (BearFeature.isSalmon(stack)) {
            if (!level().isClientSide) {
                ww$eatSalmon(player);
                usePlayerItem(player, hand, stack);
            }
            return InteractionResult.sidedSuccess(level().isClientSide);
        }
        if (stack.getItem() instanceof ShearsItem) {
            if (isBaby() || ww$isShorn()) {
                return InteractionResult.PASS;
            }
            if (!level().isClientSide) {
                if (ww$isCalm()) {
                    ww$shearFur(player, SoundSource.PLAYERS);
                    stack.hurtAndBreak(1, player, getSlotForHand(hand));
                } else {
                    ww$angerAt(player);   // you don't shear an angry bear
                }
            }
            return InteractionResult.sidedSuccess(level().isClientSide);
        }
        return super.mobInteract(player, hand);
    }

    @Override
    public boolean hurt(DamageSource source, float amount) {
        boolean hurt = super.hurt(source, amount);
        if (hurt && !level().isClientSide) {
            ww$setSitting(false);
            if (source.getEntity() instanceof Player p) {
                ww$grudge = p.getUUID();
                if (ww$isCalm()) {   // betrayal: the calm is over
                    ww$calmTicks = 0;
                    ww$setFlag(F_CALM, false);
                }
            }
        }
        return hurt;
    }

    /** A mob riding a polar bear is carried along: the bear walks and fights itself (its goals stay enabled). */
    @Nullable
    @Override
    public LivingEntity getControllingPassenger() {
        return null;
    }

    @Override
    public boolean removeWhenFarAway(double distance) {
        return ww$jockey || super.removeWhenFarAway(distance);
    }

    @Override
    protected void dropCustomDeathLoot(ServerLevel level, DamageSource source, boolean byPlayer) {
        super.dropCustomDeathLoot(level, source, byPlayer);
        ItemStack carried = ww$carried();
        if (!carried.isEmpty()) {
            spawnAtLocation(carried.copy());
            ww$setCarried(null);
        }
    }

    // ----------------------------------------------------------------------------------------- saving

    @Inject(method = "addAdditionalSaveData", at = @At("TAIL"))
    private void ww$save(CompoundTag tag, CallbackInfo ci) {
        CompoundTag t = new CompoundTag();
        t.putInt("CalmTicks", ww$calmTicks);
        t.putInt("ShornTicks", ww$shornTicks);
        ItemStack carried = ww$carried();
        if (!carried.isEmpty()) {
            t.putString("Carried", BuiltInRegistries.ITEM.getKey(carried.getItem()).toString());
        }
        t.putBoolean("JockeyMount", ww$jockey);
        t.putLongArray("SalmonEaten", ww$fed.stream().mapToLong(Long::longValue).toArray());
        if (ww$grudge != null) {
            t.putUUID("Grudge", ww$grudge);
        }
        tag.put("Winterworks", t);
    }

    @Inject(method = "readAdditionalSaveData", at = @At("TAIL"))
    private void ww$load(CompoundTag tag, CallbackInfo ci) {
        // bears from before the remake get the new stats (their saved base values are vanilla's)
        ww$upgrade(Attributes.MAX_HEALTH, 30.0, 40.0);
        ww$upgrade(Attributes.ATTACK_DAMAGE, 6.0, 8.0);
        ww$upgrade(Attributes.MOVEMENT_SPEED, 0.25, 0.28);
        if (!tag.contains("Winterworks", Tag.TAG_COMPOUND)) {
            return;
        }
        CompoundTag t = tag.getCompound("Winterworks");
        ww$calmTicks = t.getInt("CalmTicks");
        ww$shornTicks = t.getInt("ShornTicks");
        ww$jockey = t.getBoolean("JockeyMount");
        ww$fed.clear();
        for (long time : t.getLongArray("SalmonEaten")) {
            ww$fed.add(time);
        }
        ww$grudge = t.hasUUID("Grudge") ? t.getUUID("Grudge") : null;
        ww$setFlag(F_CALM, ww$calmTicks > 0);
        ww$setFlag(F_SHORN, ww$shornTicks > 0);
        ResourceLocation carried = ResourceLocation.tryParse(t.getString("Carried"));
        ww$setCarried(carried == null || t.getString("Carried").isEmpty() ? null : BuiltInRegistries.ITEM.get(carried));
    }

    @Unique
    private void ww$upgrade(net.minecraft.core.Holder<net.minecraft.world.entity.ai.attributes.Attribute> attribute, double old, double now) {
        AttributeInstance a = getAttribute(attribute);
        if (a != null && Math.abs(a.getBaseValue() - old) < 1.0e-6) {
            a.setBaseValue(now);
        }
    }

    // ----------------------------------------------------------------------------------------- BearLike

    @Override
    public BearState ww$bear() {
        if (ww$state == null) {   // goals are made in the Mob constructor, before field initialisers run
            ww$state = new BearState();
        }
        return ww$state;
    }

    @Override
    public boolean ww$mayFight() {
        return !isBaby() && !ww$isCalm();
    }

    @Override
    public SoundEvent ww$growlSound() {
        return SoundEvents.POLAR_BEAR_WARNING;
    }

    @Override
    public void ww$standUp(boolean up) {
        setStanding(up);
    }

    @Override
    public boolean ww$isShorn() {
        return ww$flag(F_SHORN);
    }

    @Override
    public boolean ww$isSitting() {
        return ww$flag(F_SITTING);
    }

    @Override
    public ItemStack ww$carried() {
        return BearFeature.carriedStack(entityData.get(WW_CARRY));
    }

    // ----------------------------------------------------------------------------------------- RemadePolarBear

    @Override
    public boolean ww$isCalm() {
        return ww$flag(F_CALM);
    }

    @Override
    public int ww$calmTicks() {
        return ww$calmTicks;
    }

    @Override
    public void ww$calm(int ticks, @Nullable Player by) {
        if (ticks <= 0) {
            ww$calmTicks = 0;
            ww$setFlag(F_CALM, false);
            ww$setFlag(F_SITTING, false);
            return;
        }
        boolean was = ww$isCalm();
        ww$calmTicks = Math.max(ww$calmTicks, ticks);
        ww$setFlag(F_CALM, true);
        setTarget(null);
        ((NeutralMob) this).stopBeingAngry();
        ww$grudge = null;
        ww$jockey = false;   // a calm bear stays around
        setStanding(false);
        if (!was && !level().isClientSide) {
            playSound(WWSounds.BEAR_CALM, 1.0f, 1.0f);
            level().broadcastEntityEvent(this, BearState.EV_HEARTS);
            ww$sitRequest = true;
            if (!ww$carried().isEmpty()) {
                ww$giveCarried(by);
            }
        }
    }

    /** Drops the carried fish as a gift, tossed towards whoever calmed it. */
    @Unique
    private void ww$giveCarried(@Nullable Player to) {
        ItemStack fish = ww$carried().copy();
        ww$setCarried(null);
        Vec3 m = BearState.mouth(this);
        ItemEntity gift = new ItemEntity(level(), m.x, m.y, m.z, fish);
        gift.setThrower(this);   // so it doesn't eat its own gift
        gift.setDefaultPickUpDelay();
        if (to != null) {
            Vec3 d = to.position().subtract(m).multiply(1, 0, 1).normalize();
            gift.setDeltaMovement(d.x * 0.22, 0.25, d.z * 0.22);
        }
        level().addFreshEntity(gift);
    }

    @Override
    public int ww$shornTicks() {
        return ww$shornTicks;
    }

    @Override
    public void ww$setShornTicks(int ticks) {
        ww$shornTicks = Math.max(0, ticks);
        ww$setFlag(F_SHORN, ww$shornTicks > 0);
    }

    @Override
    public void ww$setCarried(@Nullable Item fish) {
        entityData.set(WW_CARRY, (byte) BearFeature.carryId(fish));
    }

    @Override
    public void ww$eatCarried() {
        if (ww$carried().isEmpty() || level().isClientSide) {
            return;
        }
        playSound(WWSounds.BEAR_MUNCH, 1.0f, 0.9f + random.nextFloat() * 0.2f);
        level().broadcastEntityEvent(this, BearState.EV_EAT);   // sent before the carry change: clients see what it eats
        heal(2.0f);
        gameEvent(GameEvent.EAT);
        ww$setCarried(null);
    }

    @Override
    public void ww$goFishing() {
        ww$fishRequest = true;
    }

    @Override
    public boolean ww$takeFishingRequest() {
        boolean r = ww$fishRequest;
        ww$fishRequest = false;
        return r;
    }

    @Override
    public void ww$setSitting(boolean sitting) {
        ww$setFlag(F_SITTING, sitting);
    }

    @Override
    public boolean ww$takeSitRequest() {
        boolean r = ww$sitRequest;
        ww$sitRequest = false;
        return r;
    }

    @Override
    public int ww$salmonEaten() {
        long now = level().getGameTime();
        ww$fed.removeIf(t -> now - t > SALMON_WINDOW);
        return ww$fed.size();
    }

    @Override
    public void ww$eatSalmon(@Nullable Player feeder) {
        if (level().isClientSide) {
            return;
        }
        playSound(WWSounds.BEAR_MUNCH, 1.0f, (isBaby() ? 1.4f : 0.9f) + random.nextFloat() * 0.2f);
        level().broadcastEntityEvent(this, BearState.EV_EAT);
        heal(2.0f);
        gameEvent(GameEvent.EAT);
        if (isBaby()) {   // cubs just grow a little
            ageUp(AgeableMob.getSpeedUpSecondsWhenFeeding(-getAge()), true);
            level().broadcastEntityEvent(this, BearState.EV_HEARTS);
            return;
        }
        if (ww$isCalm()) {   // feeding a calm bear keeps it calm for longer
            ww$calmTicks = Math.min(ww$calmTicks + CALM_PER_EXTRA_SALMON, CALM_TICKS * 2);
            level().broadcastEntityEvent(this, BearState.EV_HEARTS);
            return;
        }
        long now = level().getGameTime();
        ww$fed.removeIf(t -> now - t > SALMON_WINDOW);
        ww$fed.add(now);
        if (ww$fed.size() >= SALMON_TO_CALM) {
            ww$fed.clear();
            ww$calm(CALM_TICKS, feeder);
        }
    }

    @Override
    public boolean ww$shearFur(@Nullable Player shearer, SoundSource source) {
        if (isBaby() || ww$isShorn() || !ww$isCalm() || level().isClientSide) {
            return false;
        }
        int n = 2 + random.nextInt(2);
        for (int i = 0; i < n; i++) {
            ItemEntity it = spawnAtLocation(new ItemStack(WWItems.POLAR_BEAR_FUR), 1.0f);
            if (it != null) {
                it.setDeltaMovement(it.getDeltaMovement().add((random.nextFloat() - random.nextFloat()) * 0.1f, random.nextFloat() * 0.05f,
                        (random.nextFloat() - random.nextFloat()) * 0.1f));
            }
        }
        ww$setShornTicks(SHORN_TICKS);
        level().playSound(null, this, WWSounds.BEAR_SHEAR, source, 1.0f, 1.0f);
        ((ServerLevel) level()).sendParticles(WWParticles.FUR_TUFT, getX(), getY() + getBbHeight() * 0.6, getZ(), 24, 0.6, 0.4, 0.6, 0.03);
        level().broadcastEntityEvent(this, BearState.EV_SHAKE);
        gameEvent(GameEvent.SHEAR, shearer);
        return true;
    }

    /** Shears on a bear that isn't calm: no fur, a roar, and it comes for you. */
    @Unique
    private void ww$angerAt(Player player) {
        ww$grudge = player.getUUID();
        setTarget(player);
        NeutralMob neutral = (NeutralMob) this;
        neutral.setPersistentAngerTarget(player.getUUID());
        neutral.startPersistentAngerTimer();
        ww$bear().roaredAt = player.getUUID();
        level().broadcastEntityEvent(this, BearState.EV_ROAR);
        playSound(WWSounds.BEAR_ROAR, 2.0f, 1.0f);
    }

    @Override
    public boolean ww$isJockeyMount() {
        return ww$jockey;
    }

    @Override
    public void ww$setJockeyMount(boolean mount) {
        ww$jockey = mount;
    }

    // ----------------------------------------------------------------------------------------- Shearable (dispensers, heavy shears)

    @Override
    public void shear(SoundSource source) {
        ww$shearFur(null, source);
    }

    @Override
    public boolean readyForShearing() {
        return isAlive() && !isBaby() && ww$isCalm() && !ww$isShorn();
    }

    // ----------------------------------------------------------------------------------------- synced flags

    @Unique
    private boolean ww$flag(int bit) {
        return (entityData.get(WW_FLAGS) & bit) != 0;
    }

    @Unique
    private void ww$setFlag(int bit, boolean on) {
        byte b = entityData.get(WW_FLAGS);
        entityData.set(WW_FLAGS, (byte) (on ? b | bit : b & ~bit));
    }
}
