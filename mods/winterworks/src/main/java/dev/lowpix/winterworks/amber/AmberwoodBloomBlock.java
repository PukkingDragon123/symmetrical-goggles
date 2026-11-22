package dev.lowpix.winterworks.amber;

import com.mojang.serialization.MapCodec;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWParticles;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.BlockTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.SaplingBlock;
import net.minecraft.world.level.block.grower.TreeGrower;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * The Amberwood Bloom (docs/HEXES_UPDATE.md section 10, docs/FIXES_0_4.md): the glowing flower crowning every column
 * of an Amberwood, and the tree's sapling. Planted on sand, red sand, terracotta, dirt or grass it grows into an
 * Amberwood (amber.AmberwoodFeature) like a vanilla sapling, by random ticks and bone meal; a bloom on top of an
 * amberwood log is the tree's own crown and never grows. Mosquitoes sip its nectar.
 */
public class AmberwoodBloomBlock extends SaplingBlock {
    public static final MapCodec<AmberwoodBloomBlock> CODEC = simpleCodec(p -> new AmberwoodBloomBlock(AmberwoodGrower.GROWER, p));
    private static final VoxelShape SHAPE = Block.box(2, 0, 2, 14, 12, 14);

    public AmberwoodBloomBlock(TreeGrower grower, Properties properties) {
        super(grower, properties);
    }

    @Override
    public MapCodec<? extends SaplingBlock> codec() {
        return CODEC;
    }

    @Override
    protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext ctx) {
        return SHAPE;
    }

    /** Soil it can be planted in (and so grow from). */
    public static boolean isSoil(BlockState s) {
        return s.is(BlockTags.SAND) || s.is(BlockTags.TERRACOTTA) || s.is(BlockTags.DIRT) || s.is(Blocks.FARMLAND);
    }

    @Override
    protected boolean mayPlaceOn(BlockState below, BlockGetter level, BlockPos pos) {
        return below.is(WWBlocks.AMBERWOOD_LOG) || isSoil(below);
    }

    /** A crown bloom sits on its tree's log: it is a flower, not a sapling. */
    private static boolean isCrown(LevelReader level, BlockPos pos) {
        return level.getBlockState(pos.below()).is(WWBlocks.AMBERWOOD_LOG);
    }

    @Override
    protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
        if (!isCrown(level, pos)) {
            super.randomTick(state, level, pos, random);
        }
    }

    @Override
    public boolean isValidBonemealTarget(LevelReader level, BlockPos pos, BlockState state) {
        return !isCrown(level, pos);
    }

    @Override
    public boolean isBonemealSuccess(Level level, RandomSource random, BlockPos pos, BlockState state) {
        return !isCrown(level, pos) && super.isBonemealSuccess(level, random, pos, state);
    }

    /** A faint golden glint drifting off the petals. */
    @Override
    public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
        if (random.nextInt(8) == 0) {
            level.addParticle(WWParticles.AMBER_GLINT, pos.getX() + 0.2 + random.nextDouble() * 0.6, pos.getY() + 0.5 + random.nextDouble() * 0.3,
                    pos.getZ() + 0.2 + random.nextDouble() * 0.6, 0, 0.01, 0);
        }
    }
}
