package dev.lowpix.winterworks.mixin.endgear.client;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.client.endgear.PetrifyShell;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyArg;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Petrified living entities, players included (client.endgear.PetrifyShell): the body is drawn in obsidian tones, and
 * the obsidian shell goes round it.
 */
@Mixin(LivingEntityRenderer.class)
public abstract class EndGearLivingEntityRendererMixin {
    private static final String RENDER =
            "render(Lnet/minecraft/world/entity/LivingEntity;FFLcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;I)V";

    @Inject(method = RENDER, at = @At("HEAD"))
    private void ww$petrifyBegin(LivingEntity entity, float yaw, float partial, PoseStack pose, MultiBufferSource buffers, int light,
                                 CallbackInfo ci) {
        PetrifyShell.begin(entity);
    }

    @ModifyArg(method = RENDER, at = @At(value = "INVOKE",
            target = "Lnet/minecraft/client/model/EntityModel;renderToBuffer(Lcom/mojang/blaze3d/vertex/PoseStack;Lcom/mojang/blaze3d/vertex/VertexConsumer;III)V"),
            index = 4)
    private int ww$petrifyTint(int color) {
        return PetrifyShell.tint(color);
    }

    @Inject(method = RENDER, at = @At("TAIL"))
    private void ww$petrifyShell(LivingEntity entity, float yaw, float partial, PoseStack pose, MultiBufferSource buffers, int light,
                                 CallbackInfo ci) {
        PetrifyShell.end();
        PetrifyShell.render(entity, partial, pose, buffers, light);
    }
}
