package dev.lowpix.winterworks.end;

import com.mojang.serialization.MapCodec;
import dev.lowpix.winterworks.registry.EndBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.DeadBushBlock;
import net.minecraft.world.level.block.state.BlockState;

/**
 * A dry End bush (docs/END_UPDATE.md section 2): the Dead End's tumbleweed. Breaks instantly and drops 0-2 sticks
 * (shears keep the bush); grows on end sand and end stone.
 */
public class DryEndBushBlock extends DeadBushBlock {
    public DryEndBushBlock(Properties p) {
        super(p);
    }

    @Override
    protected boolean mayPlaceOn(BlockState state, BlockGetter level, BlockPos pos) {
        return state.is(EndBlocks.END_SAND) || state.is(Blocks.END_STONE);
    }
}
