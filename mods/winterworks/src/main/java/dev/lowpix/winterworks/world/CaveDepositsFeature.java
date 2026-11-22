package dev.lowpix.winterworks.world;

import com.mojang.serialization.Codec;
import dev.lowpix.winterworks.registry.WWBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.ResourceKey;
import net.minecraft.tags.BlockTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.feature.Feature;
import net.minecraft.world.level.levelgen.feature.FeaturePlaceContext;
import net.minecraft.world.level.levelgen.feature.configurations.NoneFeatureConfiguration;
import net.minecraft.world.level.storage.loot.LootTable;

/**
 * Suspicious sand and gravel on cave floors, in every overworld biome (~54 tries a chunk, below y=50; three times the
 * 0.3 rate, docs/FIXES_0_4.md): sandy floors become suspicious sand, the rest suspicious gravel, holding amber or bones;
 * one deposit in four is amber sand or amber gravel instead.
 */
public class CaveDepositsFeature extends Feature<NoneFeatureConfiguration> {
    public static final int TRIES = 54;
    /** 1 in N deposits is amber sand / amber gravel. */
    public static final int AMBER_ONE_IN = 4;

    public CaveDepositsFeature(Codec<NoneFeatureConfiguration> codec) {
        super(codec);
    }

    @Override
    public boolean place(FeaturePlaceContext<NoneFeatureConfiguration> ctx) {
        WorldGenLevel level = ctx.level();
        RandomSource r = ctx.random();
        int x0 = ctx.origin().getX() & ~15, z0 = ctx.origin().getZ() & ~15;
        int bottom = level.getMinBuildHeight() + 8;
        boolean any = false;
        for (int i = 0; i < TRIES; i++) {
            int x = x0 + r.nextInt(16), z = z0 + r.nextInt(16);
            int top = Math.min(50, level.getHeight(Heightmap.Types.OCEAN_FLOOR_WG, x, z) - 12);
            if (top <= bottom) {
                continue;
            }
            BlockPos start = new BlockPos(x, bottom + r.nextInt(top - bottom), z);
            BlockPos floor = findFloor(level, start, 20);
            if (floor != null) {
                any |= deposit(level, floor, r);
            }
        }
        return any;
    }

    /** Walk down from `start` to a solid block with cave air above it. */
    static BlockPos findFloor(WorldGenLevel level, BlockPos start, int range) {
        BlockPos.MutableBlockPos p = start.mutable();
        for (int i = 0; i < range && p.getY() > level.getMinBuildHeight() + 1; i++, p.move(0, -1, 0)) {
            if (level.getBlockState(p).isAir() && !level.getBlockState(p.below()).isAir()) {
                return p.below().immutable();
            }
        }
        return null;
    }

    /** Turn a cave-floor block into a suspicious one with amber or bones; false if it can't be (water, ores...). */
    public static boolean deposit(WorldGenLevel level, BlockPos floor, RandomSource r) {
        BlockState s = level.getBlockState(floor);
        boolean sandy = s.is(BlockTags.SAND) || s.is(Blocks.SANDSTONE);
        if (!sandy && !(s.is(BlockTags.BASE_STONE_OVERWORLD) || s.is(Blocks.GRAVEL) || s.is(BlockTags.DIRT))) {
            return false;
        }
        if (r.nextInt(AMBER_ONE_IN) == 0) {
            placeAmber(level, floor, sandy, r);
            return true;
        }
        boolean amber = r.nextInt(5) < 3;
        place(level, floor, sandy ? Blocks.SUSPICIOUS_SAND.defaultBlockState() : Blocks.SUSPICIOUS_GRAVEL.defaultBlockState(),
                amber ? Archaeology.CAVE_AMBER : Archaeology.CAVE_BONES, r);
        return true;
    }

    /** Amber sand or amber gravel holding winterworks:archaeology/amber_deposit. */
    public static void placeAmber(WorldGenLevel level, BlockPos pos, boolean sandy, RandomSource r) {
        place(level, pos, (sandy ? WWBlocks.AMBER_SAND : WWBlocks.AMBER_GRAVEL).defaultBlockState(), Archaeology.AMBER_DEPOSIT, r);
    }

    /** Place a brushable block and give it a loot table. */
    public static void place(WorldGenLevel level, BlockPos pos, BlockState state, ResourceKey<LootTable> loot, RandomSource r) {
        level.setBlock(pos, state, 2);
        level.getBlockEntity(pos, BlockEntityType.BRUSHABLE_BLOCK).ifPresent(be -> be.setLootTable(loot, r.nextLong()));
    }
}
