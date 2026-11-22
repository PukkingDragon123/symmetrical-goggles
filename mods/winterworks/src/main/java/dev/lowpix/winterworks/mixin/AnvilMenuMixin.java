package dev.lowpix.winterworks.mixin;

import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import dev.lowpix.winterworks.hex.Hexing;
import it.unimi.dsi.fastutil.objects.Object2IntMap;
import net.minecraft.core.Holder;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.inventory.AnvilMenu;
import net.minecraft.world.inventory.ContainerLevelAccess;
import net.minecraft.world.inventory.ItemCombinerMenu;
import net.minecraft.world.inventory.MenuType;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.EnchantmentHelper;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/**
 * Anvils keep hexed levels (docs/HEXES_UPDATE.md section 2): when either input already holds an enchantment above its
 * vanilla maximum, that level (up to VI) is the cap instead of the maximum. Two vanilla maxima still don't combine
 * past the maximum.
 */
@Mixin(AnvilMenu.class)
public abstract class AnvilMenuMixin extends ItemCombinerMenu {
    AnvilMenuMixin(MenuType<?> type, int id, Inventory inventory, ContainerLevelAccess access) {
        super(type, id, inventory, access);
    }

    @WrapOperation(method = "createResult", at = @At(value = "INVOKE",
            target = "Lnet/minecraft/world/item/enchantment/Enchantment;getMaxLevel()I"))
    private int winterworks$hexedLevelCap(Enchantment enchantment, Operation<Integer> original) {
        int max = original.call(enchantment);
        int hexed = Math.max(winterworks$levelOf(inputSlots.getItem(0), enchantment), winterworks$levelOf(inputSlots.getItem(1), enchantment));
        return hexed > max ? Math.min(Hexing.MAX_LEVEL, hexed) : max;
    }

    private static int winterworks$levelOf(ItemStack stack, Enchantment enchantment) {
        int best = 0;
        for (Object2IntMap.Entry<Holder<Enchantment>> e : EnchantmentHelper.getEnchantmentsForCrafting(stack).entrySet()) {
            if (e.getKey().value() == enchantment) {
                best = Math.max(best, e.getIntValue());
            }
        }
        return best;
    }
}
