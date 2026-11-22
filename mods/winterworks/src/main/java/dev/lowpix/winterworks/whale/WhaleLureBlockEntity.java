package dev.lowpix.winterworks.whale;

import dev.lowpix.winterworks.registry.OceanBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

/** Stub: the whale agent owns this (docs/OCEAN_UPDATE.md section 8). */
public class WhaleLureBlockEntity extends BlockEntity {
    public WhaleLureBlockEntity(BlockPos pos, BlockState state) {
        super(OceanBlocks.WHALE_LURE_BE, pos, state);
    }
}
