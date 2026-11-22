package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.curse.LustSpawns;
import net.minecraft.world.entity.MobCategory;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Lust: the monster cap counts double while the spawner works near a Lust bearer (curse.LustSpawns). */
@Mixin(MobCategory.class)
public abstract class CurseMobCategoryMixin {
    @Inject(method = "getMaxInstancesPerChunk", at = @At("RETURN"), cancellable = true)
    private void ww$lustCap(CallbackInfoReturnable<Integer> cir) {
        int base = cir.getReturnValueI();
        int cap = LustSpawns.cap((MobCategory) (Object) this, base);
        if (cap != base) {
            cir.setReturnValue(cap);
        }
    }
}
