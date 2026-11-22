package dev.lowpix.winterworks.express;

import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.state.BlockState;

/**
 * A rail whose shape is set by its own logic (Coaster Loop, Switch Rail), not by its neighbours: vanilla's rail
 * auto-connection (RailState, patched by mixin.RailStateMixin) never reshapes it, and neighbours connect to it only
 * along its legs.
 */
public interface FixedRail {
    /** Whether a neighbouring rail at `other` (same x/z, any y) meets one of this rail's legs. */
    boolean ww$connectsTo(BlockState state, BlockPos self, BlockPos other);
}
