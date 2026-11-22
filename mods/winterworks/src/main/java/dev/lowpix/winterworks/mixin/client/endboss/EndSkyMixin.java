package dev.lowpix.winterworks.mixin.client.endboss;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.client.endboss.EclipseSky;
import net.minecraft.client.renderer.LevelRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** During an eclipse the End's sky is client.endboss.EclipseSky (vanilla's sky box otherwise). */
@Mixin(LevelRenderer.class)
public abstract class EndSkyMixin {
    @Inject(method = "renderEndSky", at = @At("HEAD"), cancellable = true)
    private void ww$eclipseSky(PoseStack pose, CallbackInfo ci) {
        if (EclipseSky.render(pose)) {
            ci.cancel();
        }
    }
}
