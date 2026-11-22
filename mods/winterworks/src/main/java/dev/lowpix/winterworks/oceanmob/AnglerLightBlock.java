package dev.lowpix.winterworks.oceanmob;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.BaseEntityBlock;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

/** Stub: the creatures agent owns this (docs/OCEAN_UPDATE.md sections 2-3). */
public class AnglerLightBlock extends BaseEntityBlock {
    public static final MapCodec<AnglerLightBlock> CODEC = simpleCodec(AnglerLightBlock::new);

    public AnglerLightBlock(Properties p) {
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
        return new AnglerLightBlockEntity(pos, state);
    }
}
