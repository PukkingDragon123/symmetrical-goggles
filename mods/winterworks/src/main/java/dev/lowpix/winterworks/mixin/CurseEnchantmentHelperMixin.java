package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.curse.Sins;
import net.minecraft.core.Holder;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.EnchantmentHelper;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Greed counts as Fortune +2 and Lust as Looting +3 wherever loot asks for those levels. */
@Mixin(EnchantmentHelper.class)
public abstract class CurseEnchantmentHelperMixin {
    @Inject(method = "getItemEnchantmentLevel", at = @At("RETURN"), cancellable = true)
    private static void ww$sinsCountAsTheirSource(Holder<Enchantment> enchantment, ItemStack stack, CallbackInfoReturnable<Integer> cir) {
        int level = cir.getReturnValueI();
        int sin = Sins.sourceLevel(enchantment, stack, level);
        if (sin != level) {
            cir.setReturnValue(sin);
        }
    }
}
