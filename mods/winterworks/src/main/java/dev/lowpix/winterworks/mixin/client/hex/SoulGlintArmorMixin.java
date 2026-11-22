package dev.lowpix.winterworks.mixin.client.hex;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.client.hex.SoulGlint;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.layers.HumanoidArmorLayer;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Worn cursed armour glints with souls too (client.hex.SoulGlint). */
@Mixin(HumanoidArmorLayer.class)
public abstract class SoulGlintArmorMixin {
    @Inject(method = "renderArmorPiece", at = @At("HEAD"))
    private void ww$soulGlintBegin(PoseStack pose, MultiBufferSource buffers, LivingEntity entity, EquipmentSlot slot, int light,
                                   HumanoidModel<?> model, CallbackInfo ci) {
        SoulGlint.push(entity.getItemBySlot(slot));
    }

    @Inject(method = "renderArmorPiece", at = @At("RETURN"))
    private void ww$soulGlintEnd(PoseStack pose, MultiBufferSource buffers, LivingEntity entity, EquipmentSlot slot, int light,
                                 HumanoidModel<?> model, CallbackInfo ci) {
        SoulGlint.pop();
    }
}
