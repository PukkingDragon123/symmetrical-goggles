package dev.lowpix.winterworks.nether;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.registry.WWSounds;
import dev.lowpix.winterworks.soulbull.SoulBull;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerBossEvent;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.BossEvent;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
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
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.monster.AbstractSkeleton;
import net.minecraft.world.entity.monster.Blaze;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.monster.WitherSkeleton;
import net.minecraft.world.entity.monster.piglin.AbstractPiglin;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.ServerLevelAccessor;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;
import org.joml.Vector3f;

/**
 * The Withered Commander (docs/FIXES_0_4.md "The Withered Commander"): the mini-boss of vanilla Nether fortresses,
 * one per fortress (mixin.FortressCommanderMixin, {@link #spawnInFortress}), a towering wither-skeleton officer in
 * blackened netherite with a netherite spear, riding an unarmoured Soul Bull. A wither skeleton at heart (it counts as
 * one for piglins and its bull), with its own fight:
 * <ul>
 * <li>{@link #MOVE_LUNGE} (0.8 s): a spear thrust that reaches {@link #LUNGE_REACH} blocks (more from the saddle) with
 * heavy knockback and Wither II; on foot it springs forward with it;</li>
 * <li>{@link #MOVE_SPIN} (1.2 s): a 360-degree sweep of the spear round it, hitting everything close and throwing it
 * back;</li>
 * <li>{@link #MOVE_WAR_CRY} (1.5 s): rallies the wither skeletons and blazes nearby (Strength I, and its foe is their
 * foe);</li>
 * <li>on its bull it sets the bull on its foe and has it charge (SoulBull#startRam);</li>
 * <li>when the bull dies it fights on on foot, faster and harder hitting.</li>
 * </ul>
 * 150 health, armour 12, a boss bar. Drops (its loot table) 1-3 Ancient Debris, its spear sometimes, Wither Bones,
 * and 150 XP. Moves are synced ({@link #move()}) for the lowpix clips (client.nether.WitheredCommanderRenderer); the
 * death clip plays out in full (1.5 s).
 */
public class WitheredCommander extends WitherSkeleton {
    public static final byte MOVE_NONE = 0, MOVE_LUNGE = 1, MOVE_SPIN = 2, MOVE_WAR_CRY = 3;
    /** Clip lengths in ticks, and where in each the blow lands. */
    public static final int LUNGE_TICKS = 16, LUNGE_HIT = 8, SPIN_TICKS = 24, WAR_CRY_TICKS = 30, WAR_CRY_AT = 12, DEATH_TICKS = 30;
    public static final double LUNGE_REACH = 3.7, SPIN_REACH = 3.4, MOUNTED_BONUS = 0.9;
    public static final double MAX_HEALTH = 150, ARMOR = 12;
    /** Its own blow; the spear in its hand adds its +9 (a jab 12, the lunge 15.6, the sweep 10.2; +3 on foot). */
    public static final double BASE_DAMAGE = 3;
    public static final int XP = 150, WAR_CRY_COOLDOWN = 400, WAR_CRY_RADIUS = 16;
    private static final EntityDataAccessor<Byte> DATA_MOVE = SynchedEntityData.defineId(WitheredCommander.class, EntityDataSerializers.BYTE);
    private static final EntityDataAccessor<Boolean> DATA_ON_FOOT = SynchedEntityData.defineId(WitheredCommander.class,
            EntityDataSerializers.BOOLEAN);
    private static final ResourceLocation ON_FOOT_SPEED = Winterworks.id("withered_commander_on_foot_speed");
    private static final ResourceLocation ON_FOOT_DAMAGE = Winterworks.id("withered_commander_on_foot_damage");
    private static final DustParticleOptions EMBER = new DustParticleOptions(new Vector3f(1.0f, 0.45f, 0.1f), 1.0f);

    public final AnimationState idleState = new AnimationState();
    public final AnimationState lungeState = new AnimationState();
    public final AnimationState spinState = new AnimationState();
    public final AnimationState warCryState = new AnimationState();
    public final AnimationState deathState = new AnimationState();

    private final ServerBossEvent bossEvent = (ServerBossEvent) new ServerBossEvent(getDisplayName(), BossEvent.BossBarColor.RED,
            BossEvent.BossBarOverlay.NOTCHED_10).setDarkenScreen(false);
    private int moveTicks, moveCooldown, jabCooldown, chargeCooldown;
    private long warCryReady;
    private boolean hadBull;
    private final Set<UUID> hitThisMove = new HashSet<>();
    private Vec3 lungeDir = Vec3.ZERO;

    public WitheredCommander(EntityType<? extends WitherSkeleton> type, Level level) {
        super(type, level);
        xpReward = XP;
        setDropChance(EquipmentSlot.MAINHAND, 0f);   // the loot table drops the spear (sometimes)
    }

    public static AttributeSupplier.Builder createAttributes() {
        return Monster.createMonsterAttributes()
                .add(Attributes.MAX_HEALTH, MAX_HEALTH)
                .add(Attributes.ARMOR, ARMOR)
                .add(Attributes.ARMOR_TOUGHNESS, 4)
                .add(Attributes.ATTACK_DAMAGE, BASE_DAMAGE)
                .add(Attributes.ATTACK_KNOCKBACK, 1.0)
                .add(Attributes.MOVEMENT_SPEED, 0.25)
                .add(Attributes.FOLLOW_RANGE, 32)
                .add(Attributes.KNOCKBACK_RESISTANCE, 0.7)
                .add(Attributes.STEP_HEIGHT, 1.0);
    }

    static void init() {}

    /**
     * Puts a commander on an unarmoured Soul Bull at `at` (the middle of a fortress's first bridge crossing) during
     * world generation; both persistent.
     */
    public static void spawnInFortress(WorldGenLevel level, BlockPos at, RandomSource random) {
        float yaw = random.nextInt(4) * 90f;
        SoulBull bull = SoulBull.createPenBull(level, at.getX() + 0.5, at.getY(), at.getZ() + 0.5, yaw, false);
        WitheredCommander c = WWEntities.WITHERED_COMMANDER.create(level.getLevel());
        if (c == null) {
            return;
        }
        c.moveTo(at.getX() + 0.5, at.getY(), at.getZ() + 0.5, yaw, 0f);
        c.finalizeSpawn(level, level.getCurrentDifficultyAt(at), MobSpawnType.STRUCTURE, null);
        c.setPersistenceRequired();
        c.startRiding(bull, true);
        c.hadBull = true;
        level.addFreshEntityWithPassengers(bull);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        super.defineSynchedData(builder);
        builder.define(DATA_MOVE, MOVE_NONE);
        builder.define(DATA_ON_FOOT, false);
    }

    @Override
    protected void registerGoals() {
        goalSelector.addGoal(0, new FloatGoal(this));
        goalSelector.addGoal(2, new FightGoal());
        goalSelector.addGoal(5, new WaterAvoidingRandomStrollGoal(this, 0.8));
        goalSelector.addGoal(6, new LookAtPlayerGoal(this, Player.class, 10f));
        goalSelector.addGoal(6, new RandomLookAroundGoal(this));
        targetSelector.addGoal(1, new HurtByTargetGoal(this, WitherSkeleton.class, Blaze.class));
        targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(this, Player.class, true));
        targetSelector.addGoal(3, new NearestAttackableTargetGoal<>(this, AbstractPiglin.class, true));
    }

    /** It fights with its spear its own way (FightGoal), never with a skeleton's bow or sword goals. */
    @Override
    public void reassessWeaponGoal() {}

    @Override
    protected void populateDefaultEquipmentSlots(RandomSource random, DifficultyInstance difficulty) {
        setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(WWItems.NETHERITE_SPEAR));
    }

    @Nullable
    @Override
    public SpawnGroupData finalizeSpawn(ServerLevelAccessor level, DifficultyInstance difficulty, MobSpawnType type,
                                        @Nullable SpawnGroupData data) {
        SpawnGroupData out = super.finalizeSpawn(level, difficulty, type, data);
        AttributeInstance dmg = getAttribute(Attributes.ATTACK_DAMAGE);
        if (dmg != null) {
            dmg.setBaseValue(BASE_DAMAGE);   // a wither skeleton's finalizeSpawn sets 4
        }
        setItemSlot(EquipmentSlot.HEAD, ItemStack.EMPTY);   // no Halloween pumpkin over the crested helm
        setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(WWItems.NETHERITE_SPEAR));
        setCanPickUpLoot(false);
        if (type != MobSpawnType.STRUCTURE && type != MobSpawnType.JOCKEY && !isPassenger() && level instanceof ServerLevel sl) {
            SoulBull bull = SoulBull.createPenBull(sl, getX(), getY(), getZ(), getYRot(), false);   // a spawn egg, a command: its bull too
            sl.addFreshEntity(bull);
            startRiding(bull, true);
            hadBull = true;
        }
        return out;
    }

    // ------------------------------------------------------------------------------------------------ state

    public byte move() {
        return entityData.get(DATA_MOVE);
    }

    /** Fighting on foot: its bull is dead (faster, angrier). */
    public boolean isOnFoot() {
        return entityData.get(DATA_ON_FOOT);
    }

    @Nullable
    public SoulBull bull() {
        return getVehicle() instanceof SoulBull b && b.isAlive() ? b : null;
    }

    public ServerBossEvent bossEvent() {
        return bossEvent;
    }

    private void setMove(byte m) {
        entityData.set(DATA_MOVE, m);
        moveTicks = 0;
        hitThisMove.clear();
    }

    /** Its bull has fallen: it fights on, on foot, faster and harder. */
    public void goOnFoot() {
        if (isOnFoot()) {
            return;
        }
        entityData.set(DATA_ON_FOOT, true);
        hadBull = false;
        AttributeInstance speed = getAttribute(Attributes.MOVEMENT_SPEED), dmg = getAttribute(Attributes.ATTACK_DAMAGE);
        if (speed != null && !speed.hasModifier(ON_FOOT_SPEED)) {
            speed.addPermanentModifier(new AttributeModifier(ON_FOOT_SPEED, 0.4, AttributeModifier.Operation.ADD_MULTIPLIED_BASE));
        }
        if (dmg != null && !dmg.hasModifier(ON_FOOT_DAMAGE)) {
            dmg.addPermanentModifier(new AttributeModifier(ON_FOOT_DAMAGE, 3, AttributeModifier.Operation.ADD_VALUE));
        }
        if (!level().isClientSide && move() == MOVE_NONE) {
            startWarCry();   // a roar over its fallen bull
        }
    }

    // ------------------------------------------------------------------------------------------------ the fight

    private double reach(double base) {
        return base + (isPassenger() ? MOUNTED_BONUS : 0);
    }

    /** Its spear reaches further than a skeleton's sword. */
    @Override
    protected AABB getAttackBoundingBox() {
        return super.getAttackBoundingBox().inflate(1.2, 0, 1.2);
    }

    public void startLunge(LivingEntity t) {
        lungeDir = t.position().subtract(position()).multiply(1, 0, 1).normalize();
        setMove(MOVE_LUNGE);
        moveCooldown = 30;
        playSound(WWSounds.WITHERED_COMMANDER_LUNGE, 1.4f, 0.9f + random.nextFloat() * 0.2f);
    }

    public void startSpin() {
        setMove(MOVE_SPIN);
        moveCooldown = 50;
        playSound(WWSounds.WITHERED_COMMANDER_SPIN, 1.5f, 0.9f + random.nextFloat() * 0.15f);
    }

    public void startWarCry() {
        setMove(MOVE_WAR_CRY);
        moveCooldown = 40;
        warCryReady = level().getGameTime() + WAR_CRY_COOLDOWN;
        playSound(WWSounds.WITHERED_COMMANDER_WAR_CRY, 2.5f, 0.85f);
    }

    private void tickMove() {
        byte m = move();
        if (m == MOVE_NONE || !(level() instanceof ServerLevel sl)) {
            return;
        }
        moveTicks++;
        switch (m) {
            case MOVE_LUNGE -> {
                if (!isPassenger() && moveTicks >= LUNGE_HIT - 3 && moveTicks <= LUNGE_HIT && onGround()) {
                    setDeltaMovement(lungeDir.x * 0.75, getDeltaMovement().y, lungeDir.z * 0.75);   // on foot: it springs in
                }
                if (moveTicks == LUNGE_HIT) {
                    lungeHit(sl);
                }
                if (moveTicks >= LUNGE_TICKS) {
                    setMove(MOVE_NONE);
                }
            }
            case MOVE_SPIN -> {
                if (moveTicks >= 8 && moveTicks <= 18) {
                    spinHit(sl, (moveTicks - 8) / 10f);
                }
                if (moveTicks >= SPIN_TICKS) {
                    setMove(MOVE_NONE);
                }
            }
            case MOVE_WAR_CRY -> {
                if (moveTicks == WAR_CRY_AT) {
                    warCry(sl);
                }
                if (moveTicks >= WAR_CRY_TICKS) {
                    setMove(MOVE_NONE);
                }
            }
            default -> setMove(MOVE_NONE);
        }
    }

    private boolean foe(LivingEntity e) {
        return e != this && e.isAlive() && e != getVehicle() && !(e instanceof WitherSkeleton) && !(e instanceof Blaze)
                && !(e instanceof SoulBull) && e.attackable() && EntitySelector.NO_CREATIVE_OR_SPECTATOR.test(e);
    }

    /** The thrust: what stands in a narrow line out to its reach takes a heavy blow, is thrown back and withers. */
    private void lungeHit(ServerLevel sl) {
        LivingEntity t = getTarget();
        Vec3 dir = t != null ? t.getEyePosition().subtract(getEyePosition()).normalize() : Vec3.directionFromRotation(getXRot(), getYRot());
        Vec3 from = position().add(0, isPassenger() ? 0.8 : 1.4, 0);
        double reach = reach(LUNGE_REACH) + getBbWidth() * 0.5;
        Vec3 to = from.add(dir.scale(reach));
        AABB box = new AABB(from, to).inflate(1.0);
        for (LivingEntity e : sl.getEntitiesOfClass(LivingEntity.class, box, this::foe)) {
            if (onLine(e.getBoundingBox().inflate(0.45), from, to)) {
                if (hitThisMove.add(e.getUUID())) {
                    float dmg = (float) getAttributeValue(Attributes.ATTACK_DAMAGE) * 1.3f;
                    if (e.hurt(damageSources().mobAttack(this), dmg)) {
                        e.addEffect(new MobEffectInstance(MobEffects.WITHER, 160, 1), this);
                        e.knockback(1.6, -dir.x, -dir.z);
                        e.hurtMarked = true;
                    }
                }
            }
        }
        for (int i = 1; i <= 8; i++) {
            Vec3 p = from.lerp(to, i / 8.0);
            sl.sendParticles(ParticleTypes.CRIT, p.x, p.y, p.z, 1, 0.05, 0.05, 0.05, 0.0);
        }
        sl.sendParticles(ParticleTypes.SMOKE, to.x, to.y, to.z, 6, 0.2, 0.2, 0.2, 0.02);
        playSound(SoundEvents.TRIDENT_THROW.value(), 1.2f, 0.6f);
    }

    /** Does the line from `from` to `to` pass through `box` (it may start inside it: the foe right up against it)? */
    private static boolean onLine(AABB box, Vec3 from, Vec3 to) {
        for (int i = 0; i <= 16; i++) {
            if (box.contains(from.lerp(to, i / 16.0))) {
                return true;
            }
        }
        return false;
    }

    /** The sweep: round it the spear goes, catching everything in reach once and throwing it out. */
    private void spinHit(ServerLevel sl, float t) {
        double reach = reach(SPIN_REACH) + getBbWidth() * 0.5;
        double a = (getYRot() * Mth.DEG_TO_RAD) + t * Mth.TWO_PI;
        Vec3 c = position().add(0, isPassenger() ? 0.9 : 1.2, 0);
        for (int i = 0; i < 3; i++) {
            double r = reach * (0.5 + 0.25 * i);
            sl.sendParticles(ParticleTypes.SWEEP_ATTACK, c.x - Math.sin(a) * r, c.y, c.z + Math.cos(a) * r, 1, 0, 0, 0, 0);
        }
        sl.sendParticles(EMBER, c.x - Math.sin(a) * reach, c.y, c.z + Math.cos(a) * reach, 2, 0.1, 0.1, 0.1, 0);
        AABB box = getBoundingBox().inflate(reach, 1.0, reach);
        for (LivingEntity e : sl.getEntitiesOfClass(LivingEntity.class, box, this::foe)) {
            if (e.distanceToSqr(getX(), e.getY(), getZ()) > reach * reach || !hitThisMove.add(e.getUUID())) {
                continue;
            }
            float dmg = (float) getAttributeValue(Attributes.ATTACK_DAMAGE) * 0.85f;
            if (e.hurt(damageSources().mobAttack(this), dmg)) {
                e.addEffect(new MobEffectInstance(MobEffects.WITHER, 100, 0), this);
                Vec3 out = e.position().subtract(position()).multiply(1, 0, 1).normalize();
                e.knockback(1.1, -out.x, -out.z);
                e.hurtMarked = true;
            }
        }
    }

    /** The war cry: the wither skeletons and blazes round it take heart (Strength I) and turn on its foe. */
    private void warCry(ServerLevel sl) {
        LivingEntity t = getTarget();
        AABB box = getBoundingBox().inflate(WAR_CRY_RADIUS, 8, WAR_CRY_RADIUS);
        List<Mob> allies = sl.getEntitiesOfClass(Mob.class, box, m -> m != this && m.isAlive()
                && (m instanceof WitherSkeleton || m instanceof Blaze));
        for (Mob m : allies) {
            m.addEffect(new MobEffectInstance(MobEffects.DAMAGE_BOOST, 400, 0), this);
            if (t != null && t.isAlive() && m.getTarget() == null) {
                m.setTarget(t);
            }
            sl.sendParticles(ParticleTypes.ANGRY_VILLAGER, m.getX(), m.getY() + m.getBbHeight() + 0.3, m.getZ(), 2, 0.2, 0.1, 0.2, 0);
        }
        addEffect(new MobEffectInstance(MobEffects.DAMAGE_BOOST, 200, 0), this);
        sl.sendParticles(EMBER, getX(), getY() + getBbHeight() * 0.8, getZ(), 40, 0.8, 0.6, 0.8, 0.02);
        sl.sendParticles(ParticleTypes.SOUL, getX(), getY() + getBbHeight() * 0.7, getZ(), 16, 1.2, 0.5, 1.2, 0.04);
    }

    /** Mounted: its bull goes for its foe, and charges at it. */
    private void driveBull(SoulBull bull, @Nullable LivingEntity t) {
        if (t == null || !t.isAlive()) {
            return;
        }
        if (bull.getTarget() != t) {
            bull.setTarget(t);
        }
        double d = bull.distanceTo(t);
        if (--chargeCooldown <= 0 && d > 4 && d < 12 && bull.ramCooldown() == 0 && bull.mode() == SoulBull.MODE_NONE
                && bull.getSensing().hasLineOfSight(t) && Math.abs(t.getY() - bull.getY()) < 2.5) {
            chargeCooldown = 50 + random.nextInt(30);
            if (bull.startRam(1f, t.position().subtract(bull.position()))) {
                playSound(WWSounds.WITHERED_COMMANDER_AMBIENT, 1.5f, 0.7f);   // a bark: charge!
            }
        }
    }

    @Override
    public void aiStep() {
        super.aiStep();
        if (level().isClientSide) {
            return;
        }
        if (getVehicle() instanceof SoulBull dead && !dead.isAlive()) {
            stopRiding();   // its bull has fallen under it
        }
        SoulBull bull = bull();
        if (bull != null) {
            hadBull = true;
            driveBull(bull, getTarget());
        } else if (hadBull && !isOnFoot()) {
            goOnFoot();   // thrown from a dead bull (or it fell off one): on foot from now on
        }
        if (moveCooldown > 0) {
            moveCooldown--;
        }
        if (jabCooldown > 0) {
            jabCooldown--;
        }
        tickMove();
        tickBossBar();
    }

    @Override
    public void tick() {
        super.tick();
        if (level().isClientSide) {
            idleState.startIfStopped(tickCount);
            if (random.nextInt(6) == 0 && !isDeadOrDying()) {   // embers drift off its armour
                level().addParticle(EMBER, getRandomX(0.6), getY() + getBbHeight() * (0.3 + random.nextDouble() * 0.6), getRandomZ(0.6),
                        0, 0.02, 0);
            }
        }
    }

    private void tickBossBar() {
        bossEvent.setProgress(getHealth() / getMaxHealth());
        if (tickCount % 10 != 0 || !(level() instanceof ServerLevel sl)) {
            return;
        }
        boolean engaged = getTarget() instanceof Player || getLastHurtByMob() instanceof Player;
        for (ServerPlayer p : sl.players()) {
            boolean show = engaged && p.distanceToSqr(this) < 40 * 40 || p.distanceToSqr(this) < 16 * 16 && hasLineOfSight(p);
            if (show && !bossEvent.getPlayers().contains(p)) {
                bossEvent.addPlayer(p);
            } else if (!show && bossEvent.getPlayers().contains(p)) {
                bossEvent.removePlayer(p);
            }
        }
    }

    @Override
    public void stopSeenByPlayer(ServerPlayer player) {
        super.stopSeenByPlayer(player);
        bossEvent.removePlayer(player);
    }

    @Override
    public void remove(RemovalReason reason) {
        bossEvent.removeAllPlayers();
        super.remove(reason);
    }

    @Override
    public void die(DamageSource source) {
        super.die(source);
        bossEvent.removeAllPlayers();
        if (!level().isClientSide) {
            setMove(MOVE_NONE);
            level().broadcastEntityEvent(this, (byte) 74);
        }
    }

    /** The death clip is 1.5 s: it stays (lying down) until that has played. */
    @Override
    protected void tickDeath() {
        deathTime++;
        if (deathTime >= DEATH_TICKS && !level().isClientSide() && !isRemoved()) {
            level().broadcastEntityEvent(this, (byte) 60);
            remove(RemovalReason.KILLED);
        }
    }

    @Override
    public void handleEntityEvent(byte id) {
        if (id == 74) {
            deathState.start(tickCount);
        } else {
            super.handleEntityEvent(id);
        }
    }

    @Override
    public void onSyncedDataUpdated(EntityDataAccessor<?> key) {
        super.onSyncedDataUpdated(key);
        if (DATA_MOVE.equals(key) && level().isClientSide) {
            lungeState.stop();
            spinState.stop();
            warCryState.stop();
            switch (move()) {
                case MOVE_LUNGE -> lungeState.start(tickCount);
                case MOVE_SPIN -> spinState.start(tickCount);
                case MOVE_WAR_CRY -> warCryState.start(tickCount);
                default -> { }
            }
        }
    }

    @Override
    public boolean doHurtTarget(Entity target) {
        boolean hit = super.doHurtTarget(target);   // a wither skeleton's blow: Wither I
        if (hit) {
            swing(InteractionHand.MAIN_HAND);
        }
        return hit;
    }

    @Override
    protected int getBaseExperienceReward() {
        return XP;
    }

    @Override
    public boolean removeWhenFarAway(double distance) {
        return false;
    }

    @Override
    public boolean canChangeDimensions(Level from, Level to) {
        return false;
    }

    @Override
    public void setCustomName(@Nullable Component name) {
        super.setCustomName(name);
        bossEvent.setName(getDisplayName());
    }

    // ------------------------------------------------------------------------------------------------ sounds

    @Override
    protected SoundEvent getAmbientSound() {
        return WWSounds.WITHERED_COMMANDER_AMBIENT;
    }

    @Override
    protected SoundEvent getHurtSound(DamageSource source) {
        return WWSounds.WITHERED_COMMANDER_HURT;
    }

    @Override
    protected SoundEvent getDeathSound() {
        return WWSounds.WITHERED_COMMANDER_DEATH;
    }

    @Override
    protected void playStepSound(BlockPos pos, BlockState state) {
        playSound(SoundEvents.WITHER_SKELETON_STEP, 0.4f, 0.7f);
        playSound(SoundEvents.ARMOR_EQUIP_NETHERITE.value(), 0.15f, 0.6f + random.nextFloat() * 0.2f);
    }

    @Override
    public float getVoicePitch() {
        return 0.75f + (random.nextFloat() - random.nextFloat()) * 0.08f;
    }

    // ------------------------------------------------------------------------------------------------ saving

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        tag.putBoolean("OnFoot", isOnFoot());
        tag.putBoolean("HadBull", hadBull);
        tag.putLong("WarCryReady", warCryReady);
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        entityData.set(DATA_ON_FOOT, tag.getBoolean("OnFoot"));
        hadBull = tag.getBoolean("HadBull");
        warCryReady = tag.getLong("WarCryReady");
        if (hasCustomName()) {
            bossEvent.setName(getDisplayName());
        }
    }

    // ------------------------------------------------------------------------------------------------ the goal

    /**
     * Its fight: on foot it closes in at a run; mounted, its bull carries it (driveBull). In reach it picks a move:
     * a war cry now and then when it has company, the spin when it is crowded (or by chance), the lunge from out at
     * spear's length, and a quick jab in between.
     */
    private class FightGoal extends Goal {
        private int repath;

        FightGoal() {
            setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
        }

        @Override
        public boolean canUse() {
            LivingEntity t = getTarget();
            return t != null && t.isAlive();
        }

        @Override
        public boolean requiresUpdateEveryTick() {
            return true;
        }

        @Override
        public void start() {
            setAggressive(true);
        }

        @Override
        public void stop() {
            setAggressive(false);
            getNavigation().stop();
        }

        @Override
        public void tick() {
            LivingEntity t = getTarget();
            if (t == null) {
                return;
            }
            getLookControl().setLookAt(t, 30f, 30f);
            double d = distanceTo(t);
            if (move() != MOVE_NONE) {
                if (!isPassenger() && move() != MOVE_LUNGE) {
                    getNavigation().stop();
                }
                return;
            }
            if (!isPassenger() && --repath <= 0) {
                repath = 5;
                if (d > 2.2) {
                    getNavigation().moveTo(t, 1.25);
                } else {
                    getNavigation().stop();
                }
            }
            if (moveCooldown > 0) {
                if (jabCooldown <= 0 && isWithinMeleeAttackRange(t) && getSensing().hasLineOfSight(t)) {
                    jabCooldown = 22;
                    doHurtTarget(t);
                }
                return;
            }
            long now = level().getGameTime();
            boolean company = !level().getEntitiesOfClass(Mob.class, getBoundingBox().inflate(WAR_CRY_RADIUS, 8, WAR_CRY_RADIUS),
                    m -> m != WitheredCommander.this && m.isAlive() && (m instanceof WitherSkeleton || m instanceof Blaze)).isEmpty();
            int crowd = level().getEntitiesOfClass(LivingEntity.class, getBoundingBox().inflate(reach(SPIN_REACH)),
                    WitheredCommander.this::foe).size();
            boolean sees = getSensing().hasLineOfSight(t);
            if (now >= warCryReady && company && d < 20) {
                startWarCry();
            } else if (d < reach(SPIN_REACH) + 0.5 && (crowd >= 2 || random.nextInt(4) == 0)) {
                startSpin();
            } else if (d < reach(LUNGE_REACH) + 0.8 && sees) {
                startLunge(t);
            } else if (jabCooldown <= 0 && isWithinMeleeAttackRange(t) && sees) {
                jabCooldown = 22;
                doHurtTarget(t);
            }
        }
    }
}
