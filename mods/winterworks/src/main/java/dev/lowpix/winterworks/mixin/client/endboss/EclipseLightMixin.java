package dev.lowpix.winterworks.mixin.client.endboss;

import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import com.mojang.blaze3d.platform.NativeImage;
import dev.lowpix.winterworks.client.endboss.EclipseLight;
import net.minecraft.client.renderer.LightTexture;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** During an eclipse the End is lit brighter, violet in the shadows and gold in the light (client.endboss.EclipseLight). */
@Mixin(LightTexture.class)
public abstract class EclipseLightMixin {
    @WrapOperation(method = "updateLightTexture", at = @At(value = "INVOKE",
            target = "Lcom/mojang/blaze3d/platform/NativeImage;setPixelRGBA(III)V"))
    private void ww$eclipseLight(NativeImage image, int block, int sky, int abgr, Operation<Void> original) {
        original.call(image, block, sky, EclipseLight.tint(block, sky, abgr));
    }
}
