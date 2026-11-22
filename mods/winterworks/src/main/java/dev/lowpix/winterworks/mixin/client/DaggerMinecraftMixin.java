package dev.lowpix.winterworks.mixin.client;

import dev.lowpix.winterworks.client.dagger.DaggerClient;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.phys.HitResult;
import org.jetbrains.annotations.Nullable;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyArg;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Fang Daggers (docs/FIXES_0_4.md): a left click is the left dagger. A left click at a mob swings the left hand (the
 * swing packet carries it, so everyone sees the right arm); a left click in the air with the frenzy ready is a quick
 * swing of the left dagger without vanilla's miss penalty (no 10-tick lockout, no reset of the attack charge).
 * Mining swings the main hand as usual.
 */
@Mixin(Minecraft.class)
public abstract class DaggerMinecraftMixin {
    @Shadow @Nullable public LocalPlayer player;
    @Shadow @Nullable public HitResult hitResult;
    @Shadow public int missTime;

    @Inject(method = "startAttack", at = @At("HEAD"), cancellable = true)
    private void ww$daggerWhiff(CallbackInfoReturnable<Boolean> cir) {
        if (player != null && missTime <= 0 && hitResult != null && hitResult.getType() == HitResult.Type.MISS
                && !player.isHandsBusy() && DaggerClient.whiffLeft(player)) {
            cir.setReturnValue(false);
        }
    }

    @ModifyArg(method = "startAttack", at = @At(value = "INVOKE",
            target = "Lnet/minecraft/client/player/LocalPlayer;swing(Lnet/minecraft/world/InteractionHand;)V"))
    private InteractionHand ww$daggerSwingHand(InteractionHand hand) {
        if (player != null && hitResult != null && hitResult.getType() == HitResult.Type.ENTITY) {
            return DaggerClient.leftClickHand(player, hand);
        }
        return hand;
    }
}
