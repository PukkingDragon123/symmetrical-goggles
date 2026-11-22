package dev.lowpix.winterworks.mixin.endgear.client;

import dev.lowpix.winterworks.client.endgear.EndGliderRenderer;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Gliding with the End Glider: both arms up, holding it overhead (PlayerModel copies the arms to the sleeves after). */
@Mixin(HumanoidModel.class)
public abstract class EndGearHumanoidModelMixin<T extends LivingEntity> {
    @Inject(method = "setupAnim(Lnet/minecraft/world/entity/LivingEntity;FFFFF)V", at = @At("TAIL"))
    private void ww$gliderArms(T entity, float limbSwing, float limbAmount, float age, float headYaw, float headPitch, CallbackInfo ci) {
        EndGliderRenderer.poseArms((HumanoidModel<?>) (Object) this, entity, age);
    }
}
