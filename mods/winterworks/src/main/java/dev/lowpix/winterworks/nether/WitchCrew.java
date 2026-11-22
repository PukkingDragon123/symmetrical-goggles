package dev.lowpix.winterworks.nether;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.mixin.HoglinAccessor;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.WeakHashMap;
import net.fabricmc.fabric.api.attachment.v1.AttachmentRegistry;
import net.fabricmc.fabric.api.attachment.v1.AttachmentType;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerEntityEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.core.GlobalPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySelector;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.ai.Brain;
import net.minecraft.world.entity.ai.behavior.BlockPosTracker;
import net.minecraft.world.entity.ai.memory.MemoryModuleType;
import net.minecraft.world.entity.ai.memory.WalkTarget;
import net.minecraft.world.entity.monster.hoglin.Hoglin;
import net.minecraft.world.entity.monster.piglin.AbstractPiglin;
import net.minecraft.world.entity.monster.piglin.Piglin;
import net.minecraft.world.entity.monster.piglin.PiglinAi;
import net.minecraft.world.entity.monster.piglin.PiglinBrute;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.phys.AABB;
import org.jetbrains.annotations.Nullable;

/**
 * The Piglin Witch's crew (docs/FIXES_0_4.md "The witch's crew"): the piglins, brutes, pen beasts and golden
 * experiments a Hex Fortress is built with (and the brutes she summons) carry the {@link #CREW} attachment (and the
 * scoreboard tag {@link #TAG}): their fortress, its rotation and their job.
 * <ul>
 * <li>They are on her side: when she or any of them is hurt by an outsider, every piglin and brute of the crew nearby
 * gets angry at the attacker (brain ANGRY_AT, as vanilla piglins do for each other), and she joins the fight
 * (PiglinWitch#provoke). Nothing of the crew hurts her or each other (her splash potions, a stray crossbow bolt).</li>
 * <li>They do jobs: brutes keep to their posts (brain HOME: the gate, her quarters; vanilla brutes stroll round their
 * home); piglins wander from job to job, the wart farm, the storeroom and the brewing room
 * (HexFortressPiece#jobs), and potter about there. Penned hoglins can't be hunted.</li>
 * <li>Crew brutes keep the gold rules like piglins (mixin.PiglinBruteAiMixin): a player in gold armour may walk in,
 * and trade with the witch.</li>
 * </ul>
 */
public final class WitchCrew {
    public static final int WORKER = 0, GATE_GUARD = 1, QUARTERS_GUARD = 2, WITCH = 3, EXPERIMENT = 4, PEN = 5;
    public static final String TAG = "winterworks.crew";
    /** How far the crew rallies to one of its own. */
    public static final double RALLY_RADIUS = 32.0;
    private static final long ANGER_TICKS = 600L;

    /** A member's fortress (its origin, the courtyard floor), the fortress's rotation and the member's job. */
    public record Crew(BlockPos fortress, int rotation, int role) {
        public static final Codec<Crew> CODEC = RecordCodecBuilder.create(i -> i.group(
                BlockPos.CODEC.fieldOf("fortress").forGetter(Crew::fortress),
                Codec.INT.fieldOf("rotation").forGetter(Crew::rotation),
                Codec.INT.fieldOf("role").forGetter(Crew::role)).apply(i, Crew::new));

        public Rotation rot() {
            return Rotation.values()[Math.floorMod(rotation, 4)];
        }
    }

    /** Saved, and kept when a member converts (a piglin gilding into a Golden Piglin stays crew). */
    public static final AttachmentType<Crew> CREW = AttachmentRegistry.<Crew>builder().persistent(Crew.CODEC).copyOnDeath()
            .buildAndRegister(Winterworks.id("crew"));

    private static final Set<Mob> MEMBERS = Collections.newSetFromMap(new WeakHashMap<>());
    /** A worker's next job: when it sets off, and which. */
    private static final Map<Mob, long[]> JOBS = new WeakHashMap<>();

    private WitchCrew() {}

    static void init() {
        ServerEntityEvents.ENTITY_LOAD.register((entity, level) -> {
            if (entity instanceof Mob m && m.hasAttached(CREW)) {
                MEMBERS.add(m);
            }
        });
        ServerLivingEntityEvents.ALLOW_DAMAGE.register(WitchCrew::allowDamage);
        ServerLivingEntityEvents.AFTER_DAMAGE.register((entity, source, base, taken, blocked) -> {
            if (taken > 0f || blocked) {
                defend(entity, source);
            }
        });
        ServerTickEvents.END_WORLD_TICK.register(WitchCrew::tick);
        ServerLifecycleEvents.SERVER_STOPPED.register(server -> {
            MEMBERS.clear();
            JOBS.clear();
        });
    }

    // ------------------------------------------------------------------------------------------------ membership

    /** Signs a mob up: its fortress, rotation and job. Brutes get their post as their brain's HOME. */
    public static void enlist(Mob mob, BlockPos fortress, Rotation rotation, int role) {
        mob.setAttached(CREW, new Crew(fortress.immutable(), rotation.ordinal(), role));
        mob.addTag(TAG);
        mob.setPersistenceRequired();
        if (mob instanceof PiglinBrute brute && mob.level() != null) {
            brute.getBrain().setMemory(MemoryModuleType.HOME, GlobalPos.of(mob.level().dimension(), mob.blockPosition()));
        }
        if (mob instanceof Hoglin h) {
            ((HoglinAccessor) h).winterworks$setCannotBeHunted(true);
        }
        if (mob instanceof AbstractPiglin p) {
            p.setImmuneToZombification(p.isImmuneToZombification() || mob instanceof GoldenPiglin);
        }
        MEMBERS.add(mob);
    }

    public static Optional<Crew> crew(@Nullable Entity e) {
        return e == null ? Optional.empty() : Optional.ofNullable(e.getAttached(CREW));
    }

    public static boolean isCrew(@Nullable Entity e) {
        return e != null && e.hasAttached(CREW);
    }

    /** Both of the same fortress's crew (the witch counts). */
    public static boolean sameCrew(@Nullable Entity a, @Nullable Entity b) {
        Crew ca = a == null ? null : a.getAttached(CREW), cb = b == null ? null : b.getAttached(CREW);
        return ca != null && cb != null && ca.fortress().equals(cb.fortress());
    }

    // ------------------------------------------------------------------------------------------------ the alliance

    /** No friendly fire inside a crew: her potions, their crossbow bolts, the pen bulls' horns. */
    private static boolean allowDamage(LivingEntity victim, DamageSource source, float amount) {
        Entity attacker = source.getEntity();
        return attacker == null || attacker == victim || !sameCrew(attacker, victim);
    }

    /** Someone hurt the witch or one of her crew: the crew nearby turn on them, and so does she. */
    private static void defend(LivingEntity victim, DamageSource source) {
        if (!(source.getEntity() instanceof LivingEntity attacker) || !(victim.level() instanceof ServerLevel level)) {
            return;
        }
        Crew crew = victim.getAttached(CREW);
        if (crew == null || attacker == victim || sameCrew(attacker, victim) || !attacker.isAlive()
                || !EntitySelector.NO_CREATIVE_OR_SPECTATOR.test(attacker)) {
            return;
        }
        rally(level, crew, victim, attacker);
    }

    /** Every piglin and brute of the crew within {@link #RALLY_RADIUS} of `at` gets angry at `foe`; the witch fights. */
    public static void rally(ServerLevel level, Crew crew, LivingEntity at, LivingEntity foe) {
        AABB box = at.getBoundingBox().inflate(RALLY_RADIUS, 12, RALLY_RADIUS);
        for (Mob m : level.getEntitiesOfClass(Mob.class, box, m -> m.isAlive() && sameFortress(m, crew))) {
            if (m instanceof PiglinWitch witch) {
                witch.provoke(foe);
            } else if (m instanceof AbstractPiglin p && !(m instanceof GoldenPiglin)) {
                anger(p, foe);
            }
        }
    }

    private static boolean sameFortress(Mob m, Crew crew) {
        Crew c = m.getAttached(CREW);
        return c != null && c.fortress().equals(crew.fortress());
    }

    /** Makes a piglin or brute angry at `foe`, the way vanilla piglins tell each other (PiglinAi.setAngerTarget). */
    public static void anger(AbstractPiglin p, LivingEntity foe) {
        if (foe == p || !foe.isAlive()) {
            return;
        }
        Brain<?> brain = p.getBrain();
        brain.eraseMemory(MemoryModuleType.CANT_REACH_WALK_TARGET_SINCE);
        brain.eraseMemory(MemoryModuleType.ADMIRING_ITEM);
        brain.eraseMemory(MemoryModuleType.CELEBRATE_LOCATION);
        brain.eraseMemory(MemoryModuleType.DANCING);
        brain.eraseMemory(MemoryModuleType.AVOID_TARGET);
        brain.setMemoryWithExpiry(MemoryModuleType.ANGRY_AT, foe.getUUID(), ANGER_TICKS);
        if (p.closerThan(foe, 24.0)) {
            brain.setMemory(MemoryModuleType.ATTACK_TARGET, foe);
        }
    }

    /**
     * Do crew brutes leave this player be? Gold armour, like piglins, unless they're already angry at them
     * (mixin.PiglinBruteAiMixin).
     */
    public static boolean bruteSpares(AbstractPiglin brute, LivingEntity target) {
        if (!isCrew(brute) || !(target instanceof Player player) || !PiglinAi.isWearingGold(player)) {
            return false;
        }
        return brute.getBrain().getMemory(MemoryModuleType.ANGRY_AT).map(id -> !id.equals(player.getUUID())).orElse(true);
    }

    // ------------------------------------------------------------------------------------------------ jobs

    private static void tick(ServerLevel level) {
        long now = level.getGameTime();
        if (now % 20 != 7 || MEMBERS.isEmpty()) {
            return;
        }
        for (Mob m : new ArrayList<>(MEMBERS)) {
            if (m.isRemoved() || !m.isAlive()) {
                MEMBERS.remove(m);
                continue;
            }
            if (m.level() != level || m.isNoAi()) {
                continue;
            }
            Crew crew = m.getAttached(CREW);
            if (crew == null) {
                MEMBERS.remove(m);
                continue;
            }
            if (crew.role() == WORKER && m instanceof Piglin p && !(m instanceof GoldenPiglin)) {
                work(level, p, crew, now);
            }
        }
    }

    /** Busy with something of its own (a fight, gold, a dance, a ride)? Then it leaves its job for later. */
    private static boolean busy(Piglin p) {
        Brain<Piglin> b = p.getBrain();
        return b.hasMemoryValue(MemoryModuleType.ATTACK_TARGET) || b.hasMemoryValue(MemoryModuleType.ADMIRING_ITEM)
                || b.hasMemoryValue(MemoryModuleType.CELEBRATE_LOCATION) || b.hasMemoryValue(MemoryModuleType.AVOID_TARGET)
                || b.hasMemoryValue(MemoryModuleType.RIDE_TARGET) || p.isPassenger() || !p.getOffhandItem().isEmpty()
                || PiglinGreed.isGreedy(p);
    }

    /** A worker's day: off to a job (wart, store, brew), a while there pottering, then the next. */
    private static void work(ServerLevel level, Piglin p, Crew crew, long now) {
        List<HexFortressPiece.Job> jobs = HexFortressPiece.jobs(crew.fortress(), crew.rot());
        if (jobs.isEmpty() || busy(p)) {
            return;
        }
        long[] state = JOBS.computeIfAbsent(p, k -> new long[]{now + p.getRandom().nextInt(100), p.getRandom().nextInt(jobs.size())});
        HexFortressPiece.Job job = jobs.get((int) Math.floorMod(state[1], jobs.size()));
        double d = p.distanceToSqr(job.stand().getX() + 0.5, job.stand().getY(), job.stand().getZ() + 0.5);
        if (now >= state[0]) {
            // the next job: a different one, picked at random (the farm more often: it's the most work)
            int next = (int) state[1];
            while (next == state[1] && jobs.size() > 1) {
                next = p.getRandom().nextInt(jobs.size() + 2) % jobs.size();
            }
            state[1] = next;
            state[0] = now + 300 + p.getRandom().nextInt(300);
            job = jobs.get(next);
            p.getBrain().setMemory(MemoryModuleType.WALK_TARGET, new WalkTarget(job.stand(), 0.6f, 1));
            return;
        }
        if (d < 2.5 * 2.5) {
            // at work: face the job, now and then a swing of the arm and the sound of it
            p.getBrain().setMemory(MemoryModuleType.LOOK_TARGET, new BlockPosTracker(job.look()));
            if (p.getRandom().nextInt(3) == 0) {
                p.swing(p.getRandom().nextBoolean() ? InteractionHand.MAIN_HAND : InteractionHand.OFF_HAND);
                level.playSound(null, job.look(), job.sound(), SoundSource.NEUTRAL, 0.5f, 0.8f + p.getRandom().nextFloat() * 0.3f);
            }
        } else if (d > 6 * 6 && !p.getBrain().hasMemoryValue(MemoryModuleType.WALK_TARGET) && p.getRandom().nextInt(4) == 0) {
            p.getBrain().setMemory(MemoryModuleType.WALK_TARGET, new WalkTarget(job.stand(), 0.6f, 1));   // wandered off: back to it
        }
    }

    /** For tests and the screenshots: where this worker is headed next (null: no job). */
    @Nullable
    public static HexFortressPiece.Job currentJob(Mob m) {
        Crew crew = m.getAttached(CREW);
        long[] state = JOBS.get(m);
        if (crew == null || state == null) {
            return null;
        }
        List<HexFortressPiece.Job> jobs = HexFortressPiece.jobs(crew.fortress(), crew.rot());
        return jobs.isEmpty() ? null : jobs.get((int) Math.floorMod(state[1], jobs.size()));
    }

    /** Sends a worker to its next job now (tests). */
    public static void hurryUp(Mob m) {
        long[] state = JOBS.get(m);
        if (state != null) {
            state[0] = 0;
        }
    }
}
