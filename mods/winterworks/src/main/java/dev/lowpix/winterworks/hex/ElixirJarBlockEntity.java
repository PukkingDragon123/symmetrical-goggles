package dev.lowpix.winterworks.hex;

import dev.lowpix.winterworks.registry.WWBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

public class ElixirJarBlockEntity extends BlockEntity {
    public ElixirJarBlockEntity(BlockPos pos, BlockState state) {
        super(WWBlocks.ELIXIR_JAR_BE, pos, state);
    }
}
