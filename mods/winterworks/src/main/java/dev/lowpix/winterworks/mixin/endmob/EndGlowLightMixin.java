package dev.lowpix.winterworks.mixin.endmob;

import dev.lowpix.winterworks.client.endmob.EndMobClient;
import net.minecraft.client.renderer.LightTexture;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** End Glow (docs/END_UPDATE.md section 6): whoever has it is drawn at full brightness, the first-person hand included. */
@Mixin(EntityRenderer.class)
public abstract class EndGlowLightMixin {
    @Inject(method = "getPackedLightCoords", at = @At("RETURN"), cancellable = true)
    private void winterworks$endGlow(Entity entity, float partial, CallbackInfoReturnable<Integer> cir) {
        if (entity instanceof LivingEntity e && EndMobClient.glows(e)) {
            cir.setReturnValue(LightTexture.FULL_BRIGHT);
        }
    }
}
