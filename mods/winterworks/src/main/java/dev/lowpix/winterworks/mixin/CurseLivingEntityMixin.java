package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.curse.CurseHooks;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Curses on damage: Pride's falls, Envy, Gluttony's starving, soul fire; and what happens after a hit (curse.CurseHooks). */
@Mixin(LivingEntity.class)
public abstract class CurseLivingEntityMixin {
    @ModifyVariable(method = "hurt", at = @At("HEAD"), argsOnly = true)
    private float ww$curseDamage(float amount, DamageSource source) {
        return CurseHooks.incomingDamage((LivingEntity) (Object) this, source, amount);
    }

    @Inject(method = "hurt", at = @At("RETURN"))
    private void ww$curseAfterHurt(DamageSource source, float amount, CallbackInfoReturnable<Boolean> cir) {
        if (cir.getReturnValueZ()) {
            CurseHooks.afterHurt((LivingEntity) (Object) this, source, amount);
        }
    }
}
