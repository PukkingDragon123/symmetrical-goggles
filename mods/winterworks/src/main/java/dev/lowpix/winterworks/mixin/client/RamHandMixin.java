package dev.lowpix.winterworks.mixin.client;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.client.cold.RamClient;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.client.renderer.ItemInHandRenderer;
import net.minecraft.client.renderer.MultiBufferSource;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Potion of Ramming at top speed (docs/FIXES_0_4.md): in first person the hands drop back, swept out of the way. */
@Mixin(ItemInHandRenderer.class)
public abstract class RamHandMixin {
    @Inject(method = "renderHandsWithItems", at = @At("HEAD"))
    private void ww$sweptBack(float partial, PoseStack pose, MultiBufferSource.BufferSource buffers, LocalPlayer player, int light,
                              CallbackInfo ci) {
        RamClient.firstPerson(pose, partial);
    }
}
