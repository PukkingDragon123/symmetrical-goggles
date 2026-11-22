package dev.lowpix.winterworks.endmob;

import com.mojang.serialization.MapCodec;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.BushBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BooleanProperty;

/** Stub: the mobs agent owns this (docs/END_UPDATE.md section 2). */
public class EndBloomBlock extends BushBlock {
    public static final MapCodec<EndBloomBlock> CODEC = simpleCodec(EndBloomBlock::new);
    public static final BooleanProperty OPEN = BooleanProperty.create("open");
    public static final BooleanProperty BULB = BooleanProperty.create("bulb");

    public EndBloomBlock(Properties p) {
        super(p);
        registerDefaultState(stateDefinition.any().setValue(OPEN, false).setValue(BULB, true));
    }

    @Override
    protected MapCodec<? extends BushBlock> codec() {
        return CODEC;
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> b) {
        b.add(OPEN, BULB);
    }
}
