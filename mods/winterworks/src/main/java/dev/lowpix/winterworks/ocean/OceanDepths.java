package dev.lowpix.winterworks.ocean;

import static dev.lowpix.winterworks.ocean.OceanGen.lerp;
import static dev.lowpix.winterworks.ocean.OceanGen.rnd;
import static dev.lowpix.winterworks.ocean.OceanGen.smooth;

import it.unimi.dsi.fastutil.longs.Long2ObjectOpenHashMap;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.Direction;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.biome.Climate;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.DensityFunction;
import net.minecraft.world.level.levelgen.structure.BoundingBox;

/**
 * The shape of the deep oceans (docs/OCEAN_UPDATE.md section 1): a floor height for every column and the rock
 * formations, worked out from the climate the biome source sees (continentalness: how far out to sea; temperature:
 * which ocean) and seeded noise. Everything here is a pure function of the world seed, the climate and the protected
 * structure boxes, so a chunk can work out its neighbours' columns exactly and nothing has to be written outside it.
 * <ul>
 * <li>The continental shelf keeps its vanilla floor. Past the shelf edge (continentalness about -0.50) a first cliff
 * drops to a terrace near y 10, a second to the deep floor at y -10..-30: rolling, with basins and ridges.</li>
 * <li>Out in the abyss (the slot of the new biomes, continentalness below -0.62) cold and temperate water opens into
 * long winding trenches down to y -55; warm water gets a rough volcanic floor instead.</li>
 * <li>The cliffs and trench walls are undercut (overhangs, ledges and alcoves from 3D noise), and stone and tuff
 * pillars, arches and hoodoos stand on the deep floor.</li>
 * <li>Mushroom islands and the boxes of other structures (shipwrecks, ruins, strongholds...) are left as they are,
 * blending back to the vanilla floor over {@link #PROTECT_OUT} blocks.</li>
 * </ul>
 */
public final class OceanDepths {
    /** Nothing is carved above this (sea level 63 - 9), nor below {@link #BOTTOM} (the trench floors are at -55). */
    public static final int TOP = 54, BOTTOM = -54;
    /** A floor height that carves nothing. */
    public static final double NO_CARVE = 72;
    /** The shelf edge and the start of the abyss, as negated continentalness. */
    public static final double SHELF = 0.50, ABYSS = 0.62;
    /** Around a protected structure the floor stays vanilla within PROTECT_IN blocks and blends out by PROTECT_OUT. */
    public static final int PROTECT_IN = 5, PROTECT_OUT = 18;
    /** Rock formations: at most one per FORM_CELL x FORM_CELL cell. */
    static final int FORM_CELL = 44;
    /** The y range of the formation bit columns. */
    static final int FORM_Y0 = BOTTOM - 6, FORM_YN = 128;

    public enum Zone { NORMAL, COLD, FROZEN, LUKEWARM, WARM, ABYSSAL, VOLCANIC }

    private OceanDepths() {}

    // ============================================================================================ the climate

    /** The climate of block columns, as the biome source sees it. */
    public interface ClimateField {
        double continentalness(int x, int z);

        double temperature(int x, int z);
    }

    /**
     * The world's climate: the sampler's values at the quart corners round a column (where the biome source samples
     * them), interpolated. Caches the corners it has seen: make one per job, they're not thread safe.
     */
    public static final class Sampled implements ClimateField {
        private final Climate.Sampler sampler;
        private final Long2ObjectOpenHashMap<double[]> cache = new Long2ObjectOpenHashMap<>();

        public Sampled(Climate.Sampler sampler) {
            this.sampler = sampler;
        }

        private double[] quart(int qx, int qz) {
            long k = ChunkPos.asLong(qx, qz);
            double[] v = cache.get(k);
            if (v == null) {
                DensityFunction.SinglePointContext p = new DensityFunction.SinglePointContext(qx << 2, 0, qz << 2);
                v = new double[]{sampler.continentalness().compute(p), sampler.temperature().compute(p)};
                cache.put(k, v);
            }
            return v;
        }

        private double at(int x, int z, int i) {
            int qx = Math.floorDiv(x, 4), qz = Math.floorDiv(z, 4);
            double fx = (x - (qx << 2)) / 4.0, fz = (z - (qz << 2)) / 4.0;
            return lerp(lerp(quart(qx, qz)[i], quart(qx + 1, qz)[i], fx), lerp(quart(qx, qz + 1)[i], quart(qx + 1, qz + 1)[i], fx), fz);
        }

        @Override
        public double continentalness(int x, int z) {
            return at(x, z, 0);
        }

        @Override
        public double temperature(int x, int z) {
            return at(x, z, 1);
        }
    }

    /** A fixed climate everywhere (tests). */
    public static ClimateField fixed(double continentalness, double temperature) {
        return new ClimateField() {
            @Override
            public double continentalness(int x, int z) {
                return continentalness;
            }

            @Override
            public double temperature(int x, int z) {
                return temperature;
            }
        };
    }

    // ============================================================================================ columns

    /** One column's shape. Carved: TOP >= y > floor, or inside an undercut. */
    public static final class Col {
        public double floor = NO_CARVE;
        /** Undercut strengths (0..1) and y ranges: the shelf cliff, the terrace cliff, the trench walls. */
        double u1, u1lo, u1hi, u2, u2lo, u2hi, ut, utlo, uthi;
        public double protect;
        public Zone zone = Zone.NORMAL;
        /** How much of a cliff or trench wall this column is (0..1): walls here get strata. */
        public double wall;

        boolean any() {
            return floor < TOP || u1 > 0.04 || u2 > 0.04 || ut > 0.04;
        }
    }

    /** Works out column (x, z) into `out`. */
    static void column(OceanGen.Noises n, ClimateField cf, int x, int z, double protect, Col out) {
        double c = -cf.continentalness(x, z), t = cf.temperature(x, z);
        out.protect = protect;
        out.u1 = out.u2 = out.ut = out.wall = 0;
        if (c < SHELF - 0.04) {   // the shelf and the coast: vanilla
            out.floor = NO_CARVE;
            out.zone = zone(t, 0, 0);
            return;
        }
        double e1 = SHELF + 0.02 * n.at(0, x, z, 1 / 170.0) + 0.007 * n.at(1, x, z, 1 / 45.0);
        double s1 = smooth(e1, e1 + 0.012, c);
        double e2 = e1 + 0.05 + 0.025 * n.at(2, x, z, 1 / 150.0);
        double s2 = smooth(e2, e2 + 0.012, c);
        double terrace = 9 + 7 * n.at(3, x, z, 1 / 80.0) + 2.5 * n.at(4, x, z, 1 / 23.0);
        double deep = -19 + 7 * n.at(5, x, z, 1 / 120.0) + 3 * n.at(4, x + 517, z - 211, 1 / 31.0);
        double ridge = 1 - Math.abs(n.at(6, x, z, 1 / 210.0));
        if (ridge > 0.8) {
            double k = (ridge - 0.8) / 0.2;
            deep += 22 * k * k;   // ridges rising from the deep floor
        }
        double f = lerp(NO_CARVE, terrace, s1);
        f = lerp(f, deep, s2);
        double abyss = smooth(ABYSS - 0.02, ABYSS + 0.04, c);
        double ab = abyss * smooth(0.27, 0.17, t);   // cold and temperate: the abyssal trench
        double vz = abyss * smooth(0.15, 0.25, t);   // lukewarm and warm: the volcanic depths
        if (ab > 0) {
            double wx = x + 70 * n.at(8, x, z, 1 / 190.0), wz = z + 70 * n.at(9, x, z, 1 / 190.0);
            double tw = Math.abs(n.at(7, wx, wz, 1 / 340.0));
            double tr = smooth(0.13, 0.06, tw) * ab;
            if (tr > 0) {
                double before = f;
                f = lerp(f, -55 + 2 * n.at(4, x - 913, z + 377, 1 / 17.0), tr);
                out.ut = ab * smooth(0.165, 0.13, tw) * (1 - smooth(0.09, 0.065, tw));
                out.utlo = -51;
                out.uthi = before - 2;
                out.wall = Math.max(out.wall, smooth(0.145, 0.095, tw) * (1 - smooth(0.065, 0.045, tw)) * ab);
            }
        }
        if (vz > 0) {
            f += vz * 2.5 * n.at(10, x, z, 1 / 14.0);
        }
        double keep = Math.max(protect, smooth(1.0, 1.035, c));   // mushroom islands stay as they are
        f = lerp(f, NO_CARVE, keep);
        out.floor = Math.max(f, BOTTOM - 1);
        double b1 = smooth(e1 - 0.03, e1, c) * (1 - s1) * (1 - keep);
        double b2 = smooth(e2 - 0.025, e2, c) * (1 - s2) * s1 * (1 - keep);
        out.u1 = b1;
        out.u1lo = terrace + 3;
        out.u1hi = 46;
        out.u2 = b2;
        out.u2lo = deep + 3;
        out.u2hi = terrace - 1;
        out.ut *= 1 - keep;
        out.wall = Math.max(out.wall, Math.max(smooth(e1 - 0.03, e1 + 0.01, c) * (1 - smooth(e1 + 0.01, e1 + 0.02, c)),
                smooth(e2 - 0.025, e2 + 0.01, c) * (1 - smooth(e2 + 0.01, e2 + 0.02, c)))) * (1 - keep);
        out.zone = zone(t, ab, vz);
    }

    static Zone zone(double t, double ab, double vz) {
        if (vz > 0.5) {
            return Zone.VOLCANIC;
        }
        if (ab > 0.5) {
            return Zone.ABYSSAL;
        }
        if (t > 0.55) {
            return Zone.WARM;
        }
        if (t > 0.2) {
            return Zone.LUKEWARM;
        }
        if (t < -0.45) {
            return Zone.FROZEN;
        }
        return t < -0.15 ? Zone.COLD : Zone.NORMAL;
    }

    /** Whether cell (x, y, z) of a column is carved out by an undercut. */
    static boolean undercut(OceanGen.Noises n, Col col, int x, int y, int z) {
        if (col.u1 > 0.04 && y >= col.u1lo && y <= col.u1hi && n.at3(11, x / 9.0, y / 6.0, z / 9.0) > 0.8 - 0.6 * col.u1) {
            return true;
        }
        if (col.u2 > 0.04 && y >= col.u2lo && y <= col.u2hi && n.at3(11, x / 8.0 + 311, y / 5.0, z / 8.0) > 0.8 - 0.6 * col.u2) {
            return true;
        }
        return col.ut > 0.04 && y >= col.utlo && y <= col.uthi && n.at3(11, x / 8.0 - 173, y / 6.0, z / 8.0 + 59) > 0.8 - 0.6 * col.ut;
    }

    /**
     * The final floor top at (x, z), given the vanilla floor top there: where structures sit. Ignores undercuts,
     * formations and protection (structures check those).
     */
    public static int floorTop(long seed, ClimateField cf, int x, int z, int vanillaTop) {
        Col col = new Col();
        column(OceanGen.noises(seed), cf, x, z, 0, col);
        return Math.min(vanillaTop, (int) Math.floor(Math.min(col.floor, TOP)));
    }

    /** The carved floor at (x, z), or NO_CARVE where the vanilla floor stays (no protection). */
    public static double floor(long seed, ClimateField cf, int x, int z) {
        Col col = new Col();
        column(OceanGen.noises(seed), cf, x, z, 0, col);
        return col.floor;
    }

    /** The zone of column (x, z). */
    public static Zone zone(long seed, ClimateField cf, int x, int z) {
        Col col = new Col();
        column(OceanGen.noises(seed), cf, x, z, 0, col);
        return col.zone;
    }

    // ============================================================================================ formations

    /** A rock formation standing on the deep floor: a pillar, an arch or a hoodoo. */
    public record Formation(int kind, double cx, double cz, int base, int top, double r0, double angle, double half, double legTop,
                            double tube, double leanX, double leanZ, double phase, Zone zone, int reach) {
        public static final int PILLAR = 0, ARCH = 1, HOODOO = 2;

        boolean near(int x, int z) {
            return Math.abs(x + 0.5 - cx) <= reach && Math.abs(z + 0.5 - cz) <= reach;
        }

        /** Sets the bits of the solid cells of column (x, z) (bit y - FORM_Y0). */
        void fill(int x, int z, long[] bits) {
            double px = x + 0.5, pz = z + 0.5;
            switch (kind) {
                case PILLAR -> {
                    for (int y = base; y <= top; y++) {
                        double t = (y - base) / (double) (top - base);
                        double dx = px - (cx + leanX * (y - base)), dz = pz - (cz + leanZ * (y - base));
                        double d = Math.sqrt(dx * dx + dz * dz);
                        double a = Math.atan2(dz, dx);
                        double r = r0 * (1.12 - 0.42 * t) + 0.45 * Math.sin(3 * a + phase + y * 0.27) + 0.35 * Math.sin(t * 8 + phase);
                        if (t > 0.86) {
                            double k = (t - 0.86) / 0.14;
                            r *= Math.sqrt(Math.max(0, 1 - k * k * 0.9));
                        }
                        if (d <= r) {
                            set(bits, y);
                        }
                    }
                }
                case ARCH -> {
                    double ca = Math.cos(angle), sa = Math.sin(angle);
                    double u = (px - cx) * ca + (pz - cz) * sa, w = -(px - cx) * sa + (pz - cz) * ca;
                    double b = top - legTop;
                    for (int y = base; y <= top + (int) Math.ceil(tube); y++) {
                        boolean solid = false;
                        if (y <= legTop) {
                            double flare = (legTop - y) * 0.09;
                            for (int s = -1; s <= 1 && !solid; s += 2) {
                                double du = u - s * half, d = Math.sqrt(du * du + w * w);
                                solid = d <= tube * 1.2 + flare + 0.3 * Math.sin(y * 0.6 + phase + s);
                            }
                        } else {
                            double v = y - legTop;
                            double phi = Math.atan2(v / b, u / half);
                            if (phi >= -0.05 && phi <= Math.PI + 0.05) {
                                double eu = half * Math.cos(phi), ev = b * Math.sin(phi);
                                double d = Math.sqrt((u - eu) * (u - eu) + (v - ev) * (v - ev) + w * w);
                                solid = d <= tube * (1 + 0.15 * Math.sin(phi * 5 + phase));
                            }
                        }
                        if (solid) {
                            set(bits, y);
                        }
                    }
                }
                default -> {   // a hoodoo: a neck with a wide cap
                    double rc = half;
                    for (int y = base; y <= top; y++) {
                        double dx = px - (cx + leanX * (y - base)), dz = pz - (cz + leanZ * (y - base));
                        double d = Math.sqrt(dx * dx + dz * dz), a = Math.atan2(dz, dx);
                        double r;
                        if (y >= top - 3) {
                            r = rc * (1 - 0.22 * (y - (top - 3))) + 0.6 * Math.sin(4 * a + phase);
                        } else {
                            double t = (y - base) / (double) Math.max(1, top - 3 - base);
                            r = r0 * (1.25 - 0.35 * t) + 0.35 * Math.sin(3 * a + y * 0.4 + phase);
                        }
                        if (d <= r) {
                            set(bits, y);
                        }
                    }
                }
            }
        }

        private static void set(long[] bits, int y) {
            int i = y - FORM_Y0;
            if (i >= 0 && i < FORM_YN) {
                bits[i >> 6] |= 1L << (i & 63);
            }
        }
    }

    /** The formation of cell (gx, gz), if it has one. */
    static Formation formation(long seed, OceanGen.Noises n, ClimateField cf, int gx, int gz) {
        if (rnd(seed, gx, 11, gz, 701) > 0.55f) {
            return null;
        }
        double cx = gx * FORM_CELL + 8 + rnd(seed, gx, 11, gz, 702) * (FORM_CELL - 16);
        double cz = gz * FORM_CELL + 8 + rnd(seed, gx, 11, gz, 703) * (FORM_CELL - 16);
        Col col = new Col();
        double lo = Double.MAX_VALUE, hi = -Double.MAX_VALUE;
        Zone zone = null;
        int[][] around = {{0, 0}, {8, 0}, {-8, 0}, {0, 8}, {0, -8}};
        for (int i = 0; i < around.length; i++) {
            column(n, cf, (int) Math.floor(cx) + around[i][0], (int) Math.floor(cz) + around[i][1], 0, col);
            lo = Math.min(lo, col.floor);
            hi = Math.max(hi, col.floor);
            if (i == 0) {
                zone = col.zone;
            }
        }
        if (hi > -3 || lo < -40 || hi - lo > 9) {
            return null;   // only on open deep floor: not on a cliff, a ridge or down a trench
        }
        float k = rnd(seed, gx, 11, gz, 704), a = rnd(seed, gx, 11, gz, 705), b = rnd(seed, gx, 11, gz, 706);
        float c = rnd(seed, gx, 11, gz, 707), d = rnd(seed, gx, 11, gz, 708);
        int base = (int) Math.floor(lo) - 3;
        double phase = c * Math.PI * 2;
        double lean = 0.12 * b, la = d * Math.PI * 2;
        if (k < 0.55) {
            double r0 = 2.2 + 2.2 * a;
            int top = Math.min(base + 3 + 16 + (int) (24 * b), 40);
            int reach = (int) Math.ceil(r0 * 1.12 + 1.4 + lean * (top - base)) + 1;
            return new Formation(Formation.PILLAR, cx, cz, base, top, r0, 0, 0, 0, 0, Math.cos(la) * lean, Math.sin(la) * lean, phase, zone, reach);
        }
        if (k < 0.8) {
            double half = 6 + 5 * a, tube = 1.8 + 0.9 * c;
            int legTop = base + 3 + 4 + (int) (6 * b);
            int top = Math.min(legTop + (int) (half * (0.7 + 0.5 * d)), 40);
            int reach = (int) Math.ceil(half + tube * 1.2 + 2.5);
            return new Formation(Formation.ARCH, cx, cz, base, top, 0, a * Math.PI * 7, half, legTop, tube, 0, 0, phase, zone, reach);
        }
        double r0 = 1.8 + 1.2 * a, rc = 4.5 + 3 * b;
        int top = Math.min(base + 3 + 10 + (int) (12 * d), 40);
        int reach = (int) Math.ceil(rc + 1.5 + lean * (top - base)) + 1;
        return new Formation(Formation.HOODOO, cx, cz, base, top, r0, 0, rc, 0, 0, Math.cos(la) * lean, Math.sin(la) * lean, phase, zone, reach);
    }

    /** The formations that reach into the box [x0, x1] x [z0, z1]. */
    public static List<Formation> formations(long seed, ClimateField cf, int x0, int z0, int x1, int z1) {
        OceanGen.Noises n = OceanGen.noises(seed);
        List<Formation> out = new ArrayList<>();
        int pad = 22;
        for (int gx = Math.floorDiv(x0 - pad, FORM_CELL); gx <= Math.floorDiv(x1 + pad, FORM_CELL); gx++) {
            for (int gz = Math.floorDiv(z0 - pad, FORM_CELL); gz <= Math.floorDiv(z1 + pad, FORM_CELL); gz++) {
                Formation f = formation(seed, n, cf, gx, gz);
                if (f != null && f.cx + f.reach >= x0 && f.cx - f.reach <= x1 + 1 && f.cz + f.reach >= z0 && f.cz - f.reach <= z1 + 1) {
                    out.add(f);
                }
            }
        }
        return out;
    }

    // ============================================================================================ blocks

    /** The rock of formations and of strata on cliff walls: bands of stone and tuff (deepslate in the abyss, basalt in the volcanic depths). */
    public static BlockState rock(OceanGen.Noises n, Zone zone, int x, int y, int z) {
        int b = Math.floorMod((int) Math.floor((y + 5 * n.at(12, x, z, 1 / 40.0)) / 2.6), 7);
        return switch (zone) {
            case VOLCANIC -> switch (b) {
                case 3 -> Blocks.BLACKSTONE.defaultBlockState();
                case 5 -> Blocks.SMOOTH_BASALT.defaultBlockState();
                default -> Blocks.BASALT.defaultBlockState().setValue(RotatedPillarBlock.AXIS, Direction.Axis.Y);
            };
            case ABYSSAL -> switch (b) {
                case 2, 5 -> Blocks.TUFF.defaultBlockState();
                case 3 -> Blocks.COBBLED_DEEPSLATE.defaultBlockState();
                default -> Blocks.DEEPSLATE.defaultBlockState();
            };
            default -> switch (b) {
                case 2, 5 -> Blocks.TUFF.defaultBlockState();
                case 3 -> Blocks.ANDESITE.defaultBlockState();
                case 6 -> y < 0 ? Blocks.DEEPSLATE.defaultBlockState() : Blocks.STONE.defaultBlockState();
                default -> y < 0 ? Blocks.DEEPSLATE.defaultBlockState() : Blocks.STONE.defaultBlockState();
            };
        };
    }

    // ============================================================================================ an area

    /** The shapes of a box of columns (a chunk and a one-block border round it): what the carver works from. */
    public static final class Area {
        public final long seed;
        public final int x0, z0, w, d;
        final OceanGen.Noises n;
        final Col[] cols;
        /** Formation bits per column, or null where no formation reaches. */
        final long[][] form;
        public final List<Formation> formations;
        boolean any;

        Area(long seed, int x0, int z0, int w, int d, List<Formation> formations) {
            this.seed = seed;
            this.x0 = x0;
            this.z0 = z0;
            this.w = w;
            this.d = d;
            this.n = OceanGen.noises(seed);
            this.cols = new Col[w * d];
            this.form = new long[w * d][];
            this.formations = formations;
        }

        /** Whether anything in the area is carved at all. */
        public boolean any() {
            return any;
        }

        public boolean inside(int x, int z) {
            return x >= x0 && x < x0 + w && z >= z0 && z < z0 + d;
        }

        public Col col(int x, int z) {
            return cols[(x - x0) * d + (z - z0)];
        }

        public boolean formation(int x, int y, int z) {
            long[] f = form[(x - x0) * d + (z - z0)];
            int i = y - FORM_Y0;
            return f != null && i >= 0 && i < FORM_YN && (f[i >> 6] & 1L << (i & 63)) != 0;
        }

        /** Whether cell (x, y, z) (a column of the area) is carved out to water. */
        public boolean carved(int x, int y, int z) {
            if (y > TOP || y < BOTTOM) {
                return false;
            }
            Col c = col(x, z);
            if (formation(x, y, z)) {
                return false;
            }
            return y > c.floor || undercut(n, c, x, y, z);
        }

        public BlockState rock(Zone zone, int x, int y, int z) {
            return OceanDepths.rock(n, zone, x, y, z);
        }

        public double noise(int i, double x, double z, double scale) {
            return n.at(i, x, z, scale);
        }
    }

    /**
     * Works out the columns [x0, x0 + w) x [z0, z0 + d), keeping the vanilla floor round `protectedBoxes` (their
     * x/z extent counts).
     */
    public static Area area(long seed, ClimateField cf, int x0, int z0, int w, int d, List<BoundingBox> protectedBoxes) {
        Area a = new Area(seed, x0, z0, w, d, formations(seed, cf, x0, z0, x0 + w - 1, z0 + d - 1));
        for (int i = 0; i < w; i++) {
            for (int j = 0; j < d; j++) {
                int x = x0 + i, z = z0 + j;
                double protect = 0;
                for (BoundingBox b : protectedBoxes) {
                    int dx = Math.max(Math.max(b.minX() - x, x - b.maxX()), 0), dz = Math.max(Math.max(b.minZ() - z, z - b.maxZ()), 0);
                    protect = Math.max(protect, smooth(PROTECT_OUT, PROTECT_IN, Math.sqrt(dx * dx + dz * dz)));
                }
                Col col = new Col();
                column(a.n, cf, x, z, protect, col);
                a.cols[i * d + j] = col;
                a.any |= col.any();
                if (protect > 0) {
                    continue;   // no formations near protected structures
                }
                for (Formation f : a.formations) {
                    if (f.near(x, z)) {
                        long[] bits = a.form[i * d + j];
                        if (bits == null) {
                            bits = a.form[i * d + j] = new long[2];
                        }
                        f.fill(x, z, bits);
                    }
                }
            }
        }
        return a;
    }
}
