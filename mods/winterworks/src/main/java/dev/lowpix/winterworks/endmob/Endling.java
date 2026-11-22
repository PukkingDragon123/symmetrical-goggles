package dev.lowpix.winterworks.endmob;

import dev.lowpix.winterworks.registry.EndBlocks;
import dev.lowpix.winterworks.registry.EndSounds;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.AgeableMob;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.SpawnGroupData;
import net.minecraft.world.entity.TamableAnimal;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.AvoidEntityGoal;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.FollowOwnerGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.PanicGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.SitWhenOrderedToGoal;
import net.minecraft.world.entity.ai.goal.TemptGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.animal.Animal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.ServerLevelAccessor;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * The Endling (docs/END_UPDATE.md section 8): a tiny, cute Enderman-like creature. Wild ones flee players (unless you
 * sneak holding chorus fruit), hop away by teleporting when hurt and are hunted by Guckers; a quarter of them grow a
 * flower on the head. Chorus fruit tames one (1 in 3); tamed, it follows you and sits (sneak + use). A plant from
 * `#winterworks:endling_head_plants` goes on its head (shears take it off). If you fall into the void, a tamed Endling
 * of yours within 128 blocks gives itself up to save you (EndMobFeature's void rescue, then {@link #sacrifice}).
 */
public class Endling extends TamableAnimal {
    private static final EntityDataAccessor<ItemStack> HEAD_PLANT = SynchedEntityData.defineId(Endling.class, EntityDataSerializers.ITEM_STACK);
    private static final EntityDataAccessor<Boolean> SACRIFICING = SynchedEntityData.defineId(Endling.class, EntityDataSerializers.BOOLEAN);
    public static final byte EVENT_HOP = 70, EVENT_TELEPORT = 71;
    public static final int SACRIFICE_TICKS = 24;
    public static final int RESCUE_SLOW_FALLING = 200;
    public static final float WILD_FLOWER_CHANCE = 0.25f;

    // client animation state (clips in assets/winterworks/lowpix/endling.anim.json)
    public final AnimationState idleState = new AnimationState();
    public final AnimationState sitState = new AnimationState();
    public final AnimationState hopState = new AnimationState();
    public final AnimationState teleportState = new AnimationState();
    public final AnimationState sacrificeState = new AnimationState();

    private int sacrificeTicks;
    private int hopCooldown;

    public Endling(EntityType<? extends TamableAnimal> type, Level level) {
        super(type, level);
        this.xpReward = 2;
    }

    public static AttributeSupplier.Builder createAttributes() {
        return Animal.createMobAttributes().add(Attributes.MAX_HEALTH, 8.0).add(Attributes.MOVEMENT_SPEED, 0.3)
                .add(Attributes.FOLLOW_RANGE, 16.0);
    }

    /** Natural spawns: on End grass, End moss or End stone. */
    public static boolean checkEndlingSpawnRules(EntityType<Endling> type, LevelAccessor level, MobSpawnType reason, BlockPos pos,
                                                 RandomSource random) {
        var below = level.getBlockState(pos.below());
        return below.is(EndBlocks.END_GRASS_BLOCK) || below.is(EndBlocks.END_MOSS_BLOCK) || below.is(Blocks.END_STONE);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        super.defineSynchedData(builder);
        builder.define(HEAD_PLANT, ItemStack.EMPTY);
        builder.define(SACRIFICING, false);
    }

    @Override
    protected void registerGoals() {
        goalSelector.addGoal(0, new FloatGoal(this));
        goalSelector.addGoal(1, new SitWhenOrderedToGoal(this));
        goalSelector.addGoal(2, new AvoidEntityGoal<>(this, Gucker.class, 10f, 1.2, 1.5));
        goalSelector.addGoal(3, new AvoidEntityGoal<>(this, Player.class, p -> !isTame() && !(p.isShiftKeyDown() && holdsChorus(p)),
                8f, 1.1, 1.45, e -> e instanceof Player p && EndMobFeature.isSurvivalLike(p)));
        goalSelector.addGoal(4, new PanicGoal(this, 1.4) {
            @Override
            public boolean canUse() {
                return !isTame() && super.canUse();
            }
        });
        goalSelector.addGoal(5, new TemptGoal(this, 0.9, s -> s.is(Items.CHORUS_FRUIT), false) {
            @Override
            public boolean canUse() {
                return super.canUse() && player != null && (isTame() || player.isShiftKeyDown());   // wild ones only come to a sneaker
            }
        });
        goalSelector.addGoal(6, new FollowOwnerGoal(this, 1.1, 6f, 2f));
        goalSelector.addGoal(8, new WaterAvoidingRandomStrollGoal(this, 0.8));
        goalSelector.addGoal(9, new LookAtPlayerGoal(this, Player.class, 6f));
        goalSelector.addGoal(10, new RandomLookAroundGoal(this));
    }

    private static boolean holdsChorus(LivingEntity e) {
        return e.getMainHandItem().is(Items.CHORUS_FRUIT) || e.getOffhandItem().is(Items.CHORUS_FRUIT);
    }

    @Override
    public SpawnGroupData finalizeSpawn(ServerLevelAccessor level, DifficultyInstance difficulty, MobSpawnType reason,
                                        @Nullable SpawnGroupData data) {
        if (!isTame() && getHeadPlant().isEmpty() && level.getRandom().nextFloat() < WILD_FLOWER_CHANCE) {
            setHeadPlant(new ItemStack(level.getRandom().nextBoolean() ? EndBlocks.END_BLOOM : EndBlocks.END_GRASS));
        }
        return super.finalizeSpawn(level, difficulty, reason, data);
    }

    // ------------------------------------------------------------------------------------------------ the head plant

    public ItemStack getHeadPlant() {
        return entityData.get(HEAD_PLANT);
    }

    public void setHeadPlant(ItemStack stack) {
        entityData.set(HEAD_PLANT, stack.isEmpty() ? ItemStack.EMPTY : stack.copyWithCount(1));
    }

    public static boolean isHeadPlant(ItemStack stack) {
        return stack.is(EndMobFeature.ENDLING_HEAD_PLANTS);
    }

    // ------------------------------------------------------------------------------------------------ interaction

    @Override
    public InteractionResult mobInteract(Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if (isSacrificing()) {
            return InteractionResult.PASS;
        }
        if (isHeadPlant(stack)) {
            if (!level().isClientSide) {
                if (!getHeadPlant().isEmpty()) {
                    spawnAtLocation(getHeadPlant(), 1.0f);
                }
                setHeadPlant(stack);
                stack.consume(1, player);
                playSound(SoundEvents.GRASS_PLACE, 1.0f, 1.2f);
                hop();
            }
            return InteractionResult.sidedSuccess(level().isClientSide);
        }
        if (EndBloomBlock.isShears(stack) && !getHeadPlant().isEmpty()) {
            if (!level().isClientSide) {
                spawnAtLocation(getHeadPlant(), 1.0f);
                setHeadPlant(ItemStack.EMPTY);
                playSound(SoundEvents.SHEEP_SHEAR, 1.0f, 1.4f);
                stack.hurtAndBreak(1, player, getSlotForHand(hand));
                gameEvent(GameEvent.SHEAR, player);
            }
            return InteractionResult.sidedSuccess(level().isClientSide);
        }
        if (!isTame() && stack.is(Items.CHORUS_FRUIT)) {
            if (!level().isClientSide) {
                stack.consume(1, player);
                playSound(SoundEvents.GENERIC_EAT, 0.7f, 1.6f);
                if (random.nextInt(3) == 0) {
                    tame(player);
                    navigation.stop();
                    setTarget(null);
                    level().broadcastEntityEvent(this, (byte) 7);   // hearts
                    hop();
                } else {
                    level().broadcastEntityEvent(this, (byte) 6);   // smoke
                }
            }
            return InteractionResult.sidedSuccess(level().isClientSide);
        }
        if (isTame() && isOwnedBy(player) && player.isShiftKeyDown()) {
            if (!level().isClientSide) {
                setOrderedToSit(!isOrderedToSit());
                jumping = false;
                navigation.stop();
                setTarget(null);
            }
            return InteractionResult.sidedSuccess(level().isClientSide);
        }
        return super.mobInteract(player, hand);
    }

    /** A happy little hop (the `hop` clip). */
    public void hop() {
        if (hopCooldown <= 0) {
            hopCooldown = 10;
            level().broadcastEntityEvent(this, EVENT_HOP);
            playSound(EndSounds.ENDLING_HAPPY, 0.8f, 1.0f + random.nextFloat() * 0.2f);
            if (onGround() && !isInSittingPose()) {
                setDeltaMovement(getDeltaMovement().add(0, 0.32, 0));
            }
        }
    }

    // ------------------------------------------------------------------------------------------------ hurt: teleport hops

    @Override
    public boolean hurt(DamageSource source, float amount) {
        if (isSacrificing()) {
            return false;
        }
        boolean hurt = super.hurt(source, amount);
        if (hurt && !level().isClientSide && isAlive() && !isOrderedToSit() && random.nextFloat() < 0.75f) {
            teleportHop();
        }
        return hurt;
    }

    /** A short teleport hop (4-6 blocks) onto ground. */
    public boolean teleportHop() {
        Vec3 from = position();
        for (int i = 0; i < 16; i++) {
            double a = random.nextDouble() * Mth.TWO_PI, r = 4 + random.nextDouble() * 2;
            double x = getX() + Math.cos(a) * r, z = getZ() + Math.sin(a) * r, y = getY() + random.nextInt(5) - 2;
            if (randomTeleport(x, y, z, true)) {
                level().broadcastEntityEvent(this, EVENT_TELEPORT);
                level().gameEvent(GameEvent.TELEPORT, from, GameEvent.Context.of(this));
                level().playSound(null, from.x, from.y, from.z, EndSounds.ENDLING_TELEPORT, getSoundSource(), 0.8f, 1.3f);
                playSound(EndSounds.ENDLING_TELEPORT, 0.8f, 1.4f);
                return true;
            }
        }
        return false;
    }

    // ------------------------------------------------------------------------------------------------ the void rescue

    public boolean isSacrificing() {
        return entityData.get(SACRIFICING);
    }

    /** Gives itself up for `owner`, who fell into the void: they come to it with Slow Falling; it vanishes in light. */
    public void sacrifice(ServerPlayer owner) {
        if (isSacrificing() || !(level() instanceof ServerLevel level)) {
            return;
        }
        entityData.set(SACRIFICING, true);
        sacrificeTicks = SACRIFICE_TICKS;
        setInvulnerable(true);
        setOrderedToSit(true);
        navigation.stop();
        if (owner.isPassenger()) {
            owner.stopRiding();
        }
        owner.teleportTo(level, getX(), getY() + 0.1, getZ(), owner.getYRot(), owner.getXRot());
        owner.setDeltaMovement(Vec3.ZERO);
        owner.hurtMarked = true;
        owner.resetFallDistance();
        owner.addEffect(new MobEffectInstance(MobEffects.SLOW_FALLING, RESCUE_SLOW_FALLING), this);
        level.playSound(null, getX(), getY(), getZ(), EndSounds.ENDLING_SACRIFICE, SoundSource.NEUTRAL, 1.2f, 1.0f);
        level.sendParticles(ParticleTypes.REVERSE_PORTAL, getX(), getY() + 0.5, getZ(), 30, 0.3, 0.5, 0.3, 0.05);
    }

    // ------------------------------------------------------------------------------------------------ ticking

    @Override
    public void tick() {
        super.tick();
        if (hopCooldown > 0) {
            hopCooldown--;
        }
        if (level().isClientSide) {
            clientTick();
            return;
        }
        if (isSacrificing()) {
            setDeltaMovement(getDeltaMovement().multiply(0, 1, 0));
            if (--sacrificeTicks <= 0 && level() instanceof ServerLevel level) {
                level.sendParticles(ParticleTypes.FLASH, getX(), getY() + 0.5, getZ(), 1, 0, 0, 0, 0);
                level.sendParticles(ParticleTypes.END_ROD, getX(), getY() + 0.5, getZ(), 40, 0.2, 0.3, 0.2, 0.25);
                level.playSound(null, getX(), getY(), getZ(), SoundEvents.AMETHYST_BLOCK_CHIME, SoundSource.NEUTRAL, 1.5f, 1.4f);
                discard();
            }
        }
    }

    private void clientTick() {
        boolean moving = getDeltaMovement().horizontalDistanceSqr() > 1e-4;
        idleState.animateWhen(!moving && !isInSittingPose() && !isSacrificing(), tickCount);
        sitState.animateWhen(isInSittingPose() && !isSacrificing(), tickCount);
        if (isSacrificing()) {
            if (!sacrificeState.isStarted()) {
                sacrificeState.start(tickCount);
            }
            level().addParticle(ParticleTypes.END_ROD, getRandomX(0.6), getRandomY(), getRandomZ(0.6), 0, 0.05, 0);
        } else if (random.nextInt(60) == 0) {
            level().addParticle(ParticleTypes.PORTAL, getRandomX(0.5), getRandomY() - 0.25, getRandomZ(0.5),
                    (random.nextDouble() - 0.5) * 2, -random.nextDouble(), (random.nextDouble() - 0.5) * 2);
        }
    }

    @Override
    public void handleEntityEvent(byte id) {
        switch (id) {
            case EVENT_HOP -> hopState.start(tickCount);
            case EVENT_TELEPORT -> teleportState.start(tickCount);
            default -> super.handleEntityEvent(id);
        }
    }

    // ------------------------------------------------------------------------------------------------ save

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        if (!getHeadPlant().isEmpty()) {
            tag.put("HeadPlant", getHeadPlant().save(registryAccess()));
        }
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        setHeadPlant(tag.contains("HeadPlant") ? ItemStack.parseOptional(registryAccess(), tag.getCompound("HeadPlant")) : ItemStack.EMPTY);
    }

    @Override
    protected void dropCustomDeathLoot(ServerLevel level, DamageSource source, boolean recentlyHit) {
        super.dropCustomDeathLoot(level, source, recentlyHit);
        if (!getHeadPlant().isEmpty()) {
            spawnAtLocation(getHeadPlant());
        }
    }

    // ------------------------------------------------------------------------------------------------ misc

    @Override
    public boolean isFood(ItemStack stack) {
        return false;   // no breeding: chorus fruit is for taming
    }

    @Override
    public AgeableMob getBreedOffspring(ServerLevel level, AgeableMob other) {
        return null;
    }

    @Override
    public boolean canBeLeashed() {
        return isTame();
    }

    @Override
    protected SoundEvent getAmbientSound() {
        return isTame() ? EndSounds.ENDLING_AMBIENT : (random.nextInt(4) == 0 ? EndSounds.ENDLING_SCARED : EndSounds.ENDLING_AMBIENT);
    }

    @Override
    protected SoundEvent getHurtSound(DamageSource source) {
        return EndSounds.ENDLING_HURT;
    }

    @Override
    protected SoundEvent getDeathSound() {
        return EndSounds.ENDLING_DEATH;
    }

    @Override
    public float getVoicePitch() {
        return super.getVoicePitch() * 1.1f;
    }
}
