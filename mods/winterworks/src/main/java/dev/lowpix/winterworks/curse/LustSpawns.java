package dev.lowpix.winterworks.curse;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.level.ChunkPos;

/**
 * Lust's spawn pressure: hostile mobs spawn twice as much round a player who bears Lust. While the natural spawner
 * works on a chunk near such a player (mixin.CurseNaturalSpawnerMixin), the monster cap counts double
 * (mixin.CurseMobCategoryMixin) and the monster spawn attempt runs twice.
 */
public final class LustSpawns {
    /** How far from a Lust bearer chunks feel the pressure (blocks; the spawner works up to 128 from players). */
    public static final double RANGE = 128;
    /** Lust bearers this tick (refreshed by Sins every tick; usually empty, so the spawner check is free). */
    static final List<ServerPlayer> BEARERS = new ArrayList<>();
    /** The pressure on the chunk the spawner is working on right now (server thread only), 1 otherwise. */
    private static int boost = 1;

    private LustSpawns() {}

    /** Spawn pressure on a chunk: 2 near a player bearing Lust, else 1. */
    public static int pressure(ServerLevel level, ChunkPos chunk) {
        if (BEARERS.isEmpty()) {
            return 1;
        }
        double cx = chunk.getMiddleBlockX(), cz = chunk.getMiddleBlockZ();
        for (ServerPlayer p : BEARERS) {
            if (p.level() == level && !p.isRemoved()) {
                double dx = p.getX() - cx, dz = p.getZ() - cz;
                if (dx * dx + dz * dz <= RANGE * RANGE) {
                    return 2;
                }
            }
        }
        return 1;
    }

    /** The spawner starts on a chunk. */
    public static void begin(ServerLevel level, ChunkPos chunk) {
        boost = pressure(level, chunk);
    }

    public static void end() {
        boost = 1;
    }

    /** The mob cap for a category, scaled by the pressure on the chunk being worked on. */
    public static int cap(MobCategory category, int base) {
        return boost > 1 && category == MobCategory.MONSTER ? base * boost : base;
    }

    /** How many monster spawn attempts the current chunk gets this tick. */
    public static int attempts(MobCategory category) {
        return category == MobCategory.MONSTER ? boost : 1;
    }

    static void refresh(List<ServerPlayer> bearers) {
        BEARERS.clear();
        BEARERS.addAll(bearers);
    }
}
