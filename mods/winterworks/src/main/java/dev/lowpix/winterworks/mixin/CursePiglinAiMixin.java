package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.curse.Sins;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.monster.piglin.PiglinAi;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Greed: Piglins hunt you whatever you wear. */
@Mixin(PiglinAi.class)
public abstract class CursePiglinAiMixin {
    @Inject(method = "isWearingGold", at = @At("RETURN"), cancellable = true)
    private static void ww$greedHidesGold(LivingEntity entity, CallbackInfoReturnable<Boolean> cir) {
        if (cir.getReturnValueZ() && Sins.hidesGold(entity)) {
            cir.setReturnValue(false);
        }
    }
}
