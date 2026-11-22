package dev.lowpix.winterworks.mixin.client;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.express.CoasterLoop;
import dev.lowpix.winterworks.express.LoopMotion;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** A rider on a Coaster Loop is drawn tipped with the cart: upside down at the top. */
@Mixin(LivingEntityRenderer.class)
public abstract class LoopLivingRendererMixin {
    @Inject(method = "setupRotations", at = @At("HEAD"))
    private void ww$tipWithTheCart(LivingEntity entity, PoseStack pose, float bob, float bodyRot, float partial, float scale,
                                   CallbackInfo ci) {
        LoopMotion m = CoasterLoop.vehicleMotion(entity);
        if (m != null) {
            pose.mulPose(m.rotation(m.interpolatedTheta(partial)));
        }
    }
}
