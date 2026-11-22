package dev.lowpix.winterworks.endboss;

import dev.lowpix.winterworks.end.Eclipse;
import dev.lowpix.winterworks.endmob.Obolisk;
import dev.lowpix.winterworks.net.CameraShakePayload;
import dev.lowpix.winterworks.registry.EndParticles;
import dev.lowpix.winterworks.registry.EndSounds;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
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
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.RelativeMovement;
import net.minecraft.world.entity.boss.EnderDragonPart;
import net.minecraft.world.entity.boss.enderdragon.EndCrystal;
import net.minecraft.world.entity.boss.enderdragon.EnderDragon;
import net.minecraft.world.entity.boss.enderdragon.phases.DragonChargePlayerPhase;
import net.minecraft.world.entity.boss.enderdragon.phases.EnderDragonPhase;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.FireBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.feature.EndPodiumFeature;
import net.minecraft.world.level.levelgen.feature.SpikeFeature;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.CollisionContext;
import org.jetbrains.annotations.Nullable;

/**
 * The harder Ender Dragon (docs/END_UPDATE.md section 10), run from mixin.endboss.EnderDragonMixin at the end of each
 * server aiStep; vanilla's fight (phases, perching, crystals healing it, the exit portal) is left as it is.
 * <ul>
 * <li><b>Dives</b> every 10-16 s: from its holding pattern it charges a player, faster than vanilla's charge, homing in
 *     for the first second and then committed (side-step it). A growl gives it away.</li>
 * <li><b>Grab and throw</b>: a dive whose jaws reach a player grabs them ({@link #GRAB_DAMAGE}), carries them along in its
 *     jaws for {@link #HOLD_TICKS} ticks (a hit on its head frees you), then hurls them away from the island's centre.</li>
 * <li><b>Second phase</b>, once, at half health: an eclipse that lasts while it lives (and a minute after), a second
 *     pair of wings (client), blinding {@link DragonLightBeam}s, a crystal regrowing every 40 s on a bare pillar top (up
 *     to 4 alive), the obsidian towers rising 10 blocks over 10 s with their crystals, and Obolisks (2, then 1 every
 *     60 s, at most 4 alive).</li>
 * </ul>
 * The pillars are the End's spikes ({@link SpikeFeature#getSpikesForLevel}); tests give their own with {@link #setPillars}.
 * A dragon with NoAI keeps its second phase's world changes (eclipse, towers, crystals) but makes no attacks.
 */
public final class DragonRework {
    public static final int DIVE_MIN = 200, DIVE_MAX = 320, DIVE_TRACK = 22, DIVE_GIVE_UP = 140, HOLD_TICKS = 50,
            TOWER_STEPS = 10, TOWER_STEP_TICKS = 20, CRYSTAL_EVERY = 800, MAX_CRYSTALS = 4, SUMMON_EVERY = 1200,
            MAX_OBOLISKS = 4, FIRST_SUMMON_DELAY = 40, BEAM_FIRST = 100, BEAM_MIN = 180, BEAM_MAX = 260, ECLIPSE_AFTER = 1200;
    public static final float GRAB_DAMAGE = 8f;
    private static final double DIVE_SPEED = 1.75, DIVE_ACCEL = 0.13, CARRY_SPEED = 1.3, TARGET_RANGE = 150, BEAM_RANGE = 96;

    private DragonRework() {}

    /** An obsidian tower: centre, radius and the height of its top as generated (the crystal stood at height + 1). */
    public record Pillar(int x, int z, int radius, int height) {}

    /** Per dragon (saved with it). */
    public static final class State {
        public boolean phaseTwo;
        public int towerSteps, towerTimer, crystalTimer, summonTimer, beamTimer, diveTimer = 240;
        boolean firstSummon;
        final List<UUID> obolisks = new ArrayList<>();
        @Nullable
        List<Pillar> pillars;
        /** Test and dev hooks: how many times the rework asked for an Obolisk (whether or not one came). */
        public int summonCalls;
        // not saved: what it is doing right now
        @Nullable
        UUID diveTarget;
        int diveTicks;
        @Nullable
        Vec3 diveAim;
        @Nullable
        LivingEntity held;
        int holdTicks;
        int beamTicks;
        @Nullable
        Vec3 beamAim;

        @Nullable
        public LivingEntity held() {
            return held;
        }
    }

    public static State state(EnderDragon d) {
        return ((DragonRage) d).ww$rework();
    }

    public static boolean phaseTwo(EnderDragon d) {
        return ((DragonRage) d).ww$phaseTwo();
    }

    /** Tests: use these towers instead of the End's spikes. */
    public static void setPillars(EnderDragon d, List<Pillar> pillars) {
        state(d).pillars = new ArrayList<>(pillars);
    }

    public static List<Pillar> pillars(ServerLevel sl, State s) {
        if (s.pillars != null) {
            return s.pillars;
        }
        List<Pillar> out = new ArrayList<>();
        for (SpikeFeature.EndSpike spike : SpikeFeature.getSpikesForLevel(sl)) {
            out.add(new Pillar(spike.getCenterX(), spike.getCenterZ(), spike.getRadius(), spike.getHeight()));
        }
        return out;
    }

    // ------------------------------------------------------------------------------------------------ the tick

    public static void tick(EnderDragon d) {
        if (!(d.level() instanceof ServerLevel sl)) {
            return;
        }
        State s = state(d);
        EnderDragonPhase<?> phase = d.getPhaseManager().getCurrentPhase().getPhase();
        if (d.isDeadOrDying() || phase == EnderDragonPhase.DYING || d.isRemoved()) {
            release(s, null);
            s.diveTarget = null;
            return;
        }
        if (!s.phaseTwo && d.getHealth() <= d.getMaxHealth() * 0.5f) {
            beginPhaseTwo(sl, d, s);
        }
        if (s.phaseTwo) {
            if (!((DragonRage) d).ww$phaseTwo()) {
                ((DragonRage) d).ww$setPhaseTwo(true);   // loaded from a save
            }
            Eclipse.start(sl, ECLIPSE_AFTER);   // on while it lives; it ends a minute after
            tickTowers(sl, d, s);
            tickCrystals(sl, d, s);
        }
        if (d.isNoAi()) {
            release(s, null);
            return;
        }
        tickHeld(sl, d, s);
        tickDive(sl, d, s, phase);
        if (s.phaseTwo) {
            tickBeams(sl, d, s, phase);
            tickSummons(sl, d, s);
        }
    }

    static boolean valid(@Nullable Entity e) {
        return e instanceof LivingEntity le && le.isAlive() && !le.isSpectator() && le.canBeSeenAsEnemy();
    }

    @Nullable
    private static Player nearestTarget(ServerLevel sl, EnderDragon d, double range) {
        Player best = null;
        double bd = range * range;
        for (ServerPlayer p : sl.players()) {
            double dist = p.distanceToSqr(d);
            if (valid(p) && dist < bd) {
                bd = dist;
                best = p;
            }
        }
        return best;
    }

    private static Vec3 forward(EnderDragon d) {
        float yaw = d.getYRot() * Mth.DEG_TO_RAD;
        return new Vec3(Mth.sin(yaw), 0, -Mth.cos(yaw));
    }

    /** Turns the dragon to face `at` (its head leads along sin(yaw), -cos(yaw)). */
    private static void face(EnderDragon d, Vec3 at) {
        double dx = at.x - d.getX(), dz = at.z - d.getZ();
        if (dx * dx + dz * dz < 1.0E-4) {
            return;
        }
        float want = (float) (Mth.atan2(dx, -dz) * Mth.RAD_TO_DEG);
        float diff = Mth.wrapDegrees(want - d.getYRot());
        d.setYRot(d.getYRot() + Mth.clamp(diff, -8f, 8f));
        d.yRotA = 0f;
    }

    private static Vec3 jaws(EnderDragon d) {
        EnderDragonPart head = d.head;
        return new Vec3(head.getX(), head.getY(), head.getZ());
    }

    // ------------------------------------------------------------------------------------------------ dives and the grab

    private static void tickDive(ServerLevel sl, EnderDragon d, State s, EnderDragonPhase<?> phase) {
        RandomSource r = d.getRandom();
        if (s.diveTarget != null) {
            Player t = sl.getPlayerByUUID(s.diveTarget);
            if (phase != EnderDragonPhase.CHARGING_PLAYER || !valid(t) || ++s.diveTicks > DIVE_GIVE_UP || s.held != null) {
                s.diveTarget = null;
                return;
            }
            if (s.diveTicks <= DIVE_TRACK || s.diveAim == null) {   // it homes in, then commits
                s.diveAim = t.position().add(0, 0.6, 0);
                d.getPhaseManager().getPhase(EnderDragonPhase.CHARGING_PLAYER).setTarget(s.diveAim);
            }
            Vec3 to = s.diveAim.subtract(d.position());
            if (to.lengthSqr() > 1) {
                Vec3 v = d.getDeltaMovement().add(to.normalize().scale(DIVE_ACCEL));
                if (v.length() > DIVE_SPEED) {
                    v = v.normalize().scale(DIVE_SPEED);
                }
                d.setDeltaMovement(v);
            }
            AABB jaws = d.head.getBoundingBox().inflate(1.3);
            for (ServerPlayer p : sl.players()) {
                if (valid(p) && jaws.intersects(p.getBoundingBox())) {
                    grab(sl, d, s, p);
                    return;
                }
            }
            return;
        }
        if (s.held != null || s.beamTicks > 0) {
            return;
        }
        if (--s.diveTimer > 0) {
            return;
        }
        if (phase != EnderDragonPhase.HOLDING_PATTERN && phase != EnderDragonPhase.STRAFE_PLAYER) {
            s.diveTimer = 20;
            return;
        }
        Player t = nearestTarget(sl, d, TARGET_RANGE);
        if (t == null) {
            s.diveTimer = 40;
            return;
        }
        s.diveTimer = DIVE_MIN + r.nextInt(DIVE_MAX - DIVE_MIN + 1);
        dive(d, s, t);
    }

    /** Sends it diving at `target` now (tests and the screenshot harness use it too). */
    public static void dive(EnderDragon d, State s, LivingEntity target) {
        d.getPhaseManager().setPhase(EnderDragonPhase.CHARGING_PLAYER);
        DragonChargePlayerPhase charge = d.getPhaseManager().getPhase(EnderDragonPhase.CHARGING_PLAYER);
        s.diveAim = target.position().add(0, 0.6, 0);
        charge.setTarget(s.diveAim);
        s.diveTarget = target.getUUID();
        s.diveTicks = 0;
        d.level().playSound(null, d.getX(), d.getY(), d.getZ(), SoundEvents.ENDER_DRAGON_GROWL, SoundSource.HOSTILE, 6f, 1.25f);
    }

    /** Its jaws close on `p`: 8 damage, then it carries them on, level, the way it was flying. */
    public static void grab(ServerLevel sl, EnderDragon d, State s, LivingEntity p) {
        p.hurt(d.damageSources().mobAttack(d), GRAB_DAMAGE);
        s.held = p;
        s.holdTicks = 0;
        s.diveTarget = null;
        sl.playSound(null, p.getX(), p.getY(), p.getZ(), EndSounds.DRAGON_GRAB, SoundSource.HOSTILE, 3f, 1f);
        Vec3 fwd = forward(d);
        d.getPhaseManager().setPhase(EnderDragonPhase.HOLDING_PATTERN);   // restart the charge, now towards open sky
        d.getPhaseManager().setPhase(EnderDragonPhase.CHARGING_PLAYER);
        d.getPhaseManager().getPhase(EnderDragonPhase.CHARGING_PLAYER).setTarget(d.position().add(fwd.scale(90)));
    }

    private static void tickHeld(ServerLevel sl, EnderDragon d, State s) {
        LivingEntity p = s.held;
        if (p == null) {
            return;
        }
        if (!p.isAlive() || p.isRemoved() || p.level() != sl || p.isSpectator()) {
            release(s, null);
            return;
        }
        if (++s.holdTicks >= HOLD_TICKS) {
            hurl(sl, d, s);
            return;
        }
        // level flight while it carries you
        Vec3 v = d.getDeltaMovement();
        Vec3 fwd = forward(d);
        v = new Vec3(v.x, v.y * 0.4, v.z).add(fwd.scale(0.08));
        double h = Math.sqrt(v.x * v.x + v.z * v.z);
        if (h > CARRY_SPEED) {
            v = new Vec3(v.x / h * CARRY_SPEED, v.y, v.z / h * CARRY_SPEED);
        }
        d.setDeltaMovement(v);
        Vec3 at = jaws(d).add(0, -1.7, 0).add(fwd.scale(0.4));
        if (!sl.noCollision(p, p.getDimensions(p.getPose()).makeBoundingBox(at))) {
            return;   // inside a pillar: wait where you are until the jaws are clear again
        }
        p.resetFallDistance();
        p.setDeltaMovement(Vec3.ZERO);
        if (p instanceof ServerPlayer sp) {
            sp.connection.teleport(at.x, at.y, at.z, 0f, 0f, EnumSet.of(RelativeMovement.X_ROT, RelativeMovement.Y_ROT));
        } else {
            p.teleportTo(at.x, at.y, at.z);
        }
        if (s.holdTicks % 10 == 0) {
            sl.sendParticles(ParticleTypes.DRAGON_BREATH, at.x, at.y + 1, at.z, 4, 0.3, 0.3, 0.3, 0.01);
        }
    }

    /** Hurls the held one away from the island's centre. */
    private static void hurl(ServerLevel sl, EnderDragon d, State s) {
        LivingEntity p = s.held;
        if (p == null) {
            return;
        }
        BlockPos podium = EndPodiumFeature.getLocation(d.getFightOrigin());
        Vec3 away = new Vec3(p.getX() - (podium.getX() + 0.5), 0, p.getZ() - (podium.getZ() + 0.5));
        if (away.lengthSqr() < 9) {
            away = forward(d);
        }
        away = away.normalize();
        release(s, new Vec3(away.x * 1.5, 0.7, away.z * 1.5));
        sl.playSound(null, p.getX(), p.getY(), p.getZ(), EndSounds.DRAGON_THROW, SoundSource.HOSTILE, 3f, 1f);
        sl.sendParticles(ParticleTypes.DRAGON_BREATH, p.getX(), p.getY() + 1, p.getZ(), 20, 0.5, 0.5, 0.5, 0.05);
    }

    /** Lets go (thrown with `velocity`, or just dropped). */
    static void release(State s, @Nullable Vec3 velocity) {
        LivingEntity p = s.held;
        s.held = null;
        s.holdTicks = 0;
        if (p == null || !p.isAlive()) {
            return;
        }
        p.setDeltaMovement(velocity != null ? velocity : new Vec3(0, 0.1, 0));
        p.hurtMarked = true;
        p.hasImpulse = true;
        p.resetFallDistance();
    }

    /** From the mixin: a hit on its head frees whoever it holds. */
    public static void onPartHurt(EnderDragon d, EnderDragonPart part, DamageSource source) {
        if (d.level().isClientSide || part != d.head) {
            return;
        }
        State s = state(d);
        if (s.held != null && source.getEntity() instanceof Player) {
            LivingEntity p = s.held;
            release(s, forward(d).scale(-0.3).add(0, 0.2, 0));
            d.level().playSound(null, p.getX(), p.getY(), p.getZ(), SoundEvents.ENDER_DRAGON_HURT, SoundSource.HOSTILE, 4f, 1.3f);
        }
    }

    /** From the mixin: what it holds isn't hurt or knocked back by touching it. */
    public static void filterContact(EnderDragon d, List<Entity> touched) {
        State s = state(d);
        if (s.held != null) {
            touched.remove(s.held);
        }
    }

    // ------------------------------------------------------------------------------------------------ the second phase

    public static void beginPhaseTwo(ServerLevel sl, EnderDragon d, State s) {
        s.phaseTwo = true;
        ((DragonRage) d).ww$setPhaseTwo(true);
        s.towerSteps = 0;
        s.towerTimer = 0;
        s.crystalTimer = CRYSTAL_EVERY;
        s.summonTimer = FIRST_SUMMON_DELAY;
        s.firstSummon = true;
        s.beamTimer = BEAM_FIRST;
        Eclipse.start(sl, ECLIPSE_AFTER);
        sl.playSound(null, d.getX(), d.getY(), d.getZ(), SoundEvents.ENDER_DRAGON_GROWL, SoundSource.HOSTILE, 12f, 0.7f);
        sl.playSound(null, d.getX(), d.getY(), d.getZ(), EndSounds.DRAGON_TOWER_GROW, SoundSource.HOSTILE, 8f, 0.8f);
        sl.sendParticles(ParticleTypes.DRAGON_BREATH, d.getX(), d.getY() + 2, d.getZ(), 120, 4, 2, 4, 0.08);
        sl.sendParticles(EndParticles.ECLIPSE_MOTE, d.getX(), d.getY() + 2, d.getZ(), 60, 6, 3, 6, 0.1);
        shake(sl, d.position(), 200, 1.5f, 40);
    }

    private static void tickTowers(ServerLevel sl, EnderDragon d, State s) {
        if (s.towerSteps >= TOWER_STEPS || ++s.towerTimer < TOWER_STEP_TICKS) {
            return;
        }
        s.towerTimer = 0;
        for (Pillar p : pillars(sl, s)) {
            growPillar(sl, p, p.height() + s.towerSteps);
        }
        s.towerSteps++;
    }

    /** Raises a tower one block: its cap (bedrock, fire, cage) and everything standing on it move up one, obsidian fills under. */
    static void growPillar(ServerLevel sl, Pillar p, int top) {
        BlockPos below = new BlockPos(p.x(), top - 1, p.z());
        if (!sl.isLoaded(below) || !sl.getBlockState(below).is(Blocks.OBSIDIAN)) {
            return;   // broken (or not loaded): it stays as it is
        }
        int r = p.radius(), cap = Math.max(r, 2) + 1;
        BlockPos.MutableBlockPos m = new BlockPos.MutableBlockPos();
        for (int y = top + 5; y >= top; y--) {
            for (int x = p.x() - cap; x <= p.x() + cap; x++) {
                for (int z = p.z() - cap; z <= p.z() + cap; z++) {
                    BlockState st = sl.getBlockState(m.set(x, y, z));
                    BlockState above = sl.getBlockState(m.set(x, y + 1, z));
                    if (st != above) {
                        sl.setBlock(m.set(x, y + 1, z), st, 2 | 16);
                    }
                }
            }
        }
        for (int x = p.x() - cap; x <= p.x() + cap; x++) {
            for (int z = p.z() - cap; z <= p.z() + cap; z++) {
                m.set(x, top, z);
                boolean inside = m.distToLowCornerSqr(p.x(), top, p.z()) <= r * r + 1;
                sl.setBlock(m, inside ? Blocks.OBSIDIAN.defaultBlockState() : Blocks.AIR.defaultBlockState(), 2 | 16);
            }
        }
        AABB riders = new AABB(p.x() - cap, top - 0.2, p.z() - cap, p.x() + cap + 1, top + 7, p.z() + cap + 1);
        for (Entity e : sl.getEntities((Entity) null, riders, e -> !(e instanceof EnderDragonPart) && !(e instanceof EnderDragon))) {
            if (e instanceof ServerPlayer sp) {
                sp.connection.teleport(sp.getX(), sp.getY() + 1, sp.getZ(), 0f, 0f, EnumSet.of(RelativeMovement.X_ROT, RelativeMovement.Y_ROT));
            } else {
                e.setPos(e.getX(), e.getY() + 1, e.getZ());
            }
        }
        Vec3 c = new Vec3(p.x() + 0.5, top, p.z() + 0.5);
        sl.playSound(null, c.x, c.y, c.z, EndSounds.DRAGON_TOWER_GROW, SoundSource.HOSTILE, 4f, 0.9f + sl.getRandom().nextFloat() * 0.2f);
        BlockParticleOption dust = new BlockParticleOption(ParticleTypes.BLOCK, Blocks.OBSIDIAN.defaultBlockState());
        sl.sendParticles(dust, c.x, c.y - 0.5, c.z, 40, r + 0.5, 0.3, r + 0.5, 0.15);
        sl.sendParticles(ParticleTypes.REVERSE_PORTAL, c.x, c.y + 1, c.z, 20, r, 0.5, r, 0.05);
        shake(sl, c, 32, 0.6f, 12);
    }

    private static AABB column(ServerLevel sl, Pillar p) {
        int c = Math.max(p.radius(), 2) + 1;
        return new AABB(p.x() - c, sl.getMinBuildHeight(), p.z() - c, p.x() + c + 1, sl.getMaxBuildHeight(), p.z() + c + 1);
    }

    /** Crystals on the towers now. */
    public static int crystalsAlive(ServerLevel sl, State s) {
        int n = 0;
        for (Pillar p : pillars(sl, s)) {
            n += sl.getEntitiesOfClass(EndCrystal.class, column(sl, p), Entity::isAlive).size();
        }
        return n;
    }

    private static void tickCrystals(ServerLevel sl, EnderDragon d, State s) {
        if (--s.crystalTimer > 0) {
            return;
        }
        s.crystalTimer = CRYSTAL_EVERY;
        if (crystalsAlive(sl, s) < MAX_CRYSTALS) {
            regrowCrystal(sl, d, s);
        }
    }

    /** A new crystal on a bare tower top (with its bedrock and fire). */
    public static boolean regrowCrystal(ServerLevel sl, EnderDragon d, State s) {
        List<Pillar> bare = new ArrayList<>();
        for (Pillar p : pillars(sl, s)) {
            int top = p.height() + s.towerSteps;
            BlockPos under = new BlockPos(p.x(), top - 1, p.z());
            if (sl.isLoaded(under) && sl.getBlockState(under).is(Blocks.OBSIDIAN)
                    && sl.getEntitiesOfClass(EndCrystal.class, column(sl, p), Entity::isAlive).isEmpty()) {
                bare.add(p);
            }
        }
        if (bare.isEmpty()) {
            return false;
        }
        Pillar p = bare.get(sl.getRandom().nextInt(bare.size()));
        int top = p.height() + s.towerSteps;
        BlockPos base = new BlockPos(p.x(), top, p.z());
        sl.setBlockAndUpdate(base, Blocks.BEDROCK.defaultBlockState());
        sl.setBlockAndUpdate(base.above(), FireBlock.getState(sl, base.above()));
        EndCrystal crystal = EntityType.END_CRYSTAL.create(sl);
        if (crystal == null) {
            return false;
        }
        crystal.moveTo(p.x() + 0.5, top + 1, p.z() + 0.5, sl.getRandom().nextFloat() * 360f, 0f);
        sl.addFreshEntity(crystal);
        sl.playSound(null, crystal.getX(), crystal.getY(), crystal.getZ(), EndSounds.DRAGON_CRYSTAL_REGROW, SoundSource.HOSTILE, 6f, 1f);
        sl.sendParticles(ParticleTypes.END_ROD, crystal.getX(), crystal.getY() + 1, crystal.getZ(), 40, 0.4, 1.2, 0.4, 0.08);
        sl.sendParticles(EndParticles.ECLIPSE_MOTE, crystal.getX(), crystal.getY() + 1, crystal.getZ(), 20, 1, 1, 1, 0.05);
        return true;
    }

    // ------------------------------------------------------------------------------------------------ beams and Obolisks

    private static void tickBeams(ServerLevel sl, EnderDragon d, State s, EnderDragonPhase<?> phase) {
        if (s.beamTicks > 0) {
            if (s.beamAim != null) {
                face(d, s.beamAim);
            }
            if (--s.beamTicks == 0 && d.getPhaseManager().getCurrentPhase().getPhase() == EnderDragonPhase.HOVERING) {
                d.getPhaseManager().setPhase(EnderDragonPhase.HOLDING_PATTERN);
            }
            return;
        }
        if (s.held != null || s.diveTarget != null || --s.beamTimer > 0) {
            return;
        }
        if (phase != EnderDragonPhase.HOLDING_PATTERN && phase != EnderDragonPhase.STRAFE_PLAYER) {
            s.beamTimer = 20;
            return;
        }
        Vec3 from = jaws(d);
        Player target = null;
        double best = BEAM_RANGE * BEAM_RANGE;
        for (ServerPlayer p : sl.players()) {
            double dist = p.distanceToSqr(from);
            if (valid(p) && dist < best && sl.clip(new ClipContext(from, p.getEyePosition(), ClipContext.Block.COLLIDER,
                    ClipContext.Fluid.NONE, CollisionContext.empty())).getType() == HitResult.Type.MISS) {
                best = dist;
                target = p;
            }
        }
        if (target == null) {
            s.beamTimer = 30;
            return;
        }
        s.beamTimer = BEAM_MIN + d.getRandom().nextInt(BEAM_MAX - BEAM_MIN + 1);
        beam(sl, d, s, target.position().add(0, 0.5, 0));
    }

    /** It hovers and fires a light beam at `at` (tests and the screenshot harness use it too). */
    public static DragonLightBeam beam(ServerLevel sl, EnderDragon d, State s, Vec3 at) {
        if (!d.isNoAi()) {
            d.getPhaseManager().setPhase(EnderDragonPhase.HOVERING);
        }
        s.beamAim = at;
        s.beamTicks = DragonLightBeam.WARNING + DragonLightBeam.FIRING + 8;
        return DragonLightBeam.fire(sl, jaws(d).add(0, -0.3, 0), at, d);
    }

    private static void tickSummons(ServerLevel sl, EnderDragon d, State s) {
        if (--s.summonTimer > 0) {
            return;
        }
        s.summonTimer = SUMMON_EVERY;
        s.obolisks.removeIf(id -> {
            Entity e = sl.getEntity(id);
            return e == null || !e.isAlive();
        });
        int n = Math.min(s.firstSummon ? 2 : 1, MAX_OBOLISKS - s.obolisks.size());
        s.firstSummon = false;
        for (int i = 0; i < n; i++) {
            Player t = nearestTarget(sl, d, TARGET_RANGE);
            if (t == null) {
                return;
            }
            BlockPos at = groundNear(sl, t.blockPosition(), d.getRandom());
            if (at == null) {
                continue;
            }
            s.summonCalls++;
            Obolisk o = Obolisk.spawnAwake(sl, at, t);
            sl.sendParticles(ParticleTypes.REVERSE_PORTAL, at.getX() + 0.5, at.getY() + 1, at.getZ() + 0.5, 60, 0.8, 1.5, 0.8, 0.1);
            sl.playSound(null, at, EndSounds.MONOLITH_SUMMON, SoundSource.HOSTILE, 3f, 1.2f);
            if (o != null) {
                s.obolisks.add(o.getUUID());
            }
        }
    }

    /** Solid ground 7-14 blocks from `near`, not over the void. */
    @Nullable
    private static BlockPos groundNear(ServerLevel sl, BlockPos near, RandomSource r) {
        for (int i = 0; i < 12; i++) {
            double a = r.nextDouble() * Math.PI * 2, dist = 7 + r.nextDouble() * 7;
            int x = Mth.floor(near.getX() + Math.cos(a) * dist), z = Mth.floor(near.getZ() + Math.sin(a) * dist);
            if (!sl.isLoaded(new BlockPos(x, near.getY(), z))) {
                continue;
            }
            BlockPos top = sl.getHeightmapPos(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, new BlockPos(x, 0, z));
            if (top.getY() <= sl.getMinBuildHeight() + 8 || Math.abs(top.getY() - near.getY()) > 12) {
                continue;
            }
            if (sl.getBlockState(top.below()).isFaceSturdy(sl, top.below(), Direction.UP)) {
                return top;
            }
        }
        return null;
    }

    static void shake(ServerLevel sl, Vec3 at, double radius, float strength, int ticks) {
        for (ServerPlayer p : sl.players()) {
            double d = p.position().distanceTo(at);
            if (d < radius && ServerPlayNetworking.canSend(p, CameraShakePayload.TYPE)) {
                ServerPlayNetworking.send(p, new CameraShakePayload(strength * (float) (1 - d / radius * 0.6), ticks));
            }
        }
    }

    // ------------------------------------------------------------------------------------------------ saving

    public static void save(State s, CompoundTag dragonTag) {
        CompoundTag t = new CompoundTag();
        t.putBoolean("PhaseTwo", s.phaseTwo);
        t.putInt("Towers", s.towerSteps);
        t.putInt("TowerTimer", s.towerTimer);
        t.putInt("CrystalTimer", s.crystalTimer);
        t.putInt("SummonTimer", s.summonTimer);
        t.putInt("BeamTimer", s.beamTimer);
        t.putInt("DiveTimer", s.diveTimer);
        t.putBoolean("FirstSummon", s.firstSummon);
        ListTag ids = new ListTag();
        for (UUID id : s.obolisks) {
            ids.add(NbtUtils.createUUID(id));
        }
        t.put("Obolisks", ids);
        if (s.pillars != null) {
            ListTag ps = new ListTag();
            for (Pillar p : s.pillars) {
                CompoundTag pt = new CompoundTag();
                pt.putInt("X", p.x());
                pt.putInt("Z", p.z());
                pt.putInt("R", p.radius());
                pt.putInt("H", p.height());
                ps.add(pt);
            }
            t.put("Pillars", ps);
        }
        dragonTag.put("WinterworksRework", t);
    }

    public static void load(State s, CompoundTag dragonTag) {
        if (!dragonTag.contains("WinterworksRework", Tag.TAG_COMPOUND)) {
            return;
        }
        CompoundTag t = dragonTag.getCompound("WinterworksRework");
        s.phaseTwo = t.getBoolean("PhaseTwo");
        s.towerSteps = t.getInt("Towers");
        s.towerTimer = t.getInt("TowerTimer");
        s.crystalTimer = t.getInt("CrystalTimer");
        s.summonTimer = t.getInt("SummonTimer");
        s.beamTimer = t.getInt("BeamTimer");
        s.diveTimer = t.getInt("DiveTimer");
        s.firstSummon = t.getBoolean("FirstSummon");
        s.obolisks.clear();
        for (Tag id : t.getList("Obolisks", Tag.TAG_INT_ARRAY)) {
            s.obolisks.add(NbtUtils.loadUUID(id));
        }
        if (t.contains("Pillars", Tag.TAG_LIST)) {
            List<Pillar> ps = new ArrayList<>();
            for (Tag e : t.getList("Pillars", Tag.TAG_COMPOUND)) {
                CompoundTag pt = (CompoundTag) e;
                ps.add(new Pillar(pt.getInt("X"), pt.getInt("Z"), pt.getInt("R"), pt.getInt("H")));
            }
            s.pillars = ps;
        }
    }
}
