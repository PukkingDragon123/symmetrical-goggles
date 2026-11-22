package dev.lowpix.winterworks.mixin.client;

import dev.lowpix.winterworks.client.curse.CurseClient;
import net.minecraft.client.MouseHandler;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Narcissus and Lot's Wife: you can't turn your head (client.curse.CurseClient). */
@Mixin(MouseHandler.class)
public abstract class CurseMouseHandlerMixin {
    @Inject(method = "turnPlayer", at = @At("HEAD"), cancellable = true)
    private void ww$curseLockCamera(double movementTime, CallbackInfo ci) {
        if (CurseClient.cameraLocked()) {
            ci.cancel();
        }
    }
}
