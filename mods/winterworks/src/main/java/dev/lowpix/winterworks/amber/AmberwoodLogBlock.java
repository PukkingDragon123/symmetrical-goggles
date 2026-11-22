package dev.lowpix.winterworks.amber;

import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BooleanProperty;

/** Amberwood log (docs/AMBER_UPDATE.md section 5): oozes resin that mosquitoes drink. */
public class AmberwoodLogBlock extends RotatedPillarBlock {
    public static final BooleanProperty RESIN = BooleanProperty.create("resin");

    public AmberwoodLogBlock(Properties properties) {
        super(properties);
        registerDefaultState(defaultBlockState().setValue(RESIN, false));
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> b) {
        super.createBlockStateDefinition(b);
        b.add(RESIN);
    }
}
