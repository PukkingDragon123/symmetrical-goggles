package dev.lowpix.winterworks.boss;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEffects;
import dev.lowpix.winterworks.registry.WWParticles;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.Iterator;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Holder;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerBossEvent;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.BossEvent;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
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
import net.minecraft.world.entity.animal.IronGolem;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.ExplosionDamageCalculator;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.ServerLevelAccessor;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * The Frost Mauler (docs/COLD_UPDATE.md section 7): a huge frozen sabre-toothed beast.
 *
 * <p>It sleeps <b>dormant</b> in the ancient ice of its frozen tomb (no AI, invulnerable, no gravity, frozen pose)
 * until 6 of the tomb's ancient-ice blocks are broken: the cave rumbles and shakes, the ice cracks for 3 s, it all
 * bursts, the Mauler drops, gets up and roars. Awake (400 health), it fights with telegraphed attacks:
 * <ul>
 * <li><b>Combo</b>: claw, claw, bite... it opens at a frantic pace and slows hit by hit as it tires (like the Fang
 *     Daggers' frenzy: {@link #fatigue()}). Spent, it must <b>recharge</b>: it stands panting, dazed and wide open
 *     (1.5x damage) for 5 s, 2.75 s when enraged. A raised shield blocks claws and bites, and every swing still tires it.</li>
 * <li><b>Roar</b>: knockback in 8 blocks, Slowness II, shatters ice and snow around it and brings icicles down.</li>
 * <li><b>Icicle rain</b> (every ~12 s, more often below 50% health): it rears and slams the ground (or roars) and a
 *     volley of icicles drops on and around you. Each one is telegraphed 1 s ahead: frost sifts down from where it
 *     will fall and the ground under it cracks and rings with frost.</li>
 * <li><b>Hurl</b>: at range it rips an icicle from the ceiling (or forms one in its jaws) and throws it at you.</li>
 * <li><b>Fury</b>: a crouching snarl, then it charges and bounds at you and bites in a flurry (5 each, through
 *     invulnerability frames; a raised shield blocks each bite) that tires it out: it recharges after. Dodge the
 *     charge into a wall and it is winded at once.</li>
 * </ul>
 * Below 35% health it is enraged: faster, roaring twice as often, recovering faster, its eye flames flaring. Freezing
 * can't hurt it, fire hurts 1.5x. On death it thrashes for 2 s and bursts in a frost explosion that throws everything
 * back (no block damage), then drops its loot.
 */
public class FrostMaulerEntity extends Monster {
    private static final EntityDataAccessor<Boolean> DORMANT = SynchedEntityData.defineId(FrostMaulerEntity.class, EntityDataSerializers.BOOLEAN);
    private static final EntityDataAccessor<Byte> MODE = SynchedEntityData.defineId(FrostMaulerEntity.class, EntityDataSerializers.BYTE);
    private static final EntityDataAccessor<Boolean> ENRAGED = SynchedEntityData.defineId(FrostMaulerEntity.class, EntityDataSerializers.BOOLEAN);
    private static final EntityDataAccessor<Float> FATIGUE = SynchedEntityData.defineId(FrostMaulerEntity.class, EntityDataSerializers.FLOAT);

    // modes (synced): what the whole body is doing. STUNNED is the recharge: winded, panting, open to punishment.
    public static final byte MODE_NONE = 0, MODE_FURY_WINDUP = 1, MODE_FURY_CHARGE = 2, MODE_FURY_BITE = 3, MODE_STUNNED = 4,
            MODE_WAKING = 5, MODE_AWAKENING = 6;
    // one-shot actions (server; the client hears about them through entity events)
    private static final int ACT_NONE = 0, ACT_ROAR = 1, ACT_CLAW_L = 2, ACT_CLAW_R = 3, ACT_SNAP = 4, ACT_SLAM = 5, ACT_HURL = 6;
    public static final byte EVENT_ROAR = 70, EVENT_WAKE = 73, EVENT_FURY = 74, EVENT_BITE = 75, EVENT_ROAR_BLAST = 76;
    /** Claws and combo bites carry their clip speed in the event id: base + bucket, speed 0.75 + 0.25 * bucket. */
    public static final byte EVENT_CLAW_L = 80, EVENT_CLAW_R = 90, EVENT_SNAP = 100, EVENT_SLAM = 110, EVENT_HURL_L = 111, EVENT_HURL_R = 112;

    public static final float MAX_HEALTH = 400f;
    // timings (ticks)
    public static final int AWAKEN_TICKS = 60, WAKE_TICKS = 60, ROAR_TICKS = 40, ROAR_BLAST = 8, SLAM_TICKS = 24, SLAM_HIT = 12,
            HURL_TICKS = 22, HURL_THROW = 12, FURY_WINDUP = 18, FURY_CHARGE_MAX = 32, FURY_BITES = 6, DEATH_TICKS = 40,
            RECHARGE_TICKS = 100, RECHARGE_TICKS_ENRAGED = 55, RAIN_WARNING = 20;
    /** Clip timing: the claw clips strike at 0.4 s (8 ticks), the fury clip's jaws snap at 0.2 s (4 ticks). */
    private static final float CLAW_STRIKE = 8f, SNAP_STRIKE = 4f;
    public static final float BITE_DAMAGE = 5f, CLAW_DAMAGE = 14f;
    /** Fatigue per swing (claw, bite): about 7 swings from fresh to spent. */
    public static final float CLAW_FATIGUE = 0.14f, BITE_FATIGUE = 0.17f;
    public static final double ROAR_RADIUS = 8, ROAR_BREAK_RADIUS = 5;
    /** The tomb: ancient ice within this many blocks (a cube) is its tomb; breaking {@link #TOMB_BREAKS} wakes it. */
    public static final int TOMB_RADIUS = 6, TOMB_BREAKS = 6;
    public static final int BITE_MISS = 0, BITE_HIT = 1, BITE_BLOCKED = 2;
    private static final net.minecraft.resources.ResourceLocation ENRAGED_SPEED = Winterworks.id("frost_mauler_enraged");

    // client animation state
    public final AnimationState idleState = new AnimationState();
    public final AnimationState frozenState = new AnimationState();
    public final AnimationState wakeState = new AnimationState();
    public final AnimationState roarState = new AnimationState();
    public final AnimationState clawLState = new AnimationState();
    public final AnimationState clawRState = new AnimationState();
    public final AnimationState snapState = new AnimationState();
    public final AnimationState furyState = new AnimationState();
    public final AnimationState stunnedState = new AnimationState();
    public final AnimationState deathState = new AnimationState();
    /** Client: playback speeds of the one-shots (they follow the combo's pace). */
    public float clawLSpeed = 1f, clawRSpeed = 1f, snapSpeed = 1f;
    private int roarStart = -1000, clawLStart = -1000, clawRStart = -1000, snapStart = -1000, wakeStart = -1000, roarBlastTick = -1000;
    /** Client: when the fury snarl / the slam began (procedural crouch and rear). */
    public int furyStart = -1000, slamStart = -1000;
    /** Client: last tick the eye flames were emitted (client.boss.FrostMaulerRenderer). */
    public int lastFlameTick = -1;
    private int breathTimer = 40;

    // server state
    private final ServerBossEvent bossEvent = (ServerBossEvent) new ServerBossEvent(getDisplayName(), BossEvent.BossBarColor.BLUE,
            BossEvent.BossBarOverlay.PROGRESS).setCreateWorldFog(true);
    private int action = ACT_NONE, actionTicks, actionHit, actionLen, modeTicks, rechargeLen = RECHARGE_TICKS;
    private int roarCooldown = 40, furyCooldown = 160, rainCooldown = 160, hurlCooldown = 100;
    private int comboHits, comboStep, comboLost, lastSwing, bites, biteTimer, furyEnd = -1;
    @Nullable
    private BlockPos hurlFrom;
    private Vec3 chargeDir = Vec3.ZERO;
    private boolean wasOnGround = true;
    private int tombIce = -1, awakenTicks, crackStage = -1, sealedHint;
    private final List<BlockPos> cracking = new ArrayList<>();
    private final List<PendingIcicle> pendingIcicles = new ArrayList<>();
    @Nullable
    private DamageSource pendingLoot;
    private boolean lootPending;

    /** An icicle about to drop: it warns for {@link #RAIN_WARNING} ticks (frost sifting, the ground cracking) first. */
    private static final class PendingIcicle {
        final BlockPos from;
        final boolean existing;
        final double x, z, groundY;
        final BlockState ground;
        final int fallTicks;
        int left;

        PendingIcicle(BlockPos from, boolean existing, double x, double z, double groundY, BlockState ground, int fallTicks, int left) {
            this.from = from;
            this.existing = existing;
            this.x = x;
            this.z = z;
            this.groundY = groundY;
            this.ground = ground;
            this.fallTicks = fallTicks;
            this.left = left;
        }
    }

    public FrostMaulerEntity(EntityType<? extends Monster> type, Level level) {
        super(type, level);
        this.xpReward = 150;
        setPersistenceRequired();
    }

    public static AttributeSupplier.Builder createAttributes() {
        return Monster.createMonsterAttributes().add(Attributes.MAX_HEALTH, MAX_HEALTH).add(Attributes.ARMOR, 10)
                .add(Attributes.ATTACK_DAMAGE, CLAW_DAMAGE).add(Attributes.MOVEMENT_SPEED, 0.3).add(Attributes.KNOCKBACK_RESISTANCE, 0.9)
                .add(Attributes.FOLLOW_RANGE, 40).add(Attributes.ATTACK_KNOCKBACK, 1.5).add(Attributes.STEP_HEIGHT, 1.1);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        super.defineSynchedData(builder);
        builder.define(DORMANT, false);
        builder.define(MODE, MODE_NONE);
        builder.define(ENRAGED, false);
        builder.define(FATIGUE, 0f);
    }

    @Override
    protected void registerGoals() {
        goalSelector.addGoal(0, new FloatGoal(this));
        goalSelector.addGoal(1, new ChaseGoal());
        goalSelector.addGoal(6, new WaterAvoidingRandomStrollGoal(this, 0.6));
        goalSelector.addGoal(7, new LookAtPlayerGoal(this, Player.class, 16f));
        goalSelector.addGoal(8, new RandomLookAroundGoal(this));
        targetSelector.addGoal(1, new HurtByTargetGoal(this));
        targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(this, Player.class, true));
        targetSelector.addGoal(3, new NearestAttackableTargetGoal<>(this, IronGolem.class, true));
    }

    // --------------------------------------------------------------------------------------- state

    public boolean isDormant() {
        return entityData.get(DORMANT);
    }

    public byte mode() {
        return entityData.get(MODE);
    }

    private void setMode(byte m) {
        entityData.set(MODE, m);
        modeTicks = 0;
    }

    public boolean isEnraged() {
        return entityData.get(ENRAGED);
    }

    /** Stunned = recharging: winded after a combo or a fury, taking 1.5x damage. */
    public boolean isStunned() {
        return mode() == MODE_STUNNED;
    }

    /** 0 = fresh (frantic, fast swings) .. 1 = spent (it must recharge). Synced: the client pants when it's high. */
    public float fatigue() {
        return entityData.get(FATIGUE);
    }

    private void setFatigue(float f) {
        entityData.set(FATIGUE, Mth.clamp(f, 0f, 1f));
    }

    /** How long a recharge lasts: shorter when enraged. */
    public int rechargeTicks() {
        return isEnraged() ? RECHARGE_TICKS_ENRAGED : RECHARGE_TICKS;
    }

    /** Freezes it into its tomb: `tombIce` is how much ancient ice is around it (-1: count it on the first tick). */
    public void makeDormant(int tombIce) {
        entityData.set(DORMANT, true);
        this.tombIce = tombIce;
        setMode(MODE_NONE);
        action = ACT_NONE;
        setNoAi(true);
        setNoGravity(true);
        setDeltaMovement(Vec3.ZERO);
        setPersistenceRequired();
    }

    /** How much ancient ice it counted around itself when it was frozen in. */
    public int tombIce() {
        return tombIce;
    }

    /** Wakes up where it is: the `wake` clip (it falls, rises, shakes the ice off), then a roar. */
    public void startWaking() {
        entityData.set(DORMANT, false);
        setNoAi(false);
        setNoGravity(false);
        action = ACT_NONE;
        setMode(MODE_WAKING);
        roarCooldown = 0;
        furyCooldown = 200;
        rainCooldown = 200;
        hurlCooldown = 120;
        level().broadcastEntityEvent(this, EVENT_WAKE);
    }

    /** For tests: hold back roars, icicle rain, fury and hurls (the combo still runs). */
    public void holdSpecialAttacks(int ticks) {
        roarCooldown = furyCooldown = rainCooldown = hurlCooldown = ticks;
    }

    // --------------------------------------------------------------------------------------- ticking

    @Override
    public void tick() {
        super.tick();
        if (level().isClientSide) {
            clientTick();
            return;
        }
        bossEvent.setProgress(getHealth() / getMaxHealth());
        bossEvent.setVisible(!isDormant());
        if (tickCount % 10 == 0 && level() instanceof ServerLevel sl) {
            updateBossBarPlayers(sl);
        }
    }

    /** The bar shows to players within 48 blocks while it is awake. */
    private void updateBossBarPlayers(ServerLevel sl) {
        double r2 = 48 * 48;
        for (ServerPlayer p : sl.players()) {
            boolean near = !isDormant() && isAlive() && p.distanceToSqr(this) < r2;
            if (near && !bossEvent.getPlayers().contains(p)) {
                bossEvent.addPlayer(p);
            } else if (!near && bossEvent.getPlayers().contains(p)) {
                bossEvent.removePlayer(p);
            }
        }
    }

    @Override
    public void aiStep() {
        if (level() instanceof ServerLevel sl && isAlive()) {
            if (isDormant()) {
                tickDormant(sl);
            } else {
                tickBrain(sl);
            }
            tickPendingIcicles(sl);
        }
        super.aiStep();
    }

    @Override
    protected boolean isImmobile() {
        if (super.isImmobile() || isDormant()) {
            return true;
        }
        byte m = mode();
        return action != ACT_NONE || m == MODE_FURY_WINDUP || m == MODE_FURY_BITE || m == MODE_STUNNED || m == MODE_WAKING;
    }

    // --------------------------------------------------------------------------------------- the tomb

    private void tickDormant(ServerLevel sl) {
        setDeltaMovement(Vec3.ZERO);
        if (mode() == MODE_AWAKENING) {
            tickAwakening(sl);
            return;
        }
        if ((tickCount + getId()) % 10 != 0) {
            return;
        }
        int count = countTombIce(sl);
        if (tombIce < 0) {
            tombIce = count;
        }
        int needed = Math.max(1, Math.min(TOMB_BREAKS, tombIce));
        if (tombIce == 0 || tombIce - count >= needed) {
            startAwakening(sl);
        }
    }

    private int countTombIce(ServerLevel sl) {
        int n = 0;
        BlockPos c = blockPosition();
        for (BlockPos p : BlockPos.betweenClosed(c.offset(-TOMB_RADIUS, -TOMB_RADIUS, -TOMB_RADIUS), c.offset(TOMB_RADIUS, TOMB_RADIUS, TOMB_RADIUS))) {
            if (sl.getBlockState(p).is(WWBlocks.ANCIENT_ICE)) {
                n++;
            }
        }
        return n;
    }

    private void collectCracking(ServerLevel sl) {
        cracking.clear();
        BlockPos c = blockPosition();
        for (BlockPos p : BlockPos.betweenClosed(c.offset(-TOMB_RADIUS, -TOMB_RADIUS, -TOMB_RADIUS), c.offset(TOMB_RADIUS, TOMB_RADIUS, TOMB_RADIUS))) {
            if (sl.getBlockState(p).is(WWBlocks.ANCIENT_ICE)) {
                cracking.add(p.immutable());
            }
        }
        cracking.sort((a, b) -> Double.compare(a.distSqr(c), b.distSqr(c)));
        while (cracking.size() > 600) {
            cracking.remove(cracking.size() - 1);
        }
    }

    /** The breaker ids for the crack overlays: one per block, out of the way of real entity ids. */
    private int crackId(int i) {
        return -(1 + (getId() & 0xFFFFF) * 1024 + i);
    }

    /** Enough of the tomb is broken: the cave shakes and the ice starts to crack. */
    private void startAwakening(ServerLevel sl) {
        setMode(MODE_AWAKENING);
        awakenTicks = 0;
        crackStage = -1;
        collectCracking(sl);
        sl.playSound(null, getX(), getY(), getZ(), WWSounds.TOMB_RUMBLE, SoundSource.HOSTILE, 2.0f, 0.8f);
        BossFeature.shake(sl, position(), 32, 2.2f, 70);
        for (ServerPlayer p : sl.players()) {
            if (p.distanceToSqr(this) < 32 * 32) {
                p.displayClientMessage(Component.translatable("message.winterworks.tomb.awakening"), true);
            }
        }
    }

    private void tickAwakening(ServerLevel sl) {
        awakenTicks++;
        if (cracking.isEmpty()) {
            collectCracking(sl);   // reloaded mid-awakening
        }
        int stage = Math.min(9, awakenTicks * 10 / AWAKEN_TICKS);
        if (stage != crackStage) {
            crackStage = stage;
            for (int i = 0; i < cracking.size(); i++) {
                BlockPos p = cracking.get(i);
                if (sl.getBlockState(p).is(WWBlocks.ANCIENT_ICE)) {
                    sl.destroyBlockProgress(crackId(i), p, stage);
                }
            }
        }
        RandomSource r = random;
        if (awakenTicks % 4 == 0 && !cracking.isEmpty()) {
            BlockPos p = cracking.get(r.nextInt(cracking.size()));
            sl.playSound(null, p, WWSounds.ANCIENT_ICE_CRACK, SoundSource.BLOCKS, 1.2f, 0.6f + r.nextFloat() * 0.5f);
            sl.sendParticles(WWParticles.ICE_SHARD, p.getX() + 0.5, p.getY() + 0.5, p.getZ() + 0.5, 4, 0.4, 0.4, 0.4, 0.08);
        }
        if (awakenTicks == 24 || awakenTicks == 44) {
            sl.playSound(null, getX(), getY(), getZ(), WWSounds.TOMB_RUMBLE, SoundSource.HOSTILE, 2.0f, 0.7f + awakenTicks / 120f);
            BossFeature.shake(sl, position(), 32, 1.6f + awakenTicks / 40f, 30);
            icicleRain(sl, 3);
        }
        if (awakenTicks >= AWAKEN_TICKS) {
            burstTomb(sl);
        }
    }

    /** All the remaining tomb ice explodes and the Mauler drops out of it. */
    private void burstTomb(ServerLevel sl) {
        for (int i = 0; i < cracking.size(); i++) {
            BlockPos p = cracking.get(i);
            sl.destroyBlockProgress(crackId(i), p, -1);
            BlockState s = sl.getBlockState(p);
            if (s.is(WWBlocks.ANCIENT_ICE)) {
                if (i % 4 == 0) {
                    sl.levelEvent(2001, p, Block.getId(s));
                }
                sl.setBlock(p, Blocks.AIR.defaultBlockState(), Block.UPDATE_ALL);
            }
        }
        cracking.clear();
        Vec3 c = position().add(0, getBbHeight() * 0.5, 0);
        sl.playSound(null, c.x, c.y, c.z, WWSounds.ANCIENT_ICE_BURST, SoundSource.HOSTILE, 3.0f, 0.6f);
        sl.playSound(null, c.x, c.y, c.z, WWSounds.MAULER_WAKE, SoundSource.HOSTILE, 2.5f, 1.0f);
        BossFeature.iceBurstFx(sl, c, 14f, 90);
        sl.sendParticles(ParticleTypes.EXPLOSION, c.x, c.y, c.z, 4, 1.6, 1.0, 1.6, 0.0);
        BossFeature.frostbiteBurst(sl, c, 7.0, AncientIceBlock.BURST_SECONDS, AncientIceBlock.BURST_AMPLIFIER, this);
        for (LivingEntity e : sl.getEntitiesOfClass(LivingEntity.class, getBoundingBox().inflate(6), e -> e != this && e.isAlive())) {
            Vec3 d = e.position().subtract(position()).multiply(1, 0, 1);
            Vec3 n = d.lengthSqr() < 1e-4 ? new Vec3(1, 0, 0) : d.normalize();
            e.push(n.x * 0.9, 0.4, n.z * 0.9);
            e.hurtMarked = true;
        }
        BossFeature.shake(sl, c, 32, 3.5f, 30);
        startWaking();
    }

    // --------------------------------------------------------------------------------------- the brain

    private void tickBrain(ServerLevel sl) {
        LivingEntity target = getTarget();
        if (target != null && (!target.isAlive() || target instanceof Player p && (p.isSpectator() || p.isCreative()))) {
            setTarget(null);
            target = null;
        }
        roarCooldown = Math.max(0, roarCooldown - 1);
        furyCooldown = Math.max(0, furyCooldown - 1);
        rainCooldown = Math.max(0, rainCooldown - 1);
        hurlCooldown = Math.max(0, hurlCooldown - 1);
        if (!isEnraged() && getHealth() < getMaxHealth() * 0.35f) {
            enrage();
        }
        // catching its breath between bouts (like the daggers' fatigue: it drains after a second without swinging)
        if (mode() == MODE_NONE && action == ACT_NONE && tickCount - lastSwing > 20 && fatigue() > 0) {
            setFatigue(fatigue() - (isEnraged() ? 0.025f : 0.012f));
        }
        boolean landed = onGround() && !wasOnGround;
        wasOnGround = onGround();
        switch (mode()) {
            case MODE_WAKING -> tickWaking(sl);
            case MODE_STUNNED -> tickRecharge(sl);
            case MODE_FURY_WINDUP -> tickFuryWindup(sl, target);
            case MODE_FURY_CHARGE -> tickFuryCharge(sl, target, landed);
            case MODE_FURY_BITE -> tickFuryBites(sl, target);
            case MODE_AWAKENING -> setMode(MODE_NONE);   // not dormant any more
            default -> {
                if (action != ACT_NONE) {
                    tickAction(sl, target);
                } else if (target != null) {
                    chooseAttack(sl, target);
                }
            }
        }
    }

    private void chooseAttack(ServerLevel sl, LivingEntity target) {
        if (!onGround()) {
            return;
        }
        double dist = distanceTo(target);
        boolean sees = hasLineOfSight(target);
        boolean reach = inClawReach(target);
        if (!reach && ++comboLost > 15) {
            comboHits = 0;   // the bout is over
        }
        if (roarCooldown <= 0 && dist < 14 && sees) {
            startRoar();
        } else if (rainCooldown <= 0 && dist < 16 && sees) {
            startSlam();
        } else if (reach) {
            startSwing(target);
        } else if (furyCooldown <= 0 && sees && dist > 7 && dist < 18 && fatigue() < 0.5f) {
            startFury();
        } else if (hurlCooldown <= 0 && sees && dist > 6 && dist < 26) {
            startHurl(sl, target);
        }
    }

    private void tickWaking(ServerLevel sl) {
        modeTicks++;
        if (modeTicks == 6 || modeTicks == 30) {
            playSound(WWSounds.MAULER_STEP, 2.0f, 0.6f);
            BossFeature.groundRing(sl, WWParticles.SNOW_PUFF, position(), 12, 0.25);
        }
        if (modeTicks > 36 && modeTicks < 52 && modeTicks % 3 == 0) {   // shaking the ice off
            sl.sendParticles(WWParticles.ICE_SHARD, getX(), getY() + getBbHeight() * 0.7, getZ(), 8, getBbWidth() * 0.4, 0.4,
                    getBbWidth() * 0.4, 0.2);
            sl.sendParticles(ParticleTypes.SNOWFLAKE, getX(), getY() + getBbHeight() * 0.7, getZ(), 6, getBbWidth() * 0.4, 0.4,
                    getBbWidth() * 0.4, 0.05);
        }
        if (modeTicks >= WAKE_TICKS) {
            setMode(MODE_NONE);
            startRoar();
        }
    }

    /** Spent: it stands panting, dazed and open, its fatigue draining, then shakes it off (and roars soon after). */
    private void recharge(ServerLevel sl) {
        setMode(MODE_STUNNED);
        action = ACT_NONE;
        rechargeLen = rechargeTicks();
        comboHits = 0;
        getNavigation().stop();
        Vec3 v = getDeltaMovement();
        setDeltaMovement(v.x * 0.2, v.y, v.z * 0.2);
        playSound(WWSounds.MAULER_STUNNED, 2.0f, 1.0f);
        sl.sendParticles(WWParticles.SNOW_PUFF, getX(), getY() + 0.2, getZ(), 10, 1.0, 0.1, 1.0, 0.05);
        furyCooldown = Math.max(furyCooldown, furyCooldownTicks());
    }

    private void tickRecharge(ServerLevel sl) {
        modeTicks++;
        setFatigue(1f - (float) modeTicks / rechargeLen);
        if (modeTicks % 15 == 0) {
            playSound(WWSounds.MAULER_BREATH, 1.2f, 0.7f + random.nextFloat() * 0.1f);   // heaving breaths
        }
        if (modeTicks >= rechargeLen) {
            setMode(MODE_NONE);
            setFatigue(0f);
            roarCooldown = Math.min(roarCooldown, 25);   // it shakes it off with a roar soon after
        }
    }

    private int roarCooldownTicks() {
        return isEnraged() ? 110 + random.nextInt(40) : 220 + random.nextInt(80);
    }

    private int furyCooldownTicks() {
        return isEnraged() ? 170 + random.nextInt(60) : 280 + random.nextInt(80);
    }

    /** Icicle rain every ~12 s, every ~7.5 s below half health. */
    private int rainCooldownTicks() {
        return getHealth() < getMaxHealth() * 0.5f ? 130 + random.nextInt(40) : 220 + random.nextInt(50);
    }

    private int hurlCooldownTicks() {
        return isEnraged() ? 70 + random.nextInt(30) : 110 + random.nextInt(40);
    }

    private void enrage() {
        entityData.set(ENRAGED, true);
        AttributeInstance speed = getAttribute(Attributes.MOVEMENT_SPEED);
        if (speed != null && !speed.hasModifier(ENRAGED_SPEED)) {
            speed.addPermanentModifier(new AttributeModifier(ENRAGED_SPEED, 0.3, AttributeModifier.Operation.ADD_MULTIPLIED_BASE));
        }
        roarCooldown = 0;   // announces it
    }

    /** Turns toward the target, at most `maxTurn` degrees a tick (so a wind-up can be side-stepped). */
    private void faceTarget(@Nullable LivingEntity target, float maxTurn) {
        if (target == null) {
            return;
        }
        double dx = target.getX() - getX(), dz = target.getZ() - getZ();
        if (dx * dx + dz * dz < 1e-4) {
            return;
        }
        float want = (float) (Mth.atan2(dz, dx) * Mth.RAD_TO_DEG) - 90f;
        float yaw = Mth.approachDegrees(getYRot(), want, maxTurn);
        setYRot(yaw);
        setYBodyRot(yaw);
        setYHeadRot(yaw);
    }

    private Vec3 forward() {
        return Vec3.directionFromRotation(0, getYRot());
    }

    /** Left in the Mauler's own frame (lowpix: the model faces +Z, its left is +X). */
    private Vec3 left() {
        Vec3 f = forward();
        return new Vec3(f.z, 0, -f.x);
    }

    /** Where its jaws are, roughly. */
    public Vec3 mouthPos() {
        return position().add(forward().scale(getBbWidth() * 0.5 + 0.9)).add(0, getBbHeight() * 0.75, 0);
    }

    private boolean inClawReach(LivingEntity t) {
        return getBoundingBox().inflate(1.8, 0.5, 1.8).intersects(t.getBoundingBox());
    }

    private boolean inBiteReach(LivingEntity t, double reach) {
        return t.getBoundingBox().distanceToSqr(mouthPos()) < reach * reach;
    }

    /** Event id carrying a clip speed: base + bucket (speed 0.75 + 0.25 * bucket, buckets 0-9). */
    private static byte speedEvent(byte base, float speed) {
        return (byte) (base + Mth.clamp(Math.round((speed - 0.75f) / 0.25f), 0, 9));
    }

    private static float eventSpeed(byte id, byte base) {
        return 0.75f + 0.25f * (id - base);
    }

    // --------------------------------------------------------------------------------------- actions

    private void startAction(int act, int hit, int len) {
        action = act;
        actionTicks = 0;
        actionHit = hit;
        actionLen = len;
        getNavigation().stop();
    }

    private void tickAction(ServerLevel sl, @Nullable LivingEntity target) {
        actionTicks++;
        switch (action) {
            case ACT_ROAR -> {
                if (actionTicks < ROAR_BLAST) {
                    faceTarget(target, 6);
                }
                if (actionTicks == ROAR_BLAST) {
                    roarBlast(sl);
                } else if (actionTicks > ROAR_BLAST && actionTicks < ROAR_BLAST + 16 && actionTicks % 4 == 0) {
                    Vec3 m = mouthPos();
                    sl.sendParticles(WWParticles.ROAR_WAVE, m.x, m.y, m.z, 0, 6 + (actionTicks - ROAR_BLAST) * 0.6, 0, 0, 1.0);
                }
            }
            case ACT_CLAW_L, ACT_CLAW_R, ACT_SNAP -> {
                if (actionTicks < actionHit) {
                    faceTarget(target, comboHits == 0 ? 9 : 15);
                }
                if (actionTicks == actionHit) {
                    swingHits(sl, target);
                }
            }
            case ACT_SLAM -> {
                if (actionTicks < actionHit) {
                    faceTarget(target, 8);
                }
                if (actionTicks == actionHit) {
                    slamGround(sl);
                }
            }
            case ACT_HURL -> {
                if (actionTicks < actionHit) {
                    faceTarget(target, 12);
                    hurlWindupFx(sl);
                }
                if (actionTicks == actionHit && target != null && target.isAlive()) {
                    hurlIcicle(sl, target, hurlFrom);
                }
            }
            default -> action = ACT_NONE;
        }
        if (action != ACT_NONE && actionTicks >= actionLen) {
            int done = action;
            action = ACT_NONE;
            switch (done) {
                case ACT_ROAR -> roarCooldown = roarCooldownTicks();
                case ACT_CLAW_L, ACT_CLAW_R, ACT_SNAP -> {
                    comboHits++;
                    comboStep++;
                    if (fatigue() >= 1f) {
                        recharge(sl);
                    }
                }
                default -> {
                }
            }
        }
    }

    // --------------------------------------------------------------------------------------- roar

    private void startRoar() {
        startAction(ACT_ROAR, ROAR_BLAST, ROAR_TICKS);
        playSound(WWSounds.MAULER_BREATH, 2.0f, 0.6f);   // the deep inhale
        level().broadcastEntityEvent(this, EVENT_ROAR);
    }

    /**
     * The roar itself: a shockwave that throws everything within 8 blocks back and slows it, shatters ice and snow
     * within 5 blocks (not the floor it stands on) and brings a volley of icicles down on nearby players.
     */
    public void roarBlast(ServerLevel sl) {
        Vec3 m = mouthPos();
        playSound(WWSounds.MAULER_ROAR, 3.0f, isEnraged() ? 0.85f : 1.0f);
        level().broadcastEntityEvent(this, EVENT_ROAR_BLAST);
        BossFeature.shake(sl, position(), 24, 1.1f, 16);
        sl.sendParticles(WWParticles.ROAR_WAVE, m.x, m.y, m.z, 0, ROAR_RADIUS * 2, 0, 0, 1.0);
        sl.sendParticles(WWParticles.ROAR_WAVE, getX(), getY() + 0.3, getZ(), 0, ROAR_RADIUS * 1.6, 0, 0, 1.0);
        BossFeature.groundRing(sl, WWParticles.SNOW_PUFF, position(), 18, 0.45);
        for (LivingEntity e : sl.getEntitiesOfClass(LivingEntity.class, getBoundingBox().inflate(ROAR_RADIUS),
                e -> e != this && e.isAlive() && !(e instanceof FrostMaulerEntity))) {
            if (e instanceof Player p && (p.isSpectator() || p.getAbilities().instabuild)) {
                continue;
            }
            double dx = e.getX() - getX(), dz = e.getZ() - getZ();
            double d = Math.sqrt(dx * dx + dz * dz);
            if (d > ROAR_RADIUS + getBbWidth() * 0.5) {
                continue;
            }
            if (d < 1e-3) {
                dx = forward().x;
                dz = forward().z;
                d = 1;
            }
            double k = (1.0 - d / (ROAR_RADIUS + 2)) * 2.0 * Math.max(0, 1.0 - e.getAttributeValue(Attributes.KNOCKBACK_RESISTANCE));
            e.push(dx / d * k, 0.25 + 0.2 * k, dz / d * k);
            e.hurtMarked = true;
            e.addEffect(new MobEffectInstance(MobEffects.MOVEMENT_SLOWDOWN, 60, 1), this);
        }
        breakIce(sl);
        icicleRain(sl, 4 + random.nextInt(5));
        rainCooldown = Math.max(rainCooldown, rainCooldownTicks() / 2);
        gameEvent(GameEvent.ENTITY_ACTION);
    }

    private static boolean roarBreaks(BlockState s) {
        return s.is(Blocks.ICE) || s.is(Blocks.PACKED_ICE) || s.is(Blocks.FROSTED_ICE) || s.is(Blocks.SNOW) || s.is(Blocks.SNOW_BLOCK)
                || s.is(Blocks.POWDER_SNOW);
    }

    /** Ice, packed ice and snow within 5 blocks shatter (from its feet up: the floor it stands on holds). */
    private void breakIce(ServerLevel sl) {
        if (!sl.getGameRules().getBoolean(GameRules.RULE_MOBGRIEFING)) {
            return;
        }
        BlockPos c = blockPosition();
        int r = (int) ROAR_BREAK_RADIUS, n = 0;
        List<BlockPos> hits = new ArrayList<>();
        for (BlockPos p : BlockPos.betweenClosed(c.offset(-r, 0, -r), c.offset(r, r, r))) {
            if (p.distSqr(c) <= ROAR_BREAK_RADIUS * ROAR_BREAK_RADIUS && roarBreaks(sl.getBlockState(p))) {
                hits.add(p.immutable());
            }
        }
        java.util.Collections.shuffle(hits, new java.util.Random(random.nextLong()));
        for (BlockPos p : hits) {
            if (n++ >= 48) {
                break;
            }
            sl.destroyBlock(p, false, this);
        }
    }

    // --------------------------------------------------------------------------------------- icicle rain

    private void startSlam() {
        startAction(ACT_SLAM, SLAM_HIT, SLAM_TICKS);
        playSound(WWSounds.MAULER_FURY, 1.8f, 0.7f);
        level().broadcastEntityEvent(this, EVENT_SLAM);
        rainCooldown = rainCooldownTicks();
    }

    /** Both forepaws come down: the ground jumps, and the cave lets go of its icicles. */
    private void slamGround(ServerLevel sl) {
        Vec3 c = position().add(forward().scale(getBbWidth() * 0.5 + 0.8));
        playSound(WWSounds.MAULER_STEP, 2.5f, 0.5f);
        sl.playSound(null, c.x, c.y, c.z, WWSounds.ICE_CRACK, SoundSource.HOSTILE, 1.6f, 0.6f);
        BlockState under = sl.getBlockState(BlockPos.containing(c.x, getY() - 0.2, c.z));
        sl.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, under.isAir() ? Blocks.SNOW_BLOCK.defaultBlockState() : under),
                c.x, getY() + 0.1, c.z, 30, 1.2, 0.1, 1.2, 0.2);
        sl.sendParticles(WWParticles.ROAR_WAVE, c.x, getY() + 0.2, c.z, 0, 10, 0, 0, 1.0);
        BossFeature.groundRing(sl, WWParticles.SNOW_PUFF, new Vec3(c.x, getY(), c.z), 16, 0.5);
        BossFeature.shake(sl, c, 20, 1.3f, 14);
        for (LivingEntity e : sl.getEntitiesOfClass(LivingEntity.class, new AABB(c, c).inflate(5, 2, 5),
                e -> e != this && e.isAlive() && e.onGround() && !(e instanceof FrostMaulerEntity))) {
            if (e instanceof Player p && (p.isSpectator() || p.getAbilities().instabuild)) {
                continue;
            }
            Vec3 d = e.position().subtract(c).multiply(1, 0, 1);
            Vec3 n = d.lengthSqr() < 1e-4 ? forward() : d.normalize();
            double k = Math.max(0, 1.0 - e.getAttributeValue(Attributes.KNOCKBACK_RESISTANCE));
            e.push(n.x * 0.4 * k, 0.45 * k, n.z * 0.4 * k);   // knocked off its feet
            e.hurtMarked = true;
        }
        icicleRain(sl, getHealth() < getMaxHealth() * 0.5f ? 9 + random.nextInt(4) : 6 + random.nextInt(3));
    }

    /**
     * A volley of `n` icicles: the first ones drop right on its target and the players nearby, the rest around them.
     * Each is telegraphed {@link #RAIN_WARNING} ticks before it lands (they're staggered a few ticks apart).
     */
    public void icicleRain(ServerLevel sl, int n) {
        List<LivingEntity> marks = new ArrayList<>();
        LivingEntity t = getTarget();
        if (t != null && t.isAlive()) {
            marks.add(t);
        }
        for (Player p : sl.getEntitiesOfClass(Player.class, getBoundingBox().inflate(18), p -> !p.isSpectator() && p.isAlive())) {
            if (p != t) {
                marks.add(p);
            }
        }
        for (int i = 0; i < n; i++) {
            Vec3 at;
            if (marks.isEmpty()) {
                at = position().add((random.nextDouble() - 0.5) * 14, 0, (random.nextDouble() - 0.5) * 14);
            } else {
                LivingEntity m = marks.get(i % marks.size());
                double spread = i < marks.size() ? 0 : 1.5 + random.nextDouble() * 3.5;
                double a = random.nextDouble() * Math.PI * 2;
                at = m.position().add(Math.cos(a) * spread, 0, Math.sin(a) * spread);
            }
            scheduleIcicle(sl, at, RAIN_WARNING + i * 3);
        }
    }

    /** Finds where an icicle over `at` would fall from (a ceiling, an icicle already hanging there, or the open air). */
    private void scheduleIcicle(ServerLevel sl, Vec3 at, int landIn) {
        BlockPos.MutableBlockPos q = BlockPos.containing(at.x, at.y + 0.5, at.z).mutable();
        int down = 0;
        while (down < 8 && !sl.isOutsideBuildHeight(q) && sl.getBlockState(q).getCollisionShape(sl, q).isEmpty()) {
            q.move(Direction.DOWN);
            down++;
        }
        BlockState ground = sl.getBlockState(q);
        if (ground.getCollisionShape(sl, q).isEmpty()) {
            return;   // nothing to land on
        }
        double groundY = q.getY() + ground.getCollisionShape(sl, q).max(Direction.Axis.Y);
        BlockPos.MutableBlockPos u = q.above().mutable();
        BlockPos from = null;
        boolean existing = false;
        for (int up = 0; up < 16 && !sl.isOutsideBuildHeight(u); up++, u.move(Direction.UP)) {
            BlockState s = sl.getBlockState(u);
            if (s.is(WWBlocks.ICICLE)) {
                BlockPos top = u.immutable();
                while (sl.getBlockState(top.above()).is(WWBlocks.ICICLE)) {
                    top = top.above();
                }
                from = top;
                existing = true;
                at = new Vec3(u.getX() + 0.5, at.y, u.getZ() + 0.5);
                break;
            }
            if (!s.getCollisionShape(sl, u).isEmpty()) {
                if (up >= 2) {
                    from = u.below().immutable();
                }
                break;
            }
            if (up == 12) {
                from = u.immutable();   // open air: it forms out of the cold, 12 blocks up
                break;
            }
        }
        if (from == null) {
            return;
        }
        double fall = Math.max(0.5, (existing ? u.getY() : from.getY()) - groundY);
        int fallTicks = (int) Math.ceil(Math.sqrt(2 * fall / FallingIcicleEntity.GRAVITY));
        pendingIcicles.add(new PendingIcicle(from, existing, at.x, at.z, groundY, ground, fallTicks, Math.max(landIn, fallTicks + 1)));
    }

    private void tickPendingIcicles(ServerLevel sl) {
        for (Iterator<PendingIcicle> it = pendingIcicles.iterator(); it.hasNext(); ) {
            PendingIcicle pi = it.next();
            pi.left--;
            double top = pi.from.getY() + (pi.existing ? 0.2 : 0.95);
            if (pi.left > pi.fallTicks - 2 && pi.left % 2 == 0) {
                // the warning: frost sifting down the column and the ground under it cracking
                double h = top - pi.groundY;
                for (int k = 0; k < 2; k++) {
                    sl.sendParticles(ParticleTypes.SNOWFLAKE, pi.x + (random.nextDouble() - 0.5) * 0.3, top - random.nextDouble() * h * 0.6,
                            pi.z + (random.nextDouble() - 0.5) * 0.3, 0, 0, -1, 0, 0.18);
                }
                sl.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, pi.ground), pi.x, pi.groundY + 0.05, pi.z, 3, 0.25, 0.0, 0.25, 0.05);
                sl.sendParticles(WWParticles.ICE_SHARD, pi.x, pi.groundY + 0.1, pi.z, 1, 0.2, 0.0, 0.2, 0.05);
            }
            if (pi.left > 0 && pi.left % 6 == 0) {
                sl.sendParticles(WWParticles.FROST_BURST, pi.x, pi.groundY + 0.08, pi.z, 0, 1.4, 0, 0, 1.0);   // a frost ring marks the spot
            }
            if (pi.left == 12) {
                sl.playSound(null, pi.from, WWSounds.ICE_CRACK, SoundSource.BLOCKS, 0.8f, 1.3f + random.nextFloat() * 0.3f);
            }
            if (pi.left == pi.fallTicks) {
                if (pi.existing) {
                    if (sl.getBlockState(pi.from).is(WWBlocks.ICICLE)) {
                        IcicleBlock.breakOff(sl, pi.from);
                    }
                } else if (sl.getBlockState(pi.from).isAir()) {
                    FallingIcicleEntity.spawn(sl, pi.x, pi.from.getY(), pi.z, true);
                    sl.playSound(null, pi.from, WWSounds.ICICLE_FALL, SoundSource.BLOCKS, 1.0f, 0.9f + random.nextFloat() * 0.3f);
                }
            }
            if (pi.left <= 0) {
                it.remove();
            }
        }
    }

    /** Icicles waiting to drop (warning or falling). */
    public int pendingIcicles() {
        return pendingIcicles.size();
    }

    // --------------------------------------------------------------------------------------- hurling

    private void startHurl(ServerLevel sl, LivingEntity target) {
        hurlFrom = findCeilingIcicle(sl);
        startAction(ACT_HURL, HURL_THROW, HURL_TICKS);
        hurlCooldown = hurlCooldownTicks();
        boolean leftPaw = target.position().subtract(position()).dot(left()) > 0;
        level().broadcastEntityEvent(this, leftPaw ? EVENT_HURL_L : EVENT_HURL_R);
        playSound(WWSounds.MAULER_AMBIENT, 1.6f, 0.8f);
        if (hurlFrom != null) {
            sl.playSound(null, hurlFrom, WWSounds.ICE_CRACK, SoundSource.BLOCKS, 1.2f, 0.8f);
        }
    }

    /** An icicle hanging within reach overhead, to rip down and throw. */
    @Nullable
    private BlockPos findCeilingIcicle(ServerLevel sl) {
        BlockPos c = blockPosition();
        BlockPos best = null;
        double bestD = Double.MAX_VALUE;
        for (BlockPos p : BlockPos.betweenClosed(c.offset(-7, 1, -7), c.offset(7, 12, 7))) {
            if (sl.getBlockState(p).is(WWBlocks.ICICLE)) {
                double d = p.distSqr(c);
                if (d < bestD) {
                    bestD = d;
                    best = p.immutable();
                }
            }
        }
        return best;
    }

    private void hurlWindupFx(ServerLevel sl) {
        if (actionTicks % 2 != 0) {
            return;
        }
        if (hurlFrom != null && sl.getBlockState(hurlFrom).is(WWBlocks.ICICLE)) {   // it wrenches at the icicle
            sl.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, sl.getBlockState(hurlFrom)), hurlFrom.getX() + 0.5,
                    hurlFrom.getY() + 0.9, hurlFrom.getZ() + 0.5, 4, 0.2, 0.05, 0.2, 0.05);
            sl.sendParticles(ParticleTypes.SNOWFLAKE, hurlFrom.getX() + 0.5, hurlFrom.getY() + 0.5, hurlFrom.getZ() + 0.5, 2, 0.2, 0.3, 0.2, 0.01);
        } else {   // frost gathers in its jaws
            Vec3 m = mouthPos();
            for (int i = 0; i < 3; i++) {
                double a = random.nextDouble() * Math.PI * 2, r = 1.2;
                sl.sendParticles(ParticleTypes.SNOWFLAKE, m.x + Math.cos(a) * r, m.y + (random.nextDouble() - 0.5), m.z + Math.sin(a) * r, 0,
                        -Math.cos(a), 0, -Math.sin(a), 0.15);
            }
            sl.sendParticles(WWParticles.ICE_CRIT, m.x, m.y, m.z, 2, 0.15, 0.15, 0.15, 0.02);
        }
    }

    /**
     * Throws an icicle at `target`: torn from the ceiling at `fromIcicle` if that is still an icicle, otherwise formed
     * in its jaws. Aimed with a little lead.
     */
    public FallingIcicleEntity hurlIcicle(ServerLevel sl, LivingEntity target, @Nullable BlockPos fromIcicle) {
        Vec3 from;
        if (fromIcicle != null && sl.getBlockState(fromIcicle).is(WWBlocks.ICICLE)) {
            from = Vec3.atCenterOf(fromIcicle);
            sl.levelEvent(2001, fromIcicle, Block.getId(sl.getBlockState(fromIcicle)));
            sl.setBlock(fromIcicle, Blocks.AIR.defaultBlockState(), Block.UPDATE_ALL);   // what hung below breaks off and falls
        } else {
            from = mouthPos();
        }
        Vec3 aim = target.position().add(0, target.getBbHeight() * 0.5, 0);
        double t = from.distanceTo(aim) / FallingIcicleEntity.THROW_SPEED;
        Vec3 motion = new Vec3(target.getX() - target.xOld, 0, target.getZ() - target.zOld);
        aim = aim.add(motion.scale(t * 0.7));
        playSound(WWSounds.MAULER_CLAW, 1.6f, 0.7f);
        sl.playSound(null, from.x, from.y, from.z, WWSounds.ICICLE_FALL, SoundSource.HOSTILE, 1.2f, 1.3f);
        sl.sendParticles(WWParticles.ICE_SHARD, from.x, from.y, from.z, 6, 0.2, 0.2, 0.2, 0.1);
        return FallingIcicleEntity.throwAt(sl, from, aim, this);
    }

    // --------------------------------------------------------------------------------------- the combo

    /**
     * The next swing of the combo (claw, claw, bite, ...). The opening swing winds up slowly enough to read; then
     * the pace is frantic and slows as fatigue builds: wind-up 3 -> 8 ticks, recovery 2 -> 7 ticks.
     */
    private void startSwing(LivingEntity target) {
        comboLost = 0;
        float f = fatigue();
        int windup = comboHits == 0 ? 8 : Math.round(Mth.lerp(f, 3f, 8f));
        int recover = Math.round(Mth.lerp(f, 2f, 7f));
        int kind = comboStep % 3;
        if (comboHits == 0) {   // open with the paw on the target's side
            comboStep = target.position().subtract(position()).dot(left()) > 0 ? 0 : 1;
            kind = comboStep % 3;
        }
        int act = kind == 0 ? ACT_CLAW_L : kind == 1 ? ACT_CLAW_R : ACT_SNAP;
        startAction(act, windup, windup + recover);
        if (comboHits > 0) {   // keep on it: a short lunge into each follow-up
            Vec3 d = target.position().subtract(position()).multiply(1, 0, 1);
            if (d.lengthSqr() > 1e-4) {
                d = d.normalize();
                setDeltaMovement(d.x * 0.3, getDeltaMovement().y, d.z * 0.3);
            }
        } else {
            playSound(WWSounds.MAULER_AMBIENT, 1.2f, 1.2f);   // a snarl as the first paw goes up
        }
        byte event = act == ACT_CLAW_L ? speedEvent(EVENT_CLAW_L, CLAW_STRIKE / windup)
                : act == ACT_CLAW_R ? speedEvent(EVENT_CLAW_R, CLAW_STRIKE / windup) : speedEvent(EVENT_SNAP, SNAP_STRIKE / windup);
        level().broadcastEntityEvent(this, event);
    }

    /** The swing lands. Every swing tires it, hit, blocked or missed. */
    private void swingHits(ServerLevel sl, @Nullable LivingEntity target) {
        float f = fatigue();
        lastSwing = tickCount;
        if (action == ACT_SNAP) {
            setFatigue(f + BITE_FATIGUE);
            if (target != null && inBiteReach(target, 2.4)) {
                furyBite(target);
            } else {
                playSound(WWSounds.MAULER_BITE, 1.0f, 1.35f);   // jaws closing on air
            }
            return;
        }
        setFatigue(f + CLAW_FATIGUE);
        boolean leftPaw = action == ACT_CLAW_L;
        // fast swipes are light and quick, the tired ones heavy: the opening swipe has the full weight
        float damage = comboHits == 0 ? CLAW_DAMAGE : Mth.lerp(f, 5f, CLAW_DAMAGE);
        float knock = comboHits == 0 || f > 0.8f ? 1.0f : Mth.lerp(f, 0.2f, 0.8f);
        clawHit(sl, leftPaw, damage, knock, comboHits > 0);
    }

    /** A claw swipe through a frontal arc: everything there takes `damage` and is flung away from the paw. */
    private void clawHit(ServerLevel sl, boolean leftPaw, float damage, float knock, boolean throughFrames) {
        Vec3 f = forward(), side = left().scale(leftPaw ? 1 : -1);
        Vec3 c = position().add(f.scale(getBbWidth() * 0.5 + 1.0)).add(side.scale(0.5)).add(0, 1.1, 0);
        AABB box = new AABB(c, c).inflate(1.9, 1.4, 1.9);
        boolean any = false;
        DamageSource src = damageSources().mobAttack(this);
        for (LivingEntity e : sl.getEntitiesOfClass(LivingEntity.class, box, e -> e != this && e.isAlive() && !(e instanceof FrostMaulerEntity))) {
            Vec3 to = e.position().subtract(position()).multiply(1, 0, 1);
            if (to.lengthSqr() > 1e-4 && to.normalize().dot(f) < -0.1) {
                continue;   // behind it
            }
            if (throughFrames && !e.isDamageSourceBlocked(src)) {
                e.invulnerableTime = 0;   // the flurry is faster than invulnerability frames
            }
            if (e.hurt(src, damage)) {
                any = true;
                Vec3 k = f.scale(0.5).add(side.scale(-0.7)).normalize();   // flung across, away from the paw
                e.knockback(0.5 * knock, -k.x, -k.z);
                e.hurtMarked = true;
                setLastHurtMob(e);
                sl.sendParticles(WWParticles.ICE_CRIT, e.getX(), e.getY() + e.getBbHeight() * 0.6, e.getZ(), 8, 0.3, 0.3, 0.3, 0.3);
            }
        }
        playSound(WWSounds.MAULER_CLAW, 1.6f, 0.9f + random.nextFloat() * 0.15f + (1f - fatigue()) * 0.15f);
        sl.sendParticles(WWParticles.FROST_SLASH, c.x, c.y, c.z, 0, leftPaw ? 0.7 : -0.7, 0, 0, 1.0);
        sl.sendParticles(WWParticles.SNOW_PUFF, c.x, getY() + 0.1, c.z, 4, 0.5, 0.05, 0.5, 0.03);
        if (any) {
            BossFeature.shake(sl, c, 6, 0.3f + 0.5f * knock, 8);
        }
    }

    // --------------------------------------------------------------------------------------- fury

    private void startFury() {
        setMode(MODE_FURY_WINDUP);
        action = ACT_NONE;
        getNavigation().stop();
        playSound(WWSounds.MAULER_FURY, 2.0f, 0.85f);
        level().broadcastEntityEvent(this, EVENT_FURY);
    }

    private void tickFuryWindup(ServerLevel sl, @Nullable LivingEntity target) {
        modeTicks++;
        faceTarget(target, 14);
        if (modeTicks % 3 == 0) {   // digging in
            Vec3 paws = position().add(forward().scale(getBbWidth() * 0.45));
            BlockState under = sl.getBlockState(BlockPos.containing(paws.x, getY() - 0.2, paws.z));
            sl.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, under.isAir() ? Blocks.SNOW_BLOCK.defaultBlockState() : under),
                    paws.x, getY() + 0.1, paws.z, 6, 0.6, 0.05, 0.6, 0.1);
            sl.sendParticles(WWParticles.SNOW_PUFF, paws.x, getY() + 0.1, paws.z, 2, 0.5, 0.05, 0.5, 0.02);
        }
        if (modeTicks >= FURY_WINDUP) {
            chargeDir = target != null ? target.position().subtract(position()).multiply(1, 0, 1) : forward();
            chargeDir = chargeDir.lengthSqr() < 1e-4 ? forward() : chargeDir.normalize();
            setMode(MODE_FURY_CHARGE);
            playSound(WWSounds.MAULER_FURY, 2.5f, 1.15f);
        }
    }

    private void tickFuryCharge(ServerLevel sl, @Nullable LivingEntity target, boolean landed) {
        modeTicks++;
        if (target != null) {   // it steers, but only so fast: a late side-step makes it miss
            Vec3 want = target.position().subtract(position()).multiply(1, 0, 1);
            if (want.lengthSqr() > 1e-4) {
                float cur = (float) (Mth.atan2(chargeDir.z, chargeDir.x) * Mth.RAD_TO_DEG);
                float to = (float) (Mth.atan2(want.z, want.x) * Mth.RAD_TO_DEG);
                float a = Mth.approachDegrees(cur, to, 5f) * Mth.DEG_TO_RAD;
                chargeDir = new Vec3(Mth.cos(a), 0, Mth.sin(a));
            }
        }
        double speed = isEnraged() ? 0.72 : 0.6;
        double vy = getDeltaMovement().y;
        if (onGround() && modeTicks % 7 == 0) {
            vy = 0.32;   // bounding
        }
        setDeltaMovement(chargeDir.x * speed, vy, chargeDir.z * speed);
        float yaw = (float) (Mth.atan2(chargeDir.z, chargeDir.x) * Mth.RAD_TO_DEG) - 90f;
        setYRot(yaw);
        setYBodyRot(yaw);
        setYHeadRot(yaw);
        if (landed) {
            playSound(WWSounds.MAULER_STEP, 1.6f, 0.7f);
            BossFeature.groundRing(sl, WWParticles.SNOW_PUFF, position(), 8, 0.2);
            BossFeature.shake(sl, position(), 10, 0.5f, 6);
        }
        for (LivingEntity e : sl.getEntitiesOfClass(LivingEntity.class, getBoundingBox().inflate(0.3),
                e -> e != this && e != target && e.isAlive() && !(e instanceof FrostMaulerEntity))) {
            Vec3 d = e.position().subtract(position()).multiply(1, 0, 1);
            Vec3 n = d.lengthSqr() < 1e-4 ? chargeDir : d.normalize();
            e.push(n.x * 0.8, 0.3, n.z * 0.8);   // bowled aside
            e.hurtMarked = true;
        }
        if (target != null && inBiteReach(target, 2.4)) {
            setMode(MODE_FURY_BITE);
            bites = 0;
            biteTimer = 2;
            furyEnd = -1;
            return;
        }
        if (modeTicks > 4 && horizontalCollision) {   // straight into the wall
            playSound(WWSounds.MAULER_STEP, 2.5f, 0.5f);
            Vec3 front = position().add(chargeDir.scale(getBbWidth() * 0.6)).add(0, 1.2, 0);
            BossFeature.iceBurstFx(sl, front, 4f, 20);
            BossFeature.shake(sl, position(), 14, 1.2f, 12);
            setFatigue(1f);
            recharge(sl);
            return;
        }
        if (modeTicks >= FURY_CHARGE_MAX) {
            setFatigue(1f);
            recharge(sl);
        }
    }

    /** The flurry: up to 6 bites, quick at first and slower as it tires; spent, it recharges. */
    private void tickFuryBites(ServerLevel sl, @Nullable LivingEntity target) {
        modeTicks++;
        faceTarget(target, 20);
        if (furyEnd >= 0) {
            if (modeTicks >= furyEnd) {
                setFatigue(1f);
                recharge(sl);
            }
            return;
        }
        biteTimer--;
        if (biteTimer == 2 && target != null) {   // lunge (and bounce) after it
            Vec3 d = target.position().subtract(position()).multiply(1, 0, 1);
            d = d.lengthSqr() < 1e-4 ? forward() : d.normalize();
            setDeltaMovement(d.x * 0.42, onGround() ? 0.2 : getDeltaMovement().y, d.z * 0.42);
        }
        if (biteTimer <= 0) {   // snap
            bites++;
            lastSwing = tickCount;
            level().broadcastEntityEvent(this, EVENT_BITE);
            int r = target != null && inBiteReach(target, 2.4) ? furyBite(target) : BITE_MISS;
            if (r == BITE_MISS) {
                playSound(WWSounds.MAULER_BITE, 1.0f, 1.35f);   // jaws closing on air
            }
            setFatigue(fatigue() + BITE_FATIGUE);
            biteTimer = Math.round(Mth.lerp(fatigue(), 3f, 9f));
            if (bites >= FURY_BITES || fatigue() >= 1f) {
                furyEnd = modeTicks + 5;
            }
        }
    }

    /**
     * One fang bite: 5 damage that ignores the target's invulnerability frames. A raised shield facing the Mauler
     * blocks it. Returns {@link #BITE_HIT}, {@link #BITE_BLOCKED} or {@link #BITE_MISS}.
     */
    public int furyBite(LivingEntity target) {
        if (!(level() instanceof ServerLevel sl) || !target.isAlive()) {
            return BITE_MISS;
        }
        DamageSource src = damageSources().mobAttack(this);
        playSound(WWSounds.MAULER_BITE, 1.4f, 0.9f + random.nextFloat() * 0.2f);
        Vec3 at = target.position().add(0, target.getBbHeight() * 0.6, 0);
        if (target.isDamageSourceBlocked(src)) {
            target.invulnerableTime = 0;
            target.hurt(src, BITE_DAMAGE);   // the shield takes it (vanilla: shield wear, clank, a little push)
            sl.sendParticles(WWParticles.ICE_CRIT, at.x, at.y, at.z, 4, 0.2, 0.2, 0.2, 0.15);
            return BITE_BLOCKED;
        }
        target.invulnerableTime = 0;   // fang bites come too fast for invulnerability frames
        boolean hit = target.hurt(src, BITE_DAMAGE);
        if (hit) {
            Vec3 d = target.position().subtract(position()).multiply(1, 0, 1);
            d = d.lengthSqr() < 1e-4 ? forward() : d.normalize();
            target.push(d.x * 0.15, 0.05, d.z * 0.15);
            target.hurtMarked = true;
            setLastHurtMob(target);
            sl.sendParticles(WWParticles.ICE_CRIT, at.x, at.y, at.z, 10, 0.25, 0.25, 0.25, 0.3);
            sl.sendParticles(WWParticles.FROST_SLASH, at.x, at.y, at.z, 0, random.nextFloat() * 6.28, 0, 0, 1.0);
        }
        return hit ? BITE_HIT : BITE_MISS;
    }

    // --------------------------------------------------------------------------------------- moving

    private final class ChaseGoal extends Goal {
        private int repath;

        ChaseGoal() {
            setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
        }

        private boolean free() {
            LivingEntity t = getTarget();
            return !isDormant() && mode() == MODE_NONE && action == ACT_NONE && t != null && t.isAlive();
        }

        @Override
        public boolean canUse() {
            return free();
        }

        @Override
        public boolean canContinueToUse() {
            return free();
        }

        @Override
        public void start() {
            repath = 0;
        }

        @Override
        public void stop() {
            getNavigation().stop();
        }

        @Override
        public boolean requiresUpdateEveryTick() {
            return true;
        }

        @Override
        public void tick() {
            LivingEntity t = getTarget();
            if (t == null) {
                return;
            }
            getLookControl().setLookAt(t, 30f, 30f);
            if (inClawReach(t)) {
                getNavigation().stop();
            } else if (--repath <= 0) {
                repath = 4 + random.nextInt(5);
                getNavigation().moveTo(t, 1.0);
            }
        }
    }

    @Override
    protected void playStepSound(BlockPos pos, BlockState state) {
        playSound(WWSounds.MAULER_STEP, 0.9f, 0.85f + random.nextFloat() * 0.2f);
        if (level() instanceof ServerLevel sl) {
            sl.sendParticles(WWParticles.SNOW_PUFF, getX(), getY() + 0.05, getZ(), 2, getBbWidth() * 0.4, 0.0, getBbWidth() * 0.4, 0.01);
        }
    }

    @Override
    public boolean isPushable() {
        return !isDormant() && super.isPushable();
    }

    @Override
    public void push(double x, double y, double z) {
        if (!isDormant()) {
            super.push(x, y, z);
        }
    }

    @Override
    public void knockback(double strength, double x, double z) {
        if (!isDormant() && mode() != MODE_WAKING) {
            super.knockback(strength, x, z);
        }
    }

    @Override
    protected int calculateFallDamage(float distance, float multiplier) {
        return super.calculateFallDamage(distance - 4f, multiplier * 0.5f);   // it lands like a boulder, not like a cat
    }

    @Override
    public boolean removeWhenFarAway(double distance) {
        return false;
    }

    @Override
    public boolean requiresCustomPersistence() {
        return true;
    }

    @Override
    public boolean canChangeDimensions(Level from, Level to) {
        return false;
    }

    // --------------------------------------------------------------------------------------- damage

    @Override
    public boolean isInvulnerableTo(DamageSource source) {
        if (isDormant() && !source.is(DamageTypeTags.BYPASSES_INVULNERABILITY)) {
            return true;
        }
        return source.is(DamageTypeTags.IS_FREEZING) || super.isInvulnerableTo(source);
    }

    @Override
    public boolean canFreeze() {
        return false;
    }

    /** Nothing gets into the ice; frost can't bite it; and it can't be stun-locked by launcher snowballs. */
    @Override
    public boolean canBeAffected(MobEffectInstance effect) {
        if (isDormant() || effect.getEffect().is(WWEffects.FROSTBITE) || effect.getEffect().is(WWEffects.STUNNED)) {
            return false;
        }
        return super.canBeAffected(effect);
    }

    @Override
    public boolean hurt(DamageSource source, float amount) {
        if (isDormant() && !source.is(DamageTypeTags.BYPASSES_INVULNERABILITY)) {
            if (source.getEntity() instanceof Player p && level() instanceof ServerLevel sl) {   // the ice holds
                playSound(WWSounds.ANCIENT_ICE_HIT, 1.0f, 0.7f);
                sl.sendParticles(ParticleTypes.SNOWFLAKE, getX(), getY() + getBbHeight() * 0.6, getZ(), 6, 0.6, 0.6, 0.6, 0.02);
                if (tickCount - sealedHint > 100) {
                    sealedHint = tickCount;
                    p.displayClientMessage(Component.translatable("message.winterworks.mauler.sealed"), true);
                }
            }
            return false;
        }
        if (source.is(DamageTypeTags.IS_FIRE)) {
            amount *= 1.5f;
        }
        if (isStunned()) {
            amount *= 1.5f;
        }
        return super.hurt(source, amount);
    }

    // --------------------------------------------------------------------------------------- death

    @Override
    protected void tickDeath() {
        deathTime++;
        if (!(level() instanceof ServerLevel sl)) {
            return;
        }
        if (deathTime == 1) {
            bossEvent.setProgress(0f);
            BossFeature.shake(sl, position(), 24, 1.2f, 20);
            pendingIcicles.clear();
        }
        if (deathTime % 5 == 0 && deathTime < DEATH_TICKS) {   // it cracks apart
            sl.sendParticles(WWParticles.ICE_SHARD, getX(), getY() + getBbHeight() * 0.5, getZ(), 6, getBbWidth() * 0.4, 0.5,
                    getBbWidth() * 0.4, 0.15);
            sl.playSound(null, getX(), getY(), getZ(), WWSounds.ANCIENT_ICE_CRACK, SoundSource.HOSTILE, 1.2f, 0.6f + deathTime / 80f);
        }
        if (deathTime >= DEATH_TICKS && !isRemoved()) {
            deathBurst(sl);
            level().broadcastEntityEvent(this, (byte) 60);
            remove(RemovalReason.KILLED);
        }
    }

    /** The loot waits for the burst at the end of the death animation. */
    @Override
    protected void dropAllDeathLoot(ServerLevel level, DamageSource source) {
        if (deathTime < DEATH_TICKS) {
            pendingLoot = source;
            lootPending = true;
            return;
        }
        super.dropAllDeathLoot(level, source);
    }

    /** A frost explosion: throws everything back hard, breaks nothing, hurts nobody. */
    private void deathBurst(ServerLevel sl) {
        Vec3 c = position().add(0, getBbHeight() * 0.5, 0);
        Holder<SoundEvent> boom = BuiltInRegistries.SOUND_EVENT.wrapAsHolder(WWSounds.MAULER_EXPLODE);
        sl.explode(this, damageSources().explosion(this, this), new ExplosionDamageCalculator() {
            @Override
            public boolean shouldDamageEntity(net.minecraft.world.level.Explosion explosion, Entity entity) {
                return false;
            }

            @Override
            public float getKnockbackMultiplier(Entity entity) {
                return 2.5f;
            }
        }, c.x, c.y, c.z, 7.0f, false, Level.ExplosionInteraction.NONE, ParticleTypes.EXPLOSION_EMITTER,
                ParticleTypes.EXPLOSION_EMITTER, boom);
        BossFeature.iceBurstFx(sl, c, 16f, 80);
        BossFeature.groundRing(sl, WWParticles.SNOW_PUFF, position(), 24, 0.6);
        BossFeature.shake(sl, c, 40, 3.5f, 40);
        if (lootPending) {
            lootPending = false;
            dropAllDeathLoot(sl, pendingLoot != null ? pendingLoot : damageSources().generic());
            pendingLoot = null;
        }
    }

    @Override
    public void remove(RemovalReason reason) {
        super.remove(reason);
        bossEvent.removeAllPlayers();
    }

    // --------------------------------------------------------------------------------------- client

    private void clientTick() {
        byte m = mode();
        boolean dormant = isDormant(), dying = isDeadOrDying();
        boolean moving = !dormant && walkAnimation.speed() > 0.08f;
        frozenState.animateWhen(dormant, tickCount);
        deathState.animateWhen(dying, tickCount);
        stunnedState.animateWhen(!dying && !dormant && m == MODE_STUNNED, tickCount);
        furyState.animateWhen(!dying && !dormant && (m == MODE_FURY_CHARGE || m == MODE_FURY_BITE), tickCount);
        idleState.animateWhen(!dying && !dormant && !moving && m == MODE_NONE, tickCount);
        if (tickCount - roarStart > ROAR_TICKS || dying) {
            roarState.stop();
        }
        if (tickCount - clawLStart > 16 / clawLSpeed + 1 || dying) {
            clawLState.stop();
        }
        if (tickCount - clawRStart > 16 / clawRSpeed + 1 || dying) {
            clawRState.stop();
        }
        if (tickCount - snapStart > 10 / snapSpeed || dying) {
            snapState.stop();
        }
        if ((tickCount - wakeStart > WAKE_TICKS && m != MODE_WAKING) || dying || dormant) {
            wakeState.stop();
        }
        if (dormant) {
            if (m == MODE_AWAKENING && random.nextInt(2) == 0) {
                level().addParticle(ParticleTypes.SNOWFLAKE, getRandomX(1.4), getRandomY(), getRandomZ(1.4), 0, -0.03, 0);
            }
            return;
        }
        if (dying) {
            return;
        }
        Vec3 f = Vec3.directionFromRotation(0, yHeadRot);
        Vec3 mouth = position().add(f.scale(getBbWidth() * 0.5 + 0.9)).add(0, getBbHeight() * 0.75, 0);
        // breath vapour: slow puffs, quicker when angry, heaving gasps when it is spent
        boolean winded = m == MODE_STUNNED || fatigue() > 0.7f;
        if (--breathTimer <= 0) {
            breathTimer = winded ? 7 + random.nextInt(4) : (isEnraged() ? 30 : 55) + random.nextInt(30);
            for (int i = 0; i < (winded ? 3 : 5); i++) {
                level().addParticle(WWParticles.FROST_BREATH, mouth.x, mouth.y - 0.3, mouth.z, f.x * 0.06 + (random.nextDouble() - 0.5) * 0.02,
                        -0.01, f.z * 0.06 + (random.nextDouble() - 0.5) * 0.02);
            }
        }
        // the roar: a gale of frost out of its jaws
        int sinceBlast = tickCount - roarBlastTick;
        if (sinceBlast >= 0 && sinceBlast < 18) {
            for (int i = 0; i < 4; i++) {
                double sx = (random.nextDouble() - 0.5) * 0.25, sy = (random.nextDouble() - 0.5) * 0.15, sz = (random.nextDouble() - 0.5) * 0.25;
                level().addParticle(WWParticles.FROST_BREATH, mouth.x, mouth.y, mouth.z, f.x * 0.55 + sx, sy, f.z * 0.55 + sz);
            }
            if (sinceBlast % 3 == 0) {
                level().addParticle(ParticleTypes.SNOWFLAKE, mouth.x, mouth.y, mouth.z, f.x * 0.8, 0.05, f.z * 0.8);
            }
        }
        // the fury snarl: steam through the teeth
        if (m == MODE_FURY_WINDUP && tickCount % 2 == 0) {
            level().addParticle(WWParticles.FROST_BREATH, mouth.x, mouth.y - 0.3, mouth.z, f.x * 0.12, 0.02, f.z * 0.12);
        }
        // recharging: dizzy stars round its head
        if (m == MODE_STUNNED && tickCount % 24 == 0) {
            for (int i = 0; i < 3; i++) {
                level().addParticle(WWParticles.STUN_STAR, getX(), getY() + getBbHeight(), getZ(), getId(), i * Mth.TWO_PI / 3, 0);
            }
        }
        // enraged: frost smoking off its back
        if (isEnraged() && tickCount % 3 == 0) {
            level().addParticle(WWParticles.FROST_BREATH, getRandomX(0.8), getY() + getBbHeight() * (0.8 + random.nextDouble() * 0.2),
                    getRandomZ(0.8), 0, 0.03, 0);
        }
    }

    @Override
    public void handleEntityEvent(byte id) {
        if (id >= EVENT_CLAW_L && id < EVENT_CLAW_L + 10) {
            roarState.stop();
            clawLSpeed = eventSpeed(id, EVENT_CLAW_L);
            clawLState.start(tickCount);
            clawLStart = tickCount;
            return;
        }
        if (id >= EVENT_CLAW_R && id < EVENT_CLAW_R + 10) {
            roarState.stop();
            clawRSpeed = eventSpeed(id, EVENT_CLAW_R);
            clawRState.start(tickCount);
            clawRStart = tickCount;
            return;
        }
        if (id >= EVENT_SNAP && id < EVENT_SNAP + 10) {
            snapSpeed = eventSpeed(id, EVENT_SNAP);
            snapState.start(tickCount);
            snapStart = tickCount;
            return;
        }
        switch (id) {
            case EVENT_ROAR -> {
                clawLState.stop();
                clawRState.stop();
                roarState.start(tickCount);
                roarStart = tickCount;
            }
            case EVENT_ROAR_BLAST -> roarBlastTick = tickCount;
            case EVENT_SLAM -> {   // both forepaws up, then down
                clawLSpeed = clawRSpeed = CLAW_STRIKE / SLAM_HIT;
                clawLState.start(tickCount);
                clawRState.start(tickCount);
                clawLStart = clawRStart = slamStart = tickCount;
            }
            case EVENT_HURL_L, EVENT_HURL_R -> {
                boolean l = id == EVENT_HURL_L;
                (l ? clawLState : clawRState).start(tickCount);
                if (l) {
                    clawLSpeed = CLAW_STRIKE / HURL_THROW;
                    clawLStart = tickCount;
                } else {
                    clawRSpeed = CLAW_STRIKE / HURL_THROW;
                    clawRStart = tickCount;
                }
            }
            case EVENT_WAKE -> {
                roarState.stop();
                wakeState.start(tickCount);
                wakeStart = tickCount;
                for (int i = 0; i < 30; i++) {
                    level().addParticle(WWParticles.ICE_SHARD, getRandomX(1.2), getRandomY(), getRandomZ(1.2),
                            (random.nextDouble() - 0.5) * 0.4, random.nextDouble() * 0.3, (random.nextDouble() - 0.5) * 0.4);
                }
            }
            case EVENT_FURY -> furyStart = tickCount;
            case EVENT_BITE -> {
                Vec3 f = Vec3.directionFromRotation(0, yHeadRot);
                Vec3 mouth = position().add(f.scale(getBbWidth() * 0.5 + 0.9)).add(0, getBbHeight() * 0.6, 0);
                level().addParticle(WWParticles.ICE_CRIT, mouth.x, mouth.y, mouth.z, f.x * 0.2, 0.05, f.z * 0.2);
            }
            default -> super.handleEntityEvent(id);
        }
    }

    // --------------------------------------------------------------------------------------- boss bar, sounds

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

    @Nullable
    @Override
    protected SoundEvent getAmbientSound() {
        return isDormant() ? null : WWSounds.MAULER_AMBIENT;
    }

    @Override
    protected SoundEvent getHurtSound(DamageSource source) {
        return WWSounds.MAULER_HURT;
    }

    @Override
    protected SoundEvent getDeathSound() {
        return WWSounds.MAULER_DEATH;
    }

    @Override
    protected float getSoundVolume() {
        return 2.0f;
    }

    @Override
    public int getAmbientSoundInterval() {
        return 160;
    }

    @Override
    public int getMaxHeadYRot() {
        return 30;
    }

    @Override
    public SpawnGroupData finalizeSpawn(ServerLevelAccessor level, DifficultyInstance difficulty, MobSpawnType reason,
                                        @Nullable SpawnGroupData data) {
        setPersistenceRequired();
        roarCooldown = 20;
        return super.finalizeSpawn(level, difficulty, reason, data);
    }

    // --------------------------------------------------------------------------------------- saving

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        tag.putBoolean("Dormant", isDormant());
        tag.putInt("TombIce", tombIce);
        tag.putByte("Mode", mode());
        tag.putInt("ModeTicks", modeTicks);
        tag.putInt("AwakenTicks", awakenTicks);
        tag.putBoolean("Enraged", isEnraged());
        tag.putFloat("Fatigue", fatigue());
        tag.putInt("RoarCooldown", roarCooldown);
        tag.putInt("FuryCooldown", furyCooldown);
        tag.putInt("RainCooldown", rainCooldown);
        tag.putInt("HurlCooldown", hurlCooldown);
        tag.putBoolean("LootPending", lootPending);
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        entityData.set(DORMANT, tag.getBoolean("Dormant"));
        tombIce = tag.contains("TombIce") ? tag.getInt("TombIce") : -1;
        byte m = tag.getByte("Mode");
        entityData.set(MODE, m == MODE_FURY_WINDUP || m == MODE_FURY_CHARGE || m == MODE_FURY_BITE ? MODE_STUNNED : m);
        modeTicks = tag.getInt("ModeTicks");
        awakenTicks = tag.getInt("AwakenTicks");
        entityData.set(ENRAGED, tag.getBoolean("Enraged"));
        setFatigue(tag.getFloat("Fatigue"));
        rechargeLen = rechargeTicks();
        roarCooldown = tag.getInt("RoarCooldown");
        furyCooldown = tag.getInt("FuryCooldown");
        rainCooldown = tag.contains("RainCooldown") ? tag.getInt("RainCooldown") : 160;
        hurlCooldown = tag.contains("HurlCooldown") ? tag.getInt("HurlCooldown") : 100;
        lootPending = tag.getBoolean("LootPending");
        if (isDormant()) {
            setNoAi(true);
            setNoGravity(true);
        }
        if (hasCustomName()) {
            bossEvent.setName(getDisplayName());
        }
    }
}
