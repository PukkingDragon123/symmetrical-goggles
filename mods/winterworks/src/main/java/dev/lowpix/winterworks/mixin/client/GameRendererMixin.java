package dev.lowpix.winterworks.mixin.client;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.client.boss.CameraShake;
import net.minecraft.client.renderer.GameRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Camera shake (frozen tomb awakening, Frost Mauler roars, the skull revival, its death): see client.boss.CameraShake. */
@Mixin(GameRenderer.class)
public abstract class GameRendererMixin {
    /** At the head of the hurt tilt (it returns early when you're not hurt), for both the world and the hand. */
    @Inject(method = "bobHurt", at = @At("HEAD"))
    private void ww$cameraShake(PoseStack pose, float partial, CallbackInfo ci) {
        CameraShake.apply(pose, partial);
    }
}
