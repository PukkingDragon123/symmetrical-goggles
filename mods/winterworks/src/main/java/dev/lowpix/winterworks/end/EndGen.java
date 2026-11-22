package dev.lowpix.winterworks.end;

import dev.lowpix.winterworks.registry.EndBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.LegacyRandomSource;
import net.minecraft.world.level.levelgen.synth.SimplexNoise;
import net.minecraft.world.level.storage.loot.LootTable;

/**
 * Shared bits of the Living End's world generation: which biome a column is in, the main-island guard, deterministic
 * hashing, the seeded noises and the biome palettes.
 */
public final class EndGen {
    /** Nothing of ours is ever built this close to the main island's exit portal (0, 0). */
    public static final int MAIN_ISLAND_GUARD = 900;
    /** Block-write flags for world generation: send to clients, no neighbour updates. */
    public static final int FLAGS = 2;

    private EndGen() {}

    public enum Style {
        MEADOWS, DEAD_END;

        public static Style of(Holder<Biome> b) {
            return b.is(EndWorldgen.DEAD_END) ? DEAD_END : b.is(EndWorldgen.CHORUS_MEADOWS) ? MEADOWS : null;
        }
    }

    /** The Living End style of the biome at `p`, or null outside our biomes (and always near the main island). */
    public static Style style(WorldGenLevel level, BlockPos p) {
        if (nearMainIsland(p.getX(), p.getZ())) {
            return null;
        }
        return Style.of(level.getBiome(p));
    }

    public static boolean nearMainIsland(int x, int z) {
        return (long) x * x + (long) z * z < (long) MAIN_ISLAND_GUARD * MAIN_ISLAND_GUARD;
    }

    /** True if this chunk or one next to it holds a piece of any structure (End Cities, ours): big features keep off. */
    public static boolean nearStructure(WorldGenLevel level, int cx, int cz) {
        for (int dx = -1; dx <= 1; dx++) {
            for (int dz = -1; dz <= 1; dz++) {
                if (level.getChunk(cx + dx, cz + dz).hasAnyStructureReferences()) {
                    return true;
                }
            }
        }
        return false;
    }

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

    // ------------------------------------------------------------------------------------------ noise

    /** Seeded simplex noises, rebuilt when the world seed changes (immutable once built, so thread safe). */
    public record Noises(long seed, SimplexNoise a, SimplexNoise b, SimplexNoise c) {
        /** Smooth noise in about -1..1 with two octaves. */
        public double patch(double x, double z, double scale) {
            return a.getValue(x * scale, z * scale) * 0.75 + b.getValue(x * scale * 2.7, z * scale * 2.7) * 0.25;
        }
    }

    private static volatile Noises noises;

    public static Noises noises(long seed) {
        Noises n = noises;
        if (n == null || n.seed() != seed) {
            n = new Noises(seed, new SimplexNoise(new LegacyRandomSource(seed ^ 0x1E7D1A2BL)),
                    new SimplexNoise(new LegacyRandomSource(seed ^ 0x6C0C00A7L)), new SimplexNoise(new LegacyRandomSource(seed ^ 0x3E7E0F5L)));
            noises = n;
        }
        return n;
    }

    // ------------------------------------------------------------------------------------------ blocks

    public static final BlockState AIR = Blocks.AIR.defaultBlockState();
    public static final BlockState END_STONE = Blocks.END_STONE.defaultBlockState();
    public static final BlockState OBSIDIAN = Blocks.OBSIDIAN.defaultBlockState();
    public static final BlockState CRYING = Blocks.CRYING_OBSIDIAN.defaultBlockState();
    public static final BlockState PURPUR = Blocks.PURPUR_BLOCK.defaultBlockState();
    public static final BlockState GRASS = EndBlocks.END_GRASS_BLOCK.defaultBlockState();
    public static final BlockState MOSS = EndBlocks.END_MOSS_BLOCK.defaultBlockState();
    public static final BlockState SAND = EndBlocks.END_SAND.defaultBlockState();

    /** Air, or something a feature may build over (plants, carpets). */
    public static boolean replaceable(BlockState s) {
        return s.isAir() || s.canBeReplaced() && s.getFluidState().isEmpty();
    }

    /** Natural End ground: end stone and the Living End's soils. */
    public static boolean ground(BlockState s) {
        return s.is(Blocks.END_STONE) || s.is(EndBlocks.END_GRASS_BLOCK) || s.is(EndBlocks.END_MOSS_BLOCK) || s.is(EndBlocks.END_SAND)
                || s.is(EndBlocks.SUSPICIOUS_END_SAND);
    }

    /** The top block of open ground in this style. */
    public static BlockState top(Style style) {
        return style == Style.DEAD_END ? SAND : GRASS;
    }

    /** Places a block of suspicious end sand holding `loot`. */
    public static void suspicious(WorldGenLevel level, BlockPos p, ResourceKey<LootTable> loot, long seed) {
        level.setBlock(p, EndBlocks.SUSPICIOUS_END_SAND.defaultBlockState(), FLAGS);
        level.getBlockEntity(p, BlockEntityType.BRUSHABLE_BLOCK).ifPresent(be -> be.setLootTable(loot, seed));
    }
}
