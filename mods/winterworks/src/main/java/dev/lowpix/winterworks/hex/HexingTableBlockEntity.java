package dev.lowpix.winterworks.hex;

import dev.lowpix.winterworks.registry.WWBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

public class HexingTableBlockEntity extends BlockEntity {
    public HexingTableBlockEntity(BlockPos pos, BlockState state) {
        super(WWBlocks.HEXING_TABLE_BE, pos, state);
    }
}
