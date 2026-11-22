package dev.lowpix.winterworks.mixin.client.hex;

import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import dev.lowpix.winterworks.client.hex.SoulGlint;
import net.minecraft.client.renderer.LevelRenderer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** The world draws each soul glint right after the vanilla glint it stands in for (client.hex.SoulGlint). */
@Mixin(LevelRenderer.class)
public abstract class SoulGlintBatchMixin {
    @WrapOperation(method = "renderLevel", at = @At(value = "INVOKE",
            target = "Lnet/minecraft/client/renderer/MultiBufferSource$BufferSource;endBatch(Lnet/minecraft/client/renderer/RenderType;)V"))
    private void ww$endSoulGlint(MultiBufferSource.BufferSource buffers, RenderType type, Operation<Void> original) {
        original.call(buffers, type);
        SoulGlint.endWith(buffers, type);
    }
}
