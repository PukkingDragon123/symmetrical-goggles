package dev.lowpix.winterworks.oceanmob;

import dev.lowpix.winterworks.registry.OceanBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

/** Stub: the creatures agent owns this (docs/OCEAN_UPDATE.md sections 2-3). */
public class AnglerLightBlockEntity extends BlockEntity {
    public AnglerLightBlockEntity(BlockPos pos, BlockState state) {
        super(OceanBlocks.ANGLER_LIGHT_BE, pos, state);
    }
}
