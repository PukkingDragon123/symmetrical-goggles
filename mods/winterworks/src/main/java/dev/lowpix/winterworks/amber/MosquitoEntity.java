package dev.lowpix.winterworks.amber;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.registry.WWParticles;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.EnumSet;
import java.util.Locale;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.Registries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.tags.EntityTypeTags;
import net.minecraft.tags.TagKey;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.control.FlyingMoveControl;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.TemptGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.ai.navigation.FlyingPathNavigation;
import net.minecraft.world.entity.ai.navigation.PathNavigation;
import net.minecraft.world.entity.ai.util.AirAndWaterRandomPos;
import net.minecraft.world.entity.ai.util.HoverRandomPos;
import net.minecraft.world.entity.animal.FlyingAnimal;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemUtils;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.PitcherCropBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.level.pathfinder.PathType;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * The mosquito (docs/AMBER_UPDATE.md section 6): a small hostile flyer. Empty mosquitoes hunt anything with blood,
 * stab it and drink (then they are calm and slow for 2 minutes); they also drink resin from Amberwood logs. A glass
 * bottle takes a blood mosquito's blood (a Potion of Blood); an amber mosquito fed blood spits out an amber shard.
 * Pitcher plants and pitcher pods charm them: they hang around the plants and pollinate pitcher crops.
 */
public class MosquitoEntity extends Monster implements FlyingAnimal {
    public enum State {
        EMPTY, BLOOD, AMBER;

        public String id() {
            return name().toLowerCase(Locale.ROOT);
        }

        static State byId(String id) {
            for (State s : values()) {
                if (s.id().equals(id)) {
                    return s;
                }
            }
            return EMPTY;
        }
    }

    /** Mobs without blood worth drinking (golems, slimes, blazes, endermen, ...). Undead are skipped too. */
    public static final TagKey<EntityType<?>> BLOODLESS = TagKey.create(Registries.ENTITY_TYPE, Winterworks.id("bloodless"));
    private static final EntityDataAccessor<Byte> STATE = SynchedEntityData.defineId(MosquitoEntity.class, EntityDataSerializers.BYTE);
    private static final EntityDataAccessor<Boolean> DRINKING = SynchedEntityData.defineId(MosquitoEntity.class, EntityDataSerializers.BOOLEAN);
    private static final ResourceLocation FULL_SLOW = Winterworks.id("mosquito_full");
    public static final byte EVENT_STAB = 70, EVENT_SPIT = 71;
    /** Calm (and slow) for 2 minutes after a drink of blood, then it has digested it and is hungry again. */
    public static final int CALM_TICKS = 2400;
    public static final int STAB_TICKS = 12, SPIT_TICKS = 12;

    // client animation state (clips in assets/winterworks/lowpix/mosquito.anim.json)
    public final AnimationState flyState = new AnimationState();
    public final AnimationState idleState = new AnimationState();
    public final AnimationState stabState = new AnimationState();
    public final AnimationState drinkState = new AnimationState();
    public final AnimationState spitState = new AnimationState();

    private int calmTicks;
    private int stabCooldown;
    private int pollinateCooldown = 200;
    @Nullable
    private BlockPos pitcherHome;

    public MosquitoEntity(EntityType<? extends Monster> type, Level level) {
        super(type, level);
        this.moveControl = new FlyingMoveControl(this, 20, true);
        this.xpReward = 3;
        setPathfindingMalus(PathType.DANGER_FIRE, -1.0f);
        setPathfindingMalus(PathType.WATER, -1.0f);
        setPathfindingMalus(PathType.WATER_BORDER, 16.0f);
        setPathfindingMalus(PathType.COCOA, -1.0f);
        setPathfindingMalus(PathType.FENCE, -1.0f);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return Monster.createMonsterAttributes().add(Attributes.MAX_HEALTH, 6).add(Attributes.FLYING_SPEED, 0.6)
                .add(Attributes.MOVEMENT_SPEED, 0.3).add(Attributes.ATTACK_DAMAGE, 2).add(Attributes.FOLLOW_RANGE, 24);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        super.defineSynchedData(builder);
        builder.define(STATE, (byte) 0);
        builder.define(DRINKING, false);
    }

    @Override
    protected PathNavigation createNavigation(Level level) {
        FlyingPathNavigation nav = new FlyingPathNavigation(this, level) {
            @Override
            public boolean isStableDestination(BlockPos pos) {
                return !this.level.getBlockState(pos.below()).isAir();
            }
        };
        nav.setCanOpenDoors(false);
        nav.setCanFloat(false);
        nav.setCanPassDoors(true);
        return nav;
    }

    @Override
    protected void registerGoals() {
        goalSelector.addGoal(0, new FloatGoal(this));
        goalSelector.addGoal(1, new StabGoal());
        goalSelector.addGoal(2, new TemptGoal(this, 1.0, s -> s.is(Items.PITCHER_POD), false));
        goalSelector.addGoal(3, new SeekBloodGoal());
        goalSelector.addGoal(4, new DrinkResinGoal());
        goalSelector.addGoal(5, new PitcherGoal());
        goalSelector.addGoal(6, new HoverWanderGoal());
        goalSelector.addGoal(7, new LookAtPlayerGoal(this, Player.class, 6.0f));
        goalSelector.addGoal(8, new RandomLookAroundGoal(this));
        targetSelector.addGoal(1, new HurtByTargetGoal(this) {
            @Override
            public boolean canUse() {
                return state() == State.EMPTY && calmTicks <= 0 && super.canUse();
            }
        });
        targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(this, LivingEntity.class, 10, true, false, this::canHunt));
    }

    // --------------------------------------------------------------------------------------- state

    public State state() {
        return State.values()[Mth.clamp(entityData.get(STATE), 0, 2)];
    }

    public void setState(State s) {
        entityData.set(STATE, (byte) s.ordinal());
        AttributeInstance fly = getAttribute(Attributes.FLYING_SPEED);
        AttributeInstance walk = getAttribute(Attributes.MOVEMENT_SPEED);
        for (AttributeInstance a : new AttributeInstance[]{fly, walk}) {
            if (a != null) {
                a.removeModifier(FULL_SLOW);
                if (s == State.BLOOD) {   // heavy with blood: slow
                    a.addTransientModifier(new AttributeModifier(FULL_SLOW, -0.5, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL));
                }
            }
        }
    }

    public boolean isEmptyBelly() {
        return state() == State.EMPTY;
    }

    public boolean isBlood() {
        return state() == State.BLOOD;
    }

    public boolean isAmber() {
        return state() == State.AMBER;
    }

    public boolean isDrinking() {
        return entityData.get(DRINKING);
    }

    void setDrinking(boolean v) {
        entityData.set(DRINKING, v);
    }

    public int calmTicks() {
        return calmTicks;
    }

    public void calmDown(int ticks) {
        calmTicks = Math.max(calmTicks, ticks);
        setTarget(null);
    }

    /** Mosquitoes drink from any living mob except undead, bloodless ones, other mosquitoes and charmed players. */
    public static boolean hasBlood(LivingEntity e) {
        return !(e instanceof MosquitoEntity) && !e.getType().is(EntityTypeTags.UNDEAD) && !e.getType().is(BLOODLESS);
    }

    /** Would this mosquito hunt `e` right now? */
    public boolean canHunt(LivingEntity e) {
        if (e == this || !e.isAlive() || state() != State.EMPTY || calmTicks > 0 || !hasBlood(e)) {
            return false;
        }
        if (e instanceof Player p) {   // a player holding pitcher pods charms them
            return !p.isCreative() && !p.isSpectator() && !p.isHolding(Items.PITCHER_POD);
        }
        return true;
    }

    /** Blood from any source (a Potion of Blood, a stain, a splash): amber mosquitoes spit, empty ones fill up. */
    public boolean feedBlood() {
        if (level().isClientSide) {
            return false;
        }
        if (isAmber()) {
            spitAmber();
            return true;
        }
        if (isEmptyBelly()) {
            fillWithBlood();
            return true;
        }
        return false;
    }

    /** Wants blood from a stain: an amber one (to spit) or a hungry empty one. */
    public boolean wantsBlood() {
        return isAmber() || (isEmptyBelly() && calmTicks <= 0);
    }

    void fillWithBlood() {
        setDrinking(false);
        setState(State.BLOOD);
        calmTicks = CALM_TICKS;
        setTarget(null);
        playSound(WWSounds.MOSQUITO_DRINK, 0.8f, 0.9f + random.nextFloat() * 0.2f);
        if (level() instanceof ServerLevel sl) {
            sl.sendParticles(WWParticles.BLOOD_DRIP, getX(), getY() + 0.1, getZ(), 4, 0.1, 0.05, 0.1, 0.0);
        }
    }

    /** Spits the resin out as an amber shard: the amber farm. */
    public void spitAmber() {
        setState(State.EMPTY);
        calmDown(200);
        level().broadcastEntityEvent(this, EVENT_SPIT);
        playSound(WWSounds.MOSQUITO_SPIT, 1.0f, 0.9f + random.nextFloat() * 0.2f);
        Vec3 look = Vec3.directionFromRotation(0, getYRot());
        ItemEntity shard = new ItemEntity(level(), getX() + look.x * 0.3, getY() + 0.15, getZ() + look.z * 0.3,
                new ItemStack(WWItems.AMBER_SHARD));
        shard.setDeltaMovement(look.x * 0.15, 0.12, look.z * 0.15);
        shard.setDefaultPickUpDelay();
        level().addFreshEntity(shard);
        if (level() instanceof ServerLevel sl) {
            sl.sendParticles(WWParticles.AMBER_GLINT, getX() + look.x * 0.3, getY() + 0.15, getZ() + look.z * 0.3, 8, 0.12, 0.08, 0.12, 0.02);
        }
    }

    /** Freed from an amber block: a little dazed, then very hungry. */
    public void released() {
        setState(State.EMPTY);
        calmTicks = 40;
        setDeltaMovement(0, 0.15, 0);
    }

    // --------------------------------------------------------------------------------------- ticking

    @Override
    public void tick() {
        super.tick();
        if (level().isClientSide) {
            clientTick();
            return;
        }
        if (calmTicks > 0 && --calmTicks == 0 && isBlood()) {
            setState(State.EMPTY);   // digested: hungry again
        }
        if (stabCooldown > 0) {
            stabCooldown--;
        }
        if (pollinateCooldown > 0) {
            pollinateCooldown--;
        }
    }

    private void clientTick() {
        boolean moving = getDeltaMovement().lengthSqr() > 2.5e-4;
        boolean drinking = isDrinking();
        flyState.animateWhen(moving && !drinking, tickCount);
        idleState.animateWhen(!moving && !drinking, tickCount);
        drinkState.animateWhen(drinking, tickCount);
        if (isBlood() && random.nextInt(14) == 0) {
            level().addParticle(WWParticles.BLOOD_DRIP, getX() - Mth.sin(yBodyRot * Mth.DEG_TO_RAD) * -0.15, getY() + 0.08,
                    getZ() + Mth.cos(yBodyRot * Mth.DEG_TO_RAD) * -0.15, 0, 0, 0);
        } else if (isAmber() && random.nextInt(24) == 0) {
            level().addParticle(WWParticles.AMBER_GLINT, getRandomX(0.4), getY() + 0.15, getRandomZ(0.4), 0, 0.01, 0);
        }
    }

    @Override
    public void handleEntityEvent(byte id) {
        switch (id) {
            case EVENT_STAB -> stabState.start(tickCount);
            case EVENT_SPIT -> spitState.start(tickCount);
            default -> super.handleEntityEvent(id);
        }
    }

    @Override
    public boolean hurt(DamageSource source, float amount) {
        boolean hurt = super.hurt(source, amount);
        if (hurt && isDrinking()) {
            setDrinking(false);   // swatted off mid-drink
        }
        return hurt;
    }

    // --------------------------------------------------------------------------------------- interaction

    @Override
    protected InteractionResult mobInteract(Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if (stack.is(Items.GLASS_BOTTLE) && isBlood()) {
            if (!level().isClientSide) {
                player.setItemInHand(hand, ItemUtils.createFilledResult(stack, player, AmberFeature.bloodPotion(Items.POTION), false));
                playSound(SoundEvents.BOTTLE_FILL, 1.0f, 1.0f);
                gameEvent(GameEvent.FLUID_PICKUP, player);
                setState(State.EMPTY);
                calmDown(600);   // too surprised to bite you straight away
            }
            return InteractionResult.sidedSuccess(level().isClientSide);
        }
        if (stack.is(Items.POTION) && AmberFeature.isBloodPotion(stack) && (isAmber() || isEmptyBelly())) {
            if (!level().isClientSide) {
                feedBlood();
                player.setItemInHand(hand, ItemUtils.createFilledResult(stack, player, new ItemStack(Items.GLASS_BOTTLE), false));
                playSound(SoundEvents.BOTTLE_EMPTY, 1.0f, 1.0f);
                gameEvent(GameEvent.ITEM_INTERACT_FINISH, player);
            }
            return InteractionResult.sidedSuccess(level().isClientSide);
        }
        return super.mobInteract(player, hand);
    }

    @Override
    protected void dropCustomDeathLoot(ServerLevel level, DamageSource source, boolean recentlyHit) {
        super.dropCustomDeathLoot(level, source, recentlyHit);
        if (isAmber()) {
            spawnAtLocation(WWItems.AMBER_SHARD);
        }
    }

    // --------------------------------------------------------------------------------------- flight

    @Override
    public boolean isFlying() {
        return !onGround();
    }

    @Override
    public boolean causeFallDamage(float distance, float multiplier, DamageSource source) {
        return false;
    }

    @Override
    protected void checkFallDamage(double y, boolean onGround, BlockState state, BlockPos pos) {
    }

    @Override
    public float getWalkTargetValue(BlockPos pos, LevelReader level) {
        return level.getBlockState(pos).isAir() ? 10.0f : 0.0f;
    }

    // --------------------------------------------------------------------------------------- sounds

    @Override
    protected SoundEvent getAmbientSound() {
        return WWSounds.MOSQUITO_BUZZ;
    }

    @Override
    public int getAmbientSoundInterval() {
        return 50;
    }

    @Override
    protected SoundEvent getHurtSound(DamageSource source) {
        return WWSounds.MOSQUITO_HURT;
    }

    @Override
    protected SoundEvent getDeathSound() {
        return WWSounds.MOSQUITO_DEATH;
    }

    @Override
    protected float getSoundVolume() {
        return 0.6f;
    }

    @Override
    public float getVoicePitch() {
        return (isBlood() ? 0.8f : 1.0f) + (random.nextFloat() - 0.5f) * 0.2f;
    }

    @Override
    protected void playStepSound(BlockPos pos, BlockState state) {
    }

    // --------------------------------------------------------------------------------------- saving

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        tag.putString("State", state().id());
        tag.putInt("CalmTicks", calmTicks);
        if (pitcherHome != null) {
            tag.putLong("PitcherHome", pitcherHome.asLong());
        }
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        setState(State.byId(tag.getString("State")));
        calmTicks = tag.getInt("CalmTicks");
        pitcherHome = tag.contains("PitcherHome") ? BlockPos.of(tag.getLong("PitcherHome")) : null;
    }

    // --------------------------------------------------------------------------------------- goals

    /** Pitcher plants and crops, and Amberwood blooms (nectar). */
    private static boolean isPitcher(BlockState s) {
        return s.is(Blocks.PITCHER_PLANT) || s.is(Blocks.PITCHER_CROP) || s.is(WWBlocks.AMBERWOOD_BLOOM);
    }

    @Nullable
    private BlockPos findBlock(int radius, int height, java.util.function.Predicate<BlockState> test) {
        BlockPos c = blockPosition();
        BlockPos best = null;
        double bestD = Double.MAX_VALUE;
        for (BlockPos p : BlockPos.betweenClosed(c.offset(-radius, -height, -radius), c.offset(radius, height, radius))) {
            if (test.test(level().getBlockState(p))) {
                double d = p.distSqr(c);
                if (d < bestD) {
                    bestD = d;
                    best = p.immutable();
                }
            }
        }
        return best;
    }

    /** Fly at the target, stab it (2 damage) and drink: then it is full of blood. */
    class StabGoal extends Goal {
        private int repath;
        private int drinkTicks;
        @Nullable
        private LivingEntity victim;

        StabGoal() {
            setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
        }

        @Override
        public boolean canUse() {
            LivingEntity t = getTarget();
            return t != null && canHunt(t);
        }

        @Override
        public boolean canContinueToUse() {
            return (drinkTicks > 0 && isDrinking()) || canUse();
        }

        @Override
        public boolean requiresUpdateEveryTick() {
            return true;
        }

        @Override
        public void start() {
            repath = 0;
            drinkTicks = 0;
        }

        @Override
        public void stop() {
            if (drinkTicks > 0) {
                setDrinking(false);
            }
            drinkTicks = 0;
            victim = null;
            getNavigation().stop();
        }

        @Override
        public void tick() {
            if (drinkTicks > 0) {
                LivingEntity v = victim;
                if (v != null && v.isAlive()) {   // cling on while drinking
                    Vec3 at = v.position().add(0, v.getBbHeight() * 0.75, 0);
                    getMoveControl().setWantedPosition(at.x, at.y, at.z, 1.2);
                    getLookControl().setLookAt(v);
                }
                if (--drinkTicks == 0) {
                    fillWithBlood();
                }
                return;
            }
            LivingEntity t = getTarget();
            if (t == null) {
                return;
            }
            getLookControl().setLookAt(t, 30.0f, 30.0f);
            Vec3 aim = t.position().add(0, t.getBbHeight() * 0.6, 0);
            if (distanceToSqr(aim) > 9.0) {
                if (--repath <= 0) {
                    repath = 10;
                    getNavigation().moveTo(t, 1.2);
                }
            } else {
                getNavigation().stop();
                getMoveControl().setWantedPosition(aim.x, aim.y, aim.z, 1.4);
            }
            if (stabCooldown <= 0 && getBoundingBox().inflate(0.4).intersects(t.getBoundingBox())) {
                stabCooldown = 20;
                if (doHurtTarget(t)) {
                    victim = t;
                    drinkTicks = 40;
                    setDrinking(true);
                    level().broadcastEntityEvent(MosquitoEntity.this, EVENT_STAB);
                    playSound(WWSounds.MOSQUITO_STAB, 1.0f, 0.9f + random.nextFloat() * 0.2f);
                    if (level() instanceof ServerLevel sl) {
                        sl.sendParticles(WWParticles.BLOOD_DRIP, t.getX(), t.getY() + t.getBbHeight() * 0.6, t.getZ(), 5,
                                t.getBbWidth() * 0.3, 0.1, t.getBbWidth() * 0.3, 0.0);
                    }
                }
            }
        }
    }

    /** Amber mosquitoes go looking for blood stains (touching one makes them spit their amber). */
    class SeekBloodGoal extends Goal {
        @Nullable
        private BlockPos stain;
        private int cooldown, ticks;

        SeekBloodGoal() {
            setFlags(EnumSet.of(Flag.MOVE));
        }

        @Override
        public boolean canUse() {
            if (!wantsBlood() || getTarget() != null || --cooldown > 0) {
                return false;
            }
            cooldown = 40 + random.nextInt(40);
            stain = findBlock(10, 4, s -> s.is(WWBlocks.BLOOD_STAIN));
            return stain != null;
        }

        @Override
        public boolean canContinueToUse() {
            return stain != null && ticks < 300 && wantsBlood() && getTarget() == null && level().getBlockState(stain).is(WWBlocks.BLOOD_STAIN);
        }

        @Override
        public void start() {
            ticks = 0;
            getNavigation().moveTo(stain.getX() + 0.5, stain.getY() + 0.1, stain.getZ() + 0.5, 1.0);
        }

        @Override
        public void tick() {
            ticks++;
            Vec3 at = new Vec3(stain.getX() + 0.5, stain.getY() + 0.05, stain.getZ() + 0.5);
            if (distanceToSqr(at) < 4.0) {
                getMoveControl().setWantedPosition(at.x, at.y, at.z, 0.8);   // land on it (BloodStainBlock#entityInside)
            } else if (getNavigation().isDone()) {
                getNavigation().moveTo(at.x, at.y, at.z, 1.0);
            }
        }

        @Override
        public void stop() {
            stain = null;
        }
    }

    /** Empty mosquitoes drink resin from oozing Amberwood logs and become amber-full. */
    class DrinkResinGoal extends Goal {
        @Nullable
        private BlockPos log;
        private Vec3 spot = Vec3.ZERO;
        private int cooldown, ticks, drinkTicks;

        DrinkResinGoal() {
            setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
        }

        private boolean resin(BlockPos p) {
            BlockState s = level().getBlockState(p);
            return s.is(WWBlocks.AMBERWOOD_LOG) && s.getValue(AmberwoodLogBlock.RESIN);
        }

        @Override
        public boolean canUse() {
            if (!isEmptyBelly() || getTarget() != null || --cooldown > 0) {
                return false;
            }
            cooldown = 60 + random.nextInt(60);
            log = findBlock(10, 5, s -> s.is(WWBlocks.AMBERWOOD_LOG) && s.getValue(AmberwoodLogBlock.RESIN));
            if (log == null) {
                return false;
            }
            for (Direction d : Direction.Plane.HORIZONTAL.shuffledCopy(random)) {   // an open side to perch at
                if (level().getBlockState(log.relative(d)).getCollisionShape(level(), log.relative(d)).isEmpty()) {
                    spot = Vec3.atCenterOf(log.relative(d)).add(d.getStepX() * -0.18, -0.25, d.getStepZ() * -0.18);
                    return true;
                }
            }
            log = null;
            return false;
        }

        @Override
        public boolean canContinueToUse() {
            return log != null && ticks < 400 && isEmptyBelly() && getTarget() == null && resin(log);
        }

        @Override
        public boolean requiresUpdateEveryTick() {
            return true;
        }

        @Override
        public void start() {
            ticks = 0;
            drinkTicks = 0;
            getNavigation().moveTo(spot.x, spot.y, spot.z, 1.0);
        }

        @Override
        public void tick() {
            ticks++;
            getLookControl().setLookAt(Vec3.atCenterOf(log));
            if (drinkTicks > 0) {
                getMoveControl().setWantedPosition(spot.x, spot.y, spot.z, 0.5);
                if (--drinkTicks == 0) {
                    BlockState s = level().getBlockState(log);
                    level().setBlockAndUpdate(log, s.setValue(AmberwoodLogBlock.RESIN, false));
                    setDrinking(false);
                    setState(State.AMBER);
                    playSound(WWSounds.MOSQUITO_DRINK, 0.8f, 1.2f);
                    if (level() instanceof ServerLevel sl) {
                        sl.sendParticles(WWParticles.AMBER_GLINT, spot.x, spot.y + 0.2, spot.z, 6, 0.15, 0.15, 0.15, 0.01);
                    }
                    log = null;
                }
                return;
            }
            double d = distanceToSqr(spot);
            if (d < 0.25) {
                getNavigation().stop();
                drinkTicks = 40;
                setDrinking(true);
                playSound(WWSounds.MOSQUITO_DRINK, 0.6f, 1.3f);
            } else if (d < 6.0) {
                getMoveControl().setWantedPosition(spot.x, spot.y, spot.z, 0.9);
            } else if (getNavigation().isDone()) {
                getNavigation().moveTo(spot.x, spot.y, spot.z, 1.0);
            }
        }

        @Override
        public void stop() {
            if (drinkTicks > 0 || isDrinking()) {
                setDrinking(false);
            }
            drinkTicks = 0;
            log = null;
        }
    }

    /** Hang around pitcher plants, pitcher crops and Amberwood blooms; pollinating a crop grows it a stage (like bees),
     *  a bloom's nectar heals a little. */
    class PitcherGoal extends Goal {
        @Nullable
        private BlockPos flower;
        private int ticks, hover;

        PitcherGoal() {
            setFlags(EnumSet.of(Flag.MOVE));
        }

        @Override
        public boolean canUse() {
            if (getTarget() != null || isDrinking() || random.nextInt(reducedTickDelay(40)) != 0) {
                return false;
            }
            flower = findBlock(10, 4, MosquitoEntity::isPitcher);
            if (flower != null) {
                pitcherHome = flower;
                return true;
            }
            if (pitcherHome != null && !isPitcher(level().getBlockState(pitcherHome)) && pitcherHome.distSqr(blockPosition()) < 100) {
                pitcherHome = null;   // it was picked or trampled
            }
            return false;
        }

        @Override
        public boolean canContinueToUse() {
            return flower != null && ticks < 300 && getTarget() == null && isPitcher(level().getBlockState(flower));
        }

        @Override
        public void start() {
            ticks = 0;
            hover = 40 + random.nextInt(60);
            Vec3 top = top();
            getNavigation().moveTo(top.x, top.y, top.z, 0.8);
        }

        private Vec3 top() {
            BlockState s = level().getBlockState(flower);
            boolean tall = s.is(Blocks.PITCHER_PLANT) || (s.is(Blocks.PITCHER_CROP) && s.getValue(PitcherCropBlock.AGE) >= 3);
            BlockPos base = s.hasProperty(PitcherCropBlock.HALF)
                    && s.getValue(PitcherCropBlock.HALF) == net.minecraft.world.level.block.state.properties.DoubleBlockHalf.UPPER
                    ? flower.below() : flower;
            return Vec3.atBottomCenterOf(base).add(0, tall ? 2.2 : 1.2, 0);
        }

        @Override
        public void tick() {
            ticks++;
            Vec3 top = top();
            if (distanceToSqr(top) < 2.5) {
                float a = ticks * 0.15f;   // lazy circles over the plant
                getMoveControl().setWantedPosition(top.x + Mth.cos(a) * 0.5, top.y + Mth.sin(a * 0.7f) * 0.15, top.z + Mth.sin(a) * 0.5, 0.5);
                if (--hover <= 0) {
                    pollinate();
                    flower = null;
                }
            } else if (getNavigation().isDone()) {
                getNavigation().moveTo(top.x, top.y, top.z, 0.8);
            }
        }

        private void pollinate() {
            BlockState s = level().getBlockState(flower);
            if (s.is(WWBlocks.AMBERWOOD_BLOOM) && level() instanceof ServerLevel sl) {   // a sip of nectar
                heal(1.0f);
                sl.sendParticles(WWParticles.AMBER_GLINT, flower.getX() + 0.5, flower.getY() + 0.7, flower.getZ() + 0.5, 3, 0.15, 0.1, 0.15, 0.0);
                return;
            }
            if (pollinateCooldown > 0 || !(level() instanceof ServerLevel sl) || !(s.getBlock() instanceof PitcherCropBlock crop)) {
                return;
            }
            pollinateCooldown = 600 + random.nextInt(600);
            if (crop.isValidBonemealTarget(sl, flower, s)) {
                crop.performBonemeal(sl, random, flower, s);
                sl.levelEvent(2011, flower, 15);   // the bee pollination sparkle
                playSound(WWSounds.MOSQUITO_BUZZ, 0.6f, 1.4f);
            }
        }

        @Override
        public void stop() {
            flower = null;
        }
    }

    /** Bee-style hovering wander, drifting back to its pitcher plant when it strays. */
    class HoverWanderGoal extends Goal {
        HoverWanderGoal() {
            setFlags(EnumSet.of(Flag.MOVE));
        }

        @Override
        public boolean canUse() {
            return getNavigation().isDone() && random.nextInt(10) == 0;
        }

        @Override
        public boolean canContinueToUse() {
            return getNavigation().isInProgress();
        }

        @Override
        public void start() {
            Vec3 dir = pitcherHome != null && pitcherHome.distSqr(blockPosition()) > 64
                    ? Vec3.atCenterOf(pitcherHome).subtract(position()).normalize() : getViewVector(0.0f);
            Vec3 to = HoverRandomPos.getPos(MosquitoEntity.this, 8, 7, dir.x, dir.z, Mth.HALF_PI, 3, 1);
            if (to == null) {
                to = AirAndWaterRandomPos.getPos(MosquitoEntity.this, 8, 4, -2, dir.x, dir.z, Mth.HALF_PI);
            }
            if (to != null) {
                getNavigation().moveTo(getNavigation().createPath(BlockPos.containing(to), 1), 1.0);
            }
        }
    }
}
