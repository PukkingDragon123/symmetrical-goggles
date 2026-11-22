package dev.lowpix.winterworks.mixin.client.hex;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.client.hex.SoulGlint;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.layers.ElytraLayer;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** A cursed elytra (Icarus!) glints with souls when worn (client.hex.SoulGlint). */
@Mixin(ElytraLayer.class)
public abstract class SoulGlintElytraMixin {
    @Inject(method = "render(Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;ILnet/minecraft/world/entity/LivingEntity;FFFFFF)V",
            at = @At("HEAD"))
    private void ww$soulGlintBegin(PoseStack pose, MultiBufferSource buffers, int light, LivingEntity entity, float a, float b, float c,
                                   float d, float e, float f, CallbackInfo ci) {
        SoulGlint.push(entity.getItemBySlot(EquipmentSlot.CHEST));
    }

    @Inject(method = "render(Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;ILnet/minecraft/world/entity/LivingEntity;FFFFFF)V",
            at = @At("RETURN"))
    private void ww$soulGlintEnd(PoseStack pose, MultiBufferSource buffers, int light, LivingEntity entity, float a, float b, float c,
                                 float d, float e, float f, CallbackInfo ci) {
        SoulGlint.pop();
    }
}
