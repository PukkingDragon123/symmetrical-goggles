package dev.lowpix.winterworks.mixin.oceanmob.client;

import com.llamalad7.mixinextras.injector.ModifyExpressionValue;
import dev.lowpix.winterworks.oceanmob.Anglerfish;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/**
 * Someone held in a female anglerfish's jaws rides her mouth locator, but hangs there rather than sitting: the model's
 * riding pose (the first isPassenger() in the render) is off for them.
 */
@Mixin(LivingEntityRenderer.class)
public abstract class GrabbedRiderPoseMixin {
    @ModifyExpressionValue(method = "render(Lnet/minecraft/world/entity/LivingEntity;FFLcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;I)V",
            at = @At(value = "INVOKE", target = "Lnet/minecraft/world/entity/LivingEntity;isPassenger()Z", ordinal = 0))
    private boolean ww$hangInTheJaws(boolean riding, LivingEntity entity) {
        return riding && !(entity.getVehicle() instanceof Anglerfish);
    }
}
