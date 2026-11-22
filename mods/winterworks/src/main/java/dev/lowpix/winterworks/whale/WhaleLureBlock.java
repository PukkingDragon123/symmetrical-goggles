package dev.lowpix.winterworks.whale;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.BaseEntityBlock;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

/** Stub: the whale agent owns this (docs/OCEAN_UPDATE.md section 8). */
public class WhaleLureBlock extends BaseEntityBlock {
    public static final MapCodec<WhaleLureBlock> CODEC = simpleCodec(WhaleLureBlock::new);

    public WhaleLureBlock(Properties p) {
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
        return new WhaleLureBlockEntity(pos, state);
    }
}
