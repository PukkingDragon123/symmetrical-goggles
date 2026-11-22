package dev.lowpix.winterworks.mixin.client.hex;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.client.curse.CurseScreenFx;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.renderer.GameRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * A curse's screen effect (client.curse.CurseScreenFx): its post pass runs over the finished world image, just
 * before the GUI is drawn; its dizzy roll joins the hurt tilt (for both the world and the hand).
 */
@Mixin(GameRenderer.class)
public abstract class CurseFxRenderMixin {
    @Inject(method = "render", at = @At(value = "INVOKE", target = "Lcom/mojang/blaze3d/pipeline/RenderTarget;bindWrite(Z)V",
            shift = At.Shift.BEFORE))
    private void ww$curseScreenFx(DeltaTracker delta, boolean renderLevel, CallbackInfo ci) {
        CurseScreenFx.process(delta.getGameTimeDeltaPartialTick(false));
    }

    @Inject(method = "bobHurt", at = @At("HEAD"))
    private void ww$curseRoll(PoseStack pose, float partial, CallbackInfo ci) {
        CurseScreenFx.camera(pose, partial);
    }
}
