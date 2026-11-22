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
 * The Frost Mauler (docs/COLD_UPDATE.md section 7): a huge frozen beast, half wolf, half giant bear.
 *
 * <p>It sleeps <b>dormant</b> in the ancient ice of its frozen tomb (no AI, invulnerable, no gravity, frozen pose)
 * until 6 of the tomb's ancient-ice blocks are broken: the cave rumbles and shakes, the ice cracks for 3 s, it all
 * bursts, the Mauler drops, gets up and roars. Awake, it fights with telegraphed attacks:
 * <ul>
 * <li><b>Roar</b> (2 s, blast at 0.6 s): knockback in 8 blocks, Slowness II, shatters ice and snow around it and
 *     shakes 4-8 icicles off the ceiling above nearby players (they glint and crackle before they drop);</li>
 * <li><b>Claws</b>: left / right swipes (wind-up, then 14 damage and knockback in a frontal arc);</li>
 * <li><b>Fury</b>: a crouching snarl, then it charges and bounds at you; if it reaches you it bites 6 times in a
 *     flurry (5 each, through invulnerability frames; a raised shield blocks each bite). Dodge the charge into a wall
 *     and it stuns itself sooner. After a fury it is <b>stunned</b> for 5 s and takes 1.5x damage.</li>
 * </ul>
 * Below 35% health it is enraged: faster, roaring twice as often. Freezing can't hurt it, fire hurts 1.5x. On death it
 * thrashes for 2 s and bursts in a frost explosion that throws everything back (no block damage), then drops its loot.
 */
public class FrostMaulerEntity extends Monster {
    private static final EntityDataAccessor<Boolean> DORMANT = SynchedEntityData.defineId(FrostMaulerEntity.class, EntityDataSerializers.BOOLEAN);
    private static final EntityDataAccessor<Byte> MODE = SynchedEntityData.defineId(FrostMaulerEntity.class, EntityDataSerializers.BYTE);
    private static final EntityDataAccessor<Boolean> ENRAGED = SynchedEntityData.defineId(FrostMaulerEntity.class, EntityDataSerializers.BOOLEAN);

    // modes (synced): what the whole body is doing
    public static final byte MODE_NONE = 0, MODE_FURY_WINDUP = 1, MODE_FURY_CHARGE = 2, MODE_FURY_BITE = 3, MODE_STUNNED = 4,
            MODE_WAKING = 5, MODE_AWAKENING = 6;
    // one-shot actions (server; the client hears about them through entity events)
    private static final int ACT_NONE = 0, ACT_ROAR = 1, ACT_CLAW_L = 2, ACT_CLAW_R = 3;
    public static final byte EVENT_ROAR = 70, EVENT_CLAW_L = 71, EVENT_CLAW_R = 72, EVENT_WAKE = 73, EVENT_FURY = 74, EVENT_BITE = 75,
            EVENT_ROAR_BLAST = 76;

    // timings (ticks)
    public static final int AWAKEN_TICKS = 60, WAKE_TICKS = 60, ROAR_TICKS = 40, ROAR_BLAST = 12, CLAW_TICKS = 16, CLAW_HIT = 9,
            FURY_WINDUP = 18, FURY_CHARGE_MAX = 32, FURY_BITES = 6, BITE_INTERVAL = 6, STUN_TICKS = 100, DEATH_TICKS = 40;
    public static final float BITE_DAMAGE = 5f;
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
    public final AnimationState furyState = new AnimationState();
    public final AnimationState stunnedState = new AnimationState();
    public final AnimationState deathState = new AnimationState();
    private int roarStart = -1000, clawStart = -1000, wakeStart = -1000, roarBlastTick = -1000;
    /** Client: tick the fury snarl began (for the crouch). */
    public int furyStart = -1000;
    private int breathTimer = 40;

    // server state
    private final ServerBossEvent bossEvent = (ServerBossEvent) new ServerBossEvent(getDisplayName(), BossEvent.BossBarColor.BLUE,
            BossEvent.BossBarOverlay.PROGRESS).setCreateWorldFog(true);
    private int action = ACT_NONE, actionTicks, modeTicks;
    private int roarCooldown = 40, furyCooldown = 160, clawCooldown;
    private int clawsInARow, bites, lastClawSide;
    private Vec3 chargeDir = Vec3.ZERO;
    private boolean wasOnGround = true;
    private int tombIce = -1, awakenTicks, crackStage = -1, sealedHint;
    private final List<BlockPos> cracking = new ArrayList<>();
    private final List<PendingIcicle> pendingIcicles = new ArrayList<>();
    @Nullable
    private DamageSource pendingLoot;
    private boolean lootPending;

    private static final class PendingIcicle {
        final BlockPos pos;
        final boolean existing;
        int delay;

        PendingIcicle(BlockPos pos, boolean existing, int delay) {
            this.pos = pos;
            this.existing = existing;
            this.delay = delay;
        }
    }

    public FrostMaulerEntity(EntityType<? extends Monster> type, Level level) {
        super(type, level);
        this.xpReward = 150;
        setPersistenceRequired();
    }

    public static AttributeSupplier.Builder createAttributes() {
        return Monster.createMonsterAttributes().add(Attributes.MAX_HEALTH, 320).add(Attributes.ARMOR, 10)
                .add(Attributes.ATTACK_DAMAGE, 14).add(Attributes.MOVEMENT_SPEED, 0.3).add(Attributes.KNOCKBACK_RESISTANCE, 0.9)
                .add(Attributes.FOLLOW_RANGE, 40).add(Attributes.ATTACK_KNOCKBACK, 1.5).add(Attributes.STEP_HEIGHT, 1.1);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        super.defineSynchedData(builder);
        builder.define(DORMANT, false);
        builder.define(MODE, MODE_NONE);
        builder.define(ENRAGED, false);
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

    public boolean isStunned() {
        return mode() == MODE_STUNNED;
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
        level().broadcastEntityEvent(this, EVENT_WAKE);
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
            shakeIciclesLoose(sl, 3);
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
        if (roarCooldown > 0) {
            roarCooldown--;
        }
        if (furyCooldown > 0) {
            furyCooldown--;
        }
        if (clawCooldown > 0) {
            clawCooldown--;
        }
        if (!isEnraged() && getHealth() < getMaxHealth() * 0.35f) {
            enrage();
        }
        boolean landed = onGround() && !wasOnGround;
        wasOnGround = onGround();
        switch (mode()) {
            case MODE_WAKING -> tickWaking(sl);
            case MODE_STUNNED -> tickStunned(sl);
            case MODE_FURY_WINDUP -> tickFuryWindup(sl, target);
            case MODE_FURY_CHARGE -> tickFuryCharge(sl, target, landed);
            case MODE_FURY_BITE -> tickFuryBites(sl, target);
            case MODE_AWAKENING -> setMode(MODE_NONE);   // not dormant any more
            default -> {
                if (action != ACT_NONE) {
                    tickAction(sl, target);
                } else if (target != null) {
                    chooseAttack(target);
                }
            }
        }
    }

    private void chooseAttack(LivingEntity target) {
        if (!onGround()) {
            return;
        }
        double dist = distanceTo(target);
        boolean sees = hasLineOfSight(target);
        if (roarCooldown <= 0 && dist < 14 && sees) {
            startRoar();
        } else if (furyCooldown <= 0 && sees && ((dist > 6 && dist < 18) || clawsInARow >= 3)) {
            startFury();
        } else if (clawCooldown <= 0 && inClawReach(target)) {
            startClaw(target);
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

    private void tickStunned(ServerLevel sl) {
        modeTicks++;
        if (modeTicks % 20 == 0) {
            playSound(WWSounds.MAULER_BREATH, 1.2f, 0.7f);
        }
        if (modeTicks >= STUN_TICKS) {
            setMode(MODE_NONE);
            furyCooldown = furyCooldownTicks();
            roarCooldown = Math.min(roarCooldown, 25);   // it shakes it off with a roar soon after
        }
    }

    private void stun(ServerLevel sl) {
        setMode(MODE_STUNNED);
        getNavigation().stop();
        Vec3 v = getDeltaMovement();
        setDeltaMovement(v.x * 0.2, v.y, v.z * 0.2);
        playSound(WWSounds.MAULER_STUNNED, 2.0f, 1.0f);
        sl.sendParticles(WWParticles.SNOW_PUFF, getX(), getY() + 0.2, getZ(), 10, 1.0, 0.1, 1.0, 0.05);
        furyCooldown = furyCooldownTicks();
    }

    private int roarCooldownTicks() {
        return isEnraged() ? 110 + random.nextInt(40) : 220 + random.nextInt(80);
    }

    private int furyCooldownTicks() {
        return isEnraged() ? 170 + random.nextInt(60) : 280 + random.nextInt(80);
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
        return position().add(forward().scale(getBbWidth() * 0.5 + 0.8)).add(0, getBbHeight() * 0.7, 0);
    }

    private boolean inClawReach(LivingEntity t) {
        return getBoundingBox().inflate(1.8, 0.5, 1.8).intersects(t.getBoundingBox());
    }

    private boolean inBiteReach(LivingEntity t, double reach) {
        return t.getBoundingBox().distanceToSqr(mouthPos()) < reach * reach;
    }

    // --------------------------------------------------------------------------------------- roar

    private void startRoar() {
        action = ACT_ROAR;
        actionTicks = 0;
        getNavigation().stop();
        playSound(WWSounds.MAULER_BREATH, 2.0f, 0.6f);   // the deep inhale
        level().broadcastEntityEvent(this, EVENT_ROAR);
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
                if (actionTicks >= ROAR_TICKS) {
                    action = ACT_NONE;
                    roarCooldown = roarCooldownTicks();
                }
            }
            case ACT_CLAW_L, ACT_CLAW_R -> {
                if (actionTicks < CLAW_HIT - 1) {
                    faceTarget(target, 9);
                }
                if (actionTicks == CLAW_HIT) {
                    clawHit(sl, action == ACT_CLAW_L);
                }
                if (actionTicks >= CLAW_TICKS) {
                    action = ACT_NONE;
                    clawCooldown = 6 + random.nextInt(8);
                    clawsInARow++;
                }
            }
            default -> action = ACT_NONE;
        }
    }

    /**
     * The roar itself: a shockwave that throws everything within 8 blocks back and slows it, shatters ice and snow
     * within 5 blocks (not the floor it stands on) and shakes icicles loose above nearby players.
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
        shakeIciclesLoose(sl, 4 + random.nextInt(5));
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

    /** Picks `n` spots on the ceiling above nearby players; they glint and crackle, then an icicle drops from each. */
    private void shakeIciclesLoose(ServerLevel sl, int n) {
        List<Player> players = sl.getEntitiesOfClass(Player.class, getBoundingBox().inflate(16), p -> !p.isSpectator() && p.isAlive());
        for (int i = 0; i < n; i++) {
            BlockPos col;
            if (players.isEmpty()) {
                col = BlockPos.containing(getX() + (random.nextDouble() - 0.5) * 14, getEyeY(), getZ() + (random.nextDouble() - 0.5) * 14);
            } else {
                Player p = players.get(i % players.size());
                double spread = i < players.size() ? 1.0 : 5.0;   // the first one is right above each player
                col = BlockPos.containing(p.getX() + (random.nextDouble() - 0.5) * spread, p.getEyeY(),
                        p.getZ() + (random.nextDouble() - 0.5) * spread);
            }
            BlockPos.MutableBlockPos q = col.mutable();
            for (int up = 0; up < 16; up++, q.move(Direction.UP)) {
                if (sl.isOutsideBuildHeight(q)) {
                    break;
                }
                BlockState s = sl.getBlockState(q);
                if (s.is(WWBlocks.ICICLE)) {
                    BlockPos top = q.immutable();
                    while (sl.getBlockState(top.above()).is(WWBlocks.ICICLE)) {
                        top = top.above();
                    }
                    pendingIcicles.add(new PendingIcicle(top, true, 12 + i * 3));
                    break;
                }
                if (!s.isAir() && !s.getCollisionShape(sl, q).isEmpty()) {
                    if (up > 1) {
                        pendingIcicles.add(new PendingIcicle(q.below(), false, 12 + i * 3));
                    }
                    break;
                }
            }
        }
    }

    private void tickPendingIcicles(ServerLevel sl) {
        for (Iterator<PendingIcicle> it = pendingIcicles.iterator(); it.hasNext(); ) {
            PendingIcicle pi = it.next();
            pi.delay--;
            double x = pi.pos.getX() + 0.5, y = pi.pos.getY() + (pi.existing ? 0.2 : 0.95), z = pi.pos.getZ() + 0.5;
            if (pi.delay % 2 == 0) {   // the warning: frost dust sifting down
                sl.sendParticles(ParticleTypes.SNOWFLAKE, x, y, z, 2, 0.2, 0.02, 0.2, 0.01);
                sl.sendParticles(WWParticles.ICE_SHARD, x, y, z, 1, 0.15, 0.0, 0.15, 0.0);
            }
            if (pi.delay == 8) {
                sl.playSound(null, pi.pos, WWSounds.ICE_CRACK, SoundSource.BLOCKS, 0.7f, 1.3f + random.nextFloat() * 0.3f);
            }
            if (pi.delay <= 0) {
                it.remove();
                if (pi.existing) {
                    if (sl.getBlockState(pi.pos).is(WWBlocks.ICICLE)) {
                        IcicleBlock.breakOff(sl, pi.pos);
                    }
                } else if (sl.getBlockState(pi.pos).isAir()) {
                    FallingIcicleEntity.spawn(sl, x, pi.pos.getY(), z, true);
                    sl.playSound(null, pi.pos, WWSounds.ICICLE_FALL, SoundSource.BLOCKS, 1.0f, 0.9f + random.nextFloat() * 0.3f);
                }
            }
        }
    }

    // --------------------------------------------------------------------------------------- claws

    private void startClaw(LivingEntity target) {
        Vec3 to = target.position().subtract(position());
        double side = to.dot(left());
        boolean leftPaw = Math.abs(side) < 0.4 ? lastClawSide != ACT_CLAW_L : side > 0;
        action = leftPaw ? ACT_CLAW_L : ACT_CLAW_R;
        lastClawSide = action;
        actionTicks = 0;
        getNavigation().stop();
        level().broadcastEntityEvent(this, leftPaw ? EVENT_CLAW_L : EVENT_CLAW_R);
        playSound(WWSounds.MAULER_AMBIENT, 1.2f, 1.2f);   // a short snarl as the paw goes up
    }

    private void clawHit(ServerLevel sl, boolean leftPaw) {
        Vec3 f = forward(), side = left().scale(leftPaw ? 1 : -1);
        Vec3 c = position().add(f.scale(getBbWidth() * 0.5 + 1.0)).add(side.scale(0.5)).add(0, 1.1, 0);
        AABB box = new AABB(c, c).inflate(1.9, 1.4, 1.9);
        boolean any = false;
        for (LivingEntity e : sl.getEntitiesOfClass(LivingEntity.class, box, e -> e != this && e.isAlive() && !(e instanceof FrostMaulerEntity))) {
            Vec3 to = e.position().subtract(position()).multiply(1, 0, 1);
            if (to.lengthSqr() > 1e-4 && to.normalize().dot(f) < -0.1) {
                continue;   // behind it
            }
            if (doHurtTarget(e)) {
                any = true;
                Vec3 k = f.scale(0.5).add(side.scale(-0.7));   // flung across, away from the paw
                e.push(k.x, 0.25, k.z);
                e.hurtMarked = true;
                sl.sendParticles(WWParticles.ICE_CRIT, e.getX(), e.getY() + e.getBbHeight() * 0.6, e.getZ(), 8, 0.3, 0.3, 0.3, 0.3);
            }
        }
        playSound(WWSounds.MAULER_CLAW, 1.6f, 0.9f + random.nextFloat() * 0.15f);
        sl.sendParticles(WWParticles.FROST_SLASH, c.x, c.y, c.z, 0, leftPaw ? 0.7 : -0.7, 0, 0, 1.0);
        sl.sendParticles(WWParticles.SNOW_PUFF, c.x, getY() + 0.1, c.z, 4, 0.5, 0.05, 0.5, 0.03);
        if (any) {
            BossFeature.shake(sl, c, 6, 0.6f, 8);
        }
    }

    // --------------------------------------------------------------------------------------- fury

    private void startFury() {
        setMode(MODE_FURY_WINDUP);
        action = ACT_NONE;
        clawsInARow = 0;
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
            return;
        }
        if (modeTicks > 4 && horizontalCollision) {   // straight into the wall
            playSound(WWSounds.MAULER_STEP, 2.5f, 0.5f);
            Vec3 front = position().add(chargeDir.scale(getBbWidth() * 0.6)).add(0, 1.2, 0);
            BossFeature.iceBurstFx(sl, front, 4f, 20);
            BossFeature.shake(sl, position(), 14, 1.2f, 12);
            stun(sl);
            return;
        }
        if (modeTicks >= FURY_CHARGE_MAX) {
            stun(sl);
        }
    }

    private void tickFuryBites(ServerLevel sl, @Nullable LivingEntity target) {
        modeTicks++;
        faceTarget(target, 20);
        int phase = modeTicks % BITE_INTERVAL;
        if (phase == 1 && target != null) {   // lunge (and bounce) after it
            Vec3 d = target.position().subtract(position()).multiply(1, 0, 1);
            d = d.lengthSqr() < 1e-4 ? forward() : d.normalize();
            setDeltaMovement(d.x * 0.42, onGround() ? 0.2 : getDeltaMovement().y, d.z * 0.42);
        }
        if (phase == 3 && bites < FURY_BITES) {   // snap
            bites++;
            level().broadcastEntityEvent(this, EVENT_BITE);
            int r = target != null && inBiteReach(target, 2.3) ? furyBite(target) : BITE_MISS;
            if (r == BITE_MISS) {
                playSound(WWSounds.MAULER_BITE, 1.0f, 1.35f);   // jaws closing on air
            }
        }
        if (bites >= FURY_BITES && phase == 0) {
            stun(sl);
        }
    }

    /**
     * One fang bite of the fury flurry: 5 damage that ignores the target's invulnerability frames. A raised shield
     * facing the Mauler blocks it. Returns {@link #BITE_HIT}, {@link #BITE_BLOCKED} or {@link #BITE_MISS}.
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
        if (tickCount - clawStart > CLAW_TICKS || dying) {
            clawLState.stop();
            clawRState.stop();
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
        Vec3 mouth = position().add(f.scale(getBbWidth() * 0.5 + 0.8)).add(0, getBbHeight() * 0.7, 0);
        // breath vapour: slow puffs, quicker when angry
        if (--breathTimer <= 0) {
            breathTimer = (isEnraged() ? 30 : 55) + random.nextInt(30);
            for (int i = 0; i < 5; i++) {
                level().addParticle(WWParticles.FROST_BREATH, mouth.x, mouth.y - 0.2, mouth.z, f.x * 0.06 + (random.nextDouble() - 0.5) * 0.02,
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
        // stunned: dizzy stars round its head
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
        switch (id) {
            case EVENT_ROAR -> {
                clawLState.stop();
                clawRState.stop();
                roarState.start(tickCount);
                roarStart = tickCount;
            }
            case EVENT_ROAR_BLAST -> roarBlastTick = tickCount;
            case EVENT_CLAW_L -> {
                roarState.stop();
                clawRState.stop();
                clawLState.start(tickCount);
                clawStart = tickCount;
            }
            case EVENT_CLAW_R -> {
                roarState.stop();
                clawLState.stop();
                clawRState.start(tickCount);
                clawStart = tickCount;
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
        tag.putInt("RoarCooldown", roarCooldown);
        tag.putInt("FuryCooldown", furyCooldown);
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
        roarCooldown = tag.getInt("RoarCooldown");
        furyCooldown = tag.getInt("FuryCooldown");
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
