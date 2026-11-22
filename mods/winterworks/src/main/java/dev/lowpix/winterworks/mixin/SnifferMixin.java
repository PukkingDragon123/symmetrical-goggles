package dev.lowpix.winterworks.mixin;

import net.minecraft.world.entity.animal.sniffer.Sniffer;
import org.spongepowered.asm.mixin.Mixin;

/** Sniffers tamed with pitcher pods dig up suspicious blocks (docs/AMBER_UPDATE.md section 8). */
@Mixin(Sniffer.class)
public abstract class SnifferMixin {
}
