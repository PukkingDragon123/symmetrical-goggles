package dev.lowpix.winterworks.mixin.endgear.client;

import dev.lowpix.winterworks.client.endgear.EndGearClient;
import net.minecraft.client.player.Input;
import net.minecraft.client.player.KeyboardInput;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Petrified: no movement input at all (walking, strafing, jumping, sneaking). */
@Mixin(KeyboardInput.class)
public abstract class EndGearKeyboardInputMixin {
    @Inject(method = "tick", at = @At("TAIL"))
    private void ww$petrifiedNoInput(boolean slow, float slowFactor, CallbackInfo ci) {
        if (EndGearClient.localFrozen()) {
            Input in = (Input) (Object) this;
            in.up = in.down = in.left = in.right = in.jumping = in.shiftKeyDown = false;
            in.forwardImpulse = 0f;
            in.leftImpulse = 0f;
        }
    }
}
