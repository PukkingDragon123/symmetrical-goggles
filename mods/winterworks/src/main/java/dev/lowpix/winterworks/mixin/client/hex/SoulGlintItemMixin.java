package dev.lowpix.winterworks.mixin.client.hex;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.client.hex.SoulGlint;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.ItemRenderer;
import net.minecraft.client.resources.model.BakedModel;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Every item drawn tells the soul glint whether it carries a curse (client.hex.SoulGlint). */
@Mixin(ItemRenderer.class)
public abstract class SoulGlintItemMixin {
    @Inject(method = "render(Lnet/minecraft/world/item/ItemStack;Lnet/minecraft/world/item/ItemDisplayContext;ZLcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;IILnet/minecraft/client/resources/model/BakedModel;)V",
            at = @At("HEAD"))
    private void ww$soulGlintBegin(ItemStack stack, ItemDisplayContext mode, boolean left, PoseStack pose, MultiBufferSource buffers,
                                   int light, int overlay, BakedModel model, CallbackInfo ci) {
        SoulGlint.push(stack);
    }

    @Inject(method = "render(Lnet/minecraft/world/item/ItemStack;Lnet/minecraft/world/item/ItemDisplayContext;ZLcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;IILnet/minecraft/client/resources/model/BakedModel;)V",
            at = @At("RETURN"))
    private void ww$soulGlintEnd(ItemStack stack, ItemDisplayContext mode, boolean left, PoseStack pose, MultiBufferSource buffers,
                                 int light, int overlay, BakedModel model, CallbackInfo ci) {
        SoulGlint.pop();
    }
}
