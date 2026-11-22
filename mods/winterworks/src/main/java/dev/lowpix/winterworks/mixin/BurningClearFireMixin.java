package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.potion.BurningEffect;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Potion of Burning: water, rain, powder snow and the rest can't put out whoever it holds (potion.BurningEffect). */
@Mixin(Entity.class)
public abstract class BurningClearFireMixin {
    @Inject(method = "clearFire", at = @At("HEAD"), cancellable = true)
    private void ww$keepBurning(CallbackInfo ci) {
        if ((Object) this instanceof LivingEntity e && BurningEffect.keepsBurning(e)) {
            ci.cancel();
        }
    }
}
