package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.express.CoasterLoop;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.vehicle.AbstractMinecart;
import net.minecraft.world.phys.Vec3;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** A minecart riding a Coaster Loop carries its passengers round with it, tipped like the cart (both sides). */
@Mixin(Entity.class)
public abstract class LoopRiderMixin {
    @Inject(method = "positionRider(Lnet/minecraft/world/entity/Entity;Lnet/minecraft/world/entity/Entity$MoveFunction;)V",
            at = @At("HEAD"), cancellable = true)
    private void ww$loopSeat(Entity passenger, Entity.MoveFunction move, CallbackInfo ci) {
        if ((Object) this instanceof AbstractMinecart cart) {
            Vec3 p = CoasterLoop.riderPosition(cart, passenger);
            if (p != null) {
                move.accept(passenger, p.x, p.y, p.z);
                ci.cancel();
            }
        }
    }
}
