package dev.lowpix.winterworks.oceangear;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.registry.OceanSounds;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.registries.Registries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerBossEvent;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.FluidTags;
import net.minecraft.util.Mth;
import net.minecraft.world.BossEvent;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.monster.ElderGuardian;
import net.minecraft.world.entity.monster.Guardian;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;
import org.joml.Vector3f;

/**
 * The Elder Guardian boss (docs/OCEAN_UPDATE.md section 6), run on every vanilla Elder Guardian from
 * mixin.oceangear.ElderGuardianMixin, which replaces vanilla's laser goal with {@link HoverGoal} and calls
 * {@link #tick} at the end of each server aiStep. 300 health, a boss bar, vanilla's Mining Fatigue aura kept.
 * <ul>
 * <li><b>Bubble barrage</b> ({@code bubble} clip, 1.0 s): its jaw drops, then three {@link ElderBubble}s from its mouth
 *     at 0.45 / 0.60 / 0.75 s (a fan of five per shot once enraged) that trap, drag and hurt whoever they catch.</li>
 * <li><b>Stare</b> ({@code stare} clip, 2.5 s): a 2 s telegraph (a thin line locks on and follows you, the brow lowers),
 *     then the beam: it turns after you at a limited speed and hurts everything it crosses every half second while
 *     nothing solid is in the way. Hide behind a pillar (or a Turtle Shell).</li>
 * <li><b>Tail whip</b> ({@code tail_whip} clip, 1.0 s): when you're close, a 0.4 s wind-up, then a spinning sweep that
 *     hits and throws back everything within {@link #WHIP_RADIUS} blocks.</li>
 * <li><b>The summons</b>, once at half health: a roar, spikes bristling, and {@link #SUMMONS} guardians join in; from
 *     then on it is enraged (shorter rests, wider barrages, a faster beam).</li>
 * </ul>
 * It works wherever it is: in a monument's core (vanilla restricts it to 16 blocks round where it spawned) or simply
 * spawned. With NoAI it picks no targets and doesn't move, but attacks started with {@link #start} still play out.
 */
public final class ElderBoss {
    public static final byte IDLE = 0, BUBBLE = 1, STARE = 2, TAIL_WHIP = 3, ROAR = 4;
    public static final float MAX_HEALTH = 300f, STARE_DAMAGE = 5f, WHIP_DAMAGE = 7f;
    public static final int BUBBLE_TICKS = 20, STARE_TELEGRAPH = 40, STARE_BEAM = 50, STARE_TICKS = STARE_TELEGRAPH + STARE_BEAM,
            STARE_PULSE = 10, WHIP_TICKS = 20, WHIP_FROM = 8, WHIP_TO = 15, ROAR_TICKS = 34, ROAR_SUMMON = 16, SUMMONS = 3;
    public static final int[] BUBBLE_SHOTS = {9, 12, 15};
    public static final double WHIP_RADIUS = 4.5, STARE_RANGE = 32, BEAM_RADIUS = 0.35, AGGRO_RANGE = 24, LEASH = 40;
    /** The `mouth` and `laser` locators (lowpix pixels: up, forward). */
    public static final double MOUTH_UP = 11.2 / 16, MOUTH_FWD = 15 / 16.0, LASER_UP = 21.2 / 16, LASER_FWD = 14.2 / 16;
    public static final ResourceKey<DamageType> STARE_DAMAGE_TYPE = ResourceKey.create(Registries.DAMAGE_TYPE, Winterworks.id("elder_stare"));

    private ElderBoss() {}

    /** Implemented by the mixin on ElderGuardian: the boss's state and its synced fields. */
    public interface Holder {
        State ww$boss();

        byte ww$attack();

        void ww$setAttack(byte attack);

        Vector3f ww$aim();

        void ww$setAim(Vector3f aim);

        boolean ww$enraged();

        void ww$setEnraged(boolean enraged);
    }

    /** Per boss. `summoned` and `upgraded` are saved; the rest is what it is doing right now. */
    public static final class State {
        public boolean summoned, upgraded;
        public int attackTicks, cooldown = 50;
        @Nullable
        public LivingEntity target;
        @Nullable
        ServerBossEvent bar;
        @Nullable
        Vec3 aim;
        byte last;
        final Set<Integer> whipped = new HashSet<>();
        int orbitTimer, retarget;
        float orbit;
        /** Tests and dev hooks: bubbles blown and beam pulses that hurt something. */
        public int bubblesFired, beamHits;
        // client: the clips, started when the synced attack changes
        public final AnimationState idle = new AnimationState(), swim = new AnimationState(), bubble = new AnimationState(),
                stare = new AnimationState(), whip = new AnimationState(), roar = new AnimationState();
        public int roarStart;

        @Nullable
        public ServerBossEvent bar() {
            return bar;
        }
    }

    public static State state(ElderGuardian eg) {
        return ((Holder) eg).ww$boss();
    }

    public static byte attack(ElderGuardian eg) {
        return ((Holder) eg).ww$attack();
    }

    public static boolean enraged(ElderGuardian eg) {
        return ((Holder) eg).ww$enraged();
    }

    /** The beam's aim (world), synced while it stares. */
    public static Vec3 aim(ElderGuardian eg) {
        Vector3f v = ((Holder) eg).ww$aim();
        return new Vec3(v.x, v.y, v.z);
    }

    // ------------------------------------------------------------------------------------------- locators

    /** A locator given in lowpix pixels (up, forward) in the world, turned with the body. */
    public static Vec3 locator(LivingEntity e, double up, double forward, float partial) {
        float yaw = Mth.lerp(partial, e.yBodyRotO, e.yBodyRot) * Mth.DEG_TO_RAD;
        Vec3 p = e.getPosition(partial);
        return new Vec3(p.x - Mth.sin(yaw) * forward, p.y + up, p.z + Mth.cos(yaw) * forward);
    }

    public static Vec3 mouth(LivingEntity e) {
        return locator(e, MOUTH_UP, MOUTH_FWD, 1f);
    }

    public static Vec3 laser(LivingEntity e) {
        return locator(e, LASER_UP, LASER_FWD, 1f);
    }

    static Vec3 chest(Entity e) {
        return e.position().add(0, e.getBbHeight() * 0.55, 0);
    }

    /** Where a beam from `from` along `dir` stops: the first block in the way, or {@link #STARE_RANGE}. */
    public static Vec3 beamEnd(Entity boss, Vec3 from, Vec3 dir) {
        Vec3 far = from.add(dir.normalize().scale(STARE_RANGE));
        HitResult hit = boss.level().clip(new ClipContext(from, far, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, boss));
        return hit.getType() == HitResult.Type.MISS ? far : hit.getLocation();
    }

    // ------------------------------------------------------------------------------------------- the tick

    /** Server, end of each aiStep. */
    public static void tick(ElderGuardian eg) {
        if (!(eg.level() instanceof ServerLevel level)) {
            return;
        }
        Holder h = (Holder) eg;
        State s = h.ww$boss();
        if (!s.upgraded) {   // elders from before the boss keep vanilla's 80 health in their save: give them the boss's
            AttributeInstance max = eg.getAttribute(Attributes.MAX_HEALTH);
            if (max != null && max.getBaseValue() < MAX_HEALTH) {
                max.setBaseValue(MAX_HEALTH);
                eg.setHealth(eg.getMaxHealth());
            }
            s.upgraded = true;
        }
        bossBar(eg, s, level);
        if (eg.isDeadOrDying()) {
            if (h.ww$attack() != IDLE) {
                h.ww$setAttack(IDLE);
            }
            return;
        }
        float frac = eg.getHealth() / eg.getMaxHealth();
        if (frac <= 0.5f && !h.ww$enraged()) {
            h.ww$setEnraged(true);
        }
        boolean ai = !eg.isNoAi();
        if (ai) {
            target(eg, s, level);
        }
        if (h.ww$attack() != IDLE) {
            s.attackTicks++;
            runAttack(eg, h, s, level);
            return;
        }
        if (frac <= 0.5f && !s.summoned) {   // half health: call the guardians (even a NoAI boss, so tests can see it)
            start(eg, ROAR, s.target);
            return;
        }
        if (!ai || s.target == null) {
            return;
        }
        if (--s.cooldown > 0) {
            return;
        }
        LivingEntity t = s.target;
        double d = eg.distanceTo(t);
        boolean sees = eg.hasLineOfSight(t);
        if (d < WHIP_RADIUS + 0.6) {
            start(eg, TAIL_WHIP, t);
        } else if (!sees) {
            s.cooldown = 10;   // it can't see you: swim round for a better look first
        } else if (s.last == STARE || d > STARE_RANGE - 4) {
            start(eg, BUBBLE, t);
        } else if (s.last == BUBBLE || eg.getRandom().nextFloat() < 0.55f) {
            start(eg, STARE, t);
        } else {
            start(eg, BUBBLE, t);
        }
    }

    /** Starts an attack now (also the test and dev hook). */
    public static void start(ElderGuardian eg, byte attack, @Nullable LivingEntity target) {
        Holder h = (Holder) eg;
        State s = h.ww$boss();
        s.target = target != null ? target : s.target;
        s.attackTicks = 0;
        s.whipped.clear();
        s.aim = s.target != null ? chest(s.target) : laser(eg).add(Vec3.directionFromRotation(0, eg.yBodyRot).scale(8));
        h.ww$setAim(s.aim.toVector3f());
        h.ww$setAttack(attack);
        eg.getNavigation().stop();
    }

    private static void finish(ElderGuardian eg, Holder h, State s) {
        s.last = h.ww$attack();
        h.ww$setAttack(IDLE);
        boolean rage = h.ww$enraged();
        s.cooldown = (rage ? 22 : 38) + eg.getRandom().nextInt(rage ? 18 : 26);
    }

    private static boolean valid(ElderGuardian eg, @Nullable LivingEntity t) {
        if (t == null || !t.isAlive() || t.level() != eg.level() || t.distanceToSqr(eg) > LEASH * LEASH) {
            return false;
        }
        return !(t instanceof Player p) || (!p.isCreative() && !p.isSpectator());
    }

    private static void target(ElderGuardian eg, State s, ServerLevel level) {
        LivingEntity hurtBy = eg.getLastHurtByMob();
        if (hurtBy instanceof Player && valid(eg, hurtBy) && hurtBy != s.target && eg.getRandom().nextInt(4) == 0) {
            s.target = hurtBy;
        }
        if (!valid(eg, s.target) && --s.retarget <= 0) {
            s.retarget = 10;
            s.target = null;
            double best = Double.MAX_VALUE;
            for (Player p : level.players()) {
                double d = p.distanceToSqr(eg);
                if (d < AGGRO_RANGE * AGGRO_RANGE && d < best && valid(eg, p) && (d < 144 || eg.hasLineOfSight(p))) {
                    best = d;
                    s.target = p;
                }
            }
        }
        if (!valid(eg, s.target)) {
            s.target = null;
        }
        eg.setTarget(s.target);
    }

    // ------------------------------------------------------------------------------------------- attacks

    private static void runAttack(ElderGuardian eg, Holder h, State s, ServerLevel level) {
        LivingEntity t = s.target != null && s.target.isAlive() ? s.target : null;
        int k = s.attackTicks;
        switch (h.ww$attack()) {
            case BUBBLE -> {
                if (t != null) {
                    face(eg, chest(t), 20f);
                }
                if (k == 2) {
                    level.playSound(null, eg.getX(), eg.getY(), eg.getZ(), OceanSounds.ELDER_BUBBLE, SoundSource.HOSTILE, 2.5f, 0.9f);
                }
                for (int i = 0; i < BUBBLE_SHOTS.length; i++) {
                    if (k == BUBBLE_SHOTS[i]) {
                        blow(eg, h, s, level, t, i);
                    }
                }
                if (k >= BUBBLE_TICKS) {
                    finish(eg, h, s);
                }
            }
            case STARE -> stare(eg, h, s, level, t, k);
            case TAIL_WHIP -> {
                if (t != null && k < WHIP_FROM) {
                    face(eg, chest(t), 25f);
                }
                if (k == WHIP_FROM - 2) {
                    level.playSound(null, eg.getX(), eg.getY(), eg.getZ(), OceanSounds.ELDER_TAIL_WHIP, SoundSource.HOSTILE, 2f, 1f);
                }
                if (k >= WHIP_FROM && k <= WHIP_TO) {
                    whip(eg, s, level, k);
                }
                if (k >= WHIP_TICKS) {
                    finish(eg, h, s);
                }
            }
            case ROAR -> {
                if (k == 1) {
                    level.playSound(null, eg.getX(), eg.getY(), eg.getZ(), OceanSounds.ELDER_ROAR, SoundSource.HOSTILE, 4f, 1f);
                }
                if (k % 3 == 0 && k < ROAR_SUMMON + 6) {
                    level.sendParticles(dev.lowpix.winterworks.registry.WWParticles.ELDER_BUBBLE, eg.getX(), eg.getY(0.5), eg.getZ(),
                            12, 1.4, 1.1, 1.4, 0.02);
                }
                if (k == ROAR_SUMMON && !s.summoned) {
                    summon(eg, s, level);
                }
                if (k >= ROAR_TICKS) {
                    finish(eg, h, s);
                }
            }
            default -> finish(eg, h, s);
        }
    }

    /** One shot of the barrage: a bubble straight at the target with one either side (two more when enraged). */
    private static void blow(ElderGuardian eg, Holder h, State s, ServerLevel level, @Nullable LivingEntity t, int shot) {
        Vec3 from = mouth(eg);
        Vec3 dir = t != null ? chest(t).subtract(from).normalize() : Vec3.directionFromRotation(eg.getXRot(), eg.yBodyRot);
        boolean rage = h.ww$enraged();
        float spread = (shot - 1) * 11f;   // the three shots sweep across you: left, centre, right
        List<Float> fan = new ArrayList<>(List.of(spread));
        if (rage) {
            fan.add(spread - 20f);
            fan.add(spread + 20f);
        }
        double speed = rage ? 0.5 : 0.42;
        for (float yaw : fan) {
            Vec3 v = dir.yRot(yaw * Mth.DEG_TO_RAD).scale(speed);
            ElderBubble b = new ElderBubble(level, eg, from, v, yaw == spread ? t : null);
            level.addFreshEntity(b);
            s.bubblesFired++;
        }
        level.playSound(null, from.x, from.y, from.z, OceanSounds.ELDER_BUBBLE, SoundSource.HOSTILE, 1.6f, 1.1f + shot * 0.12f);
    }

    private static void stare(ElderGuardian eg, Holder h, State s, ServerLevel level, @Nullable LivingEntity t, int k) {
        Vec3 origin = laser(eg);
        if (s.aim == null) {
            s.aim = t != null ? chest(t) : origin.add(Vec3.directionFromRotation(0, eg.yBodyRot).scale(8));
        }
        if (k == 1) {
            level.playSound(null, eg.getX(), eg.getY(), eg.getZ(), OceanSounds.ELDER_STARE_CHARGE, SoundSource.HOSTILE, 3f, 1f);
        }
        if (t != null) {
            if (k <= STARE_TELEGRAPH) {   // the lock: it follows you closely while it charges
                s.aim = s.aim.lerp(chest(t), 0.3);
            } else {   // the beam turns after you, but no faster than this
                Vec3 cur = s.aim.subtract(origin).normalize(), want = chest(t).subtract(origin).normalize();
                double max = (h.ww$enraged() ? 3.6 : 2.6) * Mth.DEG_TO_RAD;
                double ang = Math.acos(Mth.clamp(cur.dot(want), -1, 1));
                Vec3 dir = ang <= max ? want : slerp(cur, want, max / ang);
                s.aim = origin.add(dir.scale(Math.max(2, origin.distanceTo(chest(t)))));
            }
        }
        face(eg, s.aim, k <= STARE_TELEGRAPH ? 12f : 8f);
        h.ww$setAim(s.aim.toVector3f());
        if (k == STARE_TELEGRAPH + 1) {
            level.playSound(null, eg.getX(), eg.getY(), eg.getZ(), OceanSounds.ELDER_LASER, SoundSource.HOSTILE, 3f, 1f);
        }
        if (k > STARE_TELEGRAPH && (k - STARE_TELEGRAPH - 1) % STARE_PULSE == 0) {
            Vec3 end = beamEnd(eg, origin, s.aim.subtract(origin));
            DamageSource src = new DamageSource(level.registryAccess().registryOrThrow(Registries.DAMAGE_TYPE)
                    .getHolderOrThrow(STARE_DAMAGE_TYPE), eg);
            for (LivingEntity e : level.getEntitiesOfClass(LivingEntity.class, new AABB(origin, end).inflate(1.5))) {
                if (e == eg || e instanceof Guardian || (e instanceof Player p && (p.isCreative() || p.isSpectator()))) {
                    continue;
                }
                if (e.getBoundingBox().inflate(BEAM_RADIUS).clip(origin, end).isPresent() && e.hurt(src, STARE_DAMAGE)) {
                    s.beamHits++;
                }
            }
            level.sendParticles(ParticleTypes.BUBBLE_POP, end.x, end.y, end.z, 6, 0.2, 0.2, 0.2, 0.02);
        }
        if (k >= STARE_TICKS) {
            finish(eg, h, s);
        }
    }

    private static Vec3 slerp(Vec3 a, Vec3 b, double f) {
        Vec3 v = a.scale(1 - f).add(b.scale(f));
        return v.lengthSqr() < 1.0E-8 ? b : v.normalize();
    }

    private static void whip(ElderGuardian eg, State s, ServerLevel level, int k) {
        Vec3 c = eg.position().add(0, eg.getBbHeight() * 0.5, 0);
        if (k % 2 == 0) {
            float a = (k - WHIP_FROM) / (float) (WHIP_TO - WHIP_FROM) * Mth.TWO_PI;
            level.sendParticles(ParticleTypes.BUBBLE, c.x + Mth.cos(a) * 3, c.y, c.z + Mth.sin(a) * 3, 8, 0.6, 0.4, 0.6, 0.1);
        }
        for (LivingEntity e : level.getEntitiesOfClass(LivingEntity.class, eg.getBoundingBox().inflate(WHIP_RADIUS, 2.5, WHIP_RADIUS))) {
            if (e == eg || e instanceof Guardian || s.whipped.contains(e.getId()) || (e instanceof Player p && (p.isCreative() || p.isSpectator()))) {
                continue;
            }
            double dx = e.getX() - eg.getX(), dz = e.getZ() - eg.getZ();
            if (dx * dx + dz * dz > Mth.square(WHIP_RADIUS + e.getBbWidth() * 0.5)) {
                continue;
            }
            s.whipped.add(e.getId());
            if (e.hurt(eg.damageSources().mobAttack(eg), WHIP_DAMAGE)) {
                e.knockback(1.7, -dx, -dz);
                if (!TurtleShell.isRetreating(e)) {
                    e.setDeltaMovement(e.getDeltaMovement().add(0, 0.35, 0));
                }
                e.hurtMarked = true;
            }
        }
    }

    private static void summon(ElderGuardian eg, State s, ServerLevel level) {
        s.summoned = true;
        DifficultyInstance diff = level.getCurrentDifficultyAt(eg.blockPosition());
        for (int i = 0; i < SUMMONS; i++) {
            Guardian g = EntityType.GUARDIAN.create(level);
            if (g == null) {
                continue;
            }
            Vec3 at = eg.position();
            for (int tries = 0; tries < 8; tries++) {   // round it, in water if there is any
                float a = (i + tries * 0.37f) / SUMMONS * Mth.TWO_PI;
                Vec3 p = eg.position().add(Mth.cos(a) * 3.2, 0.6 + tries * 0.2, Mth.sin(a) * 3.2);
                BlockPos bp = BlockPos.containing(p);
                if (level.noCollision(g, g.getDimensions(g.getPose()).makeBoundingBox(p))
                        && (level.getFluidState(bp).is(FluidTags.WATER) || tries == 7)) {
                    at = p;
                    break;
                }
            }
            g.moveTo(at.x, at.y, at.z, eg.getRandom().nextFloat() * 360f, 0f);
            g.finalizeSpawn(level, diff, MobSpawnType.MOB_SUMMONED, null);
            if (s.target != null) {
                g.setTarget(s.target);
            }
            level.addFreshEntity(g);
            level.sendParticles(ParticleTypes.BUBBLE_COLUMN_UP, at.x, at.y + 0.5, at.z, 20, 0.4, 0.4, 0.4, 0.1);
        }
    }

    /** Turns body, head and look toward `at` (at most `step` degrees a tick). */
    static void face(ElderGuardian eg, Vec3 at, float step) {
        Vec3 eye = eg.getEyePosition();
        double dx = at.x - eye.x, dy = at.y - eye.y, dz = at.z - eye.z;
        float yaw = (float) (Mth.atan2(dz, dx) * Mth.RAD_TO_DEG) - 90f;
        float pitch = (float) -(Mth.atan2(dy, Math.sqrt(dx * dx + dz * dz)) * Mth.RAD_TO_DEG);
        float y = Mth.approachDegrees(eg.getYRot(), yaw, step);
        eg.setYRot(y);
        eg.yBodyRot = y;
        eg.yHeadRot = y;
        eg.setXRot(Mth.approachDegrees(eg.getXRot(), Mth.clamp(pitch, -50f, 50f), step));
        eg.getLookControl().setLookAt(at.x, at.y, at.z, step, step);
    }

    // ------------------------------------------------------------------------------------------- the boss bar

    private static void bossBar(ElderGuardian eg, State s, ServerLevel level) {
        if (s.bar == null) {
            s.bar = new ServerBossEvent(eg.getDisplayName(), BossEvent.BossBarColor.BLUE, BossEvent.BossBarOverlay.NOTCHED_10);
        }
        s.bar.setProgress(Mth.clamp(eg.getHealth() / eg.getMaxHealth(), 0f, 1f));
        if (eg.tickCount % 10 != 0) {
            return;
        }
        if (eg.hasCustomName()) {
            s.bar.setName(eg.getDisplayName());
        }
        for (ServerPlayer p : level.players()) {
            double d = p.distanceToSqr(eg);
            if (d < 36 * 36 && !eg.isDeadOrDying() && !s.bar.getPlayers().contains(p)) {
                s.bar.addPlayer(p);
            }
        }
        for (ServerPlayer p : new ArrayList<>(s.bar.getPlayers())) {
            if (p.level() != level || p.isRemoved() || p.distanceToSqr(eg) > 52 * 52) {
                s.bar.removePlayer(p);
            }
        }
    }

    /** The mixin calls this when a player stops tracking the boss (it left, or the boss is gone). */
    public static void untrack(ElderGuardian eg, ServerPlayer p) {
        State s = state(eg);
        if (s.bar != null) {
            s.bar.removePlayer(p);
        }
    }

    // ------------------------------------------------------------------------------------------- saving

    public static void save(State s, CompoundTag tag) {
        tag.putBoolean("WWBossSummoned", s.summoned);
        tag.putBoolean("WWBossUpgraded", s.upgraded);
    }

    public static void load(State s, CompoundTag tag) {
        s.summoned = tag.getBoolean("WWBossSummoned");
        s.upgraded = tag.getBoolean("WWBossUpgraded");
    }

    // ------------------------------------------------------------------------------------------- client

    /** Client: the synced attack changed; start its clip. */
    public static void attackSynced(ElderGuardian eg, byte attack) {
        State s = state(eg);
        int t = eg.tickCount;
        s.bubble.stop();
        s.stare.stop();
        s.whip.stop();
        s.roar.stop();
        switch (attack) {
            case BUBBLE -> s.bubble.start(t);
            case STARE -> s.stare.start(t);
            case TAIL_WHIP -> s.whip.start(t);
            case ROAR -> {
                s.roar.start(t);
                s.roarStart = t;
            }
            default -> {
            }
        }
    }

    // ------------------------------------------------------------------------------------------- movement

    /**
     * While it has a target and isn't attacking: circle the target 7-10 blocks out, at its height, inside its
     * restriction (the monument core), facing it. Blocks vanilla's stroll and look goals while it runs.
     */
    public static final class HoverGoal extends Goal {
        private final ElderGuardian eg;

        public HoverGoal(ElderGuardian eg) {
            this.eg = eg;
            setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
        }

        @Override
        public boolean canUse() {
            return state(eg).target != null && eg.isInWaterOrBubble();
        }

        @Override
        public boolean requiresUpdateEveryTick() {
            return true;
        }

        @Override
        public void tick() {
            State s = state(eg);
            LivingEntity t = s.target;
            if (t == null) {
                return;
            }
            if (attack(eg) != IDLE) {
                eg.getNavigation().stop();
                return;
            }
            eg.getLookControl().setLookAt(t, 30f, 30f);
            if (--s.orbitTimer > 0 && !eg.getNavigation().isDone()) {
                return;
            }
            s.orbitTimer = 30 + eg.getRandom().nextInt(20);
            double r = enraged(eg) ? 7 : 8.5 + eg.getRandom().nextDouble() * 1.5;
            if (eg.distanceTo(t) > 14) {
                r = 6;
            }
            float base = (float) Mth.atan2(eg.getZ() - t.getZ(), eg.getX() - t.getX());
            s.orbit = base + (eg.getRandom().nextBoolean() ? 0.6f : -0.6f);
            Vec3 want = new Vec3(t.getX() + Mth.cos(s.orbit) * r, t.getY() + 0.5 + eg.getRandom().nextDouble() * 1.5,
                    t.getZ() + Mth.sin(s.orbit) * r);
            if (eg.hasRestriction() && !eg.isWithinRestriction(BlockPos.containing(want))) {
                Vec3 c = Vec3.atCenterOf(eg.getRestrictCenter());
                want = c.add(want.subtract(c).normalize().scale(Math.max(0, eg.getRestrictRadius() - 3)));
            }
            eg.getNavigation().moveTo(want.x, want.y, want.z, 1.0);
        }
    }
}
