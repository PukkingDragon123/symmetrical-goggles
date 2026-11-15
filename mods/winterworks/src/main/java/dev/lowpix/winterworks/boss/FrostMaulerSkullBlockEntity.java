package dev.lowpix.winterworks.boss;

import dev.lowpix.winterworks.registry.WWBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

public class FrostMaulerSkullBlockEntity extends BlockEntity {
    public FrostMaulerSkullBlockEntity(BlockPos pos, BlockState state) {
        super(WWBlocks.FROST_MAULER_SKULL_BE, pos, state);
    }
}
