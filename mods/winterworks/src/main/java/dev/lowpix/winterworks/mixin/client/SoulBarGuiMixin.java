package dev.lowpix.winterworks.mixin.client;

import dev.lowpix.winterworks.client.soulbull.SoulBar;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.gui.Gui;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.entity.PlayerRideableJumping;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** The soul bar replaces the experience bar (and the jump bar) while riding a Soul Bull (docs/FIXES_0_4.md). */
@Mixin(Gui.class)
public abstract class SoulBarGuiMixin {
    @Inject(method = "renderJumpMeter", at = @At("HEAD"), cancellable = true)
    private void ww$soulBarForJump(PlayerRideableJumping vehicle, GuiGraphics g, int x, CallbackInfo ci) {
        if (SoulBar.render(g, x)) {
            ci.cancel();
        }
    }

    @Inject(method = "renderExperienceBar", at = @At("HEAD"), cancellable = true)
    private void ww$soulBarForXp(GuiGraphics g, int x, CallbackInfo ci) {
        if (SoulBar.render(g, x)) {
            ci.cancel();
        }
    }

    @Inject(method = "renderExperienceLevel", at = @At("HEAD"), cancellable = true)
    private void ww$noLevelOnSoulBull(GuiGraphics g, DeltaTracker delta, CallbackInfo ci) {
        if (SoulBar.riding()) {
            ci.cancel();
        }
    }
}
