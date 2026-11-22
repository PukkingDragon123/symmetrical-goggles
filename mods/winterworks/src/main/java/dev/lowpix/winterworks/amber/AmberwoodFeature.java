package dev.lowpix.winterworks.amber;

import com.mojang.serialization.Codec;
import dev.lowpix.winterworks.registry.WWBlocks;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.tags.BlockTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.feature.Feature;
import net.minecraft.world.level.levelgen.feature.FeaturePlaceContext;
import net.minecraft.world.level.levelgen.feature.configurations.NoneFeatureConfiguration;

/**
 * The Amberwood (docs/HEXES_UPDATE.md section 10): a saguaro-like column. A 4-7 block trunk of amberwood logs with 0-2
 * arms (each goes out one block as a sideways log, then up 1-3 blocks, never above the trunk), and an amberwood bloom
 * on top of the trunk and of every arm. Some logs already ooze resin. Configured feature winterworks:amberwood (data),
 * grown by the sapling through amber.AmberwoodGrower.
 */
public class AmberwoodFeature extends Feature<NoneFeatureConfiguration> {
    public static final int MIN_HEIGHT = 4, MAX_HEIGHT = 7, MAX_ARMS = 2, MAX_ARM_RISE = 3;
    /** 1 in N logs grows already oozing. */
    private static final int RESIN_CHANCE = 6;

    public AmberwoodFeature(Codec<NoneFeatureConfiguration> codec) {
        super(codec);
    }

    @Override
    public boolean place(FeaturePlaceContext<NoneFeatureConfiguration> ctx) {
        WorldGenLevel level = ctx.level();
        BlockPos origin = ctx.origin();
        RandomSource r = ctx.random();
        BlockPos below = origin.below();
        if (!level.getBlockState(below).isFaceSturdy(level, below, Direction.UP)) {
            return false;
        }
        BlockState bloom = WWBlocks.AMBERWOOD_BLOOM.defaultBlockState();
        Map<BlockPos, BlockState> plan = new LinkedHashMap<>();
        int h = MIN_HEIGHT + r.nextInt(MAX_HEIGHT - MIN_HEIGHT + 1);
        for (int i = 0; i < h; i++) {
            plan.put(origin.above(i), log(r, Direction.Axis.Y));
        }
        plan.put(origin.above(h), bloom);
        List<Direction> sides = Direction.Plane.HORIZONTAL.shuffledCopy(r);
        int arms = r.nextInt(MAX_ARMS + 1);
        for (int a = 0; a < arms; a++) {
            Direction d = sides.get(a);
            int y = 2 + r.nextInt(Math.max(1, h - 3));                // from the 3rd trunk block up to the one below the top
            int rise = 1 + r.nextInt(Math.min(MAX_ARM_RISE, h - 1 - y));   // no higher than the trunk
            BlockPos elbow = origin.above(y).relative(d);
            plan.put(elbow, log(r, d.getAxis()));
            for (int k = 1; k <= rise; k++) {
                plan.put(elbow.above(k), log(r, Direction.Axis.Y));
            }
            plan.put(elbow.above(rise + 1), bloom);
        }
        for (BlockPos p : plan.keySet()) {
            if (!level.isStateAtPosition(p, s -> s.isAir() || s.is(BlockTags.REPLACEABLE_BY_TREES) || s.is(WWBlocks.AMBERWOOD_SAPLING))) {
                return false;
            }
        }
        plan.forEach((p, s) -> setBlock(level, p, s));
        return true;
    }

    private static BlockState log(RandomSource r, Direction.Axis axis) {
        return WWBlocks.AMBERWOOD_LOG.defaultBlockState().setValue(RotatedPillarBlock.AXIS, axis)
                .setValue(AmberwoodLogBlock.RESIN, r.nextInt(RESIN_CHANCE) == 0);
    }
}
