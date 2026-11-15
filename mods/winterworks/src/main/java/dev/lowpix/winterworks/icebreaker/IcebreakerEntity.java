package dev.lowpix.winterworks.icebreaker;

import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.ItemTags;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.AgeableMob;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.SpawnGroupData;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.BreedGoal;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.FollowParentGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.world.entity.ai.goal.PanicGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.RandomStrollGoal;
import net.minecraft.world.entity.ai.goal.TemptGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.animal.Animal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.ServerLevelAccessor;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * The Icebreaker: a huge fat horned seal of frozen lakes. Breaks ice by charging into it, guards its cubs,
 * can be calmed with fish (dropped on the ground or fed by hand). Heavy Shears take its horn, which regrows.
 */
public class IcebreakerEntity extends Animal {
    private static final EntityDataAccessor<Integer> HORN_STAGE = SynchedEntityData.defineId(IcebreakerEntity.class, EntityDataSerializers.INT);
    private static final EntityDataAccessor<Boolean> CHARGING = SynchedEntityData.defineId(IcebreakerEntity.class, EntityDataSerializers.BOOLEAN);
    private static final EntityDataAccessor<Boolean> SLIDING = SynchedEntityData.defineId(IcebreakerEntity.class, EntityDataSerializers.BOOLEAN);
    private static final EntityDataAccessor<Boolean> CALM = SynchedEntityData.defineId(IcebreakerEntity.class, EntityDataSerializers.BOOLEAN);
    private static final EntityDataAccessor<Integer> VARIANT = SynchedEntityData.defineId(IcebreakerEntity.class, EntityDataSerializers.INT);
    private static final EntityDataAccessor<Boolean> ALPHA = SynchedEntityData.defineId(IcebreakerEntity.class, EntityDataSerializers.BOOLEAN);
    /** Coat variants: textures/entity/icebreaker_<name>.png (same model, different colours and spots). */
    public static final String[] VARIANTS = {"grey", "harbor", "leopard", "ringed", "brown", "frost"};

    public static final byte EVENT_RAM = 4;
    public static final byte EVENT_HAPPY = 41;
    public static final byte EVENT_ROAR = 42;
    public static final byte EVENT_ICE_SMASH = 43;
    public static final byte EVENT_BELLY_SLAP = 44;
    public static final byte EVENT_TAIL_SLAP = 45;
    public static final byte EVENT_BARK = 46;
    /** Horn growth: 0 = none, 1 = a bud ... 4 = full horn. Points needed per stage (see tickHorn). */
    public static final int MAX_HORN = 4, HORN_POINTS = 3000;

    // client animation state
    public final AnimationState idleState = new AnimationState();
    public final AnimationState chargeState = new AnimationState();
    public final AnimationState slideState = new AnimationState();
    public final AnimationState swimState = new AnimationState();
    public final AnimationState ramState = new AnimationState();
    public final AnimationState happyState = new AnimationState();
    public final AnimationState bellySlapState = new AnimationState();
    public final AnimationState tailSlapState = new AnimationState();
    public final AnimationState barkState = new AnimationState();
    /** Client: 0..1 how far the newest horn segment has grown (for a smooth grow-in). */
    public float hornGrowFx = 1f;
    private int lastHornStage = -1;
    /** Belly jiggle spring (client): offset and velocity, kicked by landings, bounces and hits. */
    public float bellyJiggle, bellyJiggleVel, bellyJiggleO;
    private double lastVy;

    private int hornPoints;
    private int calmTicks;
    private int slapTicks;
    private boolean tailSlap;
    int chargeCooldown = 60;
    int iceCooldown = 200;

    public IcebreakerEntity(EntityType<? extends Animal> type, Level level) {
        super(type, level);
        this.xpReward = 8;
    }

    public static AttributeSupplier.Builder createAttributes() {
        return Animal.createMobAttributes()
                .add(Attributes.MAX_HEALTH, 60.0)
                .add(Attributes.MOVEMENT_SPEED, 0.2)
                .add(Attributes.ATTACK_DAMAGE, 8.0)
                .add(Attributes.ATTACK_KNOCKBACK, 1.5)
                .add(Attributes.KNOCKBACK_RESISTANCE, 0.75)
                .add(Attributes.FOLLOW_RANGE, 24.0)
                .add(Attributes.ARMOR, 4.0)
                .add(Attributes.STEP_HEIGHT, 1.0);
    }

    public static boolean checkIcebreakerSpawnRules(EntityType<IcebreakerEntity> type, LevelAccessor level, MobSpawnType reason,
                                                   BlockPos pos, RandomSource random) {
        BlockState below = level.getBlockState(pos.below());
        boolean icy = below.is(BlockTags.ICE) || below.is(Blocks.SNOW_BLOCK) || below.is(Blocks.SNOW) || below.is(Blocks.GRASS_BLOCK)
                || below.is(BlockTags.SAND) || below.is(Blocks.GRAVEL);
        return icy && level.getRawBrightness(pos, 0) > 8;
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        super.defineSynchedData(builder);
        builder.define(HORN_STAGE, MAX_HORN);
        builder.define(CHARGING, false);
        builder.define(SLIDING, false);
        builder.define(CALM, false);
        builder.define(VARIANT, 0);
        builder.define(ALPHA, false);
    }

    @Override
    protected void registerGoals() {
        goalSelector.addGoal(0, new FloatGoal(this));
        goalSelector.addGoal(1, new PanicGoal(this, 1.7) {
            @Override
            public boolean canUse() {
                return IcebreakerEntity.this.isBaby() && super.canUse();
            }
        });
        goalSelector.addGoal(2, new IcebreakerChargeGoal(this));
        goalSelector.addGoal(3, new MeleeAttackGoal(this, 1.3, true));
        goalSelector.addGoal(4, new EatDroppedFishGoal(this));
        goalSelector.addGoal(5, new BreedGoal(this, 1.0));
        goalSelector.addGoal(6, new TemptGoal(this, 1.15, s -> s.is(ItemTags.FISHES), false));
        goalSelector.addGoal(7, new FollowParentGoal(this, 1.25));
        goalSelector.addGoal(8, new BreakIceGoal(this));
        goalSelector.addGoal(9, new RandomStrollGoal(this, 0.85));
        goalSelector.addGoal(10, new LookAtPlayerGoal(this, Player.class, 10.0f));
        goalSelector.addGoal(11, new RandomLookAroundGoal(this));
        targetSelector.addGoal(1, new HurtByTargetGoal(this) {
            @Override
            public boolean canUse() {
                return !IcebreakerEntity.this.isBaby() && super.canUse();
            }
        }.setAlertOthers());
        targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(this, Player.class, 10, true, false, this::threatensCubs));
    }

    /** Players who come close to a cub get charged, unless this one was calmed with fish. */
    private boolean threatensCubs(LivingEntity e) {
        if (isBaby() || isCalm() || !(e instanceof Player)) {
            return false;
        }
        List<IcebreakerEntity> cubs = level().getEntitiesOfClass(IcebreakerEntity.class, getBoundingBox().inflate(12.0),
                IcebreakerEntity::isBaby);
        for (IcebreakerEntity cub : cubs) {
            if (cub.distanceToSqr(e) < 7.0 * 7.0) {
                return true;
            }
        }
        return false;
    }

    // --------------------------------------------------------------------------------------- state

    public int hornStage() {
        return entityData.get(HORN_STAGE);
    }

    public void setHornStage(int v) {
        entityData.set(HORN_STAGE, Math.max(0, Math.min(MAX_HORN, v)));
    }

    /** Big enough to shear (and to break ice with). */
    public boolean hasHorn() {
        return hornStage() >= 2;
    }

    /** The herd's Alpha: bigger, tougher, a great mane and a scarred grizzled coat. About 1 adult in 12. */
    public boolean isAlpha() {
        return entityData.get(ALPHA);
    }

    public void setAlpha(boolean alpha) {
        if (alpha == isAlpha()) {
            return;
        }
        entityData.set(ALPHA, alpha);
        var id = dev.lowpix.winterworks.Winterworks.id("alpha");
        for (var attr : new net.minecraft.core.Holder[]{Attributes.SCALE, Attributes.MAX_HEALTH, Attributes.ATTACK_DAMAGE,
                Attributes.KNOCKBACK_RESISTANCE}) {
            @SuppressWarnings("unchecked")
            var inst = getAttribute((net.minecraft.core.Holder<net.minecraft.world.entity.ai.attributes.Attribute>) attr);
            if (inst != null) {
                inst.removeModifier(id);
            }
        }
        if (alpha) {
            getAttribute(Attributes.SCALE).addPermanentModifier(new net.minecraft.world.entity.ai.attributes.AttributeModifier(id, 0.3,
                    net.minecraft.world.entity.ai.attributes.AttributeModifier.Operation.ADD_VALUE));
            getAttribute(Attributes.MAX_HEALTH).addPermanentModifier(new net.minecraft.world.entity.ai.attributes.AttributeModifier(id, 60,
                    net.minecraft.world.entity.ai.attributes.AttributeModifier.Operation.ADD_VALUE));
            getAttribute(Attributes.ATTACK_DAMAGE).addPermanentModifier(new net.minecraft.world.entity.ai.attributes.AttributeModifier(id, 5,
                    net.minecraft.world.entity.ai.attributes.AttributeModifier.Operation.ADD_VALUE));
            getAttribute(Attributes.KNOCKBACK_RESISTANCE).addPermanentModifier(new net.minecraft.world.entity.ai.attributes.AttributeModifier(id,
                    0.15, net.minecraft.world.entity.ai.attributes.AttributeModifier.Operation.ADD_VALUE));
            setHornStage(MAX_HORN);
            setHealth(getMaxHealth());
        }
        refreshDimensions();
    }

    public int variant() {
        return Math.floorMod(entityData.get(VARIANT), VARIANTS.length);
    }

    public void setVariant(int v) {
        entityData.set(VARIANT, Math.floorMod(v, VARIANTS.length));
    }

    /** Coats by place: icy seas favour the pale and ringed seals, snowy land the spotted and brown ones. */
    private int pickVariant(ServerLevelAccessor level) {
        var biome = level.getBiome(blockPosition());
        RandomSource r = random;
        if (biome.is(net.minecraft.world.level.biome.Biomes.FROZEN_OCEAN) || biome.is(net.minecraft.world.level.biome.Biomes.DEEP_FROZEN_OCEAN)
                || biome.is(net.minecraft.world.level.biome.Biomes.ICE_SPIKES)) {
            return new int[]{5, 5, 3, 3, 0, 2}[r.nextInt(6)];
        }
        return new int[]{0, 0, 1, 1, 2, 3, 4, 4, 5}[r.nextInt(9)];
    }

    public boolean isCharging() {
        return entityData.get(CHARGING);
    }

    public void setCharging(boolean v) {
        entityData.set(CHARGING, v);
    }

    public boolean isSliding() {
        return entityData.get(SLIDING);
    }

    public boolean isCalm() {
        return entityData.get(CALM);
    }

    public void calmDown(int ticks) {
        calmTicks = Math.max(calmTicks, ticks);
        entityData.set(CALM, true);
        setTarget(null);
        setLastHurtByMob(null);
        setPersistentAngerTargetNull();
    }

    private void setPersistentAngerTargetNull() {
        // vanilla Animal has no anger memory; clearing the target and attacker is enough
    }

    // --------------------------------------------------------------------------------------- ticking

    @Override
    public void tick() {
        super.tick();
        if (level().isClientSide) {
            clientTick();
            return;
        }
        tickHorn();
        tickSlaps();
        if (calmTicks > 0 && --calmTicks == 0) {
            entityData.set(CALM, false);
        }
        if (chargeCooldown > 0) {
            chargeCooldown--;
        }
        if (iceCooldown > 0) {
            iceCooldown--;
        }
        BlockState below = level().getBlockState(getBlockPosBelowThatAffectsMyMovement());
        boolean slippery = below.getBlock().getFriction() > 0.9f || (isCharging() && below.is(BlockTags.SNOW));
        entityData.set(SLIDING, onGround() && slippery && getDeltaMovement().horizontalDistanceSqr() > 0.004);
    }

    /**
     * The horn grows back in four stages. It grows when the Icebreaker is cold: slowly in warm places, steadily in
     * snowy biomes, quickly while freezing, and fastest when it is stuck in powdered snow (which can't hurt it).
     */
    private void tickHorn() {
        if (isBaby() || hornStage() >= MAX_HORN) {
            return;
        }
        int rate = 1;
        boolean cold = level().getBiome(blockPosition()).value().coldEnoughToSnow(blockPosition());
        if (cold) {
            rate = 2;
        }
        if (getTicksFrozen() > 0) {
            rate = 6;
        }
        if (isInPowderSnow || wasInPowderSnow) {
            rate = 12;
        }
        hornPoints += rate;
        if (rate >= 6 && tickCount % 5 == 0 && level() instanceof ServerLevel sl) {
            sl.sendParticles(ParticleTypes.SNOWFLAKE, getX(), getY() + getBbHeight() + 0.2, getZ(), 2, 0.25, 0.15, 0.25, 0.02);
        }
        if (hornPoints >= HORN_POINTS) {
            hornPoints = 0;
            setHornStage(hornStage() + 1);
            playSound(WWSounds.HORN_REGROW, 1.0f, 0.8f + hornStage() * 0.15f);
            if (level() instanceof ServerLevel sl) {
                sl.sendParticles(ParticleTypes.END_ROD, getX(), getY() + getBbHeight() + 0.3, getZ(), 6, 0.2, 0.2, 0.2, 0.02);
            }
        }
    }

    /** Freezing doesn't hurt an Icebreaker: it grows its horn. */
    @Override
    public boolean isInvulnerableTo(DamageSource source) {
        return source.is(net.minecraft.tags.DamageTypeTags.IS_FREEZING) || super.isInvulnerableTo(source);
    }

    /** Rear up and drum the belly (a warning, or showing off). */
    public void bellySlap() {
        if (slapTicks > 0) {
            return;
        }
        slapTicks = 24;
        tailSlap = false;
        level().broadcastEntityEvent(this, EVENT_BELLY_SLAP);
    }

    /** Lift the tail flippers and slam them down. */
    public void tailSlap() {
        if (slapTicks > 0) {
            return;
        }
        slapTicks = 20;
        tailSlap = true;
        level().broadcastEntityEvent(this, EVENT_TAIL_SLAP);
    }

    private void tickSlaps() {
        if (slapTicks > 0) {
            slapTicks--;
            int t = (tailSlap ? 20 : 24) - slapTicks;
            boolean hit = tailSlap ? t == 10 : (t == 6 || t == 11 || t == 16);
            if (hit && level() instanceof ServerLevel sl) {
                playSound(WWSounds.ICEBREAKER_SLAP, tailSlap ? 1.4f : 1.0f, (isBaby() ? 1.5f : 0.9f) + random.nextFloat() * 0.15f);
                if (tailSlap) {
                    Vec3 back = Vec3.directionFromRotation(0, getYRot()).scale(-1.6 * getScale());
                    double x = getX() + back.x, z = getZ() + back.z;
                    if (isInWater()) {
                        playSound(WWSounds.ICEBREAKER_SPLASH, 1.2f, 0.9f);
                        sl.sendParticles(ParticleTypes.SPLASH, x, getY() + 0.6, z, 40, 0.6, 0.2, 0.6, 0.3);
                        sl.sendParticles(ParticleTypes.BUBBLE, x, getY() + 0.3, z, 12, 0.5, 0.2, 0.5, 0.1);
                    } else {
                        BlockState under = sl.getBlockState(BlockPos.containing(x, getY() - 0.2, z));
                        sl.sendParticles(new net.minecraft.core.particles.BlockParticleOption(ParticleTypes.BLOCK, under.isAir()
                                ? Blocks.SNOW_BLOCK.defaultBlockState() : under), x, getY() + 0.2, z, 25, 0.5, 0.1, 0.5, 0.2);
                        sl.sendParticles(ParticleTypes.SNOWFLAKE, x, getY() + 0.3, z, 10, 0.5, 0.2, 0.5, 0.08);
                    }
                } else {
                    sl.sendParticles(ParticleTypes.SNOWFLAKE, getX(), getY() + getBbHeight() * 0.5, getZ(), 6, 0.6, 0.3, 0.6, 0.05);
                }
            }
        } else if (getTarget() == null && onGround() && !isCharging() && random.nextInt(isBaby() ? 500 : 900) == 0) {
            if (random.nextBoolean()) {
                bellySlap();
            } else {
                tailSlap();
            }
        } else if (isInWater() && getTarget() == null && random.nextInt(700) == 0) {
            tailSlap();
        }
    }

    private void clientTick() {
        int stage = hornStage();
        if (lastHornStage >= 0 && stage > lastHornStage) {
            hornGrowFx = 0f;
        }
        lastHornStage = stage;
        hornGrowFx = Math.min(1f, hornGrowFx + 0.04f);
        if (isInWater() && getDeltaMovement().horizontalDistanceSqr() > 0.004 && tickCount % 2 == 0) {
            Vec3 back = Vec3.directionFromRotation(0, yBodyRot).scale(-1.4 * getScale());
            level().addParticle(ParticleTypes.BUBBLE, getX() + back.x, getY() + 0.4, getZ() + back.z, 0, 0.05, 0);
        }
        boolean moving = getDeltaMovement().horizontalDistanceSqr() > 1.0e-5 || walkAnimation.speed() > 0.05f;
        swimState.animateWhen(isInWater(), tickCount);
        chargeState.animateWhen(isCharging() && !isInWater(), tickCount);
        slideState.animateWhen(isSliding() && !isCharging() && !isInWater(), tickCount);
        idleState.animateWhen(!moving && !isInWater(), tickCount);
        // belly spring: vertical bumps and footfalls make it wobble, then it settles
        double vy = getY() - yo;
        float kick = (float) (vy - lastVy);
        lastVy = vy;
        bellyJiggleO = bellyJiggle;
        bellyJiggleVel += -kick * 1.6f + (onGround() && moving ? Mth.sin(tickCount * 0.9f) * 0.012f * walkAnimation.speed() : 0f);
        bellyJiggleVel += -bellyJiggle * 0.32f;   // spring
        bellyJiggleVel *= 0.8f;                   // damping
        bellyJiggle = Mth.clamp(bellyJiggle + bellyJiggleVel, -0.35f, 0.35f);
    }

    public float bellyJiggle(float partial) {
        return Mth.lerp(partial, bellyJiggleO, bellyJiggle);
    }

    @Override
    public void handleEntityEvent(byte id) {
        switch (id) {
            case EVENT_RAM -> {
                ramState.start(tickCount);
                bellyJiggleVel += 0.25f;
            }
            case EVENT_HAPPY -> {
                happyState.start(tickCount);
                bellyJiggleVel += 0.2f;
                for (int i = 0; i < 6; i++) {
                    level().addParticle(ParticleTypes.HEART, getRandomX(1.0), getRandomY() + 0.5, getRandomZ(1.0), 0, 0.05, 0);
                }
            }
            case EVENT_ROAR -> {
                bellyJiggleVel += 0.15f;
                for (int i = 0; i < 10; i++) {
                    level().addParticle(ParticleTypes.SNOWFLAKE, getRandomX(1.2), getY() + 0.2, getRandomZ(1.2),
                            (random.nextDouble() - 0.5) * 0.2, 0.15, (random.nextDouble() - 0.5) * 0.2);
                }
            }
            case EVENT_ICE_SMASH -> bellyJiggleVel += 0.3f;
            case EVENT_BELLY_SLAP -> bellySlapState.start(tickCount);
            case EVENT_TAIL_SLAP -> tailSlapState.start(tickCount);
            case EVENT_BARK -> barkState.start(tickCount);
            default -> super.handleEntityEvent(id);
        }
    }

    // --------------------------------------------------------------------------------------- fighting

    @Override
    public boolean doHurtTarget(Entity target) {
        boolean hit = super.doHurtTarget(target);
        if (hit) {
            level().broadcastEntityEvent(this, EVENT_RAM);
            playSound(WWSounds.ICEBREAKER_RAM, 1.2f, 0.85f + random.nextFloat() * 0.2f);
            if (target instanceof LivingEntity le) {
                Vec3 d = target.position().subtract(position()).multiply(1, 0, 1).normalize();
                le.push(d.x * 0.7, 0.35, d.z * 0.7);
                le.hurtMarked = true;
            }
        }
        return hit;
    }

    @Override
    public boolean hurt(DamageSource source, float amount) {
        if (source.getEntity() instanceof Player) {
            calmTicks = 0;
            entityData.set(CALM, false);
        }
        return super.hurt(source, amount);
    }

    /** Smash ice (and frosted ice) blocks around a point into water, with a crack and a burst of shards. */
    public int smashIce(BlockPos centre, int radius) {
        if (!(level() instanceof ServerLevel sl) || !sl.getGameRules().getBoolean(net.minecraft.world.level.GameRules.RULE_MOBGRIEFING)) {
            return 0;
        }
        int n = 0;
        for (BlockPos p : BlockPos.betweenClosed(centre.offset(-radius, -1, -radius), centre.offset(radius, 1, radius))) {
            BlockState s = sl.getBlockState(p);
            if (s.is(Blocks.ICE) || s.is(Blocks.FROSTED_ICE)) {
                sl.levelEvent(2001, p, net.minecraft.world.level.block.Block.getId(s));
                BlockState under = sl.getBlockState(p.below());
                boolean water = under.blocksMotion() || under.liquid();
                sl.setBlockAndUpdate(p, water ? Blocks.WATER.defaultBlockState() : Blocks.AIR.defaultBlockState());
                n++;
            }
        }
        if (n > 0) {
            sl.playSound(null, centre, WWSounds.ICE_CRACK, SoundSource.NEUTRAL, 1.6f, 0.8f + random.nextFloat() * 0.2f);
            sl.sendParticles(ParticleTypes.SNOWFLAKE, centre.getX() + 0.5, centre.getY() + 1.0, centre.getZ() + 0.5, 30, 1.2, 0.4, 1.2, 0.1);
            level().broadcastEntityEvent(this, EVENT_ICE_SMASH);
        }
        return n;
    }

    // --------------------------------------------------------------------------------------- interaction

    @Override
    public InteractionResult mobInteract(Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if (stack.getItem() instanceof HeavyShearsItem) {
            if (!hasHorn() || isBaby()) {
                return InteractionResult.PASS;
            }
            if (!level().isClientSide) {
                shearHorn(player);
                stack.hurtAndBreak(4, player, getSlotForHand(hand));
            }
            return InteractionResult.sidedSuccess(level().isClientSide);
        }
        if (isFood(stack)) {
            if (!level().isClientSide) {
                calmDown(20 * 180);
                heal(4.0f);
                level().broadcastEntityEvent(this, EVENT_HAPPY);
                playSound(WWSounds.ICEBREAKER_HAPPY, 1.0f, 1.0f);
            }
            InteractionResult r = super.mobInteract(player, hand);   // breeding / growing up
            if (!r.consumesAction()) {
                usePlayerItem(player, hand, stack);
                return InteractionResult.sidedSuccess(level().isClientSide);
            }
            return r;
        }
        return super.mobInteract(player, hand);
    }

    public void shearHorn(@Nullable Player player) {
        int stage = hornStage();
        setHornStage(0);
        hornPoints = 0;
        // a full horn gives one horn and maybe a second; a half-grown one gives one
        spawnAtLocation(new ItemStack(WWItems.ICEBREAKER_HORN, stage >= MAX_HORN && random.nextInt(3) == 0 ? 2 : 1), 1.8f);
        playSound(WWSounds.HORN_SHEAR, 1.0f, 1.0f);
        gameEvent(GameEvent.SHEAR, player);
        level().broadcastEntityEvent(this, EVENT_RAM);
        if (player != null && !isCalm() && !player.getAbilities().instabuild) {
            setTarget(player);   // it did not enjoy that
        }
    }

    public void eatFish(ItemStack fish) {
        fish.shrink(1);
        calmDown(20 * 180);
        heal(6.0f);
        playSound(WWSounds.ICEBREAKER_HAPPY, 1.0f, 0.9f + random.nextFloat() * 0.2f);
        level().broadcastEntityEvent(this, EVENT_HAPPY);
        if (random.nextInt(3) == 0) {
            slapTicks = 0;
            tailSlap();
        }
        if (isBaby()) {
            ageUp(getSpeedUpSecondsWhenFeeding(-getAge()), true);
        }
    }

    @Override
    public boolean isFood(ItemStack stack) {
        return stack.is(ItemTags.FISHES);
    }

    @Nullable
    @Override
    public AgeableMob getBreedOffspring(ServerLevel level, AgeableMob other) {
        IcebreakerEntity cub = WWEntities.ICEBREAKER.create(level);
        if (cub != null) {
            cub.setHornStage(0);
            cub.setVariant(random.nextBoolean() || !(other instanceof IcebreakerEntity o) ? variant() : o.variant());
        }
        return cub;
    }

    @Override
    public SpawnGroupData finalizeSpawn(ServerLevelAccessor level, DifficultyInstance difficulty, MobSpawnType reason,
                                        @Nullable SpawnGroupData data) {
        if (data == null) {
            data = new AgeableMob.AgeableMobGroupData(0.45f);   // herds come with cubs
        }
        SpawnGroupData out = super.finalizeSpawn(level, difficulty, reason, data);
        setHornStage(isBaby() ? 0 : 2 + random.nextInt(3));
        setVariant(pickVariant(level));
        if (!isBaby() && random.nextInt(12) == 0) {
            setAlpha(true);
        }
        return out;
    }

    @Override
    protected float getWaterSlowDown() {
        return 0.96f;   // seals are fast swimmers
    }

    @Override
    public int getMaxHeadYRot() {
        return 35;
    }

    // --------------------------------------------------------------------------------------- sounds

    /** Every grunt is acted out: head up, mouth open, nostrils flared. */
    @Override
    public void playAmbientSound() {
        super.playAmbientSound();
        level().broadcastEntityEvent(this, EVENT_BARK);
    }

    @Override
    protected SoundEvent getAmbientSound() {
        return isBaby() ? WWSounds.ICEBREAKER_HAPPY : WWSounds.ICEBREAKER_AMBIENT;
    }

    @Override
    protected SoundEvent getHurtSound(DamageSource source) {
        return WWSounds.ICEBREAKER_HURT;
    }

    @Override
    protected SoundEvent getDeathSound() {
        return WWSounds.ICEBREAKER_DEATH;
    }

    @Override
    protected void playStepSound(BlockPos pos, BlockState state) {
        playSound(WWSounds.ICEBREAKER_STEP, 0.4f, isBaby() ? 1.5f : 0.8f);
    }

    @Override
    public float getVoicePitch() {
        return isBaby() ? 1.6f + random.nextFloat() * 0.2f : (isAlpha() ? 0.65f : 0.85f) + random.nextFloat() * 0.15f;
    }

    // --------------------------------------------------------------------------------------- saving

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        tag.putInt("HornStage", hornStage());
        tag.putString("Variant", VARIANTS[variant()]);
        tag.putBoolean("Alpha", isAlpha());
        tag.putInt("HornPoints", hornPoints);
        tag.putInt("CalmTicks", calmTicks);
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        setHornStage(tag.contains("HornStage") ? tag.getInt("HornStage") : MAX_HORN);
        hornPoints = tag.getInt("HornPoints");
        if (tag.getBoolean("Alpha")) {
            entityData.set(ALPHA, true);   // its attribute modifiers are saved with the attributes
            refreshDimensions();
        }
        String v = tag.getString("Variant");
        for (int i = 0; i < VARIANTS.length; i++) {
            if (VARIANTS[i].equals(v)) {
                setVariant(i);
            }
        }
        calmTicks = tag.getInt("CalmTicks");
        entityData.set(CALM, calmTicks > 0);
    }

    AABB frontBox(double reach) {
        Vec3 look = Vec3.directionFromRotation(0, getYRot());
        return getBoundingBox().move(look.scale(reach)).inflate(0.3, 0.0, 0.3);
    }
}
