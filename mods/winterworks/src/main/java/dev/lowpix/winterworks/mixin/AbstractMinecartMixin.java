package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.express.CartSpeed;
import dev.lowpix.winterworks.express.RailPhysics;
import net.minecraft.world.entity.vehicle.AbstractMinecart;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Every minecart (vanilla ones too) reacts to Winter Express rails and can be boosted past the vanilla speed limit. */
@Mixin(AbstractMinecart.class)
public abstract class AbstractMinecartMixin implements CartSpeed {
    @Unique
    private double ww$speedFactor = 1.0;

    @Override
    public double ww$speedFactor() {
        return ww$speedFactor;
    }

    @Override
    public void ww$setSpeedFactor(double f) {
        ww$speedFactor = f;
    }

    @Inject(method = "getMaxSpeed", at = @At("RETURN"), cancellable = true)
    private void ww$maxSpeed(CallbackInfoReturnable<Double> cir) {
        if (ww$speedFactor > 1.0) {
            cir.setReturnValue(cir.getReturnValue() * ww$speedFactor);
        }
    }

    @Inject(method = "tick", at = @At("TAIL"))
    private void ww$afterTick(CallbackInfo ci) {
        RailPhysics.afterTick((AbstractMinecart) (Object) this);
    }
}
