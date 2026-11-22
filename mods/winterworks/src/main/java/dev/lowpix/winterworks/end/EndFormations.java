package dev.lowpix.winterworks.end;

import net.minecraft.world.level.block.state.BlockState;

/**
 * The Living End's rock (docs/END_UPDATE.md section 1): alien formations in both biomes (arches, standing rings and
 * twisted spires of end stone banded with purpur in the meadows, with obsidian in the Dead End), and the Dead End's
 * giant end-stone pillars capped with obsidian, jagged obsidian formations and rock piles. Each takes the air block
 * over its ground and a hash; shapes are swept balls, so they come out smooth.
 */
public final class EndFormations {
    private EndFormations() {}

    static BlockState band(EndGen.Style st) {
        return st == EndGen.Style.DEAD_END ? EndGen.OBSIDIAN : EndGen.PURPUR;
    }

    static BlockState accent(EndGen.Style st) {
        return st == EndGen.Style.DEAD_END ? EndGen.CRYING : EndGen.PURPUR;
    }

    static double u(long h, int shift) {
        return ((h >>> shift) & 0xFFFF) / 65536.0;
    }

    /** Fills a tube along a polyline, ball by ball. */
    private interface Mat {
        BlockState at(double t, int x, int y, int z);
    }

    private static void tube(EndWriter w, double[] xs, double[] ys, double[] zs, double[] rs, Mat mat) {
        for (int i = 0; i < xs.length; i++) {
            double t = xs.length == 1 ? 0 : i / (double) (xs.length - 1);
            w.ball(xs[i], ys[i], zs[i], rs[i], p -> mat.at(t, p.getX(), p.getY(), p.getZ()), false);
        }
    }

    // ------------------------------------------------------------------------------------------ arches

    /**
     * A natural arch from (x, y, z) to `span` blocks away along angle a; both feet must find ground within 4 blocks of
     * y (the caller's `groundAt`). Returns false if they don't.
     */
    public static boolean arch(EndWriter w, int x, int y, int z, int y2, double a, int span, int height, EndGen.Style st, long id) {
        int samples = span * 4;
        double[] xs = new double[samples + 1], ys = new double[samples + 1], zs = new double[samples + 1], rs = new double[samples + 1];
        double ex = x + Math.cos(a) * span, ez = z + Math.sin(a) * span;
        double thick = 1.4 + u(id, 4) * 0.7;
        for (int i = 0; i <= samples; i++) {
            double t = i / (double) samples;
            xs[i] = x + 0.5 + (ex - x) * t;
            zs[i] = z + 0.5 + (ez - z) * t;
            double base = y + (y2 - y) * t;
            ys[i] = base + height * Math.pow(Math.sin(Math.PI * t), 0.75) - 1.5;
            rs[i] = thick * (0.72 + 0.45 * Math.abs(Math.cos(Math.PI * t)));
        }
        BlockState b = band(st);
        tube(w, xs, ys, zs, rs, (t, px, py, pz) -> ((int) Math.floor(t * span / 2.2 + py * 0.15)) % 3 == 0 ? b : EndGen.END_STONE);
        // feet: sunk into the ground
        for (int k = 1; k <= 3; k++) {
            w.ball(xs[0], ys[0] - k, zs[0], rs[0] + 0.3, p -> EndGen.END_STONE, false);
            w.ball(xs[samples], ys[samples] - k, zs[samples], rs[samples] + 0.3, p -> EndGen.END_STONE, false);
        }
        return true;
    }

    // ------------------------------------------------------------------------------------------ rings

    /** A ring standing on edge on the ground at (x, y, z), facing along angle a. */
    public static boolean ring(EndWriter w, int x, int y, int z, double a, EndGen.Style st, long id) {
        double rm = 4 + u(id, 6) * 3.2, rt = 1.0 + u(id, 22) * 0.6;
        double cx = x + 0.5, cy = y + rm - 1.0, cz = z + 0.5;
        double ux = Math.cos(a), uz = Math.sin(a);
        int samples = (int) (rm * 2 * Math.PI * 2.5);
        double[] xs = new double[samples], ys = new double[samples], zs = new double[samples], rs = new double[samples];
        for (int i = 0; i < samples; i++) {
            double f = i * Math.PI * 2 / samples;
            xs[i] = cx + Math.cos(f) * rm * ux;
            zs[i] = cz + Math.cos(f) * rm * uz;
            ys[i] = cy + Math.sin(f) * rm;
            rs[i] = rt * (1 + 0.18 * Math.sin(f * 3 + id));
        }
        BlockState b = band(st), acc = accent(st);
        tube(w, xs, ys, zs, rs, (t, px, py, pz) -> {
            int seg = (int) Math.floor(t * 12);
            return seg % 4 == 0 ? acc : seg % 2 == 0 ? EndGen.END_STONE : b;
        });
        // a plinth where it meets the ground
        w.ball(cx, y - 0.5, cz, rt + 1.4, p -> EndGen.END_STONE, false);
        w.ball(cx, y - 2.0, cz, rt + 2.0, p -> EndGen.END_STONE, false);
        return true;
    }

    // ------------------------------------------------------------------------------------------ twisted spires

    /** A spire of 2-3 strands twisting round each other, rising from (x, y, z). */
    public static boolean spire(EndWriter w, int x, int y, int z, EndGen.Style st, long id) {
        int height = 14 + (int) (u(id, 2) * 17);
        int strands = 2 + (int) ((id >>> 20) & 1);
        double rb = 2.0 + u(id, 24) * 1.4, turns = 1.1 + u(id, 40) * 1.3, f0 = u(id, 8) * Math.PI * 2;
        int samples = height * 3;
        BlockState b = band(st), acc = accent(st);
        for (int sidx = 0; sidx < strands; sidx++) {
            double[] xs = new double[samples + 1], ys = new double[samples + 1], zs = new double[samples + 1], rs = new double[samples + 1];
            for (int i = 0; i <= samples; i++) {
                double t = i / (double) samples;
                double f = f0 + sidx * Math.PI * 2 / strands + t * turns * Math.PI * 2;
                double r = rb * Math.pow(1 - t, 0.85) + 0.25;
                xs[i] = x + 0.5 + Math.cos(f) * r;
                zs[i] = z + 0.5 + Math.sin(f) * r;
                ys[i] = y - 1 + t * height;
                rs[i] = 1.45 * (1 - t) + 0.45;
            }
            boolean dark = sidx % 2 == 1;
            tube(w, xs, ys, zs, rs, (t, px, py, pz) -> t > 0.93 ? acc : dark ? b : EndGen.END_STONE);
        }
        // a core through the lower half, and a footing
        for (int k = -3; k < height / 2; k++) {
            double t = Math.max(0, k) / (double) height;
            w.ball(x + 0.5, y + k, z + 0.5, (rb + 0.4) * (1 - t * 1.6), p -> EndGen.END_STONE, false);
        }
        return true;
    }

    // ------------------------------------------------------------------------------------------ the Dead End

    /** A giant end-stone pillar, weathered and leaning a little, capped with obsidian (crying at the drips). */
    public static boolean pillar(EndWriter w, int x, int y, int z, long id) {
        EndGen.Noises n = EndGen.noises(w.seed);
        int height = 18 + (int) (u(id, 2) * 22);
        double rb = 2.4 + u(id, 18) * 2.0;
        double lean = u(id, 34) * Math.PI * 2, lm = u(id, 50) * 0.06;
        for (int k = -4; k <= height; k++) {
            double t = Math.max(0, k) / (double) height;
            double cx = x + 0.5 + Math.cos(lean) * lm * Math.max(0, k), cz = z + 0.5 + Math.sin(lean) * lm * Math.max(0, k);
            double r = rb * (1 - 0.28 * t) * (0.86 + 0.22 * n.a().getValue(k * 0.16, id % 1000));
            if (k < 2) {
                r += (2 - k) * 0.6;   // talus at the foot
            }
            boolean cap = k > height - 4;
            if (cap) {
                r = rb * 0.85 + (k > height - 2 ? 1.2 : 0.6);   // a wider obsidian table on top
            }
            int yy = y + k;
            int ri = (int) Math.ceil(r);
            for (int dx = -ri; dx <= ri; dx++) {
                for (int dz = -ri; dz <= ri; dz++) {
                    double ddx = (int) Math.floor(cx) + dx + 0.5 - cx, ddz = (int) Math.floor(cz) + dz + 0.5 - cz;
                    if (ddx * ddx + ddz * ddz > r * r) {
                        continue;
                    }
                    int px = (int) Math.floor(cx) + dx, pz = (int) Math.floor(cz) + dz;
                    BlockState s = EndGen.END_STONE;
                    if (cap) {
                        s = w.rnd(px, yy, pz, 51) < 0.12 ? EndGen.CRYING : EndGen.OBSIDIAN;
                    } else if (k > height - 9 && w.rnd(px, 0, pz, 52) < 0.06) {
                        s = EndGen.CRYING;   // tears running down from the cap
                    }
                    w.set(px, yy, pz, s);
                }
            }
        }
        return true;
    }

    /** A jagged cluster of obsidian shards bursting from the ground. */
    public static boolean shards(EndWriter w, int x, int y, int z, long id) {
        int count = 3 + (int) ((id >>> 3) % 5);
        for (int i = 0; i < count; i++) {
            long h = EndGen.mix(id + i * 0x9E3779B97F4A7C15L);
            double az = u(h, 0) * Math.PI * 2, tilt = Math.toRadians(8 + u(h, 16) * 40);
            double len = (i == 0 ? 9 : 4) + u(h, 32) * (i == 0 ? 7 : 7);
            double r0 = (i == 0 ? 1.7 : 1.1) + u(h, 48) * 0.6;
            double dx = Math.sin(tilt) * Math.cos(az), dy = Math.cos(tilt), dz = Math.sin(tilt) * Math.sin(az);
            double sx = x + 0.5 + Math.cos(az) * (i == 0 ? 0 : 1.2), sz = z + 0.5 + Math.sin(az) * (i == 0 ? 0 : 1.2);
            for (double s = -2; s <= len; s += 0.4) {
                double t = Math.max(0, s) / len;
                double r = r0 * (1 - t) + 0.35;
                boolean tip = t > 0.8;
                w.ball(sx + dx * s, y - 0.5 + dy * s, sz + dz * s, r,
                        p -> tip && (h & 1) == 0 || w.rnd(p.getX(), p.getY(), p.getZ(), 61) < 0.1 ? EndGen.CRYING : EndGen.OBSIDIAN, false);
            }
        }
        w.ball(x + 0.5, y - 1, z + 0.5, 2.2, p -> EndGen.OBSIDIAN, false);
        return true;
    }

    /** A pile of 2-5 boulders, mostly end stone, the odd one of obsidian. */
    public static boolean rockPile(EndWriter w, int x, int y, int z, long id) {
        int count = 2 + (int) ((id >>> 5) % 4);
        for (int i = 0; i < count; i++) {
            long h = EndGen.mix(id + i * 0x2545F4914F6CDD1DL);
            double r = 1.0 + u(h, 0) * 1.4;
            double bx = x + 0.5 + (u(h, 16) - 0.5) * 6, bz = z + 0.5 + (u(h, 32) - 0.5) * 6;
            BlockState s = (h >>> 60) < 3 ? EndGen.OBSIDIAN : EndGen.END_STONE;
            w.ball(bx, y + r * 0.35 - 0.5, bz, r, p -> s, false);
        }
        return true;
    }
}
