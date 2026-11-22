package dev.lowpix.winterworks.mixin.endgear;

import dev.lowpix.winterworks.endgear.DragonEggs;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.item.ItemEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** A Dragon Egg that falls out of the End comes back with a crack instead of vanishing (endgear.DragonEggs). */
@Mixin(Entity.class)
public abstract class EndGearEntityMixin {
    @Inject(method = "onBelowWorld", at = @At("HEAD"), cancellable = true)
    private void ww$eggFromTheVoid(CallbackInfo ci) {
        if ((Object) this instanceof ItemEntity item && DragonEggs.fromVoid(item)) {
            ci.cancel();
        }
    }
}
