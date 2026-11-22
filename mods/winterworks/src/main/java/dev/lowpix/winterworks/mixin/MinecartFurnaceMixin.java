package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.express.CartSpeed;
import dev.lowpix.winterworks.express.Couplings;
import dev.lowpix.winterworks.express.FurnacePower;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.vehicle.MinecartFurnace;
import net.minecraft.world.phys.Vec3;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** A furnace minecart in a locomotive's train is its boiler (express.FurnacePower). */
@Mixin(MinecartFurnace.class)
public abstract class MinecartFurnaceMixin implements FurnacePower.Fuel {
    @Shadow
    private int fuel;

    @Shadow
    public double xPush;

    @Shadow
    public double zPush;

    @Shadow
    protected abstract double getMaxSpeed();

    @Override
    public int ww$fuel() {
        return fuel;
    }

    private boolean ww$inLocomotiveTrain() {
        MinecartFurnace self = (MinecartFurnace) (Object) this;
        return !self.level().isClientSide && FurnacePower.locomotive(self) != null;
    }

    /** Behind a locomotive it keeps up with the train instead of holding it to the furnace cart's crawl. */
    @Inject(method = "getMaxSpeed", at = @At("RETURN"), cancellable = true)
    private void ww$trainSpeed(CallbackInfoReturnable<Double> cir) {
        if (ww$inLocomotiveTrain()) {
            MinecartFurnace self = (MinecartFurnace) (Object) this;
            double f = Math.max(1.0, ((CartSpeed) self).ww$speedFactor());
            cir.setReturnValue((self.isInWater() ? 4.0 : 8.0) / 20.0 * f);
        }
    }

    /** ... and leaves the pushing to the locomotive it fires. */
    @Inject(method = "applyNaturalSlowdown", at = @At("HEAD"))
    private void ww$locomotiveDrives(CallbackInfo ci) {
        if ((xPush != 0 || zPush != 0) && ww$inLocomotiveTrain()) {
            xPush = 0;
            zPush = 0;
        }
    }

    /**
     * Vanilla lets a pushing furnace cart's velocity run up to 2 b/t while it moves 0.2: coupled, that would fling the
     * cars behind it into it. Keep its velocity to what it really moves, so its couplings pull the train smoothly.
     */
    @Inject(method = "applyNaturalSlowdown", at = @At("TAIL"))
    private void ww$honestSpeed(CallbackInfo ci) {
        MinecartFurnace self = (MinecartFurnace) (Object) this;
        if (self.level().isClientSide || !Couplings.hasAnyLink(self)) {
            return;
        }
        Vec3 v = self.getDeltaMovement();
        double h = v.horizontalDistance(), max = getMaxSpeed();
        if (h > max) {
            self.setDeltaMovement(v.x * max / h, v.y, v.z * max / h);
        }
    }

    @Inject(method = "interact", at = @At("RETURN"))
    private void ww$stoked(Player player, InteractionHand hand, CallbackInfoReturnable<InteractionResult> cir) {
        MinecartFurnace self = (MinecartFurnace) (Object) this;
        if (!self.level().isClientSide && fuel > 0) {
            FurnacePower.stoked(self, player);
        }
    }
}
