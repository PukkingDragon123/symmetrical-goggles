package dev.lowpix.winterworks.end;

import dev.lowpix.winterworks.registry.EndBlocks;
import net.minecraft.core.Direction;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.Heightmap;

/**
 * Floating islands and rocks (docs/END_UPDATE.md section 1). An island (y 70-150, radius 4-14) is a gently domed disc
 * with a ragged outline whose underside narrows in terraces to a point, like an inverted ziggurat worn by the void;
 * its top has the biome's own surface and plants (in the meadows, End Moss drapes over the rim), and big chorus roots
 * hang from it, the biggest two blocks thick.
 * Small rocks drift between them. Every island is planned from its chunk's hash, so neighbours agree on who yields
 * where two would overlap.
 */
public final class FloatingIsland {
    public static final int MIN_Y = 70, MAX_Y = 150, MIN_RADIUS = 4, MAX_RADIUS = 14;
    /** The share of chunks with an island centred in them. */
    static final float CHANCE = 0.12f;

    private FloatingIsland() {}

    public record Plan(int x, int y, int z, int radius, long id) {}

    /** The island centred in chunk (cx, cz), if it has one (before overlap and clearance checks). */
    public static Plan plan(long seed, int cx, int cz) {
        if (EndGen.rnd(seed, cx, 0, cz, 401) >= CHANCE) {
            return null;
        }
        float s = EndGen.rnd(seed, cx, 1, cz, 402);
        int radius = MIN_RADIUS + Math.round((float) Math.pow(s, 0.85) * (MAX_RADIUS - MIN_RADIUS));
        int x = (cx << 4) + 3 + (int) (EndGen.rnd(seed, cx, 2, cz, 403) * 10);
        int z = (cz << 4) + 3 + (int) (EndGen.rnd(seed, cx, 3, cz, 404) * 10);
        int y = MIN_Y + 6 + (int) (EndGen.rnd(seed, cx, 4, cz, 405) * (MAX_Y - MIN_Y - 6));
        return new Plan(x, y, z, radius, EndGen.hash(seed, cx, 5, cz, 406));
    }

    static boolean overlaps(Plan a, Plan b) {
        double dh = Math.hypot(a.x - b.x, a.z - b.z);
        int dv = Math.abs(a.y - b.y);
        return dh < (a.radius + b.radius) * 0.95 + 3 && dv < (a.radius + b.radius) * 0.8 + 6;
    }

    /** Places the island of this chunk, if any: the feature's work. */
    static boolean placeForChunk(EndWriter w, int cx, int cz) {
        Plan plan = plan(w.seed, cx, cz);
        if (plan == null) {
            return false;
        }
        for (int dx = -1; dx <= 1; dx++) {
            for (int dz = -1; dz <= 1; dz++) {
                Plan o = (dx | dz) == 0 ? null : plan(w.seed, cx + dx, cz + dz);
                if (o != null && overlaps(plan, o) && Long.compareUnsigned(o.id, plan.id) > 0) {
                    return false;   // the neighbour's island wins this patch of sky
                }
            }
        }
        EndGen.Style st = EndGen.style(w.level, new net.minecraft.core.BlockPos(plan.x, 64, plan.z));
        if (st == null) {
            return false;
        }
        // keep clear of the ground (and of End City towers' heights): lift it if the land below rises too high
        int ground = 0;
        for (int dx = -plan.radius; dx <= plan.radius; dx += 3) {
            for (int dz = -plan.radius; dz <= plan.radius; dz += 3) {
                if (dx * dx + dz * dz <= plan.radius * plan.radius) {
                    ground = Math.max(ground, w.level.getHeight(Heightmap.Types.WORLD_SURFACE_WG, plan.x + dx, plan.z + dz));
                }
            }
        }
        int y = Math.max(plan.y, ground + (int) Math.ceil(depth(plan.radius)) + 7);
        if (y > MAX_Y) {
            return false;
        }
        build(w, plan.x, y, plan.z, plan.radius, st, plan.id);
        return true;
    }

    static double depth(int radius) {
        return 2.5 + radius * 0.95;
    }

    /** Builds an island centred at (cx, cy, cz) with radius `radius` (4-14) in style `st`. */
    public static void build(EndWriter w, int cx, int cy, int cz, int radius, EndGen.Style st, long id) {
        EndGen.Noises n = EndGen.noises(w.seed);
        double ox = (id & 0xFFFF) / 997.0, oz = ((id >>> 16) & 0xFFFF) / 991.0;
        double depth = depth(radius);
        int step = radius >= 8 ? 3 : 2;
        int reach = Math.min(15, (int) Math.ceil(radius * 1.12));
        int[][] bottom = new int[2 * reach + 1][2 * reach + 1];
        int[][] top = new int[2 * reach + 1][2 * reach + 1];
        for (int dx = -reach; dx <= reach; dx++) {
            for (int dz = -reach; dz <= reach; dz++) {
                bottom[dx + reach][dz + reach] = Integer.MIN_VALUE;
                double r = Math.sqrt(dx * dx + dz * dz);
                double a = Math.atan2(dz, dx);
                double edge = Math.min(reach, radius * (0.8 + 0.32 * (0.5 + 0.5 * n.a().getValue(Math.cos(a) * 1.6 + ox,
                        Math.sin(a) * 1.6 + oz))));
                double t = r / edge;
                if (t > 1) {
                    continue;
                }
                int x = cx + dx, z = cz + dz;
                int topOff = (int) Math.round((1 - t * t) * (0.6 + radius * 0.13) + n.b().getValue(x * 0.15, z * 0.15) * 0.7);
                double raw = depth * Math.pow(1 - t, 1.05) + n.c().getValue(x * 0.11, z * 0.11) * 1.8;
                int d = Math.max(1, (int) Math.ceil(raw / step) * step);
                if (t > 0.88) {
                    d = Math.min(d, 2);   // a thin lip: the overhang at the rim
                }
                int yTop = cy + topOff, yBot = cy - d;
                for (int y = yBot; y <= yTop; y++) {
                    BlockState s = EndGen.END_STONE;
                    if (st == EndGen.Style.DEAD_END && y < cy - 1 && n.a().getValue(x * 0.09, y * 0.2, z * 0.09) > 0.55) {
                        s = EndGen.OBSIDIAN;   // dark veins through the Dead End's islands
                    }
                    w.set(x, y, z, s);
                }
                if (st == EndGen.Style.MEADOWS) {
                    w.set(x, yTop, z, EndSurface.meadowTop(n, x, z));
                } else if (!EndSurface.outcrop(n, x, z) && yTop - yBot >= 2) {
                    w.set(x, yTop, z, EndGen.SAND);
                    if (yTop - yBot >= 4) {
                        w.set(x, yTop - 1, z, EndGen.SAND);
                    }
                }
                bottom[dx + reach][dz + reach] = yBot;
                top[dx + reach][dz + reach] = yTop;
            }
        }
        roots(w, cx, cz, radius, reach, bottom, id);
        if (st == EndGen.Style.MEADOWS) {   // End Moss draping over the rim
            for (int dx = -reach; dx <= reach; dx++) {
                for (int dz = -reach; dz <= reach; dz++) {
                    if (bottom[dx + reach][dz + reach] == Integer.MIN_VALUE) {
                        continue;
                    }
                    int x = cx + dx, z = cz + dz, yTop = top[dx + reach][dz + reach];
                    int len = (int) Math.round(1 + 2.5 * (0.5 + 0.5 * n.b().getValue(x * 0.3 + 11, z * 0.3)));
                    for (int k = 1; k <= len; k++) {
                        int y = yTop - k;
                        if (w.get(x, y, z).is(net.minecraft.world.level.block.Blocks.END_STONE) && (w.get(x + 1, y, z).isAir()
                                || w.get(x - 1, y, z).isAir() || w.get(x, y, z + 1).isAir() || w.get(x, y, z - 1).isAir())) {
                            w.set(x, y, z, EndGen.MOSS);
                        }
                    }
                }
            }
        }
        if (st == EndGen.Style.MEADOWS && radius >= 8) {   // a chorus tree on the bigger meadow islands
            int tx = (int) ((id >>> 20) % 3) - 1, tz = (int) ((id >>> 24) % 3) - 1;
            ChorusTree.grow(w, cx + tx, top[tx + reach][tz + reach] + 1, cz + tz, EndGen.mix(id ^ 0x7EE));
        }
        for (int dx = -reach; dx <= reach; dx++) {
            for (int dz = -reach; dz <= reach; dz++) {
                if (bottom[dx + reach][dz + reach] != Integer.MIN_VALUE) {
                    int x = cx + dx, z = cz + dz, y = top[dx + reach][dz + reach] + 1;
                    if (w.get(x, y, z).isAir()) {
                        EndSurface.plant(w, n, st, x, y, z);
                    }
                }
            }
        }
    }

    static BlockState root(Direction.Axis axis) {
        return EndBlocks.CHORUS_ROOTS.defaultBlockState().setValue(RotatedPillarBlock.AXIS, axis);
    }

    /** Big chorus roots hanging from the underside, wandering a little as they go down. */
    static void roots(EndWriter w, int cx, int cz, int radius, int reach, int[][] bottom, long id) {
        int count = 2 + radius / 2 + (int) ((id >>> 50) & 1);
        for (int i = 0; i < count; i++) {
            long h = EndGen.mix(id + i * 0x9E3779B97F4A7C15L);
            double a = (h & 0xFFFF) / 65536.0 * Math.PI * 2;
            double rr = ((h >>> 16) & 0xFFFF) / 65536.0 * radius * 0.55;
            int dx = (int) Math.round(Math.cos(a) * rr), dz = (int) Math.round(Math.sin(a) * rr);
            if (Math.abs(dx) > reach || Math.abs(dz) > reach || bottom[dx + reach][dz + reach] == Integer.MIN_VALUE) {
                continue;
            }
            int x = cx + dx, z = cz + dz, y = bottom[dx + reach][dz + reach] - 1;
            int len = 3 + (int) (radius * 0.5 + ((h >>> 32) & 0xFF) / 256.0 * radius * 0.9);
            boolean thick = i == 0 && radius >= 9 || i == 1 && radius >= 12;
            for (int k = 0; k < len; k++, y--) {
                if (!w.get(x, y, z).isAir() || !w.can(x, y, z)) {
                    break;
                }
                w.set(x, y, z, root(Direction.Axis.Y));
                if (thick && k < len * 0.45) {
                    w.put(x + 1, y, z, root(Direction.Axis.Y));
                    w.put(x, y, z + 1, root(Direction.Axis.Y));
                    w.put(x + 1, y, z + 1, root(Direction.Axis.Y));
                }
                long hk = EndGen.mix(h ^ k * 0x632BE59BD9B4E019L);
                if (k > 1 && (hk & 7) == 0) {   // a kink: one block sideways
                    Direction d = Direction.from2DDataValue((int) ((hk >>> 8) & 3));
                    int nx = x + d.getStepX(), nz = z + d.getStepZ();
                    if (!w.get(nx, y, nz).isAir()) {
                        break;
                    }
                    w.set(nx, y, nz, root(d.getAxis()));
                    x = nx;
                    z = nz;
                }
            }
        }
    }

    // ------------------------------------------------------------------------------------------ floating rocks

    /** 0-2 small rocks adrift over the chunk. */
    static boolean rocks(EndWriter w, int cx, int cz) {
        boolean any = false;
        for (int i = 0; i < 2; i++) {
            if (EndGen.rnd(w.seed, cx, 10 + i, cz, 410) >= (i == 0 ? 0.11f : 0.03f)) {
                continue;
            }
            int x = (cx << 4) + 2 + (int) (EndGen.rnd(w.seed, cx, 12 + i, cz, 411) * 12);
            int z = (cz << 4) + 2 + (int) (EndGen.rnd(w.seed, cx, 14 + i, cz, 412) * 12);
            int y = 74 + (int) (EndGen.rnd(w.seed, cx, 16 + i, cz, 413) * 70);
            double r = 1.3 + EndGen.rnd(w.seed, cx, 18 + i, cz, 414) * 2.3;
            EndGen.Style st = EndGen.style(w.level, new net.minecraft.core.BlockPos(x, 64, z));
            if (st == null || y < w.level.getHeight(Heightmap.Types.WORLD_SURFACE_WG, x, z) + 8) {
                continue;
            }
            any |= rock(w, x, y, z, r, st, EndGen.hash(w.seed, cx, 20 + i, cz, 415));
        }
        return any;
    }

    /** A lumpy rock tapering to a point below; false if the sky there isn't empty. */
    public static boolean rock(EndWriter w, int x, int y, int z, double r, EndGen.Style st, long id) {
        int c = (int) Math.ceil(r) + 1;
        for (int dx = -c; dx <= c; dx++) {
            for (int dy = -c * 2; dy <= c; dy++) {
                for (int dz = -c; dz <= c; dz++) {
                    if (!w.get(x + dx, y + dy, z + dz).isAir()) {
                        return false;
                    }
                }
            }
        }
        EndGen.Noises n = EndGen.noises(w.seed);
        boolean dark = st == EndGen.Style.DEAD_END && (id & 3) == 0;
        for (int dx = -c; dx <= c; dx++) {
            for (int dy = -c * 2; dy <= c; dy++) {
                for (int dz = -c; dz <= c; dz++) {
                    double sy = dy > 0 ? dy * 1.5 : dy * 0.62;   // flat-ish top, a long keel
                    double d = Math.sqrt(dx * dx + sy * sy + dz * dz);
                    double lump = r * (0.8 + 0.35 * n.b().getValue((x + dx) * 0.4, (y + dy) * 0.4, (z + dz) * 0.4));
                    if (d <= lump) {
                        w.set(x + dx, y + dy, z + dz, dark ? EndGen.OBSIDIAN : EndGen.END_STONE);
                    }
                }
            }
        }
        if (st == EndGen.Style.MEADOWS) {
            for (int dx = -c; dx <= c; dx++) {
                for (int dz = -c; dz <= c; dz++) {
                    for (int dy = c; dy >= -c; dy--) {
                        if (w.get(x + dx, y + dy, z + dz).is(Blocks.END_STONE)) {
                            w.set(x + dx, y + dy, z + dz, EndGen.GRASS);
                            EndSurface.plant(w, n, st, x + dx, y + dy + 1, z + dz);
                            break;
                        }
                    }
                }
            }
            if ((id >>> 8 & 1) == 0) {   // a root dangling from it
                int yy = y - (int) Math.ceil(r * 1.6);
                while (!w.get(x, yy, z).isAir() && yy > y - 3 * c) {
                    yy--;
                }
                for (int k = 0; k < 2 + (id >>> 9 & 3); k++) {
                    w.put(x, yy - k, z, root(Direction.Axis.Y));
                }
            }
        }
        return true;
    }
}
