package dev.lowpix.winterworks.mixin.endgear.client;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.client.endgear.EndGliderRenderer;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.layers.ItemInHandLayer;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.world.entity.HumanoidArm;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Gliding with the End Glider: it's drawn overhead between both raised hands instead of in one hand. */
@Mixin(ItemInHandLayer.class)
public abstract class EndGearItemInHandLayerMixin {
    @Inject(method = "renderArmWithItem", at = @At("HEAD"), cancellable = true)
    private void ww$gliderOverhead(LivingEntity entity, ItemStack stack, ItemDisplayContext ctx, HumanoidArm arm, PoseStack pose,
                                   MultiBufferSource buffers, int light, CallbackInfo ci) {
        EntityModel<?> model = ((RenderLayer<?, ?>) (Object) this).getParentModel();
        if (EndGliderRenderer.renderOverhead(entity, stack, model, pose, buffers, light)) {
            ci.cancel();
        }
    }
}
