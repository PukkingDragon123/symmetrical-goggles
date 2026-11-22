package dev.lowpix.winterworks.mixin;

import net.minecraft.world.level.block.DecoratedPotBlock;
import org.spongepowered.asm.mixin.Mixin;

/** Placing a decorated pot on an amber T builds a Pot Golem (docs/AMBER_UPDATE.md section 9). */
@Mixin(DecoratedPotBlock.class)
public abstract class DecoratedPotBlockMixin {
}
