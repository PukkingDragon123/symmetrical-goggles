package dev.lowpix.winterworks.end;

import dev.lowpix.winterworks.registry.EndBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.state.BlockState;

/**
 * A fallen meteorite (docs/END_UPDATE.md section 1), very rare in the Dead End: a shallow crater with a raised rim of
 * thrown-up sand, its scorched floor glassy with obsidian, and in the middle a half-buried cluster of glowing
 * meteorite round a meteorite core.
 */
public final class Meteorite {
    private Meteorite() {}

    /** The topmost solid block of column (x, z) within a few blocks of y, or MIN_VALUE. */
    static int surface(EndWriter w, int x, int y, int z) {
        for (int yy = y + 5; yy >= y - 10; yy--) {
            BlockState s = w.get(x, yy, z);
            if (!s.isAir() && !EndGen.replaceable(s)) {
                return yy;
            }
        }
        return Integer.MIN_VALUE;
    }

    /** A crater centred on (x, y, z), the air block over the ground. Returns the meteorite core's position. */
    public static BlockPos crater(EndWriter w, int x, int y, int z, long id) {
        double rc = 6 + EndFormations.u(id, 0) * 3, d0 = 2.6 + EndFormations.u(id, 16) * 1.4, rim = 2.8;
        int reach = (int) Math.ceil(rc + rim);
        int floorC = y - 1;
        for (int dx = -reach; dx <= reach; dx++) {
            for (int dz = -reach; dz <= reach; dz++) {
                double r = Math.sqrt(dx * dx + dz * dz);
                if (r > rc + rim) {
                    continue;
                }
                int px = x + dx, pz = z + dz;
                int gy = surface(w, px, y - 1, pz);
                if (gy == Integer.MIN_VALUE) {
                    continue;
                }
                for (int k = 1; k <= 2; k++) {   // plants and bushes go
                    if (EndGen.replaceable(w.get(px, gy + k, pz))) {
                        w.set(px, gy + k, pz, EndGen.AIR);
                    }
                }
                if (r <= rc) {
                    int dig = (int) Math.round(d0 * (1 - (r / rc) * (r / rc)));
                    int floor = gy - dig;
                    for (int yy = floor + 1; yy <= gy; yy++) {
                        w.set(px, yy, pz, EndGen.AIR);
                    }
                    // smooth rings, not a per-block mix (that read as a checkerboard): a glassy melt in the middle,
                    // scorched stone round it, ash-pale sand out to the rim, with a ragged edge between rings
                    float f = w.rnd(px, floor, pz, 71);
                    double ring = r / rc + (f - 0.5) * 0.12;
                    BlockState s = ring < 0.38 ? (f < 0.12 ? EndGen.CRYING : EndGen.OBSIDIAN)
                            : ring < 0.72 ? EndGen.END_STONE : EndGen.SAND;
                    w.set(px, floor, pz, s);
                    w.set(px, floor - 1, pz, EndGen.END_STONE);
                    if (dx == 0 && dz == 0) {
                        floorC = floor;
                    }
                } else {
                    int up = (int) Math.round(1.8 * (1 - (r - rc) / rim) + EndFormations.u(EndGen.hash(w.seed, px, 0, pz, 72), 0) * 0.8);
                    for (int k = 1; k <= up; k++) {
                        w.set(px, gy + k, pz, k == up ? EndGen.SAND : EndGen.END_STONE);
                    }
                }
            }
        }
        // the meteorite: a lumpy, half-buried ball round its core
        double rm = 2.3 + EndFormations.u(id, 32) * 0.7;
        BlockState met = EndBlocks.METEORITE.defaultBlockState();
        int cy = floorC;
        for (int dx = -3; dx <= 3; dx++) {
            for (int dy = -3; dy <= 3; dy++) {
                for (int dz = -3; dz <= 3; dz++) {
                    double d = Math.sqrt(dx * dx + dy * dy * 1.2 + dz * dz) + EndFormations.u(EndGen.hash(id, dx, dy, dz, 73), 0) * 0.7;
                    if (d <= rm) {
                        w.set(x + dx, cy + dy, z + dz, met);
                    }
                }
            }
        }
        BlockPos core = new BlockPos(x, cy, z);
        w.set(core, EndBlocks.METEORITE_CORE.defaultBlockState());
        // a few fragments flung across the floor
        for (int i = 0; i < 5; i++) {
            long h = EndGen.mix(id + i * 0x9E3779B97F4A7C15L);
            double a = EndFormations.u(h, 0) * Math.PI * 2, r = rm + 1.5 + EndFormations.u(h, 16) * (rc - rm - 1.5);
            int px = x + (int) Math.round(Math.cos(a) * r), pz = z + (int) Math.round(Math.sin(a) * r);
            int gy = surface(w, px, cy + 3, pz);
            if (gy != Integer.MIN_VALUE) {
                w.set(px, gy, pz, met);
            }
        }
        return core;
    }
}
