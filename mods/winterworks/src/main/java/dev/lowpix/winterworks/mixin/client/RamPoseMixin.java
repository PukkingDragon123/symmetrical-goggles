package dev.lowpix.winterworks.mixin.client;

import dev.lowpix.winterworks.client.cold.RamClient;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Potion of Ramming at top speed (docs/FIXES_0_4.md): the running pose, leaning forward with the arms swept back, laid
 * over the humanoid pose (PlayerModel copies it to the sleeves, trousers and jacket after this).
 */
@Mixin(HumanoidModel.class)
public abstract class RamPoseMixin<T extends LivingEntity> {
    @Inject(method = "setupAnim(Lnet/minecraft/world/entity/LivingEntity;FFFFF)V", at = @At("TAIL"))
    private void ww$rammingPose(T entity, float limbSwing, float limbAmount, float age, float headYaw, float headPitch, CallbackInfo ci) {
        float partial = Minecraft.getInstance().getTimer().getGameTimeDeltaPartialTick(false);
        float k = RamClient.lean(entity, partial);
        if (k > 0f) {
            RamClient.pose((HumanoidModel<?>) (Object) this, entity, limbSwing, k);
        }
    }
}
