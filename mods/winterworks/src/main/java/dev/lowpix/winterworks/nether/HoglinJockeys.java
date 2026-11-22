package dev.lowpix.winterworks.nether;

import dev.lowpix.winterworks.mixin.HoglinAccessor;
import dev.lowpix.winterworks.soulbull.SoulBullFeature;
import java.util.Map;
import java.util.Optional;
import java.util.WeakHashMap;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.EntitySelector;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.ai.memory.MemoryModuleType;
import net.minecraft.world.entity.monster.hoglin.Hoglin;
import net.minecraft.world.entity.monster.piglin.Piglin;
import net.minecraft.world.level.ServerLevelAccessor;
import net.minecraft.world.level.biome.Biomes;
import org.jetbrains.annotations.Nullable;

/**
 * Hoglin jockeys (docs/FIXES_0_4.md "Hoglin jockeys"): adult piglins riding adult hoglins. A hoglin spawned naturally,
 * with the chunk or by a structure (mixin.HoglinMixin, at the end of its finalizeSpawn) gets a piglin rider now and
 * then: {@link #CRIMSON_CHANCE} in crimson forests, {@link #LANDS_CHANCE} in and around bastions and Hex Fortresses
 * (SoulBullFeature.PIGLIN_LANDS); a Hex Fortress keeps one on its gate bridge. Ridden hoglins can't be hunted.
 * <p>
 * The rider steers: a mob's navigation is its vehicle's (Mob#getNavigation), so the piglin's brain walks the hoglin
 * about; while it carries a piglin the hoglin's own brain is put aside ({@link #steer}, called instead of its brain
 * tick), so it doesn't wander off or shy away from its rider, and it gores whatever its rider is fighting.
 */
public final class HoglinJockeys {
    public static final float CRIMSON_CHANCE = 0.15f, LANDS_CHANCE = 0.3f;
    private static final int ATTACK_COOLDOWN = 30;
    private static final Map<Hoglin, Long> NEXT_GORE = new WeakHashMap<>();

    private HoglinJockeys() {}

    static void init() {}

    /** The hook at the end of Hoglin.finalizeSpawn: maybe a piglin climbs on. */
    public static void onFinalizeSpawn(Hoglin hoglin, ServerLevelAccessor level, MobSpawnType type) {
        if (type != MobSpawnType.NATURAL && type != MobSpawnType.CHUNK_GENERATION && type != MobSpawnType.STRUCTURE) {
            return;
        }
        if (hoglin.isBaby() || hoglin.isVehicle() || hoglin.isPassenger()) {
            return;
        }
        float chance = chance(level, hoglin.blockPosition());
        if (chance > 0f && level.getRandom().nextFloat() < chance) {
            mount(level, hoglin);
        }
    }

    /** The jockey chance at a spot: crimson forests, and the piglins' own structures (only known in a live world). */
    public static float chance(ServerLevelAccessor level, BlockPos pos) {
        if (level instanceof ServerLevel sl && SoulBullFeature.inPiglinLands(sl, pos)) {
            return LANDS_CHANCE;
        }
        return level.getBiome(pos).is(Biomes.CRIMSON_FOREST) ? CRIMSON_CHANCE : 0f;
    }

    /** Puts an adult piglin (sword or crossbow) on an adult hoglin; add the hoglin with addFreshEntityWithPassengers. */
    @Nullable
    public static Piglin mount(ServerLevelAccessor level, Hoglin hoglin) {
        Piglin rider = EntityType.PIGLIN.create(level.getLevel());
        if (rider == null) {
            return null;
        }
        rider.moveTo(hoglin.getX(), hoglin.getY(), hoglin.getZ(), hoglin.getYRot(), 0f);
        rider.finalizeSpawn(level, level.getCurrentDifficultyAt(hoglin.blockPosition()), MobSpawnType.JOCKEY, null);
        rider.setBaby(false);
        hoglin.setAge(0);
        ((HoglinAccessor) hoglin).winterworks$setCannotBeHunted(true);
        if (hoglin.isPersistenceRequired()) {
            rider.setPersistenceRequired();
        }
        rider.startRiding(hoglin, true);
        return rider;
    }

    /** Is this hoglin carrying an adult piglin that steers it? */
    @Nullable
    public static Piglin rider(Hoglin hoglin) {
        return !hoglin.isBaby() && hoglin.getControllingPassenger() instanceof Piglin p && p.isAlive() && p.isAdult() ? p : null;
    }

    /**
     * A ridden hoglin's tick (in place of its brain): what hurt it angers its rider; it gores whatever its rider is
     * fighting when it can reach it. Returns false (the hoglin thinks for itself) when no piglin is steering.
     */
    public static boolean steer(Hoglin hoglin) {
        Piglin rider = rider(hoglin);
        if (rider == null || !(hoglin.level() instanceof ServerLevel level)) {
            return false;
        }
        LivingEntity hurtBy = hoglin.getLastHurtByMob();
        Optional<LivingEntity> target = rider.getBrain().getMemory(MemoryModuleType.ATTACK_TARGET);
        if (hurtBy != null && hurtBy != rider && hurtBy.isAlive() && hoglin.tickCount - hoglin.getLastHurtByMobTimestamp() < 60
                && target.isEmpty() && !WitchCrew.sameCrew(hurtBy, hoglin) && EntitySelector.NO_CREATIVE_OR_SPECTATOR.test(hurtBy)) {
            WitchCrew.anger(rider, hurtBy);
        }
        target = rider.getBrain().getMemory(MemoryModuleType.ATTACK_TARGET);
        if (target.isPresent() && target.get().isAlive()) {
            LivingEntity t = target.get();
            hoglin.getLookControl().setLookAt(t, 30f, 30f);
            long now = level.getGameTime();
            if (now >= NEXT_GORE.getOrDefault(hoglin, 0L) && hoglin.isWithinMeleeAttackRange(t) && hoglin.getSensing().hasLineOfSight(t)) {
                NEXT_GORE.put(hoglin, now + ATTACK_COOLDOWN);
                hoglin.swing(InteractionHand.MAIN_HAND);
                hoglin.doHurtTarget(t);
            }
        }
        return true;
    }
}
