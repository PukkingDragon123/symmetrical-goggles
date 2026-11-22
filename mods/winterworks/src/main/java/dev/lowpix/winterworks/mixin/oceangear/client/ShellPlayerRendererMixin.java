package dev.lowpix.winterworks.mixin.oceangear.client;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.client.oceangear.TurtleShellRenderers;
import dev.lowpix.winterworks.oceangear.TurtleShell;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.player.PlayerRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** A player retreated into a full Turtle Shell is drawn as the closed shell instead of their body. */
@Mixin(PlayerRenderer.class)
public abstract class ShellPlayerRendererMixin {
    @Inject(method = "render(Lnet/minecraft/client/player/AbstractClientPlayer;FFLcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;I)V",
            at = @At("HEAD"), cancellable = true)
    private void ww$shell(AbstractClientPlayer player, float yaw, float partial, PoseStack pose, MultiBufferSource buffers, int light,
                          CallbackInfo ci) {
        if (TurtleShell.isRetreating(player)) {
            TurtleShellRenderers.renderRetreat(player, ((PlayerRenderer) (Object) this).getRenderOffset(player, partial), partial, pose,
                    buffers, light);
            ci.cancel();
        }
    }
}
