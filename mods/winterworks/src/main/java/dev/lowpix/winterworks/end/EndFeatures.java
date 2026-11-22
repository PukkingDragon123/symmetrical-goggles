package dev.lowpix.winterworks.end;

import dev.lowpix.winterworks.Winterworks;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.RandomState;
import net.minecraft.world.level.levelgen.feature.Feature;
import net.minecraft.world.level.levelgen.feature.FeaturePlaceContext;
import net.minecraft.world.level.levelgen.feature.configurations.NoneFeatureConfiguration;

/**
 * The Living End's terrain features (docs/END_UPDATE.md section 1), each run once per chunk by the biomes (placed
 * features without modifiers; data from tools/data_end_world.py), checking the biome column by column:
 * <ul>
 * <li>{@code end_surface} (raw generation): terraced cliffs and overhangs at island edges (EndCliffs), then End
 * Grass and Moss, End Sand dunes (EndSurface)</li>
 * <li>{@code floating_islands} (raw generation): floating islands and rocks (FloatingIsland)</li>
 * <li>{@code end_rocks} (local modifications): chorus trees and plants, formations, pillars, obsidian shards, rock
 * piles, meteorites</li>
 * <li>{@code end_vegetation} (vegetal decoration): grass, blooms, moss carpets, dry bushes (EndSurface)</li>
 * </ul>
 * Everything writes only to the chunk and its neighbours, and nothing comes near the main island.
 */
public final class EndFeatures {
    public static final Feature<NoneFeatureConfiguration> SURFACE = reg("end_surface", ctx -> {
        int x0 = ctx.origin().getX() & ~15, z0 = ctx.origin().getZ() & ~15;
        boolean ours = false;
        for (int i = 0; i < 5 && !ours; i++) {
            ours = EndGen.style(ctx.level(), new BlockPos(x0 + (i == 4 ? 8 : (i & 1) * 15), 64, z0 + (i == 4 ? 8 : (i >> 1) * 15))) != null;
        }
        boolean cliffs = ours && EndCliffs.shape(EndWriter.forChunk(ctx.level(), x0 >> 4, z0 >> 4), x0, z0);
        return EndSurface.surface(ctx.level(), x0, z0) | cliffs;
    });
    public static final Feature<NoneFeatureConfiguration> FLOATING_ISLANDS = reg("floating_islands", ctx -> {
        int cx = ctx.origin().getX() >> 4, cz = ctx.origin().getZ() >> 4;
        EndWriter w = EndWriter.forChunk(ctx.level(), cx, cz);
        boolean any = !EndGen.nearStructure(ctx.level(), cx, cz) && FloatingIsland.placeForChunk(w, cx, cz);
        return FloatingIsland.rocks(w, cx, cz) | any;
    });
    public static final Feature<NoneFeatureConfiguration> ROCKS = reg("end_rocks", EndFeatures::rocks);
    public static final Feature<NoneFeatureConfiguration> VEGETATION = reg("end_vegetation", ctx ->
            EndSurface.vegetate(ctx.level(), ctx.origin().getX() & ~15, ctx.origin().getZ() & ~15));

    private EndFeatures() {}

    private interface Place {
        boolean place(FeaturePlaceContext<NoneFeatureConfiguration> ctx);
    }

    private static Feature<NoneFeatureConfiguration> reg(String name, Place p) {
        return Registry.register(BuiltInRegistries.FEATURE, Winterworks.id(name), new Feature<>(NoneFeatureConfiguration.CODEC) {
            @Override
            public boolean place(FeaturePlaceContext<NoneFeatureConfiguration> ctx) {
                return p.place(ctx);
            }
        });
    }

    static void init() {}

    // ------------------------------------------------------------------------------------------ ground features

    /**
     * The air block over the generated ground of column (x, z) (through any dunes laid on it), or MIN_VALUE over the
     * void. Uses the terrain noise, so floating islands overhead don't count as ground.
     */
    static int groundAt(EndWriter w, ChunkGenerator gen, RandomState rs, int x, int z) {
        int base = gen.getBaseHeight(x, z, Heightmap.Types.WORLD_SURFACE_WG, w.level, rs);
        if (base <= w.level.getMinBuildHeight() + 2) {
            return Integer.MIN_VALUE;
        }
        int y = base;
        while (y < base + 5 && !w.get(x, y, z).isAir() && !EndGen.replaceable(w.get(x, y, z))) {
            y++;
        }
        while (y > base - 3 && w.get(x, y - 1, z).isAir()) {
            y--;
        }
        return EndGen.ground(w.get(x, y - 1, z)) ? y : Integer.MIN_VALUE;
    }

    private static boolean rocks(FeaturePlaceContext<NoneFeatureConfiguration> ctx) {
        WorldGenLevel level = ctx.level();
        int cx = ctx.origin().getX() >> 4, cz = ctx.origin().getZ() >> 4;
        if (EndGen.nearStructure(level, cx, cz)) {
            return false;   // End Cities and our structures stand clear of trees and rocks
        }
        EndWriter w = EndWriter.forChunk(level, cx, cz);
        ChunkGenerator gen = ctx.chunkGenerator();
        RandomState rs = level.getLevel().getChunkSource().randomState();
        EndGen.Noises n = EndGen.noises(w.seed);
        long seed = w.seed;
        boolean any = false;
        // up to six candidate spots in the chunk, each tried for one kind of feature
        for (int i = 0; i < 6; i++) {
            int x = (cx << 4) + 2 + (int) (EndGen.rnd(seed, cx, i, cz, 501) * 12);
            int z = (cz << 4) + 2 + (int) (EndGen.rnd(seed, cx, i, cz, 502) * 12);
            EndGen.Style st = EndGen.style(level, new BlockPos(x, 64, z));
            if (st == null) {
                continue;
            }
            int y = groundAt(w, gen, rs, x, z);
            if (y == Integer.MIN_VALUE) {
                continue;
            }
            long id = EndGen.hash(seed, x, y, z, 503 + i);
            float r = EndGen.rnd(seed, cx, i, cz, 504);
            if (st == EndGen.Style.MEADOWS) {
                double grove = n.patch(x + 1234, z - 4321, 0.018);
                switch (i) {
                    case 0, 1 -> {   // chorus trees, in groves
                        double p = grove > 0.3 ? 0.75 : grove > 0.05 ? 0.3 : 0.05;
                        if (r < p * (i == 0 ? 1 : 0.45)) {
                            any |= ChorusTree.grow(w, x, y, z, id);
                        }
                    }
                    case 2, 3 -> {   // vanilla chorus plants, round the groves' edges
                        if (r < (i == 2 ? 0.3 : 0.1)) {
                            any |= ChorusTree.chorusPlant(w, x, y, z, id);
                        }
                    }
                    case 4 -> {
                        if (r < 0.085) {
                            any |= formation(w, gen, rs, x, y, z, st, id);
                        }
                    }
                    default -> { }
                }
            } else {
                switch (i) {
                    case 0 -> {
                        if (r < 0.4) {
                            any |= EndFormations.rockPile(w, x, y, z, id);
                        }
                    }
                    case 1 -> {
                        if (r < 0.12) {
                            any |= EndFormations.pillar(w, x, y, z, id);
                        }
                    }
                    case 2 -> {
                        if (r < 0.14) {
                            any |= EndFormations.shards(w, x, y, z, id);
                        }
                    }
                    case 3 -> {
                        if (r < 0.075) {
                            any |= formation(w, gen, rs, x, y, z, st, id);
                        }
                    }
                    case 4 -> {
                        if (r < 1 / 260f) {
                            Meteorite.crater(w, x, y, z, id);
                            any = true;
                        }
                    }
                    default -> { }
                }
            }
        }
        return any;
    }

    /** An arch, a ring or a twisted spire. */
    private static boolean formation(EndWriter w, ChunkGenerator gen, RandomState rs, int x, int y, int z, EndGen.Style st, long id) {
        double a = EndFormations.u(id, 12) * Math.PI * 2;
        switch ((int) Long.remainderUnsigned(id >>> 28, 3)) {
            case 0 -> {
                int span = 9 + (int) (EndFormations.u(id, 36) * 9);
                int ex = x + (int) Math.round(Math.cos(a) * span), ez = z + (int) Math.round(Math.sin(a) * span);
                int y2 = groundAt(w, gen, rs, ex, ez);
                if (y2 == Integer.MIN_VALUE || Math.abs(y2 - y) > 4 || EndGen.style(w.level, new BlockPos(ex, 64, ez)) == null) {
                    return false;
                }
                int height = 6 + (int) (EndFormations.u(id, 44) * 8);
                return EndFormations.arch(w, x, y, z, y2, a, span, height, st, id);
            }
            case 1 -> {
                return EndFormations.ring(w, x, y, z, a, st, id);
            }
            default -> {
                return EndFormations.spire(w, x, y, z, st, id);
            }
        }
    }
}
