package dev.lowpix.winterworks.mixin.client;

import net.minecraft.client.renderer.GameRenderer;
import org.spongepowered.asm.mixin.Mixin;

/** Camera shake (frozen tomb awakening, Frost Mauler roars). */
@Mixin(GameRenderer.class)
public abstract class GameRendererMixin {
}
