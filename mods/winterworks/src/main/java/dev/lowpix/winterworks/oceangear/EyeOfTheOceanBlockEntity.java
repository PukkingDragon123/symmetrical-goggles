package dev.lowpix.winterworks.oceangear;

import dev.lowpix.winterworks.registry.OceanBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

/** Stub: the gear agent owns this (docs/OCEAN_UPDATE.md section 6). */
public class EyeOfTheOceanBlockEntity extends BlockEntity {
    public EyeOfTheOceanBlockEntity(BlockPos pos, BlockState state) {
        super(OceanBlocks.EYE_OF_THE_OCEAN_BE, pos, state);
    }
}
