package dev.lowpix.winterworks.mixin.client.endboss;

import dev.lowpix.winterworks.client.endboss.EclipseSky;
import net.minecraft.client.renderer.DimensionSpecialEffects;
import net.minecraft.world.phys.Vec3;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** The End's fog takes the eclipse's violet (client.endboss.EclipseSky#fog). */
@Mixin(DimensionSpecialEffects.EndEffects.class)
public abstract class EndFogMixin {
    @Inject(method = "getBrightnessDependentFogColor", at = @At("RETURN"), cancellable = true)
    private void ww$eclipseFog(Vec3 colour, float brightness, CallbackInfoReturnable<Vec3> cir) {
        cir.setReturnValue(EclipseSky.fog(cir.getReturnValue()));
    }
}
