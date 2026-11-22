package dev.lowpix.winterworks.mixin.client;

import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.express.CoasterLoop;
import dev.lowpix.winterworks.express.LoopMotion;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.MinecartRenderer;
import net.minecraft.world.entity.vehicle.AbstractMinecart;
import net.minecraft.world.phys.Vec3;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Vanilla minecarts on a Coaster Loop: off the rail-snapping, tipped round the loop with the cart. */
@Mixin(MinecartRenderer.class)
public abstract class LoopMinecartRendererMixin {
    private static final String RENDER =
            "render(Lnet/minecraft/world/entity/vehicle/AbstractMinecart;FFLcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;I)V";

    @WrapOperation(method = RENDER, at = @At(value = "INVOKE",
            target = "Lnet/minecraft/world/entity/vehicle/AbstractMinecart;getPos(DDD)Lnet/minecraft/world/phys/Vec3;"))
    private Vec3 ww$noRailInLoop(AbstractMinecart cart, double x, double y, double z, Operation<Vec3> op) {
        return CoasterLoop.looping(cart) ? null : op.call(cart, x, y, z);
    }

    @Inject(method = RENDER, at = @At(value = "INVOKE", target = "Lcom/mojang/blaze3d/vertex/PoseStack;translate(FFF)V", ordinal = 1))
    private void ww$tipInLoop(AbstractMinecart cart, float yaw, float partial, PoseStack pose, MultiBufferSource buffers, int light,
                              CallbackInfo ci) {
        LoopMotion m = CoasterLoop.motion(cart);
        if (m != null) {
            pose.mulPose(m.rotation(m.interpolatedTheta(partial)));
        }
    }
}
