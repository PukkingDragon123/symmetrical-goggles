package dev.lowpix.winterworks.potion;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.registry.EndEffects;
import dev.lowpix.winterworks.registry.WWEffects;
import dev.lowpix.winterworks.registry.WWItems;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.itemgroup.v1.FabricItemGroupEntries;
import net.fabricmc.fabric.api.itemgroup.v1.ItemGroupEvents;
import net.fabricmc.fabric.api.registry.FabricBrewingRecipeRegistryBuilder;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.alchemy.Potion;
import net.minecraft.world.item.alchemy.PotionContents;
import net.minecraft.world.item.alchemy.Potions;

/**
 * The mod's potions (docs/FIXES_0_4.md "Potions", "Blood in hexing"): the brewing recipes for Burning and Decay and
 * their long and strong forms, blood as a base for Harming and Regeneration, and every mod potion as drink, splash,
 * lingering and tipped arrow in the creative tabs. Splash (gunpowder), lingering (dragon's breath) and tipped arrows
 * (a lingering potion round 8 arrows) are vanilla's own container recipes, so every potion has them.
 */
public final class PotionFeature {
    /** The potion forms, in the order the creative tabs show them. */
    public static final List<Item> FORMS = List.of(Items.POTION, Items.SPLASH_POTION, Items.LINGERING_POTION, Items.TIPPED_ARROW);

    private PotionFeature() {}

    /** Every mod potion family (base, long, strong), main tab first, then the End's. */
    public static List<List<Holder<Potion>>> families() {
        return List.of(
                List.of(WWEffects.RAMMING_POTION, WWEffects.LONG_RAMMING_POTION, WWEffects.STRONG_RAMMING_POTION),
                List.of(WWEffects.BLOOD_POTION),
                List.of(WWEffects.IMMUNITY_POTION, WWEffects.LONG_IMMUNITY_POTION),
                List.of(WWEffects.BURNING_POTION, WWEffects.LONG_BURNING_POTION, WWEffects.STRONG_BURNING_POTION),
                List.of(WWEffects.DECAY_POTION, WWEffects.LONG_DECAY_POTION, WWEffects.STRONG_DECAY_POTION),
                List.of(EndEffects.RECALL_POTION));
    }

    public static void init() {
        FabricBrewingRecipeRegistryBuilder.BUILD.register(b -> {
            b.addMix(Potions.AWKWARD, Items.TORCHFLOWER, WWEffects.BURNING_POTION);
            b.addMix(WWEffects.BURNING_POTION, Items.REDSTONE, WWEffects.LONG_BURNING_POTION);
            b.addMix(WWEffects.BURNING_POTION, Items.GLOWSTONE_DUST, WWEffects.STRONG_BURNING_POTION);
            b.addMix(Potions.AWKWARD, WWItems.WITHER_BONE, WWEffects.DECAY_POTION);
            b.addMix(WWEffects.DECAY_POTION, Items.REDSTONE, WWEffects.LONG_DECAY_POTION);
            b.addMix(WWEffects.DECAY_POTION, Items.GLOWSTONE_DUST, WWEffects.STRONG_DECAY_POTION);
            // blood is a base potion: the vanilla potions it makes then extend and strengthen as usual
            b.addMix(WWEffects.BLOOD_POTION, Items.FERMENTED_SPIDER_EYE, Potions.HARMING);
            b.addMix(WWEffects.BLOOD_POTION, Items.GHAST_TEAR, Potions.REGENERATION);
        });
        // the tabs by key, so nothing here loads the End's registries early
        ItemGroupEvents.modifyEntriesEvent(ResourceKey.create(Registries.CREATIVE_MODE_TAB, Winterworks.id("main")))
                .register(entries -> arrange(entries, families().subList(0, families().size() - 1)));
        ItemGroupEvents.modifyEntriesEvent(ResourceKey.create(Registries.CREATIVE_MODE_TAB, Winterworks.id("end")))
                .register(entries -> arrange(entries, families().subList(families().size() - 1, families().size())));
    }

    private static void arrange(FabricItemGroupEntries entries, List<List<Holder<Potion>>> families) {
        List<ItemStack> display = entries.getDisplayStacks();
        List<ItemStack> out = new ArrayList<>();
        boolean[] done = new boolean[families.size()];
        for (ItemStack stack : display) {
            int f = familyOf(stack, families);
            if (f < 0) {
                out.add(stack);
                continue;
            }
            if (!done[f]) {   // this family, then the families after it that the tab didn't show yet
                for (int k = f; k < families.size() && (k == f || !done[k] && !shown(display, families.get(k))); k++) {
                    done[k] = true;
                    out.addAll(stacks(families.get(k)));
                }
            }
        }
        for (int k = 0; k < families.size(); k++) {
            if (!done[k]) {
                out.addAll(stacks(families.get(k)));
            }
        }
        display.clear();
        display.addAll(out);
        for (List<Holder<Potion>> family : families) {
            for (ItemStack s : stacks(family)) {
                if (entries.getSearchTabStacks().stream().noneMatch(e -> ItemStack.isSameItemSameComponents(e, s))) {
                    entries.getSearchTabStacks().add(s);
                }
            }
        }
    }

    private static boolean shown(List<ItemStack> display, List<Holder<Potion>> family) {
        return display.stream().anyMatch(s -> family.stream().anyMatch(p -> isPotion(s, p)));
    }

    private static int familyOf(ItemStack stack, List<List<Holder<Potion>>> families) {
        for (int k = 0; k < families.size(); k++) {
            for (Holder<Potion> p : families.get(k)) {
                if (isPotion(stack, p)) {
                    return k;
                }
            }
        }
        return -1;
    }

    private static boolean isPotion(ItemStack stack, Holder<Potion> potion) {
        if (FORMS.stream().noneMatch(stack::is)) {
            return false;
        }
        PotionContents pc = stack.get(net.minecraft.core.component.DataComponents.POTION_CONTENTS);
        return pc != null && pc.is(potion);
    }

    /** The four forms of every potion in a family. */
    public static List<ItemStack> stacks(List<Holder<Potion>> family) {
        List<ItemStack> out = new ArrayList<>();
        for (Holder<Potion> p : family) {
            for (Item form : FORMS) {
                out.add(PotionContents.createItemStack(form, p));
            }
        }
        return out;
    }
}
