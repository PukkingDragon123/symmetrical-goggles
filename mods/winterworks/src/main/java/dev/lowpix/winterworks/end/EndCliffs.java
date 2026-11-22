package dev.lowpix.winterworks.end;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.levelgen.Heightmap;

/**
 * Terraced cliffs and overhangs at the edges of the Living End's islands (docs/END_UPDATE.md section 1). Near an edge
 * (within six blocks of where the land drops away into the void or down a deep step) the ground is cut into terraces
 * 4 blocks high whose lines meander with a noise; and where the ground ends at a sheer drop, its top juts out 1-3
 * blocks as a thin overhanging lip. Runs before the surface (EndSurface), so terraces and lips get their grass or
 * sand. The ground's top in a column is its highest end stone open to the sky below any floating island (whose tops
 * are grass or sand by then).
 */
public final class EndCliffs {
    static final int STEP = 4, MAX_CUT = 4, NEAR = 6, DROP = 8;

    private EndCliffs() {}

    /** The ground's top in column (x, z): end stone with air above, under anything floating; MIN_VALUE over the void. */
    static int top(EndWriter w, int x, int z) {
        int from = w.level.getHeight(Heightmap.Types.WORLD_SURFACE_WG, x, z) - 1;
        int to = Math.max(w.level.getMinBuildHeight(), from - 140);
        for (int y = from; y >= to; y--) {
            if (w.get(x, y, z).is(Blocks.END_STONE) && w.get(x, y + 1, z).isAir()) {
                return y;
            }
        }
        return Integer.MIN_VALUE;
    }

    public static boolean shape(EndWriter w, int x0, int z0) {
        EndGen.Noises n = EndGen.noises(w.seed);
        int size = 16 + 2 * NEAR;
        int[][] tops = new int[size][size];
        for (int i = 0; i < size; i++) {
            for (int j = 0; j < size; j++) {
                tops[i][j] = top(w, x0 - NEAR + i, z0 - NEAR + j);
            }
        }
        boolean any = false;
        for (int dx = 0; dx < 16; dx++) {
            for (int dz = 0; dz < 16; dz++) {
                int x = x0 + dx, z = z0 + dz;
                int yr = tops[dx + NEAR][dz + NEAR];
                if (yr == Integer.MIN_VALUE || yr < 30 || EndGen.style(w.level, new BlockPos(x, 64, z)) == null) {
                    continue;
                }
                boolean edge = false;
                for (Direction d : Direction.Plane.HORIZONTAL) {
                    for (int k = 2; k <= NEAR && !edge; k += 2) {
                        int t = tops[dx + NEAR + d.getStepX() * k][dz + NEAR + d.getStepZ() * k];
                        edge = t == Integer.MIN_VALUE || t < yr - DROP;
                    }
                }
                if (!edge) {
                    continue;
                }
                // terraces: cut the ground down to the step below it
                double off = 1.5 + 1.5 * n.a().getValue(x * 0.045, z * 0.045);
                int t = (int) (Math.floor((yr + off) / STEP) * STEP - Math.floor(off));
                if (t < yr && yr - t <= MAX_CUT && !w.get(x, t, z).isAir()) {
                    for (int y = t + 1; y <= yr; y++) {
                        w.set(x, y, z, EndGen.AIR);
                    }
                    yr = t;
                    any = true;
                }
                any |= lip(w, n, x, yr, z);
            }
        }
        return any;
    }

    /** Where the top at (x, yr, z) ends at a sheer drop, a lip juts out over it, 1-3 blocks. */
    static boolean lip(EndWriter w, EndGen.Noises n, int x, int yr, int z) {
        boolean any = false;
        for (Direction d : Direction.Plane.HORIZONTAL) {
            int nx = x + d.getStepX(), nz = z + d.getStepZ();
            boolean drop = true;
            for (int y = yr; y >= yr - 6 && drop; y--) {
                drop = w.get(nx, y, nz).isAir();
            }
            if (!drop) {
                continue;
            }
            double reach = 0.6 + 3.0 * (0.5 + 0.5 * n.b().getValue(x * 0.11 + d.ordinal() * 7.1, z * 0.11));
            int len = (int) reach;
            for (int k = 1; k <= len; k++) {
                int px = x + d.getStepX() * k, pz = z + d.getStepZ() * k;
                if (!w.get(px, yr, pz).isAir()) {
                    break;
                }
                w.set(px, yr, pz, EndGen.END_STONE);
                if (k == 1 && len > 1) {
                    w.put(px, yr - 1, pz, EndGen.END_STONE);   // thicker where it leaves the cliff
                }
                any = true;
            }
        }
        return any;
    }
}
