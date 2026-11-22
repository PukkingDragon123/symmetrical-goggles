package dev.lowpix.winterworks.hex;

import dev.lowpix.winterworks.curse.Curse;
import net.minecraft.core.Holder;
import net.minecraft.core.component.DataComponents;
import net.minecraft.tags.EnchantmentTags;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.ItemEnchantments;

/**
 * Which items carry a curse (docs/FIXES_0_4.md "Cursed books and cursed gear"): any of ours (lesser, hidden or a sin)
 * or a vanilla curse (Binding, Vanishing), applied or stored in a book. Cursed items glint with souls instead of the
 * purple shimmer (client.hex.SoulGlint) and enchanted books carrying a curse look cursed (item/cursed_book, or
 * item/cursed_book_sin for a sin: client.hex.CursedBooks).
 */
public final class CursedItems {
    public static final int NONE = 0, CURSE = 1, SIN = 2;

    private CursedItems() {}

    /** NONE, CURSE or SIN (a sin outranks any other curse). */
    public static int tier(ItemStack stack) {
        if (stack.isEmpty()) {
            return NONE;
        }
        int t = tier(stack.get(DataComponents.STORED_ENCHANTMENTS), NONE);
        return t == SIN ? SIN : tier(stack.get(DataComponents.ENCHANTMENTS), t);
    }

    private static int tier(ItemEnchantments en, int best) {
        if (en == null || en.isEmpty()) {
            return best;
        }
        for (Holder<Enchantment> h : en.keySet()) {
            Curse c = Curse.of(h);
            if (c != null && c.sin()) {
                return SIN;
            }
            if (c != null || h.is(EnchantmentTags.CURSE)) {
                best = CURSE;
            }
        }
        return best;
    }

    public static boolean cursed(ItemStack stack) {
        return tier(stack) != NONE;
    }
}
