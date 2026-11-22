package dev.lowpix.winterworks.endboss;

import dev.lowpix.winterworks.end.Petrify;
import dev.lowpix.winterworks.endmob.Obolisk;
import dev.lowpix.winterworks.net.CameraShakePayload;
import dev.lowpix.winterworks.registry.EndBlocks;
import dev.lowpix.winterworks.registry.EndItems;
import dev.lowpix.winterworks.registry.EndParticles;
import dev.lowpix.winterworks.registry.EndSounds;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.NbtUtils;
import net.minecraft.nbt.Tag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerBossEvent;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.util.Mth;
import net.minecraft.world.BossEvent;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.RelativeMovement;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.control.BodyRotationControl;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.CollisionContext;
import org.jetbrains.annotations.Nullable;
import org.joml.Vector3f;

/**
 * The Monolith (docs/END_UPDATE.md section 11): a giant obsidian slab with three eyes and two floating hands, hovering
 * over the Monolith Tower's arena. 600 health, armour 20, no knockback, fire immune, a purple boss bar.
 *
 * <p>It wakes when a player comes up into its arena (or hits it) and turns to face its target, staying where it was put.
 * <ul>
 * <li><b>Stare</b> (every few seconds, its eyes flare): while it sees its target (32 blocks) Slowness builds over 3 s;
 *     after 4 s of unbroken stare the target is petrified for 3 s ({@link Petrify#freeze}, vulnerable) and a hand comes
 *     down on them. Break line of sight (the arena's pillars) to escape.</li>
 * <li><b>Hand slam</b>: a hand rises over you, its shadow on the floor, and comes down 1 s later: radius 3, 14 damage,
 *     knockback. Below 33% both hands slam at once.</li>
 * <li><b>Grab</b> (below 66%): a hand winds back, then lunges; if it reaches you (pillars stop it) it lifts and crushes you
 *     (4 a second for 2 s), then hurls you across the arena.</li>
 * <li><b>Clap</b> (below 33%): both hands clap on the floor in front of it and a shockwave ring runs out along the floor
 *     (10 damage): jump it.</li>
 * <li><b>Summons</b> 2 Obolisks at 66% and 33% and every 45 s below 66% (at most 4 alive), via {@link Obolisk#spawnAwake}.</li>
 * </ul>
 * Phases: 100-66% stare and slams; 66-33% grabs and summons too, faster; below 33% claps and both hands, fastest.
 * Only the body takes damage (the hands are not part of it: arrows glance off them); projectiles do half. Dying it
 * crumbles for 3 s, then drops 3 Monolith Eyes, a Meteorite Core, its loot table and 500 XP.
 *
 * <p>The hands' world positions are worked out here each tick and synced (entity data, relative to the body), so
 * client.endboss.MonolithRenderer draws the hands where their hits land.
 */
public class Monolith extends Monster {
    // ---- synced
    private static final EntityDataAccessor<Vector3f> HAND_L = SynchedEntityData.defineId(Monolith.class, EntityDataSerializers.VECTOR3);
    private static final EntityDataAccessor<Vector3f> HAND_R = SynchedEntityData.defineId(Monolith.class, EntityDataSerializers.VECTOR3);
    /** Hand states: left in the low nibble, right in the high one. */
    private static final EntityDataAccessor<Byte> HANDS = SynchedEntityData.defineId(Monolith.class, EntityDataSerializers.BYTE);
    private static final EntityDataAccessor<Boolean> AWAKE = SynchedEntityData.defineId(Monolith.class, EntityDataSerializers.BOOLEAN);
    private static final EntityDataAccessor<Byte> PHASE = SynchedEntityData.defineId(Monolith.class, EntityDataSerializers.BYTE);
    /** The entity id its eyes are locked on (-1: not staring). */
    private static final EntityDataAccessor<Integer> STARE = SynchedEntityData.defineId(Monolith.class, EntityDataSerializers.INT);
    /** 0..100: how far the current unbroken stare is towards petrification. */
    private static final EntityDataAccessor<Byte> STARE_PROGRESS = SynchedEntityData.defineId(Monolith.class, EntityDataSerializers.BYTE);
    /** The clap ring's centre (relative to the body, on the floor). */
    private static final EntityDataAccessor<Vector3f> RING = SynchedEntityData.defineId(Monolith.class, EntityDataSerializers.VECTOR3);

    public static final float MAX_HEALTH = 600f, SLAM_DAMAGE = 14f, CRUSH_DAMAGE = 2f, CLAP_DAMAGE = 10f, EYE_HEIGHT = 4.45f;
    public static final double STARE_RANGE = 32, SLAM_RADIUS = 3, SLAM_HEIGHT = 5.5, AGGRO_RANGE = 22, LEASH = 40,
            RING_SPEED = 0.55, RING_MAX = 20, RING_WIDTH = 0.85, RING_JUMP = 0.6, ARENA = 11;
    /** Stare: Slowness steps up each second for 3 s, petrified at 4 s of unbroken stare, for 3 s. */
    public static final int STARE_TICKS = 120, STARE_PETRIFY = 80, PETRIFY_TICKS = 60, SLAM_TELEGRAPH = 20, SLAM_TRACK = 8,
            SLAM_FALL = 4, GRAB_WIND = 12, GRAB_REACH = 34, GRAB_HOLD = 40, CLAP_SPREAD = 16, CLAP_HIT = 4, SUMMON_TICKS = 40,
            SUMMON_RAISE = 20, SUMMON_AT = 28, SUMMON_EVERY = 900, MAX_OBOLISKS = 4, DEATH_TICKS = 60, XP = 500;
    // hand states (synced)
    public static final byte H_REST = 0, H_SLAM_AIM = 1, H_SLAM_FALL = 2, H_SLAM_DOWN = 3, H_GRAB_WIND = 4, H_GRAB_REACH = 5,
            H_GRAB_HOLD = 6, H_CLAP_SPREAD = 7, H_CLAP_HIT = 8, H_SUMMON = 9, H_RETURN = 10, H_DEAD = 11;
    public static final byte EVENT_SLAM_L = 70, EVENT_SLAM_R = 71, EVENT_GRAB = 72, EVENT_CLAP = 73, EVENT_SUMMON = 74,
            EVENT_RING = 75, EVENT_STARE = 76, EVENT_PETRIFY = 77, EVENT_CLINK = 78, EVENT_WAKE = 79;

    // ---- client animation
    public final AnimationState idleState = new AnimationState();
    public final AnimationState stareState = new AnimationState();
    public final AnimationState slamLState = new AnimationState();
    public final AnimationState slamRState = new AnimationState();
    public final AnimationState grabState = new AnimationState();
    public final AnimationState clapState = new AnimationState();
    public final AnimationState summonState = new AnimationState();
    public final AnimationState deathState = new AnimationState();
    /** Client: the hands (relative to the body) last tick and this tick, for drawing between ticks. */
    public final Vector3f handLO = new Vector3f(), handL = new Vector3f(), handRO = new Vector3f(), handR = new Vector3f();
    /** Client: when the clap ring went off (its tick count), and when the last one-shots began. */
    public int ringStart = -1000, slamLStart = -1000, slamRStart = -1000, grabStart = -1000, clapStart = -1000, summonStart = -1000;
    /** Client: each hand's state and the tick it began (for posing clips by what the hand is doing). */
    public final byte[] clientHandState = {H_REST, H_REST};
    public final int[] clientHandSince = {0, 0};
    private boolean handsSeen;

    // ---- server
    private final ServerBossEvent bossEvent = (ServerBossEvent) new ServerBossEvent(getDisplayName(), BossEvent.BossBarColor.PURPLE,
            BossEvent.BossBarOverlay.NOTCHED_6).setDarkenScreen(false);
    @Nullable
    private Vec3 home;
    private double floorY = Double.NaN;
    private final Hand left = new Hand(true), right = new Hand(false);
    @Nullable
    private LivingEntity target;
    private int lostTicks, sleepTicks, actionCooldown = 30, stareCooldown = 50, stareTicks, stareSeen, summonTimer = SUMMON_EVERY;
    private int reachedPhase = 1, ringAge = -1;
    private boolean summonQueued, nextLeft = true, provoked;
    @Nullable
    private LivingEntity staring;
    @Nullable
    private LivingEntity crushNext;
    private Vec3 ringCentre = Vec3.ZERO;
    private final Set<Integer> ringHit = new HashSet<>();
    private final List<UUID> obolisks = new ArrayList<>();
    private final Set<Integer> deflected = new HashSet<>();
    @Nullable
    private DamageSource pendingLoot;
    private boolean lootPending;
    /** Tests: how often it called Petrify.freeze and asked for an Obolisk. */
    private int petrifyCalls, summonCalls;

    /** A floating hand (server). */
    final class Hand {
        final boolean isLeft;
        Vec3 pos = Vec3.ZERO;
        byte state = H_REST;
        int t;
        Vec3 aim = Vec3.ZERO;
        @Nullable
        LivingEntity victim;

        Hand(boolean isLeft) {
            this.isLeft = isLeft;
        }

        void set(byte s) {
            state = s;
            t = 0;
        }

        boolean free() {
            return state == H_REST;
        }

        double side() {
            return isLeft ? 1 : -1;
        }
    }

    public Monolith(EntityType<? extends Monster> type, Level level) {
        super(type, level);
        this.xpReward = XP;
        setPersistenceRequired();
        setNoGravity(true);
        refreshDimensions();   // its eye height (getDefaultDimensions)
    }

    public static AttributeSupplier.Builder createAttributes() {
        return Monster.createMonsterAttributes().add(Attributes.MAX_HEALTH, MAX_HEALTH).add(Attributes.ARMOR, 20)
                .add(Attributes.KNOCKBACK_RESISTANCE, 1.0).add(Attributes.FOLLOW_RANGE, 48).add(Attributes.MOVEMENT_SPEED, 0)
                .add(Attributes.ATTACK_DAMAGE, SLAM_DAMAGE).add(Attributes.GRAVITY, 0);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        super.defineSynchedData(builder);
        builder.define(HAND_L, new Vector3f(3.3f, 3.2f, 0.8f));
        builder.define(HAND_R, new Vector3f(-3.3f, 3.2f, 0.8f));
        builder.define(HANDS, (byte) 0);
        builder.define(AWAKE, false);
        builder.define(PHASE, (byte) 1);
        builder.define(STARE, -1);
        builder.define(STARE_PROGRESS, (byte) 0);
        builder.define(RING, new Vector3f());
    }

    // ------------------------------------------------------------------------------------------------ synced views

    public boolean isAwake() {
        return entityData.get(AWAKE);
    }

    public int phase() {
        return entityData.get(PHASE);
    }

    public byte handState(boolean leftHand) {
        int b = entityData.get(HANDS) & 0xFF;
        return (byte) (leftHand ? b & 0xF : b >> 4);
    }

    /** The entity it stares at (client and server), or -1. */
    public int stareTarget() {
        return entityData.get(STARE);
    }

    public float stareProgress() {
        return (entityData.get(STARE_PROGRESS) & 0xFF) / 100f;
    }

    public Vec3 ringCentreOffset() {
        Vector3f v = entityData.get(RING);
        return new Vec3(v.x, v.y, v.z);
    }

    /** A hand's world position (server: now; client: as last synced). */
    public Vec3 handPos(boolean leftHand) {
        if (level().isClientSide) {
            Vector3f v = entityData.get(leftHand ? HAND_L : HAND_R);
            return position().add(v.x, v.y, v.z);
        }
        return (leftHand ? left : right).pos;
    }

    public int petrifyCalls() {
        return petrifyCalls;
    }

    public int summonCalls() {
        return summonCalls;
    }

    @Nullable
    public Vec3 home() {
        return home;
    }

    public double floorY() {
        return floorY;
    }

    // ------------------------------------------------------------------------------------------------ the body stays put

    @Override
    protected BodyRotationControl createBodyControl() {
        return new BodyRotationControl(this) {
            @Override
            public void clientTick() {}
        };
    }

    @Override
    public void travel(Vec3 input) {
        setDeltaMovement(Vec3.ZERO);
    }

    @Override
    public boolean isPushable() {
        return false;
    }

    @Override
    public void push(Entity entity) {}

    @Override
    public void push(double x, double y, double z) {}

    @Override
    public boolean isPushedByFluid() {
        return false;
    }

    @Override
    public void knockback(double strength, double x, double z) {}

    @Override
    public boolean causeFallDamage(float distance, float multiplier, DamageSource source) {
        return false;
    }

    @Override
    public boolean removeWhenFarAway(double distance) {
        return false;
    }

    @Override
    public boolean canBeLeashed() {
        return false;
    }

    @Override
    protected boolean canRide(Entity entity) {
        return false;
    }

    @Override
    public boolean canChangeDimensions(Level from, Level to) {
        return false;
    }

    @Override
    public boolean addEffect(MobEffectInstance effect, @Nullable Entity source) {
        return false;   // no potions, no petrification: it is the one that petrifies
    }

    private Vec3 local(double leftOff, double up, double forward) {
        float yaw = getYRot() * Mth.DEG_TO_RAD;
        double fx = -Mth.sin(yaw), fz = Mth.cos(yaw);   // forward
        double lx = Mth.cos(yaw), lz = Mth.sin(yaw);    // left
        return new Vec3(getX() + lx * leftOff + fx * forward, getY() + up, getZ() + lz * leftOff + fz * forward);
    }

    /** Where a hand floats at rest: the model's rest pose (its hand boxes' middle), raised a little when awake. */
    private Vec3 rest(Hand h) {
        double bob = Mth.sin((tickCount + (h.isLeft ? 0 : 31)) * 0.07f) * 0.18;
        return isAwake() ? local(h.side() * 2.45, 3.25 + bob, 1.15) : local(h.side() * 2.35, 2.6 + bob * 0.5, 1.0);
    }

    @Override
    protected net.minecraft.world.entity.EntityDimensions getDefaultDimensions(net.minecraft.world.entity.Pose pose) {
        return super.getDefaultDimensions(pose).withEyeHeight(EYE_HEIGHT);   // between its three eyes
    }

    private void initHome(ServerLevel sl) {
        home = position();
        floorY = findFloor(sl, home);
        left.pos = rest(left);
        right.pos = rest(right);
    }

    /** The top of the floor under `at` (up to 24 below), or `at`'s own height. */
    private double findFloor(ServerLevel sl, Vec3 at) {
        BlockPos.MutableBlockPos m = new BlockPos.MutableBlockPos();
        for (int dy = 0; dy < 24; dy++) {
            m.set(Mth.floor(at.x), Mth.floor(at.y) - dy, Mth.floor(at.z));
            BlockState st = sl.getBlockState(m);
            if (st.isFaceSturdy(sl, m, Direction.UP)) {
                return m.getY() + 1;
            }
        }
        return at.y;
    }

    // ------------------------------------------------------------------------------------------------ ticking

    @Override
    public void tick() {
        super.tick();
        if (level().isClientSide) {
            clientTick();
            return;
        }
        if (level() instanceof ServerLevel sl) {
            if (home == null) {
                initHome(sl);
            }
            if (position().distanceToSqr(home) > 1.0E-4) {
                setPos(home.x, home.y, home.z);
            }
            bossEvent.setProgress(getHealth() / getMaxHealth());
            bossEvent.setVisible(isAwake() && isAlive());
            if (tickCount % 10 == 0) {
                for (ServerPlayer p : sl.players()) {
                    boolean near = isAwake() && isAlive() && p.distanceToSqr(this) < 48 * 48;
                    if (near && !bossEvent.getPlayers().contains(p)) {
                        bossEvent.addPlayer(p);
                    } else if (!near && bossEvent.getPlayers().contains(p)) {
                        bossEvent.removePlayer(p);
                    }
                }
            }
            syncHands();
        }
    }

    @Override
    protected void customServerAiStep() {
        if (!(level() instanceof ServerLevel sl) || home == null) {
            return;
        }
        updateTarget(sl);
        if (!isAwake()) {
            tickHand(sl, left);
            tickHand(sl, right);
            if (target != null && (provoked || hasLineOfSight(target))) {   // you come up into its arena (or hit it)
                provoked = false;
                wake(sl);
            }
            return;
        }
        if (target == null) {
            if (++sleepTicks > 300 && left.victim == null && right.victim == null) {
                sleep();
            }
        } else {
            sleepTicks = 0;
            face(target.position());
        }
        updatePhase();
        tickStare(sl);
        tickHand(sl, left);
        tickHand(sl, right);
        tickRing(sl);
        deflectProjectiles(sl);
        chooseAction(sl);
    }

    static boolean valid(@Nullable LivingEntity e) {
        return e != null && e.isAlive() && !e.isRemoved() && !e.isSpectator() && e.canBeSeenAsEnemy() && !(e instanceof Monolith)
                && !(e instanceof Obolisk);
    }

    private void updateTarget(ServerLevel sl) {
        if (target != null && (!valid(target) || target.level() != level() || target.distanceToSqr(home) > LEASH * LEASH)) {
            target = null;
        }
        if (target != null) {
            lostTicks = hasLineOfSight(target) ? 0 : lostTicks + 1;
        }
        if (target == null || lostTicks > 100 || tickCount % 40 == 0) {
            Player best = null;
            double bd = Double.MAX_VALUE;
            for (ServerPlayer p : sl.players()) {
                if (!valid(p)) {
                    continue;
                }
                double dx = p.getX() - home.x, dz = p.getZ() - home.z, dy = p.getY() - home.y;
                double h = dx * dx + dz * dz;
                boolean near = h < AGGRO_RANGE * AGGRO_RANGE && Math.abs(dy) < 16;
                if (!near && !(isAwake() && h < LEASH * LEASH)) {
                    continue;
                }
                double score = h + (hasLineOfSight(p) ? 0 : 400);
                if (score < bd) {
                    bd = score;
                    best = p;
                }
            }
            if (best != null && (target == null || lostTicks > 100 || best != target && bd + 64 < target.distanceToSqr(home))) {
                target = best;
                lostTicks = 0;
            }
        }
    }

    @Nullable
    public LivingEntity target() {
        return target;
    }

    /** Tests and the screenshot harness: no stares, attacks or summons of its own for `ticks` (forced ones still run). */
    public void holdActions(int ticks) {
        actionCooldown = ticks;
        stareCooldown = ticks;
        summonTimer = Math.max(summonTimer, ticks);
    }

    /** Wakes it with a target (tests and the screenshot harness: no wait for a player to walk up). */
    public void wakeFor(LivingEntity t) {
        target = t;
        if (level() instanceof ServerLevel sl) {
            if (home == null) {
                initHome(sl);
            }
            if (!isAwake()) {
                wake(sl);
            }
        }
    }

    private void wake(ServerLevel sl) {
        entityData.set(AWAKE, true);
        level().broadcastEntityEvent(this, EVENT_WAKE);
        sl.playSound(null, getX(), getY() + 4, getZ(), EndSounds.MONOLITH_STARE, SoundSource.HOSTILE, 4f, 0.6f);
        actionCooldown = 40;
        stareCooldown = 60;
        shake(sl, position(), 32, 0.8f, 20);
    }

    private void sleep() {
        entityData.set(AWAKE, false);
        endStare();
        sleepTicks = 0;
        ringAge = -1;
    }

    private void face(Vec3 at) {
        double dx = at.x - getX(), dz = at.z - getZ();
        if (dx * dx + dz * dz < 0.01) {
            return;
        }
        float want = (float) (Mth.atan2(dz, dx) * Mth.RAD_TO_DEG) - 90f;
        float yaw = getYRot() + Mth.clamp(Mth.wrapDegrees(want - getYRot()), -4f, 4f);
        setYRot(yaw);
        yBodyRot = yaw;
        yHeadRot = yaw;
        setXRot(0);
    }

    private void updatePhase() {
        float f = getHealth() / getMaxHealth();
        int p = f > 0.66f ? 1 : f > 0.33f ? 2 : 3;
        if (p > reachedPhase) {
            reachedPhase = p;
            summonQueued = true;
            summonTimer = SUMMON_EVERY;
        }
        if (phase() != reachedPhase) {
            entityData.set(PHASE, (byte) reachedPhase);
        }
    }

    private double speed() {
        return switch (reachedPhase) {
            case 1 -> 1.0;
            case 2 -> 1.2;
            default -> 1.45;
        };
    }

    // ------------------------------------------------------------------------------------------------ the stare

    private void tickStare(ServerLevel sl) {
        if (stareTicks > 0) {
            stareTicks--;
            LivingEntity t = staring;
            if (valid(t) && t.distanceToSqr(this) < STARE_RANGE * STARE_RANGE && hasLineOfSight(t)) {
                stareSeen++;
                int amp = Math.min(3, stareSeen / 20);   // Slowness I..IV, a step each second
                if (stareSeen % 5 == 1 || stareSeen % 20 == 0) {
                    t.addEffect(new MobEffectInstance(MobEffects.MOVEMENT_SLOWDOWN, 30, amp, false, true, true), this);
                }
                if (stareSeen >= STARE_PETRIFY) {
                    petrify(sl, t);
                    endStare();
                    return;
                }
            } else {
                stareSeen = 0;   // broke line of sight: it starts over
            }
            entityData.set(STARE_PROGRESS, (byte) Mth.clamp(stareSeen * 100 / STARE_PETRIFY, 0, 100));
            if (stareTicks == 0) {
                endStare();
            }
            return;
        }
        if (--stareCooldown > 0 || !valid(target) || target.distanceToSqr(this) > STARE_RANGE * STARE_RANGE || !hasLineOfSight(target)) {
            return;
        }
        startStare(target);
    }

    /** Its eyes lock on `t` (tests and the harness can force it). */
    public void startStare(LivingEntity t) {
        staring = t;
        stareTicks = STARE_TICKS;
        stareSeen = 0;
        entityData.set(STARE, t.getId());
        entityData.set(STARE_PROGRESS, (byte) 0);
        level().broadcastEntityEvent(this, EVENT_STARE);
        level().playSound(null, getX(), getY() + 5, getZ(), EndSounds.MONOLITH_STARE, SoundSource.HOSTILE, 3f, 1f);
    }

    private void endStare() {
        stareTicks = 0;
        stareSeen = 0;
        staring = null;
        entityData.set(STARE, -1);
        entityData.set(STARE_PROGRESS, (byte) 0);
        stareCooldown = switch (reachedPhase) {
            case 1 -> 150;
            case 2 -> 120;
            default -> 90;
        };
    }

    private void petrify(ServerLevel sl, LivingEntity t) {
        petrifyCalls++;
        Petrify.freeze(t, PETRIFY_TICKS, false);
        level().broadcastEntityEvent(this, EVENT_PETRIFY);
        sl.playSound(null, t.getX(), t.getY(), t.getZ(), EndSounds.MONOLITH_STARE, SoundSource.HOSTILE, 3f, 0.5f);
        crushNext = t;   // a hand comes down on the statue
        actionCooldown = Math.min(actionCooldown, 4);
    }

    // ------------------------------------------------------------------------------------------------ actions

    private void chooseAction(ServerLevel sl) {
        if (reachedPhase >= 2 && summonTimer > 0) {
            summonTimer--;
        }
        // crossing 66% / 33% it summons at once (as soon as both hands are free); below 66% every 45 s too
        if (summonQueued || reachedPhase >= 2 && summonTimer <= 0 && actionCooldown <= 0) {
            if (left.free() && right.free()) {
                summonQueued = false;
                summonTimer = SUMMON_EVERY;
                startSummon(sl);
                actionCooldown = Math.max(actionCooldown, SUMMON_TICKS + 10);
            }
            return;
        }
        if (--actionCooldown > 0) {
            return;
        }
        if (crushNext != null) {
            LivingEntity v = crushNext;
            Hand h = left.free() ? left : right.free() ? right : null;
            if (h != null) {
                crushNext = null;
                if (valid(v)) {
                    startSlam(h, v, null);
                    actionCooldown = 10;
                }
            }
            return;
        }
        if (!valid(target) || target.distanceToSqr(this) > STARE_RANGE * STARE_RANGE) {
            return;
        }
        if (reachedPhase == 1 && stareTicks > 0) {
            return;   // first phase: it stares or it slams, not both at once
        }
        double dist = Math.sqrt(target.distanceToSqr(home));
        boolean onFloor = !Double.isNaN(floorY) && Math.abs(target.getY() - floorY) < 1.5;
        int roll = random.nextInt(100);
        int cool = switch (reachedPhase) {
            case 1 -> 34;
            case 2 -> 24;
            default -> 16;
        };
        if (reachedPhase >= 3 && left.free() && right.free()) {
            if (roll < 25 && onFloor && dist < 15) {
                startClap(sl);
                actionCooldown = cool + CLAP_SPREAD + 10;
                return;
            }
            if (roll < 60) {
                startSlam(left, target, null);
                startSlam(right, target, predict(target));
                actionCooldown = cool + SLAM_TELEGRAPH;
                return;
            }
        }
        if (reachedPhase >= 2 && roll >= 60 && dist < 18 && right.free()) {   // it grabs with its right hand
            startGrab(right, target);
            actionCooldown = cool + GRAB_WIND;
            return;
        }
        Hand h = nextLeft ? (left.free() ? left : right.free() ? right : null) : (right.free() ? right : left.free() ? left : null);
        if (h != null) {
            nextLeft = !h.isLeft;
            startSlam(h, target, null);
            actionCooldown = cool + (reachedPhase == 1 ? SLAM_TELEGRAPH : 0);
        }
    }

    /** Where `t` is heading (the second hand of a double slam waits there). */
    private Vec3 predict(LivingEntity t) {
        Vec3 v = t.getDeltaMovement();
        Vec3 dir = new Vec3(v.x, 0, v.z);
        if (dir.lengthSqr() < 1.0E-3) {
            double a = random.nextDouble() * Math.PI * 2;
            dir = new Vec3(Math.cos(a), 0, Math.sin(a));
        }
        Vec3 p = t.position().add(dir.normalize().scale(4.5));
        return clampToArena(new Vec3(p.x, floorY(t), p.z));
    }

    private Vec3 clampToArena(Vec3 p) {
        Vec3 d = new Vec3(p.x - home.x, 0, p.z - home.z);
        if (d.length() > ARENA) {
            d = d.normalize().scale(ARENA);
        }
        return new Vec3(home.x + d.x, p.y, home.z + d.z);
    }

    /** The floor under an entity (where a slam lands). */
    private double floorY(LivingEntity t) {
        if (t.onGround()) {
            return t.getY();
        }
        if (level() instanceof ServerLevel sl) {
            return findFloor(sl, t.position());
        }
        return t.getY();
    }

    /** A hand rises over `victim` (or `at`, if given) and comes down {@link #SLAM_TELEGRAPH} ticks later. */
    public void startSlam(boolean leftHand, LivingEntity victim, @Nullable Vec3 at) {
        startSlam(leftHand ? left : right, victim, at);
    }

    private void startSlam(Hand h, LivingEntity victim, @Nullable Vec3 at) {
        releaseVictim(h, null);
        h.set(H_SLAM_AIM);
        h.victim = at == null ? victim : null;
        h.aim = at != null ? at : new Vec3(victim.getX(), floorY(victim), victim.getZ());
        level().broadcastEntityEvent(this, h.isLeft ? EVENT_SLAM_L : EVENT_SLAM_R);
    }

    public void startGrab(boolean leftHand, LivingEntity victim) {
        startGrab(leftHand ? left : right, victim);
    }

    private void startGrab(Hand h, LivingEntity victim) {
        h.set(H_GRAB_WIND);
        h.victim = victim;
        level().broadcastEntityEvent(this, EVENT_GRAB);
        level().playSound(null, h.pos.x, h.pos.y, h.pos.z, EndSounds.MONOLITH_GRAB, SoundSource.HOSTILE, 2.5f, 1f);
    }

    public void startClap(ServerLevel sl) {
        releaseVictim(left, null);
        releaseVictim(right, null);
        left.set(H_CLAP_SPREAD);
        right.set(H_CLAP_SPREAD);
        Vec3 c = clapPoint(0);
        ringCentre = new Vec3(c.x, floorY, c.z);
        entityData.set(RING, new Vector3f((float) (ringCentre.x - getX()), (float) (ringCentre.y - getY()), (float) (ringCentre.z - getZ())));
        level().broadcastEntityEvent(this, EVENT_CLAP);
    }

    /** The clap: the palms meet just above the floor, a little under 3 blocks in front (the `clap` clip). */
    private Vec3 clapPoint(double side) {
        Vec3 p = local(side, 0, 2.9);
        return new Vec3(p.x, floorY + 0.75, p.z);
    }

    public void startSummon(ServerLevel sl) {
        left.set(H_SUMMON);
        right.set(H_SUMMON);
        level().broadcastEntityEvent(this, EVENT_SUMMON);
        sl.playSound(null, getX(), getY() + 4, getZ(), EndSounds.MONOLITH_SUMMON, SoundSource.HOSTILE, 4f, 1f);
    }

    private static void moveTo(Hand h, Vec3 goal, double speed) {
        Vec3 d = goal.subtract(h.pos);
        double len = d.length();
        h.pos = len <= speed ? goal : h.pos.add(d.scale(speed / len));
    }

    private void tickHand(ServerLevel sl, Hand h) {
        h.t++;
        double sp = speed();
        switch (h.state) {
            case H_REST -> moveTo(h, rest(h), 0.5);
            case H_RETURN -> {
                Vec3 r = rest(h);
                moveTo(h, r, 0.8 * sp);
                if (h.pos.distanceToSqr(r) < 0.09 || h.t > 60) {
                    h.set(H_REST);
                }
            }
            case H_SLAM_AIM -> {
                if (h.t <= SLAM_TRACK && valid(h.victim)) {   // it follows you for 0.4 s, then its aim is set
                    h.aim = new Vec3(h.victim.getX(), floorY(h.victim), h.victim.getZ());
                }
                moveTo(h, h.aim.add(0, SLAM_HEIGHT, 0), 1.7 * sp);
                if (h.t >= SLAM_TELEGRAPH - SLAM_FALL) {
                    h.set(H_SLAM_FALL);
                }
            }
            case H_SLAM_FALL -> {
                float k = Math.min(1f, h.t / (float) SLAM_FALL);
                Vec3 over = h.aim.add(0, SLAM_HEIGHT, 0);
                Vec3 p = new Vec3(Mth.lerp(k, h.pos.x, h.aim.x), over.y - SLAM_HEIGHT * k * k + 0.45 * k, Mth.lerp(k, h.pos.z, h.aim.z));
                h.pos = p;
                if (h.t >= SLAM_FALL) {
                    h.pos = h.aim.add(0, 0.45, 0);
                    slamImpact(sl, h);
                    h.set(H_SLAM_DOWN);
                }
            }
            case H_SLAM_DOWN -> {
                if (h.t >= (int) (18 / sp)) {
                    h.set(H_RETURN);
                }
            }
            case H_GRAB_WIND -> {
                moveTo(h, rest(h).add(0, 1.2, 0).add(local(0, 0, -0.8).subtract(position())), 0.5);
                if (h.t >= GRAB_WIND) {
                    h.set(H_GRAB_REACH);
                }
            }
            case H_GRAB_REACH -> {
                LivingEntity v = h.victim;
                if (!valid(v) || h.t > GRAB_REACH) {
                    h.victim = null;
                    h.set(H_RETURN);
                    break;
                }
                Vec3 goal = v.getBoundingBox().getCenter();
                Vec3 d = goal.subtract(h.pos);
                double step = Math.min(d.length(), 0.95 * sp);
                Vec3 next = h.pos.add(d.normalize().scale(step));
                if (sl.clip(new ClipContext(h.pos, next, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, CollisionContext.empty()))
                        .getType() != HitResult.Type.MISS) {
                    clink(sl, h.pos);   // it hits a pillar: you are safe behind one
                    h.victim = null;
                    h.set(H_RETURN);
                    break;
                }
                h.pos = next;
                if (h.pos.distanceTo(goal) < 1.5) {
                    h.set(H_GRAB_HOLD);
                    sl.playSound(null, h.pos.x, h.pos.y, h.pos.z, EndSounds.MONOLITH_GRAB, SoundSource.HOSTILE, 3f, 0.7f);
                }
            }
            case H_GRAB_HOLD -> {
                LivingEntity v = h.victim;
                if (!valid(v)) {
                    h.victim = null;
                    h.set(H_RETURN);
                    break;
                }
                moveTo(h, local(h.side() * 0.3, 3.8, 1.9), 0.45);   // up before its eyes (the end of the `grab` clip)
                holdVictim(v, h.pos.add(0, -v.getBbHeight() * 0.5, 0));
                if (h.t % 10 == 0) {
                    v.invulnerableTime = 0;
                    v.hurt(damageSources().mobAttack(this), CRUSH_DAMAGE);
                    sl.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.OBSIDIAN.defaultBlockState()), h.pos.x, h.pos.y,
                            h.pos.z, 8, 0.4, 0.4, 0.4, 0.1);
                    sl.playSound(null, h.pos.x, h.pos.y, h.pos.z, SoundEvents.DEEPSLATE_BREAK, SoundSource.HOSTILE, 1.5f, 0.6f);
                }
                if (h.t >= GRAB_HOLD) {
                    hurl(sl, h);
                    h.set(H_RETURN);
                }
            }
            case H_CLAP_SPREAD -> {
                moveTo(h, clapPoint(h.side() * 3.9), 1.3 * sp);
                if (h.t >= CLAP_SPREAD) {
                    h.set(H_CLAP_HIT);
                }
            }
            case H_CLAP_HIT -> {
                moveTo(h, clapPoint(h.side() * 0.6), 1.9);
                if (h.isLeft && h.t == CLAP_HIT) {
                    clapImpact(sl);
                }
                if (h.t >= CLAP_HIT + 12) {
                    h.set(H_RETURN);
                }
            }
            case H_SUMMON -> {   // both hands rise, then strike the floor either side (the `summon` clip): the Obolisks come up
                if (h.t < SUMMON_RAISE) {
                    moveTo(h, local(h.side() * 3.0, 6.9, 0.9), 0.45);
                } else if (h.t <= SUMMON_AT) {
                    Vec3 p = local(h.side() * 2.1, 0, 2.45);
                    moveTo(h, new Vec3(p.x, floorY + 0.55, p.z), 1.1);
                }
                if (h.t == SUMMON_AT) {
                    Vec3 p = h.pos;
                    sl.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.OBSIDIAN.defaultBlockState()), p.x, floorY + 0.1, p.z,
                            30, 0.8, 0.1, 0.8, 0.2);
                    if (h.isLeft) {
                        summonObolisks(sl);
                        shake(sl, position(), 32, 1.2f, 16);
                    }
                }
                if (h.t >= SUMMON_TICKS) {
                    h.set(H_RETURN);
                }
            }
            case H_DEAD -> {
                double fy = Double.isNaN(floorY) ? getY() : floorY;
                h.pos = new Vec3(h.pos.x, Math.max(fy + 0.4, h.pos.y - 0.05 * h.t), h.pos.z);
            }
            default -> h.set(H_REST);
        }
    }

    private void slamImpact(ServerLevel sl, Hand h) {
        Vec3 c = h.aim;
        AABB box = new AABB(c, c).inflate(SLAM_RADIUS + 1.5, 3, SLAM_RADIUS + 1.5);
        for (LivingEntity e : sl.getEntitiesOfClass(LivingEntity.class, box, e -> e != this && e.isAlive() && !(e instanceof Obolisk))) {
            double dx = e.getX() - c.x, dz = e.getZ() - c.z;
            double hd = Math.sqrt(dx * dx + dz * dz) - e.getBbWidth() * 0.5;
            if (hd > SLAM_RADIUS || e.getY() > c.y + 2.6 || e.getY() + e.getBbHeight() < c.y - 1) {
                continue;
            }
            e.invulnerableTime = 0;
            if (e.hurt(damageSources().mobAttack(this), SLAM_DAMAGE)) {
                Vec3 away = new Vec3(dx, 0, dz);
                away = away.lengthSqr() < 1.0E-3 ? new Vec3(1, 0, 0) : away.normalize();
                e.setDeltaMovement(e.getDeltaMovement().add(away.x * 0.9, 0.45, away.z * 0.9));
                e.hurtMarked = true;
            }
        }
        BlockPos under = BlockPos.containing(c.x, c.y - 0.5, c.z);
        BlockState ground = sl.getBlockState(under);
        if (ground.isAir()) {
            ground = Blocks.OBSIDIAN.defaultBlockState();
        }
        sl.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, ground), c.x, c.y + 0.1, c.z, 70, SLAM_RADIUS * 0.6, 0.1,
                SLAM_RADIUS * 0.6, 0.25);
        for (int i = 0; i < 16; i++) {   // a ring of dust at its reach
            double a = Math.PI * 2 * i / 16;
            sl.sendParticles(ParticleTypes.POOF, c.x + Math.cos(a) * SLAM_RADIUS, c.y + 0.1, c.z + Math.sin(a) * SLAM_RADIUS, 1, 0, 0.02, 0, 0.02);
        }
        sl.sendParticles(EndParticles.ECLIPSE_MOTE, c.x, c.y + 0.5, c.z, 12, 1.5, 0.3, 1.5, 0.08);
        sl.playSound(null, c.x, c.y, c.z, EndSounds.MONOLITH_SLAM, SoundSource.HOSTILE, 4f, 0.9f + random.nextFloat() * 0.2f);
        shake(sl, c, 24, 1.6f, 14);
    }

    private void holdVictim(LivingEntity v, Vec3 at) {
        v.resetFallDistance();
        v.setDeltaMovement(Vec3.ZERO);
        if (v instanceof ServerPlayer sp) {
            sp.connection.teleport(at.x, at.y, at.z, 0f, 0f, EnumSet.of(RelativeMovement.X_ROT, RelativeMovement.Y_ROT));
        } else {
            v.teleportTo(at.x, at.y, at.z);
        }
    }

    /** Throws the crushed one across the arena: away from the body, landing well inside the arena's edge. */
    private void hurl(ServerLevel sl, Hand h) {
        LivingEntity v = h.victim;
        h.victim = null;
        if (v == null || !v.isAlive()) {
            return;
        }
        Vec3 away = new Vec3(v.getX() - home.x, 0, v.getZ() - home.z);
        if (away.lengthSqr() < 0.5) {
            away = local(0, 0, 1).subtract(position());
        }
        away = away.normalize();
        Vec3 land = clampToArena(home.add(away.scale(ARENA - 2.5)));
        Vec3 d = new Vec3(land.x - v.getX(), 0, land.z - v.getZ());
        double hs = Mth.clamp(d.length() / 9.0, 0.25, 1.0);
        Vec3 dir = d.lengthSqr() < 1.0E-3 ? away : d.normalize();
        releaseVictim(h, new Vec3(dir.x * hs, 0.45, dir.z * hs));
        sl.playSound(null, v.getX(), v.getY(), v.getZ(), EndSounds.MONOLITH_GRAB, SoundSource.HOSTILE, 2f, 1.4f);
    }

    private void releaseVictim(Hand h, @Nullable Vec3 velocity) {
        LivingEntity v = h.victim;
        boolean held = h.state == H_GRAB_HOLD;
        h.victim = null;
        if (v != null && held && v.isAlive()) {
            v.setDeltaMovement(velocity != null ? velocity : new Vec3(0, 0.1, 0));
            v.hurtMarked = true;
            v.hasImpulse = true;
            v.resetFallDistance();
        }
    }

    private void clapImpact(ServerLevel sl) {
        ringAge = 0;
        ringHit.clear();
        level().broadcastEntityEvent(this, EVENT_RING);
        Vec3 c = ringCentre;
        sl.playSound(null, c.x, c.y, c.z, EndSounds.MONOLITH_CLAP, SoundSource.HOSTILE, 5f, 1f);
        sl.sendParticles(ParticleTypes.FLASH, c.x, c.y + 0.8, c.z, 1, 0, 0, 0, 0);
        sl.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.OBSIDIAN.defaultBlockState()), c.x, c.y + 1, c.z, 40, 0.6,
                0.4, 0.6, 0.3);
        shake(sl, c, 32, 2.2f, 18);
    }

    /** The clap's shockwave runs out along the floor; whoever is on the floor where it passes is hit (jump it). */
    private void tickRing(ServerLevel sl) {
        if (ringAge < 0) {
            return;
        }
        ringAge++;
        double r = 0.8 + RING_SPEED * ringAge;
        if (r > RING_MAX) {
            ringAge = -1;
            return;
        }
        Vec3 c = ringCentre;
        AABB box = new AABB(c.x - r - 1, c.y - 1, c.z - r - 1, c.x + r + 1, c.y + 3, c.z + r + 1);
        for (LivingEntity e : sl.getEntitiesOfClass(LivingEntity.class, box, e -> e != this && e.isAlive() && !(e instanceof Obolisk))) {
            if (ringHit.contains(e.getId())) {
                continue;
            }
            double dx = e.getX() - c.x, dz = e.getZ() - c.z;
            double d = Math.sqrt(dx * dx + dz * dz);
            if (Math.abs(d - r) > RING_WIDTH + e.getBbWidth() * 0.5 || e.getY() - c.y > RING_JUMP || e.getY() < c.y - 1) {
                continue;
            }
            ringHit.add(e.getId());
            e.invulnerableTime = 0;
            if (e.hurt(damageSources().mobAttack(this), CLAP_DAMAGE)) {
                Vec3 away = d < 1.0E-3 ? new Vec3(1, 0, 0) : new Vec3(dx / d, 0, dz / d);
                e.setDeltaMovement(e.getDeltaMovement().add(away.x * 0.6, 0.35, away.z * 0.6));
                e.hurtMarked = true;
            }
        }
        if (ringAge % 2 == 0) {
            int n = (int) (r * 3);
            for (int i = 0; i < n; i++) {
                double a = Math.PI * 2 * i / n;
                if (random.nextInt(3) == 0) {
                    sl.sendParticles(ParticleTypes.CLOUD, c.x + Math.cos(a) * r, c.y + 0.1, c.z + Math.sin(a) * r, 1, 0, 0.02, 0, 0.01);
                }
            }
        }
    }

    public boolean ringActive() {
        return ringAge >= 0;
    }

    private void summonObolisks(ServerLevel sl) {
        obolisks.removeIf(id -> {
            Entity e = sl.getEntity(id);
            return e == null || !e.isAlive();
        });
        int n = Math.min(2, MAX_OBOLISKS - obolisks.size());
        for (int i = 0; i < n; i++) {
            BlockPos at = summonSpot(sl);
            if (at == null) {
                continue;
            }
            summonCalls++;
            sl.sendParticles(ParticleTypes.REVERSE_PORTAL, at.getX() + 0.5, at.getY() + 1, at.getZ() + 0.5, 50, 0.7, 1.4, 0.7, 0.1);
            sl.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.CRYING_OBSIDIAN.defaultBlockState()), at.getX() + 0.5,
                    at.getY() + 0.2, at.getZ() + 0.5, 30, 0.8, 0.1, 0.8, 0.2);
            Obolisk o = Obolisk.spawnAwake(sl, at, valid(target) ? target : null);
            if (o != null) {
                obolisks.add(o.getUUID());
            }
        }
    }

    /** A clear spot on the arena floor 6-10 blocks out. */
    @Nullable
    private BlockPos summonSpot(ServerLevel sl) {
        for (int i = 0; i < 16; i++) {
            double a = random.nextDouble() * Math.PI * 2, dist = 6 + random.nextDouble() * 4;
            double x = home.x + Math.cos(a) * dist, z = home.z + Math.sin(a) * dist;
            BlockPos at = BlockPos.containing(x, floorY, z);
            AABB room = new AABB(at.getX() - 0.4, at.getY(), at.getZ() - 0.4, at.getX() + 1.4, at.getY() + 3.7, at.getZ() + 1.4);
            if (sl.getBlockState(at.below()).isFaceSturdy(sl, at.below(), Direction.UP) && sl.noCollision(room)) {
                return at;
            }
        }
        return null;
    }

    /** Arrows and other projectiles glance off the hands: only the body can be hurt. */
    private void deflectProjectiles(ServerLevel sl) {
        for (Hand h : new Hand[]{left, right}) {
            AABB hand = new AABB(h.pos, h.pos).inflate(1.1);
            for (Projectile p : sl.getEntitiesOfClass(Projectile.class, hand.inflate(5), Entity::isAlive)) {
                if (deflected.contains(p.getId())) {
                    continue;
                }
                Vec3 from = p.position(), to = from.add(p.getDeltaMovement());
                if (!hand.contains(from) && hand.clip(from, to).isEmpty()) {
                    continue;
                }
                deflected.add(p.getId());
                Vec3 v = p.getDeltaMovement();
                p.setDeltaMovement(v.scale(-0.3).add((random.nextDouble() - 0.5) * 0.3, 0.25, (random.nextDouble() - 0.5) * 0.3));
                p.hurtMarked = true;
                clink(sl, p.position());
            }
        }
        if (tickCount % 100 == 0) {
            deflected.clear();
        }
    }

    private void clink(ServerLevel sl, Vec3 at) {
        level().broadcastEntityEvent(this, EVENT_CLINK);
        sl.playSound(null, at.x, at.y, at.z, SoundEvents.SHIELD_BLOCK, SoundSource.HOSTILE, 1.2f, 0.55f);
        sl.sendParticles(ParticleTypes.CRIT, at.x, at.y, at.z, 8, 0.2, 0.2, 0.2, 0.2);
    }

    private void syncHands() {
        Vector3f l = new Vector3f((float) (left.pos.x - getX()), (float) (left.pos.y - getY()), (float) (left.pos.z - getZ()));
        Vector3f r = new Vector3f((float) (right.pos.x - getX()), (float) (right.pos.y - getY()), (float) (right.pos.z - getZ()));
        if (!l.equals(entityData.get(HAND_L), 1.0E-3f)) {
            entityData.set(HAND_L, l);
        }
        if (!r.equals(entityData.get(HAND_R), 1.0E-3f)) {
            entityData.set(HAND_R, r);
        }
        byte b = (byte) ((left.state & 0xF) | (right.state & 0xF) << 4);
        if (entityData.get(HANDS) != b) {
            entityData.set(HANDS, b);
        }
    }

    static void shake(ServerLevel sl, Vec3 at, double radius, float strength, int ticks) {
        for (ServerPlayer p : sl.players()) {
            double d = p.position().distanceTo(at);
            if (d < radius && ServerPlayNetworking.canSend(p, CameraShakePayload.TYPE)) {
                ServerPlayNetworking.send(p, new CameraShakePayload(strength * (float) (1 - d / radius * 0.7), ticks));
            }
        }
    }

    // ------------------------------------------------------------------------------------------------ damage

    @Override
    public boolean hurt(DamageSource source, float amount) {
        if (isInvulnerableTo(source)) {
            return false;
        }
        if (source.is(DamageTypeTags.IS_PROJECTILE)) {
            amount *= 0.5f;
        }
        if (!level().isClientSide && source.getEntity() instanceof LivingEntity attacker && valid(attacker) && !isAwake()) {
            target = attacker;   // hit while it slept
            provoked = true;
        }
        return super.hurt(source, amount);
    }

    @Override
    public boolean isInvulnerableTo(DamageSource source) {
        return source.is(DamageTypeTags.IS_FALL) || source.is(DamageTypeTags.IS_DROWNING) || source.is(DamageTypeTags.IS_FIRE)
                || source.is(net.minecraft.world.damagesource.DamageTypes.IN_WALL) || source.is(net.minecraft.world.damagesource.DamageTypes.CRAMMING)
                || super.isInvulnerableTo(source);
    }

    // ------------------------------------------------------------------------------------------------ death

    @Override
    public void die(DamageSource source) {
        releaseVictim(left, null);
        releaseVictim(right, null);
        left.set(H_DEAD);
        right.set(H_DEAD);
        syncHands();
        endStare();
        ringAge = -1;
        super.die(source);
    }

    @Override
    protected void tickDeath() {
        deathTime++;
        if (!(level() instanceof ServerLevel sl)) {
            return;
        }
        tickHand(sl, left);
        tickHand(sl, right);
        syncHands();
        if (deathTime == 1) {
            bossEvent.setProgress(0f);
            shake(sl, position(), 40, 1.2f, DEATH_TICKS);
        }
        if (deathTime % 3 == 0 && deathTime < DEATH_TICKS) {   // it crumbles
            double y = getY() + getBbHeight() * (1 - deathTime / (float) DEATH_TICKS);
            sl.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.OBSIDIAN.defaultBlockState()), getX(), y, getZ(), 24,
                    getBbWidth() * 0.4, 0.6, getBbWidth() * 0.3, 0.2);
            sl.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.CRYING_OBSIDIAN.defaultBlockState()), getX(), y, getZ(), 6,
                    getBbWidth() * 0.3, 0.4, getBbWidth() * 0.3, 0.1);
            sl.sendParticles(EndParticles.ECLIPSE_MOTE, getX(), y, getZ(), 4, 1.2, 0.8, 1.2, 0.05);
            sl.playSound(null, getX(), y, getZ(), SoundEvents.DEEPSLATE_BREAK, SoundSource.HOSTILE, 2f, 0.5f + deathTime / 120f);
        }
        if (deathTime >= DEATH_TICKS && !isRemoved()) {
            Vec3 c = position().add(0, 1.5, 0);
            sl.sendParticles(ParticleTypes.EXPLOSION_EMITTER, c.x, c.y, c.z, 1, 0, 0, 0, 0);
            sl.sendParticles(ParticleTypes.REVERSE_PORTAL, c.x, c.y + 1, c.z, 120, 1.5, 2, 1.5, 0.2);
            sl.playSound(null, c.x, c.y, c.z, SoundEvents.GENERIC_EXPLODE.value(), SoundSource.HOSTILE, 3f, 0.6f);
            shake(sl, c, 40, 3f, 30);
            if (lootPending) {
                lootPending = false;
                dropAllDeathLoot(sl, pendingLoot != null ? pendingLoot : damageSources().generic());
                pendingLoot = null;
            }
            level().broadcastEntityEvent(this, (byte) 60);
            remove(RemovalReason.KILLED);
        }
    }

    /** The loot waits for the end of the crumble. */
    @Override
    protected void dropAllDeathLoot(ServerLevel level, DamageSource source) {
        if (deathTime < DEATH_TICKS) {
            pendingLoot = source;
            lootPending = true;
            return;
        }
        super.dropAllDeathLoot(level, source);
    }

    @Override
    protected void dropCustomDeathLoot(ServerLevel level, DamageSource source, boolean recentlyHit) {
        super.dropCustomDeathLoot(level, source, recentlyHit);
        ItemStack eyes = new ItemStack(EndItems.MONOLITH_EYE, 3);
        spawnAtLocation(eyes, 1.5f);
        spawnAtLocation(new ItemStack(EndBlocks.METEORITE_CORE), 1.0f);
    }

    @Override
    public void remove(RemovalReason reason) {
        releaseVictim(left, null);
        releaseVictim(right, null);
        super.remove(reason);
        bossEvent.removeAllPlayers();
    }

    @Override
    public void stopSeenByPlayer(ServerPlayer player) {
        super.stopSeenByPlayer(player);
        bossEvent.removePlayer(player);
    }

    @Override
    public void setCustomName(@Nullable Component name) {
        super.setCustomName(name);
        bossEvent.setName(getDisplayName());
    }

    // ------------------------------------------------------------------------------------------------ sounds

    @Nullable
    @Override
    protected SoundEvent getAmbientSound() {
        return isAwake() ? EndSounds.MONOLITH_AMBIENT : null;
    }

    @Override
    public int getAmbientSoundInterval() {
        return 160;
    }

    @Override
    protected SoundEvent getHurtSound(DamageSource source) {
        return EndSounds.MONOLITH_HURT;
    }

    @Override
    protected SoundEvent getDeathSound() {
        return EndSounds.MONOLITH_DEATH;
    }

    @Override
    protected float getSoundVolume() {
        return 3f;
    }

    // ------------------------------------------------------------------------------------------------ client

    private void clientTick() {
        handLO.set(handL);
        handRO.set(handR);
        handL.set(entityData.get(HAND_L));
        handR.set(entityData.get(HAND_R));
        if (!handsSeen) {
            handsSeen = true;
            handLO.set(handL);
            handRO.set(handR);
        }
        for (int i = 0; i < 2; i++) {
            byte s = handState(i == 0);
            if (s != clientHandState[i]) {
                clientHandState[i] = s;
                clientHandSince[i] = tickCount;
            }
        }
        boolean dying = isDeadOrDying();
        idleState.animateWhen(!dying, tickCount);
        stareState.animateWhen(!dying && stareTarget() >= 0, tickCount);
        deathState.animateWhen(dying, tickCount);
        stopAfter(slamLState, slamLStart, 28);   // the clips' lengths at the speeds client.endboss.MonolithRenderer plays them
        stopAfter(slamRState, slamRStart, 28);
        stopAfter(grabState, grabStart, 20);
        stopAfter(clapState, clapStart, 40);
        stopAfter(summonState, summonStart, 40);
        if (isAwake() && random.nextInt(4) == 0) {   // motes drift off its runes
            level().addParticle(EndParticles.ECLIPSE_MOTE, getRandomX(0.6), getY() + 1 + random.nextDouble() * 5.5, getRandomZ(0.6),
                    0, 0.02, 0);
        }
        if (stareTarget() >= 0 && tickCount % 2 == 0) {   // the gaze: motes stream from the eyes towards you
            Entity t = level().getEntity(stareTarget());
            if (t != null) {
                Vec3 eye = getEyePosition();
                Vec3 d = t.getEyePosition().subtract(eye).normalize().scale(0.6);
                level().addParticle(EndParticles.ECLIPSE_MOTE, eye.x, eye.y, eye.z, d.x, d.y, d.z);
            }
        }
    }

    private void stopAfter(AnimationState s, int start, int ticks) {
        if (s.isStarted() && (tickCount - start > ticks || isDeadOrDying())) {
            s.stop();
        }
    }

    @Override
    public void handleEntityEvent(byte id) {
        switch (id) {
            case EVENT_SLAM_L -> {
                slamLState.start(tickCount);
                slamLStart = tickCount;
            }
            case EVENT_SLAM_R -> {
                slamRState.start(tickCount);
                slamRStart = tickCount;
            }
            case EVENT_GRAB -> {
                grabState.start(tickCount);
                grabStart = tickCount;
            }
            case EVENT_CLAP -> {
                clapState.start(tickCount);
                clapStart = tickCount;
            }
            case EVENT_SUMMON -> {
                summonState.start(tickCount);
                summonStart = tickCount;
            }
            case EVENT_RING -> ringStart = tickCount;
            case EVENT_STARE, EVENT_PETRIFY, EVENT_WAKE -> {
                Vec3 eye = getEyePosition();
                for (int i = 0; i < 16; i++) {
                    level().addParticle(EndParticles.ECLIPSE_MOTE, eye.x + (random.nextDouble() - 0.5) * 2, eye.y + (random.nextDouble() - 0.5),
                            eye.z + (random.nextDouble() - 0.5) * 2, 0, 0.05, 0);
                }
            }
            case EVENT_CLINK -> {}
            default -> super.handleEntityEvent(id);
        }
    }

    // ------------------------------------------------------------------------------------------------ saving

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        if (home != null) {
            tag.putDouble("HomeX", home.x);
            tag.putDouble("HomeY", home.y);
            tag.putDouble("HomeZ", home.z);
            tag.putDouble("FloorY", floorY);
        }
        tag.putBoolean("Awake", isAwake());
        tag.putInt("Phase", reachedPhase);
        tag.putInt("SummonTimer", summonTimer);
        ListTag ids = new ListTag();
        for (UUID id : obolisks) {
            ids.add(NbtUtils.createUUID(id));
        }
        tag.put("Obolisks", ids);
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        if (tag.contains("HomeX")) {
            home = new Vec3(tag.getDouble("HomeX"), tag.getDouble("HomeY"), tag.getDouble("HomeZ"));
            floorY = tag.getDouble("FloorY");
            left.pos = home.add(3, 2, 0);
            right.pos = home.add(-3, 2, 0);
        }
        entityData.set(AWAKE, tag.getBoolean("Awake"));
        reachedPhase = Math.max(1, tag.getInt("Phase"));
        entityData.set(PHASE, (byte) reachedPhase);
        if (tag.contains("SummonTimer")) {
            summonTimer = tag.getInt("SummonTimer");
        }
        obolisks.clear();
        for (Tag id : tag.getList("Obolisks", Tag.TAG_INT_ARRAY)) {
            obolisks.add(NbtUtils.loadUUID(id));
        }
        bossEvent.setName(getDisplayName());
    }
}
