package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.express.CoasterLoop;
import net.minecraft.world.entity.player.Player;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** No getting off halfway round a Coaster Loop (sneaking there would drop you from the top). */
@Mixin(Player.class)
public abstract class LoopPlayerMixin {
    @Inject(method = "wantsToStopRiding", at = @At("HEAD"), cancellable = true)
    private void ww$holdOnInLoop(CallbackInfoReturnable<Boolean> cir) {
        if (CoasterLoop.vehicleMotion((Player) (Object) this) != null) {
            cir.setReturnValue(false);
        }
    }
}
