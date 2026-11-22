package dev.lowpix.winterworks.hex;

import dev.lowpix.winterworks.registry.WWBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

public class SoulTankBlockEntity extends BlockEntity {
    public SoulTankBlockEntity(BlockPos pos, BlockState state) {
        super(WWBlocks.SOUL_TANK_BE, pos, state);
    }
}
