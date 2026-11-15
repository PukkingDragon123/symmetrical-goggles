package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.cold.ColdSystem;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Fur armour shrugs off Slowness, Frostbite and Stunned (docs/COLD_UPDATE.md section 2). */
@Mixin(LivingEntity.class)
public abstract class LivingEntityMixin {
    @Inject(method = "canBeAffected", at = @At("HEAD"), cancellable = true)
    private void ww$furImmunity(MobEffectInstance effect, CallbackInfoReturnable<Boolean> cir) {
        if (ColdSystem.resists((LivingEntity) (Object) this, effect.getEffect())) {
            cir.setReturnValue(false);
        }
    }
}
