package dev.lowpix.winterworks.end;

import dev.lowpix.winterworks.registry.EndBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.DoublePlantBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;
import net.minecraft.world.level.levelgen.Heightmap;

/**
 * The ground of the Living End's biomes (docs/END_UPDATE.md section 1): every upward-facing end stone face of a column
 * becomes End Grass with End Moss patches (Chorus Meadows) or a few blocks of grey End Sand in low dunes, with bare
 * rock outcrops and the odd Suspicious End Sand (the Dead End). Then the plants: meadow grass in drifts, tall grass,
 * small clusters of End Blooms, moss carpets; dry bushes in the desert. Every choice is hashed from the world seed
 * and the position, so a cell decorated twice (an island built over it, a neighbour's pass) comes out the same.
 */
public final class EndSurface {
    private EndSurface() {}

    // ------------------------------------------------------------------------------------------ ground

    /** Re-surfaces the 16 x 16 columns of the chunk with its minimum corner at (x0, z0). */
    public static boolean surface(WorldGenLevel level, int x0, int z0) {
        EndWriter w = EndWriter.forChunk(level, x0 >> 4, z0 >> 4);
        EndGen.Noises n = EndGen.noises(level.getSeed());
        int minY = level.getMinBuildHeight();
        BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos();
        boolean any = false;
        for (int dx = 0; dx < 16; dx++) {
            for (int dz = 0; dz < 16; dz++) {
                int x = x0 + dx, z = z0 + dz;
                EndGen.Style st = EndGen.style(level, p.set(x, 64, z));
                if (st == null) {
                    continue;
                }
                int top = level.getHeight(Heightmap.Types.WORLD_SURFACE_WG, x, z) - 1;
                boolean open = true, first = true;
                for (int y = top; y >= minY; y--) {
                    BlockState s = w.get(x, y, z);
                    if (s.isAir()) {
                        open = true;
                        continue;
                    }
                    if (open && s.is(Blocks.END_STONE)) {
                        any = true;
                        if (st == EndGen.Style.MEADOWS) {
                            w.set(x, y, z, meadowTop(n, x, z));
                        } else {
                            desertColumn(w, n, x, y, z, first);
                        }
                    }
                    open = false;
                    first = false;
                }
            }
        }
        return any;
    }

    /** End Grass, or End Moss in soft-edged patches. */
    public static BlockState meadowTop(EndGen.Noises n, int x, int z) {
        double m = n.patch(x + 3100, z - 1700, 0.045);
        double grove = n.patch(x + 1234, z - 4321, 0.018);   // the chorus groves' noise (EndFeatures): moss gathers there
        return m > 0.66 - Math.max(0, grove) * 0.4 ? EndGen.MOSS : EndGen.GRASS;
    }

    /** Bare grey-yellow rock where the outcrop noise is high (the Dead End shows its bones there). */
    static boolean outcrop(EndGen.Noises n, int x, int z) {
        return n.patch(x - 900, z + 4400, 0.06) > 0.58;
    }

    /** The Dead End's sand on a column whose open top is end stone at y: 2-4 deep, one more on the dunes. */
    static void desertColumn(EndWriter w, EndGen.Noises n, int x, int y, int z, boolean topmost) {
        if (outcrop(n, x, z)) {
            return;
        }
        double dune = n.c().getValue(x * 0.021, z * 0.034) * 0.7 + n.a().getValue(x * 0.06 + 50, z * 0.05) * 0.3;
        int depth = 2 + (dune > 0 ? 1 : 0) + (dune > 0.4 ? 1 : 0);
        for (int k = 0; k < depth; k++) {
            if (!w.get(x, y - k, z).is(Blocks.END_STONE) || w.get(x, y - k - 1, z).isAir()) {
                break;
            }
            w.set(x, y - k, z, EndGen.SAND);
        }
        if (!w.get(x, y, z).is(EndBlocks.END_SAND)) {
            return;
        }
        int extra = topmost && dune > 0.42 ? 1 : 0;   // a low dune here and there
        for (int k = 1; k <= Math.min(2, extra); k++) {
            w.put(x, y + k, z, EndGen.SAND);
        }
        int surfaceY = y + Math.min(2, extra);
        if (w.rnd(x, surfaceY, z, 17) < 1 / 340f && w.get(x, surfaceY, z).is(EndBlocks.END_SAND)) {
            EndGen.suspicious(w.level, new BlockPos(x, surfaceY, z), EndLoot.DEAD_END_ARCHAEOLOGY,
                    EndGen.hash(w.seed, x, surfaceY, z, 18));
        }
    }

    // ------------------------------------------------------------------------------------------ plants

    /** Plants the chunk's open ground (every exposed top in each column, islands included). */
    public static boolean vegetate(WorldGenLevel level, int x0, int z0) {
        EndWriter w = EndWriter.forChunk(level, x0 >> 4, z0 >> 4);
        EndGen.Noises n = EndGen.noises(level.getSeed());
        int minY = level.getMinBuildHeight();
        BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos();
        boolean any = false;
        for (int dx = 0; dx < 16; dx++) {
            for (int dz = 0; dz < 16; dz++) {
                int x = x0 + dx, z = z0 + dz;
                EndGen.Style st = EndGen.style(level, p.set(x, 64, z));
                if (st == null) {
                    continue;
                }
                int top = level.getHeight(Heightmap.Types.WORLD_SURFACE_WG, x, z);
                for (int y = top; y > minY; y--) {
                    if (w.get(x, y, z).isAir() && !w.get(x, y - 1, z).isAir()) {
                        any |= plant(w, n, st, x, y, z);
                    }
                }
            }
        }
        return any;
    }

    /** Maybe plants something in the air cell (x, y, z) over its ground. */
    public static boolean plant(EndWriter w, EndGen.Noises n, EndGen.Style st, int x, int y, int z) {
        BlockState ground = w.get(x, y - 1, z);
        float r = w.rnd(x, y, z, 31);
        if (st == EndGen.Style.DEAD_END) {
            if (!(ground.is(EndBlocks.END_SAND) || ground.is(Blocks.END_STONE))) {
                return false;
            }
            double scrub = n.patch(x + 777, z + 333, 0.03);
            if (r < 0.006 + Math.max(0, scrub) * 0.03) {
                return w.set(x, y, z, EndBlocks.DRY_END_BUSH.defaultBlockState());
            }
            return false;
        }
        if (ground.is(EndBlocks.END_MOSS_BLOCK)) {
            if (r < 0.42) {
                return w.set(x, y, z, EndBlocks.END_MOSS_CARPET.defaultBlockState());
            }
            if (r < 0.5) {
                return w.set(x, y, z, EndBlocks.END_GRASS.defaultBlockState());
            }
            return false;
        }
        if (!ground.is(EndBlocks.END_GRASS_BLOCK)) {
            return false;
        }
        // drifts of grass: dense in the hollows of the noise, thin on the rises
        double drift = n.patch(x - 250, z + 610, 0.035);
        double density = 0.16 + Math.max(0, drift) * 0.55;
        double blooms = n.patch(x + 5000, z + 5000, 0.08);
        if (blooms > 0.62 && r < 0.18) {
            return bloom(w, x, y, z);
        }
        if (r < density * 0.32) {
            return tall(w, x, y, z);
        }
        if (r < density) {
            return w.set(x, y, z, EndBlocks.END_GRASS.defaultBlockState());
        }
        if (r > 0.9985) {
            return bloom(w, x, y, z);   // a lone bloom here and there
        }
        return false;
    }

    static boolean tall(EndWriter w, int x, int y, int z) {
        if (!w.get(x, y + 1, z).isAir() || !w.can(x, y + 1, z)) {
            return false;
        }
        BlockState lower = EndBlocks.TALL_END_GRASS.defaultBlockState().setValue(DoublePlantBlock.HALF, DoubleBlockHalf.LOWER);
        w.set(x, y, z, lower);
        w.set(x, y + 1, z, lower.setValue(DoublePlantBlock.HALF, DoubleBlockHalf.UPPER));
        return true;
    }

    /** An End Bloom (closed, with its bulb) on End Grass or Moss: the soil the bloom grows on. */
    static boolean bloom(EndWriter w, int x, int y, int z) {
        return w.set(x, y, z, EndBlocks.END_BLOOM.defaultBlockState());
    }
}
