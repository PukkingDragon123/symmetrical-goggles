package dev.lowpix.winterworks.mixin.client.endboss;

import com.llamalad7.mixinextras.injector.ModifyExpressionValue;
import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.client.endboss.EclipseSky;
import net.minecraft.client.gui.components.BossHealthOverlay;
import net.minecraft.client.renderer.LevelRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * During an eclipse the End's sky is client.endboss.EclipseSky (vanilla's sky box otherwise). The dragon's boss bar
 * asks for thick world fog, which hides the whole sky: while the eclipse is up (the dragon's second phase starts one)
 * that fog lifts, so the moon is seen over the fight.
 */
@Mixin(LevelRenderer.class)
public abstract class EndSkyMixin {
    @Inject(method = "renderEndSky", at = @At("HEAD"), cancellable = true)
    private void ww$eclipseSky(PoseStack pose, CallbackInfo ci) {
        if (EclipseSky.render(pose)) {
            ci.cancel();
        }
    }

    @ModifyExpressionValue(method = "renderLevel", at = @At(value = "INVOKE",
            target = "Lnet/minecraft/client/gui/components/BossHealthOverlay;shouldCreateWorldFog()Z"))
    private boolean ww$eclipseLiftsBossFog(boolean fog) {
        return fog && !EclipseSky.liftsBossFog();
    }
}
