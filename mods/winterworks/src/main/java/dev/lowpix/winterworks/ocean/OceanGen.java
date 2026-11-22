package dev.lowpix.winterworks.ocean;

import net.minecraft.tags.BlockTags;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.FallingBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.LegacyRandomSource;
import net.minecraft.world.level.levelgen.synth.SimplexNoise;

/** Shared bits of the Tides & Treasures world generation: hashing, smoothing, the seeded noises and block tests. */
public final class OceanGen {
    /** Block-write flags for world generation: send to clients, no neighbour updates. */
    public static final int FLAGS = 2;
    public static final BlockState WATER = Blocks.WATER.defaultBlockState();
    public static final BlockState AIR = Blocks.AIR.defaultBlockState();

    private OceanGen() {}

    // ------------------------------------------------------------------------------------------ hashing

    public static long mix(long z) {
        z = (z ^ (z >>> 33)) * 0xff51afd7ed558ccdL;
        z = (z ^ (z >>> 33)) * 0xc4ceb9fe1a85ec53L;
        return z ^ (z >>> 33);
    }

    public static long hash(long seed, int x, int y, int z, int salt) {
        return mix(seed ^ x * 0x632BE59BD9B4E019L ^ y * 0x85157AF5L ^ z * 0x2545F4914F6CDD1DL ^ salt * 0x27D4EB2F165667C5L);
    }

    /** 0..1, the same for a position whichever chunk asks. */
    public static float rnd(long seed, int x, int y, int z, int salt) {
        return (hash(seed, x, y, z, salt) >>> 40) / (float) (1 << 24);
    }

    // ------------------------------------------------------------------------------------------ maths

    /** Smoothstep from e0 to e1 (either order): 0 at e0, 1 at e1. */
    public static double smooth(double e0, double e1, double x) {
        double t = (x - e0) / (e1 - e0);
        if (t <= 0) {
            return 0;
        }
        if (t >= 1) {
            return 1;
        }
        return t * t * (3 - 2 * t);
    }

    public static double lerp(double a, double b, double t) {
        return a + (b - a) * t;
    }

    // ------------------------------------------------------------------------------------------ noise

    /** Seeded simplex noises, rebuilt when the world seed changes (immutable once built, so thread safe). */
    public static final class Noises {
        public final long seed;
        private final SimplexNoise[] n = new SimplexNoise[16];

        Noises(long seed) {
            this.seed = seed;
            for (int i = 0; i < n.length; i++) {
                n[i] = new SimplexNoise(new LegacyRandomSource(seed ^ 0x0CEA7DE9L * (i + 1) ^ 0x5DEECE66DL));
            }
        }

        /** Noise `i` at (x, z) * scale: about -1..1. */
        public double at(int i, double x, double z, double scale) {
            return n[i].getValue(x * scale, z * scale);
        }

        /** 3D noise `i`: about -1..1. */
        public double at3(int i, double x, double y, double z) {
            return n[i].getValue(x, y, z);
        }
    }

    private static volatile Noises noises;

    public static Noises noises(long seed) {
        Noises n = noises;
        if (n == null || n.seed != seed) {
            n = new Noises(seed);
            noises = n;
        }
        return n;
    }

    // ------------------------------------------------------------------------------------------ blocks

    /** Natural rock and sediment the ocean generation may reshape (never ores, never placed blocks). */
    public static boolean natural(BlockState s) {
        return !s.hasBlockEntity() && (s.is(BlockTags.BASE_STONE_OVERWORLD) || s.is(Blocks.GRAVEL) || s.is(Blocks.SAND)
                || s.is(Blocks.RED_SAND) || s.is(Blocks.CLAY) || s.is(Blocks.DIRT) || s.is(Blocks.SANDSTONE)
                || s.is(Blocks.COBBLED_DEEPSLATE) || s.is(Blocks.CALCITE) || s.is(Blocks.SMOOTH_BASALT) || s.is(Blocks.BASALT)
                || s.is(Blocks.MAGMA_BLOCK) || s.is(dev.lowpix.winterworks.registry.OceanBlocks.ASH_SAND));
    }

    /** A block that falls when nothing holds it up (sand, gravel, ash sand). */
    public static boolean loose(BlockState s) {
        return s.getBlock() instanceof FallingBlock;
    }

    /** What a loose block over a carved-out cell turns into so it doesn't fall: sandstone, stone. */
    public static BlockState settled(BlockState s) {
        if (s.is(Blocks.SAND)) {
            return Blocks.SANDSTONE.defaultBlockState();
        }
        if (s.is(Blocks.RED_SAND)) {
            return Blocks.RED_SANDSTONE.defaultBlockState();
        }
        if (s.is(dev.lowpix.winterworks.registry.OceanBlocks.ASH_SAND)) {
            return dev.lowpix.winterworks.registry.OceanBlocks.ASHSTONE.defaultBlockState();
        }
        return Blocks.TUFF.defaultBlockState();
    }
}
