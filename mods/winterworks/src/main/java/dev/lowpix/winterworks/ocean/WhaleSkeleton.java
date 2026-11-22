package dev.lowpix.winterworks.ocean;

import dev.lowpix.winterworks.registry.OceanBlocks;
import dev.lowpix.winterworks.registry.OceanEntities;
import net.minecraft.core.Direction;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.SeaPickleBlock;
import net.minecraft.world.level.block.state.BlockState;

/**
 * A whale skeleton (docs/OCEAN_UPDATE.md section 7): a whale fall on the deep floor, about 46 blocks of bone. The spine
 * curves along the floor from the tail to the skull, ribs arch down either side into the silt, the long skull lies at
 * the front with its jaws fallen open, and the flippers' bones spread out beside it. Tube worms have colonised the
 * floor round the bones, sea pickles glow in the rib cage, anglerfish hunt there, and the whale's last swallow is
 * still in a chest under the ribs (chests/whale_skeleton). Canonical frame: head at +z.
 */
final class WhaleSkeleton {
    private static final BlockState BONE = Blocks.BONE_BLOCK.defaultBlockState();

    private WhaleSkeleton() {}

    private static BlockState bone(Direction.Axis axis) {
        return BONE.setValue(RotatedPillarBlock.AXIS, axis);
    }

    /** The spine's centre at z: x (it curves), y (it rises over the rib cage, sinks to the floor at the tail). */
    private static double spineX(int z, double bend) {
        return bend * Math.sin((z + 22) / 13.0);
    }

    private static double spineY(int z) {
        if (z < -12) {
            return 0.6 + 2.6 * Math.max(0, (z + 24) / 12.0);
        }
        return z > 10 ? 3.2 - (z - 10) * 0.1 : 3.2 + 0.6 * Math.sin((z + 12) / 22.0 * Math.PI);
    }

    static void build(OceanStructurePiece.W w) {
        double bend = 1.2 + w.rnd(0, 0, 0, 1) * 2.4;
        if (w.rnd(0, 0, 0, 2) < 0.5f) {
            bend = -bend;
        }
        spine(w, bend);
        ribs(w, bend);
        skull(w, bend);
        flippers(w, bend);
        life(w, bend);
    }

    private static void spine(OceanStructurePiece.W w, double bend) {
        for (int z = -24; z <= 11; z++) {
            int x = (int) Math.round(spineX(z, bend)), y = (int) Math.round(spineY(z));
            boolean thick = z >= -10;
            if (w.rnd(0, 0, z, 3) < 0.06f && z < -14) {
                continue;   // a vertebra lost to the scavengers
            }
            w.set(x, y, z, bone(Direction.Axis.Z));
            if (thick) {
                w.set(x + 1, y, z, bone(Direction.Axis.Z));
                if (z >= -4 && z <= 8) {
                    w.set(x, y + 1, z, bone(Direction.Axis.Z));
                    w.set(x + 1, y + 1, z, bone(Direction.Axis.Z));
                }
            }
            if (Math.floorMod(z, 3) == 0) {   // the spines over the vertebrae
                int up = thick ? (z >= -4 && z <= 8 ? 2 : 1) : 1;
                int h = z >= -6 && z <= 6 ? 2 : 1;
                for (int k = 1; k <= h; k++) {
                    w.set(x, y + up + k - 1, z, bone(Direction.Axis.Y));
                }
                if (thick && z <= 8) {   // and their side processes
                    w.set(x - 1, y, z, bone(Direction.Axis.X));
                    w.set(x + 2, y, z, bone(Direction.Axis.X));
                }
            }
        }
    }

    private static void ribs(OceanStructurePiece.W w, double bend) {
        for (int i = 0; i < 9; i++) {
            int z0 = -6 + i * 2;
            if (w.rnd(i, 0, 0, 4) < 0.12f) {
                continue;   // missing pair
            }
            int sx = (int) Math.round(spineX(z0, bend));
            double sy = spineY(z0) + (z0 >= -4 && z0 <= 8 ? 1 : 0);
            double span = 5.2 + 1.6 * Math.sin((i + 0.5) / 9.0 * Math.PI) + w.rnd(i, 1, 0, 5) * 0.8;
            for (int side = -1; side <= 1; side += 2) {
                boolean snapped = w.rnd(i, side, 0, 6) < 0.18f;
                double last = snapped ? 0.45 + w.rnd(i, side, 1, 7) * 0.3 : 1.05;
                int px = Integer.MIN_VALUE, py = 0, pz = 0;
                for (double t = 0; t <= last; t += 0.035) {
                    double a = t * Math.PI / 2;
                    double x = (side > 0 ? sx + 1.5 : sx - 0.5) + side * span * Math.sin(a);
                    double y = sy + 0.8 - (sy + 1.8) * (1 - Math.cos(a));
                    double z = z0 - 1.6 * t;
                    int bx = (int) Math.floor(x + 0.5), by = (int) Math.floor(y + 0.5), bz = (int) Math.floor(z + 0.5);
                    if (bx == px && by == py && bz == pz) {
                        continue;
                    }
                    px = bx;
                    py = by;
                    pz = bz;
                    Direction.Axis axis = t < 0.45 ? Direction.Axis.X : Direction.Axis.Y;
                    w.set(bx, by, bz, bone(axis));
                }
            }
        }
    }

    private static void skull(OceanStructurePiece.W w, double bend) {
        int sx = (int) Math.round(spineX(11, bend));
        // the cranium
        for (int z = 11; z <= 16; z++) {
            for (int x = -3; x <= 4; x++) {
                for (int y = 0; y <= 4; y++) {
                    double dx = (x - 0.5) / 3.6, dy = (y - 1.2) / 3.2, dz = (z - 13.2) / 3.4;
                    if (dx * dx + dy * dy + dz * dz > 1) {
                        continue;
                    }
                    boolean socket = Math.abs(Math.abs(x - 0.5) - 3) < 0.6 && y == 2 && z == 14;
                    boolean hollow = dx * dx + dy * dy + dz * dz < 0.35;
                    if (socket || hollow) {
                        w.water(sx + x, y, z);
                    } else {
                        w.set(sx + x, y, z, bone(Direction.Axis.Z));
                    }
                }
            }
        }
        // the long upper jaw
        for (int z = 17; z <= 24; z++) {
            double half = 2.1 - (z - 17) * 0.17;
            int y = z < 21 ? 2 : 1;
            for (int x = -3; x <= 4; x++) {
                if (Math.abs(x - 0.5) <= half) {
                    w.set(sx + x, y, z, bone(Direction.Axis.Z));
                }
            }
        }
        // the lower jaws, fallen open on the floor
        for (int side = -1; side <= 1; side += 2) {
            for (int z = 12; z <= 25; z++) {
                double t = (z - 12) / 13.0;
                int x = (int) Math.round(sx + 0.5 + side * (3.2 + 2.4 * Math.sin(t * Math.PI) + (side > 0 ? 1.4 : 0) * t));
                w.set(x, 0, z, bone(Direction.Axis.Z));
                if (t < 0.3) {
                    w.set(x, 1, z, bone(Direction.Axis.Z));
                }
            }
        }
    }

    private static void flippers(OceanStructurePiece.W w, double bend) {
        int z0 = 7;
        int sx = (int) Math.round(spineX(z0, bend));
        for (int side = -1; side <= 1; side += 2) {
            double bx = side > 0 ? sx + 7.5 : sx - 6.5;
            for (int k = 0; k <= 5; k++) {   // the arm
                w.set((int) Math.round(bx + side * k), k < 2 ? 1 : 0, z0 + k / 2, bone(Direction.Axis.X));
            }
            for (int f = -1; f <= 1; f++) {   // the fingers
                for (int k = 1; k <= 4; k++) {
                    w.set((int) Math.round(bx + side * (5 + k)), 0, z0 + 2 + f * (1 + k / 2), bone(Direction.Axis.X));
                }
            }
        }
    }

    /** Tube worms round the bones, sea pickles, the swallowed chest and the anglerfish. */
    private static void life(OceanStructurePiece.W w, double bend) {
        for (int z = -26; z <= 26; z++) {
            for (int x = -13; x <= 13; x++) {
                if (!w.column(x, z)) {
                    continue;
                }
                float r = w.rnd(x, 0, z, 8);
                double sx = spineX(Math.max(-24, Math.min(11, z)), bend);
                double d = Math.abs(x - sx);
                boolean near = z >= -26 && z <= 26 && (d < 9 && z > -8 && z < 14 || d < 3 && z >= -26);
                if (!near || r > 0.16f) {
                    continue;
                }
                int f = w.floor(x, z, 6, 12);
                if (f == Integer.MIN_VALUE || !w.open(x, f + 1, z) || !w.get(x, f + 1, z).is(Blocks.WATER)) {
                    continue;
                }
                if (r < 0.12f) {
                    w.set(x, f + 1, z, OceanBlocks.TUBE_WORMS.defaultBlockState());
                } else {
                    w.set(x, f + 1, z, Blocks.SEA_PICKLE.defaultBlockState().setValue(SeaPickleBlock.PICKLES, 1 + (int) (r * 20) % 4)
                            .setValue(SeaPickleBlock.WATERLOGGED, true));
                }
            }
        }
        int cx = (int) Math.round(spineX(2, bend));
        if (w.column(cx, 2)) {
            int f = w.floor(cx, 2, 4, 10);
            if (f != Integer.MIN_VALUE) {
                w.chest(cx, f, 2, Direction.EAST, OceanLoot.WHALE_SKELETON);
            }
        }
        // anglerfish hunting round the skull and in the rib cage
        int n = 1 + (int) (w.rnd(0, 0, 0, 9) * 3);
        for (int i = 0; i < n; i++) {
            int x = (int) Math.round(spineX(4, bend)) + (i % 2 == 0 ? 4 : -4);
            int z = 4 + i * 5;
            w.mob(OceanEntities.ANGLERFISH, x, 3, z, i * 70f);
        }
    }
}
