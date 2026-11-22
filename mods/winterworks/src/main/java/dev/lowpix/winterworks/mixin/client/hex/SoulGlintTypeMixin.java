package dev.lowpix.winterworks.mixin.client.hex;

import dev.lowpix.winterworks.client.hex.SoulGlint;
import net.minecraft.client.renderer.RenderType;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** While a cursed stack is drawn, vanilla's glint types resolve to the soul glint (client.hex.SoulGlint). */
@Mixin(RenderType.class)
public abstract class SoulGlintTypeMixin {
    @Inject(method = {"glint", "glintTranslucent", "entityGlint", "entityGlintDirect", "armorEntityGlint"}, at = @At("RETURN"),
            cancellable = true)
    private static void ww$soulGlint(CallbackInfoReturnable<RenderType> cir) {
        RenderType soul = SoulGlint.resolve(cir.getReturnValue());
        if (soul != cir.getReturnValue()) {
            cir.setReturnValue(soul);
        }
    }
}
