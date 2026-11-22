package dev.lowpix.winterworks.ocean;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.SeaPickleBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.feature.FeaturePlaceContext;
import net.minecraft.world.level.levelgen.feature.configurations.NoneFeatureConfiguration;

/**
 * Natural sponges in coral reefs (docs/OCEAN_UPDATE.md sections 2, 7): a lumpy cluster of wet sponges on the reef
 * floor, a dry sponge or two buried in the sand under it (they soak up the sea when dug out), and sea pickles. Placed at
 * a floor position (placed feature: rarity, in square, ocean floor heightmap, biome filter), only in the shallows.
 */
public final class ReefSponges {
    private ReefSponges() {}

    static boolean place(FeaturePlaceContext<NoneFeatureConfiguration> ctx) {
        return cluster(ctx.level(), ctx.origin(), ctx.random()) > 0;
    }

    /** A sponge cluster on the floor at `origin` (the first water block over it). Returns how many sponges it laid. */
    public static int cluster(WorldGenLevel level, BlockPos origin, RandomSource r) {
        if (origin.getY() < 30 || !sea(level.getBlockState(origin)) || !level.getBlockState(origin.below()).blocksMotion()) {
            return 0;
        }
        int placed = 0, n = 4 + r.nextInt(7);
        BlockPos.MutableBlockPos m = new BlockPos.MutableBlockPos();
        for (int i = 0; i < n * 3 && placed < n; i++) {
            int dx = (int) Math.round(r.nextGaussian() * 1.3), dz = (int) Math.round(r.nextGaussian() * 1.3);
            m.set(origin.getX() + dx, origin.getY() + 4, origin.getZ() + dz);
            // drop down to the floor (or onto a sponge already laid)
            int k = 0;
            while (k++ < 8 && sea(level.getBlockState(m.below()))) {
                m.move(Direction.DOWN);
            }
            if (!sea(level.getBlockState(m)) || !level.getBlockState(m.below()).blocksMotion() || m.getY() > origin.getY() + 1) {
                continue;
            }
            if (!level.ensureCanWrite(m)) {
                continue;
            }
            level.setBlock(m, Blocks.WET_SPONGE.defaultBlockState(), OceanGen.FLAGS);
            placed++;
        }
        if (placed == 0) {
            return 0;
        }
        // dry sponges buried under the floor, out of reach of the water
        BlockPos.MutableBlockPos q = new BlockPos.MutableBlockPos();
        for (int i = 0; i < 2; i++) {
            q.set(origin.getX() + r.nextInt(3) - 1, origin.getY() - 2, origin.getZ() + r.nextInt(3) - 1);
            if (!level.ensureCanWrite(q) || !buried(level, q)) {
                continue;
            }
            level.setBlock(q, Blocks.SPONGE.defaultBlockState(), OceanGen.FLAGS);
        }
        // sea pickles glowing round it
        for (int i = 0; i < 3; i++) {
            q.set(origin.getX() + r.nextInt(7) - 3, origin.getY(), origin.getZ() + r.nextInt(7) - 3);
            if (level.ensureCanWrite(q) && sea(level.getBlockState(q)) && level.getBlockState(q.below()).isFaceSturdy(level, q.below(), Direction.UP)) {
                BlockState pickle = Blocks.SEA_PICKLE.defaultBlockState().setValue(SeaPickleBlock.PICKLES, 1 + r.nextInt(4))
                        .setValue(SeaPickleBlock.WATERLOGGED, true);
                level.setBlock(q, pickle, OceanGen.FLAGS);
            }
        }
        return placed;
    }

    /** Open sea: water, or the seagrass and such growing in it (the reef's own plants are laid before the sponges). */
    private static boolean sea(BlockState s) {
        return s.is(Blocks.WATER) || s.canBeReplaced() && s.getFluidState().is(net.minecraft.tags.FluidTags.WATER) && !s.hasBlockEntity();
    }

    /** Whether `p` is solid sea floor with no water next to it. */
    private static boolean buried(WorldGenLevel level, BlockPos p) {
        if (!OceanGen.natural(level.getBlockState(p))) {
            return false;
        }
        for (Direction d : Direction.values()) {
            if (!level.getFluidState(p.relative(d)).isEmpty()) {
                return false;
            }
        }
        return true;
    }
}
