package dev.lowpix.winterworks.mixin.endgear.client;

import dev.lowpix.winterworks.client.endgear.EndGearClient;
import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Petrified: no attacking, mining or using things (the server refuses them too: endgear.EndGearFeature). */
@Mixin(Minecraft.class)
public abstract class EndGearMinecraftMixin {
    @Inject(method = "startAttack", at = @At("HEAD"), cancellable = true)
    private void ww$petrifiedNoAttack(CallbackInfoReturnable<Boolean> cir) {
        if (EndGearClient.localFrozen()) {
            cir.setReturnValue(false);
        }
    }

    @Inject(method = "continueAttack", at = @At("HEAD"), cancellable = true)
    private void ww$petrifiedNoMining(boolean leftClick, CallbackInfo ci) {
        if (EndGearClient.localFrozen()) {
            ci.cancel();
        }
    }

    @Inject(method = "startUseItem", at = @At("HEAD"), cancellable = true)
    private void ww$petrifiedNoUse(CallbackInfo ci) {
        if (EndGearClient.localFrozen()) {
            ci.cancel();
        }
    }
}
