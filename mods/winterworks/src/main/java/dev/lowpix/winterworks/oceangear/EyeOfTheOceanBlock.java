package dev.lowpix.winterworks.oceangear;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.BaseEntityBlock;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

/** Stub: the gear agent owns this (docs/OCEAN_UPDATE.md section 6). */
public class EyeOfTheOceanBlock extends BaseEntityBlock {
    public static final MapCodec<EyeOfTheOceanBlock> CODEC = simpleCodec(EyeOfTheOceanBlock::new);

    public EyeOfTheOceanBlock(Properties p) {
        super(p);
    }

    @Override
    protected MapCodec<? extends BaseEntityBlock> codec() {
        return CODEC;
    }

    @Override
    protected RenderShape getRenderShape(BlockState state) {
        return RenderShape.MODEL;
    }

    @Override
    public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
        return new EyeOfTheOceanBlockEntity(pos, state);
    }
}
