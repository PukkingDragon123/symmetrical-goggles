package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.amber.AmberFeature;
import dev.lowpix.winterworks.registry.WWEffects;
import net.minecraft.world.item.alchemy.PotionContents;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** The Potion of Blood has no effect to take its colour from: make it dark red (docs/AMBER_UPDATE.md section 7). */
@Mixin(PotionContents.class)
public abstract class PotionContentsMixin {
    @Inject(method = "getColor()I", at = @At("HEAD"), cancellable = true)
    private void ww$bloodRed(CallbackInfoReturnable<Integer> cir) {
        PotionContents self = (PotionContents) (Object) this;
        if (self.customColor().isEmpty() && self.potion().isPresent() && self.potion().get().is(WWEffects.BLOOD_POTION)) {
            cir.setReturnValue(AmberFeature.BLOOD_COLOR);
        }
    }
}
