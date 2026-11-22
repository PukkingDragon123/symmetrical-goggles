package dev.lowpix.winterworks.end;

import dev.lowpix.winterworks.registry.EndBlocks;
import net.minecraft.core.Direction;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.DoublePlantBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;

/**
 * An End Shrine (docs/END_UPDATE.md section 3): a round temple on a raised disc of end stone bricks inlaid with purpur
 * rings. Twelve purpur columns carry a ring of end stone bricks and a purpur dome with an oculus, partly fallen in;
 * in the middle the ruin's chest stands on a purpur altar between end rods. End moss creeps over the floor and the
 * dome, and four planters of End Grass hold End Blooms. Steps lead up on four sides; 2-3 disguised Obolisks guard it.
 * Canonical frame: the floor surface at y=0 (bricks at y=-1), the ground round it a block or two lower.
 */
final class EndShrine {
    static final int R = 11, COLUMNS = 12;
    static final double COLUMN_R = 8.5, DOME_R = 8.2, DOME_Y = 7, DOME_SQUASH = 0.85;

    private EndShrine() {}

    static void build(EndStructurePiece.W w) {
        EndGen.Noises n = EndGen.noises(w.hash(0, 0, 0, 1));
        // 1. the disc, its foundations and the open air over it
        for (int x = -14; x <= 14; x++) {
            for (int z = -14; z <= 14; z++) {
                if (!w.column(x, z)) {
                    continue;
                }
                double r = Math.sqrt(x * x + z * z);
                if (r > 12.6) {
                    continue;
                }
                w.foundation(x, z, -2, 16, SB.END_BRICKS);
                for (int y = 0; y <= 17; y++) {
                    w.set(x, y, z, SB.AIR);
                }
                if (r > R + 0.5) {
                    w.set(x, -1, z, SB.slab(Blocks.END_STONE_BRICK_SLAB, false));   // the step round the rim
                    continue;
                }
                BlockState f;
                if (r > R - 0.5 || r >= 6.5 && r <= 7.5) {
                    f = SB.PURPUR;
                } else if (r <= 2.6) {
                    f = SB.purpurPillar(Direction.Axis.Y);
                } else {
                    f = SB.END_BRICKS;
                }
                boolean moss = r > 3 && n.patch(x, z, 0.16) > 0.42 - r * 0.018;
                w.set(x, -1, z, moss ? SB.MOSS : f);
                if (moss) {
                    float m = w.rnd(x, 0, z, 2);
                    if (m < 0.45) {
                        w.set(x, 0, z, SB.MOSS_CARPET);
                    } else if (m < 0.53) {
                        w.set(x, 0, z, EndBlocks.END_BLOOM.defaultBlockState());
                    }
                }
            }
        }
        // 2. steps up on the four sides (between the columns)
        for (Direction d : Direction.Plane.HORIZONTAL) {
            for (int k = -1; k <= 1; k++) {
                int sx = d.getStepX(), sz = d.getStepZ();
                int px = sx * 12 + (sz != 0 ? k : 0), pz = sz * 12 + (sx != 0 ? k : 0);
                w.set(px, -1, pz, SB.stairs(Blocks.END_STONE_BRICK_STAIRS, d.getOpposite(), false));
                w.set(px + sx, -2, pz + sz, SB.stairs(Blocks.END_STONE_BRICK_STAIRS, d.getOpposite(), false));
                w.foundation(px + sx, pz + sz, -3, 10, SB.END_BRICKS);
                w.set(px + sx, -1, pz + sz, SB.AIR);
            }
        }
        // 3. the colonnade and the ring it carries
        for (int c = 0; c < COLUMNS; c++) {
            double a = (c + 0.5) * Math.PI * 2 / COLUMNS;
            int x = (int) Math.round(Math.cos(a) * COLUMN_R), z = (int) Math.round(Math.sin(a) * COLUMN_R);
            w.set(x, 0, z, SB.PURPUR);
            boolean ruined = w.rnd(c, 0, 0, 3) < 0.17;
            int top = ruined ? 2 + (int) (w.rnd(c, 1, 0, 4) * 3) : 5;
            for (int y = 1; y <= top; y++) {
                w.set(x, y, z, SB.purpurPillar(Direction.Axis.Y));
            }
            if (!ruined) {
                w.set(x, 6, z, SB.PURPUR);
            } else {   // its fallen drum
                Direction out = SB.towardsCentre(x, z).getOpposite();
                w.set(x + out.getStepX() * 2, 0, z + out.getStepZ() * 2, SB.purpurPillar(out.getAxis()));
                w.set(x + out.getStepX() * 3, 0, z + out.getStepZ() * 3, SB.purpurPillar(out.getAxis()));
            }
        }
        for (int x = -11; x <= 11; x++) {
            for (int z = -11; z <= 11; z++) {
                double r = Math.sqrt(x * x + z * z);
                if (r >= 7.4 && r <= 9.6) {
                    w.set(x, 7, z, w.rnd(x, 7, z, 5) < 0.14 ? SB.MOSS : SB.END_BRICKS);
                }
                if (r > 9.0 && r <= 10.1) {
                    w.set(x, 7, z, SB.slab(Blocks.PURPUR_SLAB, true));   // the cornice
                }
            }
        }
        // 4. the dome, an oculus at the top, a breach on one side (its stones on the floor)
        double breach = w.rnd(0, 0, 0, 6) * Math.PI * 2;
        for (int x = -9; x <= 9; x++) {
            for (int z = -9; z <= 9; z++) {
                for (int y = 8; y <= 15; y++) {
                    double dy = (y - DOME_Y) / DOME_SQUASH;
                    double d = Math.sqrt(x * x + z * z + dy * dy);
                    if (d > DOME_R || d < DOME_R - 1.15 || Math.sqrt(x * x + z * z) < 1.6) {
                        continue;
                    }
                    double a = Math.atan2(z, x), da = Math.abs(Math.atan2(Math.sin(a - breach), Math.cos(a - breach)));
                    boolean hole = da < 0.55 && y < 13 || n.b().getValue(x * 0.35, y * 0.35, z * 0.35) > 0.62;
                    if (hole) {
                        if (w.rnd(x, y, z, 7) < 0.35) {
                            int fx = (int) Math.round(x * 1.05), fz = (int) Math.round(z * 1.05);
                            if (w.get(fx, 0, fz).isAir() || w.get(fx, 0, fz).is(EndBlocks.END_MOSS_CARPET)) {
                                w.set(fx, 0, fz, w.rnd(x, y, z, 8) < 0.5 ? SB.PURPUR : SB.slab(Blocks.PURPUR_SLAB, false));
                            }
                        }
                        continue;
                    }
                    w.set(x, y, z, w.rnd(x, y, z, 9) < 0.09 ? SB.MOSS : SB.PURPUR);
                }
            }
        }
        // 5. the altar and its chest
        for (int x = -2; x <= 2; x++) {
            for (int z = -2; z <= 2; z++) {
                boolean edgeX = Math.abs(x) == 2, edgeZ = Math.abs(z) == 2;
                if (edgeX && edgeZ) {
                    w.set(x, 0, z, SB.PURPUR);
                } else if (edgeX || edgeZ) {
                    w.set(x, 0, z, SB.stairs(Blocks.PURPUR_STAIRS, SB.towardsCentre(x, z), false));
                } else {
                    w.set(x, 0, z, SB.END_BRICKS);
                }
            }
        }
        w.set(0, 1, 0, SB.purpurPillar(Direction.Axis.Y));
        for (Direction d : Direction.Plane.HORIZONTAL) {
            w.set(d.getStepX(), 1, d.getStepZ(), SB.stairs(Blocks.PURPUR_STAIRS, d.getOpposite(), false));
        }
        for (int sx = -1; sx <= 1; sx += 2) {
            for (int sz = -1; sz <= 1; sz += 2) {
                w.set(sx, 1, sz, SB.END_ROD);
            }
        }
        w.chest(0, 2, 0, Direction.SOUTH, EndLoot.SHRINE_CHEST);
        // 6. planters of End Grass with blooms, on the diagonals
        for (int q = 0; q < 4; q++) {
            double a = Math.PI / 4 + q * Math.PI / 2;
            int cx = (int) Math.round(Math.cos(a) * 4.6), cz = (int) Math.round(Math.sin(a) * 4.6);
            for (int x = cx - 1; x <= cx + 1; x++) {
                for (int z = cz - 1; z <= cz + 1; z++) {
                    w.set(x, -1, z, SB.GRASS);
                    float r = w.rnd(x, 0, z, 10);
                    if (x == cx && z == cz || r < 0.35) {
                        w.set(x, 0, z, EndBlocks.END_BLOOM.defaultBlockState());
                    } else if (r < 0.6) {
                        w.set(x, 0, z, EndBlocks.TALL_END_GRASS.defaultBlockState().setValue(DoublePlantBlock.HALF, DoubleBlockHalf.LOWER));
                        w.set(x, 1, z, EndBlocks.TALL_END_GRASS.defaultBlockState().setValue(DoublePlantBlock.HALF, DoubleBlockHalf.UPPER));
                    } else {
                        w.set(x, 0, z, EndBlocks.END_GRASS.defaultBlockState());
                    }
                }
            }
        }
        // 7. 2-3 guards by the steps
        int skip = (int) (w.rnd(0, 0, 0, 11) * 4);
        boolean three = w.rnd(0, 0, 0, 12) < 0.5;
        int q = 0;
        for (Direction d : Direction.Plane.HORIZONTAL) {
            if (q++ == skip || !three && q == ((skip + 2) & 3) + 1) {
                continue;
            }
            Direction side = d.getClockWise();
            w.guard(d.getStepX() * 14 + side.getStepX() * 3, -1, d.getStepZ() * 14 + side.getStepZ() * 3);
        }
    }
}
