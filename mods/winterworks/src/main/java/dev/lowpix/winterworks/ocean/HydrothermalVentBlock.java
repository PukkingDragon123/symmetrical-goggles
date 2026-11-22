package dev.lowpix.winterworks.ocean;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.BaseEntityBlock;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

/** Stub: the world agent owns this (docs/OCEAN_UPDATE.md section 2). */
public class HydrothermalVentBlock extends BaseEntityBlock {
    public static final MapCodec<HydrothermalVentBlock> CODEC = simpleCodec(HydrothermalVentBlock::new);

    public HydrothermalVentBlock(Properties p) {
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
        return new HydrothermalVentBlockEntity(pos, state);
    }
}
