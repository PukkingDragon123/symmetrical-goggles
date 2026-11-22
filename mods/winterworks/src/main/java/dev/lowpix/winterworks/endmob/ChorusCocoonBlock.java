package dev.lowpix.winterworks.endmob;

import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.IntegerProperty;

/** Stub: the mobs agent owns this (docs/END_UPDATE.md section 2). */
public class ChorusCocoonBlock extends Block {
    public static final IntegerProperty AGE = BlockStateProperties.AGE_3;

    public ChorusCocoonBlock(Properties p) {
        super(p);
        registerDefaultState(stateDefinition.any().setValue(AGE, 0));
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> b) {
        b.add(AGE);
    }
}
