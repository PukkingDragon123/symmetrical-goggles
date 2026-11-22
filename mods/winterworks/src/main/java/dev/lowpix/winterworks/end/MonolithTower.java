package dev.lowpix.winterworks.end;

import dev.lowpix.winterworks.registry.EndBlocks;
import net.minecraft.core.Direction;
import net.minecraft.world.level.block.state.BlockState;

/**
 * The Monolith Tower (docs/END_UPDATE.md section 3): a round obsidian-brick tower 64 blocks to the arena floor, ribbed
 * by eight tapering buttresses and belted with glowing polished meteorite at every floor. Inside, a three-wide spiral
 * stair winds round a glowing core through floors at 16, 32 and 48 (each with chests and a disguised Obolisk) and the
 * treasure vault at 57, under the arena. At the top the tower flares out like a chalice into the open arena (radius
 * 12): rings of obsidian tiles crossed by glowing spokes, obsidian pillars for cover, a broken rim, and the Monolith
 * floating at its centre. Canonical frame: ground floor surface at y=0, the door towards +z.
 */
final class MonolithTower {
    static final double WALL_IN = 6.5, WALL_OUT = 8.5, CORE = 1.5, STAIR_OUT = 4.5, ARENA_R = 12.5;
    /** Rise per turn of the stair, the floors (block y; you stand one higher), the vault and the arena floor. */
    static final int PITCH = 16, VAULT = 57, ARENA = 64, FLARE_FROM = 54;
    static final int[] FLOORS = {16, 32, 48};

    private MonolithTower() {}

    /** The stair's lowest tread height in the band cell at angle a (0..PITCH-1). */
    static int base(double a) {
        double t = (a < 0 ? a + Math.PI * 2 : a) / (Math.PI * 2);
        return Math.min(PITCH - 1, (int) Math.floor(t * PITCH));
    }

    /** True if a floor at height f is open in the band cell at angle a (the stairwell: treads 1-4 below it). */
    static boolean stairwell(int f, double a) {
        int m = Math.floorMod(f - base(a), PITCH);
        return m >= 1 && m <= 4;
    }

    static double outer(int y) {
        if (y < FLARE_FROM) {
            return WALL_OUT;
        }
        double t = (y - FLARE_FROM) / (double) (ARENA - FLARE_FROM);
        return WALL_OUT + (ARENA_R - WALL_OUT) * t * t;
    }

    static void build(EndStructurePiece.W w) {
        for (int x = -13; x <= 13; x++) {
            for (int z = -13; z <= 13; z++) {
                if (w.column(x, z)) {
                    column(w, x, z);
                }
            }
        }
        door(w);
        arena(w);
        rooms(w);
    }

    static BlockState wallBlock(EndStructurePiece.W w, int x, int y, int z, double a) {
        // weeping streaks: a few angles where crying obsidian runs down from a floor
        int streak = (int) Math.floor((a + Math.PI) / (Math.PI * 2) * 24);
        if (w.rnd(streak, 0, 0, 30) < 0.18 && Math.floorMod(y, PITCH) > 8 && w.rnd(streak, y, 0, 31) < 0.7) {
            return SB.CRYING;
        }
        float r = w.rnd(x, y, z, 32);
        return r < 0.12 ? SB.CRACKED : SB.BRICKS;
    }

    private static void column(EndStructurePiece.W w, int x, int z) {
        double r = Math.sqrt(x * x + z * z), a = Math.atan2(z, x);
        if (r > 13) {
            return;
        }
        // ground works: a stepped plinth, foundations, and clear air round the base
        if (r <= 10.5) {
            w.foundation(x, z, -2, 22, SB.BRICKS);
            w.set(x, -1, z, r > 9.5 ? SB.POLISHED : r > WALL_OUT ? SB.TILES : floorTile(w, x, z, -1));
            for (int y = 0; y <= 4; y++) {
                if (r > WALL_OUT) {
                    w.set(x, y, z, SB.AIR);
                }
            }
            if (r > WALL_OUT && r <= 9.5) {
                w.set(x, 0, z, SB.slab(EndBlocks.POLISHED_OBSIDIAN_SLAB, false));
            }
        }
        // buttresses: eight radial fins, tapering as they rise
        double fin = Math.PI / 8;
        double sector = Math.abs(Math.atan2(Math.sin(a * 4 - fin * 4), Math.cos(a * 4 - fin * 4)));
        boolean onFin = sector < 0.32 && r > WALL_OUT - 0.2;
        for (int y = 0; y <= ARENA; y++) {
            double out = outer(y);
            if (onFin && y < 34) {
                out = Math.max(out, 10.6 - y / 16.0);
            }
            if (r > out + 0.01) {
                continue;
            }
            if (r >= WALL_IN) {
                BlockState s;
                boolean belt = r > WALL_OUT - 1 && (y == 15 || y == 31 || y == 47);
                if (belt) {
                    s = SB.GLOW;
                } else if (r > WALL_OUT - 1 && (y == 16 || y == 32 || y == 48)) {
                    s = SB.CHISELED;
                } else if (y >= FLARE_FROM && r > WALL_OUT) {
                    s = y == ARENA - 1 && r > out - 1 ? SB.CHISELED : SB.POLISHED;   // the chalice's skin
                } else if (onFin && r > WALL_OUT) {
                    s = y % 8 == 7 ? SB.POLISHED : SB.BRICKS;
                } else {
                    s = wallBlock(w, x, y, z, a);
                }
                w.set(x, y, z, s);
                continue;
            }
            // inside
            if (y == ARENA) {
                continue;   // the arena floor is laid by arena()
            }
            if (r < CORE) {
                w.set(x, y, z, y % 4 == 2 ? SB.GLOW : SB.OBSIDIAN);   // the glowing core
                continue;
            }
            boolean floor = y == 16 || y == 32 || y == 48 || y == VAULT;
            boolean band = r < STAIR_OUT;
            if (floor) {
                if (band && stairwell(y, a)) {
                    w.set(x, y, z, SB.AIR);
                } else {
                    w.set(x, y, z, floorTile(w, x, z, y));
                }
                continue;
            }
            if (y == VAULT + 6 && !(band && stairwell(ARENA, a))) {
                w.set(x, y, z, SB.POLISHED);   // the vault's ceiling, under the arena floor
                continue;
            }
            if (band && y >= 0 && y < ARENA && Math.floorMod(y - base(a), PITCH) == 0) {
                w.set(x, y, z, SB.stairs(EndBlocks.OBSIDIAN_BRICK_STAIRS, SB.tangent(x, z), false));
                continue;
            }
            if (band && y < ARENA - 1 && Math.floorMod(y + 1 - base(a), PITCH) == 0 && y >= 0) {
                w.set(x, y, z, SB.stairs(EndBlocks.OBSIDIAN_BRICK_STAIRS, SB.tangent(x, z).getOpposite(), true));   // the stair's underside
                continue;
            }
            w.set(x, y, z, SB.AIR);
        }
        // windows: slits through the wall, four per storey, never on a belt or a fin
        if (r >= WALL_IN && r <= WALL_OUT + 0.01 && !onFin) {
            for (int storey = 0; storey < 4; storey++) {
                int f = storey * PITCH, lo = storey < 3 ? f + 5 : f + 3, hi = storey < 3 ? f + 8 : f + 5;
                double wa = storey * Math.PI / 4 + Math.PI / 2;
                for (int k = 0; k < 4; k++) {
                    double aa = wa + k * Math.PI / 2;
                    double da = Math.abs(Math.atan2(Math.sin(a - aa), Math.cos(a - aa)));
                    if (da * r < 0.6) {
                        for (int y = lo; y <= hi + 1; y++) {
                            w.set(x, y, z, y == hi + 1 ? SB.CHISELED : SB.AIR);
                        }
                    }
                }
            }
        }
    }

    static BlockState floorTile(EndStructurePiece.W w, int x, int z, int y) {
        double r = Math.sqrt(x * x + z * z);
        if (r < 2.5) {
            return SB.CHISELED;
        }
        if (r > 5.6) {
            return SB.POLISHED;
        }
        if ((x + z & 3) == 0 && (x - z & 3) == 0) {
            return SB.GLOW;
        }
        return w.rnd(x, y, z, 33) < 0.15 ? SB.CRACKED_TILES : SB.TILES;
    }

    /** The door (+z): a 3-wide, 4-high opening with a pointed head and steps down to the ground. */
    private static void door(EndStructurePiece.W w) {
        for (int x = -1; x <= 1; x++) {
            for (int z = 5; z <= 11; z++) {
                for (int y = 0; y <= 3; y++) {
                    if (z <= 9 && Math.sqrt(x * x + z * z) >= WALL_IN - 0.5) {
                        w.set(x, y, z, SB.AIR);
                    }
                }
            }
            w.set(x, 4, 8, x == 0 ? SB.GLOW : SB.CHISELED);
        }
        w.set(-1, 3, 8, SB.stairs(EndBlocks.OBSIDIAN_BRICK_STAIRS, Direction.EAST, true));
        w.set(1, 3, 8, SB.stairs(EndBlocks.OBSIDIAN_BRICK_STAIRS, Direction.WEST, true));
        for (int x = -2; x <= 2; x += 4) {
            for (int y = 0; y <= 5; y++) {
                w.set(x, y, 9, y == 5 ? SB.GLOW : SB.POLISHED);
            }
        }
        for (int x = -1; x <= 1; x++) {   // steps down from the plinth
            w.set(x, -1, 11, SB.stairs(EndBlocks.OBSIDIAN_BRICK_STAIRS, Direction.NORTH, false));
            w.set(x, -2, 12, SB.stairs(EndBlocks.OBSIDIAN_BRICK_STAIRS, Direction.NORTH, false));
            w.foundation(x, 12, -3, 12, SB.BRICKS);
            for (int y = -1; y <= 3; y++) {
                w.set(x, y, 12, y == -2 ? SB.stairs(EndBlocks.OBSIDIAN_BRICK_STAIRS, Direction.NORTH, false) : SB.AIR);
            }
        }
        w.guard(5, 0, 12);
        if (w.rnd(0, 0, 0, 40) < 0.5) {
            w.guard(-6, 0, 11);
        }
    }

    /** The arena on top: rings, glowing spokes, pillars for cover, a broken rim, and the Monolith. */
    private static void arena(EndStructurePiece.W w) {
        int y = ARENA;
        for (int x = -13; x <= 13; x++) {
            for (int z = -13; z <= 13; z++) {
                double r = Math.sqrt(x * x + z * z), a = Math.atan2(z, x);
                if (r > ARENA_R) {
                    continue;
                }
                if (r < STAIR_OUT && r >= CORE && stairwell(ARENA, a)) {
                    w.set(x, y, z, SB.AIR);   // where the stair comes up
                    continue;
                }
                double spoke = Math.abs(Math.atan2(Math.sin(a * 4), Math.cos(a * 4))) * r / 4;
                BlockState s;
                if (r < 2.2) {
                    s = SB.CHISELED;
                } else if (r < 3.2) {
                    s = SB.GLOW;
                } else if (spoke < 0.5 && r < 11.2 && r > 4.5) {
                    s = SB.GLOW;
                } else if (r >= 7.2 && r < 8.2 || r >= 11.5) {
                    s = SB.POLISHED;
                } else {
                    s = w.rnd(x, y, z, 41) < 0.12 ? SB.CRACKED_TILES : SB.TILES;
                }
                w.set(x, y, z, s);
                for (int yy = y + 1; yy <= y + 10; yy++) {
                    w.set(x, yy, z, SB.AIR);
                }
                if (r > 11.6) {   // the rim: posts with gaps
                    int seg = (int) Math.floor((a + Math.PI) / (Math.PI * 2) * 28);
                    if (seg % 4 != 0 && w.rnd(seg, 0, 0, 42) > 0.2) {
                        w.set(x, y + 1, z, w.rnd(x, y, z, 43) < 0.25 ? SB.CRACKED : SB.BRICKS);
                        if (seg % 4 == 2) {
                            w.set(x, y + 2, z, SB.post(EndBlocks.OBSIDIAN_BRICK_WALL));
                        }
                    }
                }
            }
        }
        // six pillars for cover
        for (int p = 0; p < 6; p++) {
            double a = Math.PI / 6 + p * Math.PI / 3;
            int cx = (int) Math.round(Math.cos(a) * 8.6), cz = (int) Math.round(Math.sin(a) * 8.6);
            int h = 3 + (int) (w.rnd(p, 0, 0, 44) * 4);
            for (int dx = 0; dx <= 1; dx++) {
                for (int dz = 0; dz <= 1; dz++) {
                    int hh = h - (int) (w.rnd(p, dx, dz, 45) * 2);
                    for (int yy = 1; yy <= hh; yy++) {
                        w.set(cx + dx, y + yy, cz + dz, yy == hh ? SB.CHISELED : w.rnd(cx + dx, yy, cz + dz, 46) < 0.15 ? SB.CRYING
                                : SB.OBSIDIAN);
                    }
                }
            }
        }
        w.monolith(0, y + 1, 0);
    }

    /** Chests, guards and the treasure on the floors (by the wall, across from the stairwell). */
    private static void rooms(EndStructurePiece.W w) {
        w.chest(-5, 0, -3, Direction.EAST, EndLoot.TOWER_CHEST);
        for (int i = 0; i < FLOORS.length; i++) {
            int f = FLOORS[i] + 1;
            // the stairwell is at the end of the turn (angles just under 2 pi): put things round pi
            w.chest(-6, f, 1, Direction.EAST, EndLoot.TOWER_CHEST);
            if (w.rnd(i, 0, 0, 50) < 0.6) {
                w.chest(-4, f, 4, Direction.SOUTH, EndLoot.TOWER_CHEST);
            }
            w.guard(-5, f, -2);
            w.set(-5, f, 3, SB.END_ROD);
        }
        int v = VAULT + 1;
        w.chest(-6, v, 0, Direction.EAST, EndLoot.TOWER_TREASURE);
        w.set(-6, v, 2, SB.GLOW_BRICKS);
        w.set(-6, v, -2, SB.GLOW_BRICKS);
        w.set(-6, v + 1, 2, SB.END_ROD);
        w.set(-6, v + 1, -2, SB.END_ROD);
    }
}
