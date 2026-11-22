package dev.lowpix.winterworks.whale;

import dev.lowpix.winterworks.registry.OceanBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

/** Stub: the whale agent owns this (docs/OCEAN_UPDATE.md section 9). */
public class CannonBlockEntity extends BlockEntity {
    public CannonBlockEntity(BlockPos pos, BlockState state) {
        super(OceanBlocks.CANNON_BE, pos, state);
    }
}
