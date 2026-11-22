package dev.lowpix.winterworks.mixin;

import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.RailState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** Another RailState's position (for RailStateMixin). */
@Mixin(RailState.class)
public interface RailStateAccessor {
    @Accessor("pos")
    BlockPos ww$pos();
}
