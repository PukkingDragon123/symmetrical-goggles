package dev.lowpix.winterworks.ocean;

import dev.lowpix.winterworks.registry.OceanBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

/** Stub: the world agent owns this (docs/OCEAN_UPDATE.md section 2). */
public class HydrothermalVentBlockEntity extends BlockEntity {
    public HydrothermalVentBlockEntity(BlockPos pos, BlockState state) {
        super(OceanBlocks.HYDROTHERMAL_VENT_BE, pos, state);
    }
}
