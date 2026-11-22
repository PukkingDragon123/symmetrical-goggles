package dev.lowpix.winterworks.mixin.client;

import dev.lowpix.winterworks.dagger.FangDaggerItem;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.entity.player.PlayerRenderer;
import net.minecraft.world.InteractionHand;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Fang Daggers (docs/FIXES_0_4.md): the free off hand holds the left dagger, so it takes the holding-an-item arm pose. */
@Mixin(PlayerRenderer.class)
public abstract class DaggerPlayerRendererMixin {
    @Inject(method = "getArmPose", at = @At("HEAD"), cancellable = true)
    private static void ww$leftDaggerPose(AbstractClientPlayer player, InteractionHand hand, CallbackInfoReturnable<HumanoidModel.ArmPose> cir) {
        if (hand == InteractionHand.OFF_HAND && player.getOffhandItem().isEmpty() && FangDaggerItem.dualWielding(player)) {
            cir.setReturnValue(HumanoidModel.ArmPose.ITEM);
        }
    }
}
