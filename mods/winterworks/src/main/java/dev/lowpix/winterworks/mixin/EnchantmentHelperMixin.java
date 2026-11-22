package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.hex.HexedBookItem;
import net.minecraft.core.component.DataComponentType;
import net.minecraft.core.component.DataComponents;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.enchantment.EnchantmentHelper;
import net.minecraft.world.item.enchantment.ItemEnchantments;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * A Hexed Book stores its enchantments like an enchanted book (STORED_ENCHANTMENTS), so anvils and grindstones read
 * and write them the same way (vanilla only does this for minecraft:enchanted_book).
 */
@Mixin(EnchantmentHelper.class)
public abstract class EnchantmentHelperMixin {
    @Inject(method = "getComponentType", at = @At("HEAD"), cancellable = true)
    private static void winterworks$hexedBooksStoreEnchantments(ItemStack stack,
                                                                 CallbackInfoReturnable<DataComponentType<ItemEnchantments>> cir) {
        if (stack.getItem() instanceof HexedBookItem) {
            cir.setReturnValue(DataComponents.STORED_ENCHANTMENTS);
        }
    }
}
