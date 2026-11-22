package dev.lowpix.winterworks.mixin.client;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.dagger.FangDaggerItem;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.layers.ItemInHandLayer;
import net.minecraft.world.entity.HumanoidArm;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Fang Daggers in third person (docs/FIXES_0_4.md): the pair in the main hand puts the left dagger in the free off hand. */
@Mixin(ItemInHandLayer.class)
public abstract class DaggerItemInHandLayerMixin {
    @Shadow
    protected abstract void renderArmWithItem(LivingEntity entity, ItemStack stack, ItemDisplayContext context, HumanoidArm arm,
                                              PoseStack pose, MultiBufferSource buffers, int light);

    @Inject(method = "renderArmWithItem", at = @At("HEAD"), cancellable = true)
    private void ww$leftDagger(LivingEntity entity, ItemStack stack, ItemDisplayContext context, HumanoidArm arm, PoseStack pose,
                               MultiBufferSource buffers, int light, CallbackInfo ci) {
        if (stack.isEmpty() && arm != entity.getMainArm() && FangDaggerItem.dualWielding(entity)) {
            renderArmWithItem(entity, entity.getMainHandItem(), context, arm, pose, buffers, light);
            ci.cancel();
        }
    }
}
