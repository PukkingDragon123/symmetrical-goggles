package dev.lowpix.winterworks.whale;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.BaseEntityBlock;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

/** Stub: the whale agent owns this (docs/OCEAN_UPDATE.md section 9). */
public class CannonBlock extends BaseEntityBlock {
    public static final MapCodec<CannonBlock> CODEC = simpleCodec(CannonBlock::new);

    public CannonBlock(Properties p) {
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
        return new CannonBlockEntity(pos, state);
    }
}
