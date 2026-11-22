package dev.lowpix.winterworks.mixin.endgear.client;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.client.endgear.PetrifyShell;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** The obsidian shell round any petrified living entity, players included (client.endgear.PetrifyShell). */
@Mixin(LivingEntityRenderer.class)
public abstract class EndGearLivingEntityRendererMixin {
    @Inject(method = "render(Lnet/minecraft/world/entity/LivingEntity;FFLcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;I)V",
            at = @At("TAIL"))
    private void ww$petrifyShell(LivingEntity entity, float yaw, float partial, PoseStack pose, MultiBufferSource buffers, int light,
                                 CallbackInfo ci) {
        PetrifyShell.render(entity, partial, pose, buffers, light);
    }
}
