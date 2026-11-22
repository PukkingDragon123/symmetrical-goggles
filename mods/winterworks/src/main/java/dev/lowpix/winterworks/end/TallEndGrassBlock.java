package dev.lowpix.winterworks.end;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.block.DoublePlantBlock;
import net.minecraft.world.level.block.state.BlockState;

/** Tall end grass (docs/END_UPDATE.md section 2): a two-block End plant on End soil (EndPlantBlock#isEndSoil). */
public class TallEndGrassBlock extends DoublePlantBlock {
    public static final MapCodec<TallEndGrassBlock> CODEC = simpleCodec(TallEndGrassBlock::new);

    public TallEndGrassBlock(Properties p) {
        super(p);
    }

    @Override
    public MapCodec<? extends DoublePlantBlock> codec() {
        return CODEC;
    }

    @Override
    protected boolean mayPlaceOn(BlockState state, BlockGetter level, BlockPos pos) {
        return EndPlantBlock.isEndSoil(state);
    }
}
