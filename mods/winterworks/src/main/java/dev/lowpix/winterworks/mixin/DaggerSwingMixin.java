package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.dagger.FangDaggerItem;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Fang Daggers (docs/FIXES_0_4.md): snappy swings. With the pair out a swing takes 4 ticks instead of vanilla's 6
 * (with Haste or Mining Fatigue, vanilla's own timing). Only the arm animation: no gameplay depends on it.
 */
@Mixin(LivingEntity.class)
public abstract class DaggerSwingMixin {
    @Inject(method = "getCurrentSwingDuration", at = @At("HEAD"), cancellable = true)
    private void ww$snappyDaggers(CallbackInfoReturnable<Integer> cir) {
        LivingEntity self = (LivingEntity) (Object) this;
        if (self instanceof Player && FangDaggerItem.dualWielding(self) && !self.hasEffect(MobEffects.DIG_SPEED)
                && !self.hasEffect(MobEffects.DIG_SLOWDOWN)) {
            cir.setReturnValue(4);
        }
    }
}
