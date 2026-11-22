package dev.lowpix.winterworks.end;

import dev.lowpix.winterworks.registry.EndBlocks;
import net.minecraft.core.Direction;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Obsidian Ruins (docs/END_UPDATE.md section 3): a sunken octagonal court of obsidian tiles, two blocks below the Dead
 * End's sand, ringed by broken obsidian-brick walls. A weeping altar of chiseled and crying obsidian stands on a dais
 * at the back with the ruin's chest; broken pillars (one fallen) line the court; an arch marks the entrance (+z) and a
 * second, broken, the west side. Wind has drifted end sand over one side, burying walls and holding suspicious end
 * sand; 1-2 disguised Obolisks wait outside. Canonical frame: floor surface at y=0 (tiles at y=-1), the natural
 * ground round it at about y=1.
 */
final class ObsidianRuins {
    static final int R = 10;

    private ObsidianRuins() {}

    /** Octagonal distance: a square with its corners cut. */
    static double oct(int x, int z) {
        return Math.max(Math.max(Math.abs(x), Math.abs(z)), (Math.abs(x) + Math.abs(z)) * 0.74);
    }

    static void build(EndStructurePiece.W w) {
        double wa = w.rnd(0, 0, 0, 1) * Math.PI * 2, wx = Math.cos(wa), wz = Math.sin(wa);
        EndGen.Noises n = EndGen.noises(w.hash(0, 0, 0, 2));
        // 1. the court, the embankment round it, and the ground under it all
        for (int x = -13; x <= 13; x++) {
            for (int z = -13; z <= 13; z++) {
                if (!w.column(x, z)) {
                    continue;
                }
                double o = oct(x, z);
                if (o <= R + 0.5) {
                    w.foundation(x, z, -2, 12, SB.BRICKS);
                    w.set(x, -1, z, floor(w, x, z));
                    for (int y = 0; y <= 13; y++) {
                        w.set(x, y, z, SB.AIR);
                    }
                } else if (o <= R + 3.5) {
                    int top = (int) Math.round(-1 + (o - R - 0.5) * 0.75);
                    w.foundation(x, z, Math.min(top, 0) - 1, 8, EndGen.END_STONE);
                    for (int y = -1; y <= top; y++) {
                        w.set(x, y, z, SB.SAND);
                    }
                    for (int y = top + 1; y <= 13; y++) {
                        w.set(x, y, z, SB.AIR);
                    }
                }
            }
        }
        // 2. broken perimeter walls, with the entrance (+z) and west gaps for the arches
        for (int x = -R; x <= R; x++) {
            for (int z = -R; z <= R; z++) {
                double o = oct(x, z);
                if (o < R - 0.5 || o > R + 0.5) {
                    continue;
                }
                if (z >= R - 1 && Math.abs(x) <= 2 || x <= -R + 1 && Math.abs(z) <= 2) {
                    continue;
                }
                int h = (int) (w.rnd(x / 2, 0, z / 2, 3) * 5.5) - 1;
                for (int y = 0; y <= h; y++) {
                    w.set(x, y, z, brick(w, x, y, z));
                }
                if (h >= 0 && w.rnd(x, h, z, 4) < 0.35) {
                    w.set(x, h + 1, z, SB.slab(EndBlocks.OBSIDIAN_BRICK_SLAB, false));
                }
            }
        }
        // 3. the dais, the weeping altar and the chest
        for (int x = -4; x <= 4; x++) {
            for (int z = -8; z <= -5; z++) {
                w.set(x, 0, z, z == -5 ? SB.stairs(EndBlocks.OBSIDIAN_BRICK_STAIRS, Direction.NORTH, false) : SB.POLISHED);
            }
        }
        w.set(0, 1, -7, SB.CHISELED);
        w.set(0, 2, -7, SB.CRYING);
        w.set(-1, 1, -7, SB.stairs(EndBlocks.POLISHED_OBSIDIAN_STAIRS, Direction.EAST, false));
        w.set(1, 1, -7, SB.stairs(EndBlocks.POLISHED_OBSIDIAN_STAIRS, Direction.WEST, false));
        for (int sx = -3; sx <= 3; sx += 6) {
            for (int y = 1; y <= 4; y++) {
                w.set(sx, y, -7, y == 4 ? SB.CHISELED : SB.POLISHED);
            }
            w.set(sx, 5, -7, SB.CRYING);
        }
        w.chest(2, 1, -6, Direction.SOUTH, EndLoot.RUINS_CHEST);
        // the back wall behind the altar, with a window
        for (int x = -4; x <= 4; x++) {
            for (int y = 0; y <= 6 - Math.abs(x) / 2; y++) {
                boolean window = Math.abs(x) <= 1 && y >= 2 && y <= 4;
                w.set(x, y, -9, window ? (y == 4 && x == 0 ? SB.CHISELED : SB.AIR) : brick(w, x, y, -9));
            }
        }
        w.set(-1, 4, -9, SB.stairs(EndBlocks.OBSIDIAN_BRICK_STAIRS, Direction.EAST, true));
        w.set(1, 4, -9, SB.stairs(EndBlocks.OBSIDIAN_BRICK_STAIRS, Direction.WEST, true));
        // 4. pillars down the court, all broken; one lies where it fell
        int[][] pillars = {{-6, -3}, {6, -3}, {-6, 3}, {6, 3}};
        for (int i = 0; i < pillars.length; i++) {
            int px = pillars[i][0], pz = pillars[i][1];
            int h = 2 + (int) (w.rnd(i, 0, 0, 5) * 6);
            boolean fallen = i == (int) (w.rnd(0, 0, 0, 6) * 4);
            w.set(px, 0, pz, SB.CHISELED);
            if (fallen) {
                Direction d = Direction.from2DDataValue((int) (w.rnd(i, 1, 0, 7) * 4));
                w.set(px, 1, pz, SB.slab(EndBlocks.OBSIDIAN_BRICK_SLAB, false));
                for (int k = 2; k <= 5; k++) {
                    w.set(px + d.getStepX() * k, 0, pz + d.getStepZ() * k, k == 5 ? SB.POLISHED : brick(w, px, k, pz));
                }
                continue;
            }
            for (int y = 1; y <= h; y++) {
                w.set(px, y, pz, brick(w, px, y, pz));
            }
            w.set(px, h + 1, pz, w.rnd(i, 2, 0, 8) < 0.5 ? SB.slab(EndBlocks.OBSIDIAN_BRICK_SLAB, false) : SB.POLISHED);
        }
        // 5. the entrance arch (+z), whole
        archway(w, 0, R, false);
        // 6. the west arch, broken
        archway(w, -R, 0, true);
        // 7. rubble on the floor
        for (int x = -R + 1; x <= R - 1; x++) {
            for (int z = -R + 1; z <= R - 1; z++) {
                if (oct(x, z) > R - 1 || Math.abs(x) <= 1 || Math.abs(z) <= 1 || z <= -5 && z >= -9 && Math.abs(x) <= 4) {
                    continue;
                }
                float r = w.rnd(x, 0, z, 9);
                if (r < 0.03 && w.get(x, 0, z).isAir()) {
                    w.set(x, 0, z, SB.slab(EndBlocks.OBSIDIAN_BRICK_SLAB, false));
                } else if (r < 0.045 && w.get(x, 0, z).isAir()) {
                    w.set(x, 0, z, SB.stairs(EndBlocks.OBSIDIAN_BRICK_STAIRS, Direction.from2DDataValue((int) (r * 1000) & 3), false));
                }
            }
        }
        // 8. the sand drift over the windward side, with suspicious sand in it
        int sus = 0;
        for (int x = -R; x <= R; x++) {
            for (int z = -R; z <= R; z++) {
                if (oct(x, z) > R + 0.5) {
                    continue;
                }
                double t = (x * wx + z * wz + R) / (2.0 * R);
                double d = t * 4.6 - 1.4 + n.a().getValue(x * 0.18, z * 0.18) * 1.1;
                int dd = (int) Math.round(Math.max(0, Math.min(4.5, d)));
                for (int y = 0; y < dd; y++) {
                    if (!w.get(x, y, z).isAir() && w.column(x, z)) {
                        continue;
                    }
                    boolean buried = y < dd - 1 || dd >= 2;
                    if (buried && w.rnd(x, y, z, 10) < 0.07) {
                        w.suspicious(x, y, z, EndLoot.RUINS_ARCHAEOLOGY);
                        sus++;
                    } else {
                        w.set(x, y, z, SB.SAND);
                    }
                }
            }
        }
        // at least three, where the drift starts (hashed spots along the windward wall foot)
        for (int i = 0; i < 3; i++) {
            int x = (int) Math.round(wx * (R - 2) + (i - 1) * 2 * -wz), z = (int) Math.round(wz * (R - 2) + (i - 1) * 2 * wx);
            BlockState old = w.get(x, 0, z);
            if (old.isAir() || old.is(EndBlocks.END_SAND)) {
                w.suspicious(x, 0, z, EndLoot.RUINS_ARCHAEOLOGY);
            }
        }
        // 9. guards outside the walls
        w.guard(12, 2, -6);
        if (w.rnd(0, 0, 0, 11) < 0.5) {
            w.guard(-12, 2, 7);
        }
    }

    static BlockState brick(EndStructurePiece.W w, int x, int y, int z) {
        float r = w.rnd(x, y, z, 20);
        return r < 0.04 ? SB.CRYING : r < 0.3 ? SB.CRACKED : SB.BRICKS;
    }

    static BlockState floor(EndStructurePiece.W w, int x, int z) {
        double re = Math.sqrt(x * x + z * z);
        if (re <= 1.5) {
            return x == 0 && z == 0 ? SB.CRYING : SB.CHISELED;
        }
        if (re >= 3.5 && re <= 4.5) {
            return SB.POLISHED;
        }
        if (Math.abs(x) <= 1 || Math.abs(z) <= 1) {
            return SB.POLISHED;
        }
        float r = w.rnd(x, -1, z, 21);
        return r < 0.06 ? SB.SAND : r < 0.36 ? SB.CRACKED_TILES : SB.TILES;
    }

    /**
     * An arch across the wall at (x, z) (on the +z wall, running along x; or on the -x wall, running along z), 7 wide
     * and 7 high; broken: the far pillar stands only 2 high and the span is gone but its first blocks.
     */
    static void archway(EndStructurePiece.W w, int ax, int az, boolean broken) {
        boolean alongX = az != 0;
        for (int i = -3; i <= 3; i++) {
            int x = alongX ? ax + i : ax, z = alongX ? az : az + i;
            boolean pillar = Math.abs(i) == 3;
            if (pillar) {
                int h = broken && i == 3 ? 2 : 6;
                for (int y = 0; y < h; y++) {
                    w.set(x, y, z, y == 0 ? SB.CHISELED : brick(w, x, y, z));
                }
                if (!(broken && i == 3)) {
                    w.set(x, 6, z, SB.POLISHED);
                }
                continue;
            }
            if (broken && i > -2) {
                continue;
            }
            w.set(x, 6, z, i == 0 ? SB.CHISELED : SB.POLISHED);
            if (Math.abs(i) == 2) {
                Direction away = alongX ? (i < 0 ? Direction.WEST : Direction.EAST) : (i < 0 ? Direction.NORTH : Direction.SOUTH);
                w.set(x, 5, z, SB.stairs(EndBlocks.OBSIDIAN_BRICK_STAIRS, away, true));
            }
            if (i == 0) {
                w.set(x, 7, z, SB.slab(EndBlocks.OBSIDIAN_BRICK_SLAB, false));
            }
        }
        if (broken) {   // the fallen span, lying in the sand
            for (int k = 0; k < 3; k++) {
                int x = alongX ? ax + k : ax + 2, z = alongX ? az + 2 : az + k;
                w.set(x, 0, z, k == 1 ? SB.CHISELED : SB.POLISHED);
            }
        }
    }
}
