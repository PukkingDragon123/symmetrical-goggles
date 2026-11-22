package dev.lowpix.winterworks.mixin.client;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.dagger.FangDaggerItem;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.ItemInHandRenderer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Fang Daggers in first person (docs/FIXES_0_4.md): the pair in the main hand draws the left dagger in the free off
 * hand too, with vanilla's own hand placement, bob and swing for that hand.
 */
@Mixin(ItemInHandRenderer.class)
public abstract class DaggerHandRendererMixin {
    @Shadow
    private void renderArmWithItem(AbstractClientPlayer player, float partial, float pitch, InteractionHand hand, float swing,
                                   ItemStack stack, float equip, PoseStack pose, MultiBufferSource buffers, int light) {
        throw new AssertionError();
    }

    @Inject(method = "renderArmWithItem", at = @At("HEAD"), cancellable = true)
    private void ww$leftDagger(AbstractClientPlayer player, float partial, float pitch, InteractionHand hand, float swing, ItemStack stack,
                               float equip, PoseStack pose, MultiBufferSource buffers, int light, CallbackInfo ci) {
        if (hand == InteractionHand.OFF_HAND && stack.isEmpty() && FangDaggerItem.dualWielding(player)) {
            renderArmWithItem(player, partial, pitch, hand, swing, player.getMainHandItem(), equip, pose, buffers, light);
            ci.cancel();
        }
    }
}
