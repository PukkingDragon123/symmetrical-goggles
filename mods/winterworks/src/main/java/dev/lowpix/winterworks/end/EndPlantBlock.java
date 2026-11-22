package dev.lowpix.winterworks.end;

import com.mojang.serialization.MapCodec;
import dev.lowpix.winterworks.registry.EndBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.BonemealableBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.BushBlock;
import net.minecraft.world.level.block.DoublePlantBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * End grass (docs/END_UPDATE.md section 2): a short purple plant that grows on End soil (end stone, End Grass, End
 * Moss). Shears collect it; bone meal grows it into tall end grass, like vanilla grass.
 */
public class EndPlantBlock extends BushBlock implements BonemealableBlock {
    public static final MapCodec<EndPlantBlock> CODEC = simpleCodec(EndPlantBlock::new);
    private static final VoxelShape SHAPE = Block.box(2, 0, 2, 14, 13, 14);

    public EndPlantBlock(Properties p) {
        super(p);
    }

    @Override
    protected MapCodec<? extends BushBlock> codec() {
        return CODEC;
    }

    /** The End soils plants grow on: end stone, End Grass and End Moss. */
    public static boolean isEndSoil(BlockState s) {
        return s.is(Blocks.END_STONE) || s.is(EndBlocks.END_GRASS_BLOCK) || s.is(EndBlocks.END_MOSS_BLOCK);
    }

    @Override
    protected boolean mayPlaceOn(BlockState state, BlockGetter level, BlockPos pos) {
        return isEndSoil(state);
    }

    @Override
    protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext ctx) {
        return SHAPE;
    }

    @Override
    public boolean isValidBonemealTarget(LevelReader level, BlockPos pos, BlockState state) {
        return level.getBlockState(pos.above()).isAir();
    }

    @Override
    public boolean isBonemealSuccess(Level level, RandomSource random, BlockPos pos, BlockState state) {
        return true;
    }

    @Override
    public void performBonemeal(ServerLevel level, RandomSource random, BlockPos pos, BlockState state) {
        BlockState tall = EndBlocks.TALL_END_GRASS.defaultBlockState();
        if (tall.canSurvive(level, pos) && level.isEmptyBlock(pos.above())) {
            DoublePlantBlock.placeAt(level, tall, pos, Block.UPDATE_CLIENTS);
        }
    }
}
