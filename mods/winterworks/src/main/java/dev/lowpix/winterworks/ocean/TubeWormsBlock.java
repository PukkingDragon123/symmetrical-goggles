package dev.lowpix.winterworks.ocean;

import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SimpleWaterloggedBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.BooleanProperty;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.level.material.Fluids;

/** Stub: the world agent owns this (docs/OCEAN_UPDATE.md section 2). */
public class TubeWormsBlock extends Block implements SimpleWaterloggedBlock {
    public static final BooleanProperty EXTENDED = BooleanProperty.create("extended");
    public static final BooleanProperty WATERLOGGED = BlockStateProperties.WATERLOGGED;

    public TubeWormsBlock(Properties p) {
        super(p);
        registerDefaultState(stateDefinition.any().setValue(EXTENDED, true).setValue(WATERLOGGED, true));
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> b) {
        b.add(EXTENDED, WATERLOGGED);
    }

    @Override
    protected FluidState getFluidState(BlockState state) {
        return state.getValue(WATERLOGGED) ? Fluids.WATER.getSource(false) : super.getFluidState(state);
    }
}
