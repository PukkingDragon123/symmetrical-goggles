package dev.lowpix.winterworks.mixin.endgear.client;

import com.llamalad7.mixinextras.injector.v2.WrapWithCondition;
import dev.lowpix.winterworks.client.endgear.EndGearClient;
import net.minecraft.client.MouseHandler;
import net.minecraft.client.player.LocalPlayer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** Petrified: the camera can't turn (the mouse movement is used up, so nothing jumps when the shell breaks). */
@Mixin(MouseHandler.class)
public abstract class EndGearMouseHandlerMixin {
    @WrapWithCondition(method = "turnPlayer", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/player/LocalPlayer;turn(DD)V"))
    private boolean ww$petrifiedNoTurn(LocalPlayer player, double dx, double dy) {
        return !EndGearClient.localFrozen();
    }
}
