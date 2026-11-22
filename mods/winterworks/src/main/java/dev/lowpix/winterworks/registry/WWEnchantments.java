package dev.lowpix.winterworks.registry;

import dev.lowpix.winterworks.Winterworks;
import java.util.List;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.enchantment.Enchantment;

/** Data-driven enchantments of Hexes & Havoc (data/winterworks/enchantment/*.json, written by tools/data_curses.py). */
public final class WWEnchantments {
    public static final ResourceKey<Enchantment> NARCISSUS = key("narcissus");
    public static final ResourceKey<Enchantment> ICARUS = key("icarus");
    public static final ResourceKey<Enchantment> MIDAS = key("midas");
    public static final ResourceKey<Enchantment> ORPHEUS = key("orpheus");
    public static final ResourceKey<Enchantment> SISYPHUS = key("sisyphus");
    public static final ResourceKey<Enchantment> TANTALUS = key("tantalus");
    public static final ResourceKey<Enchantment> MOTH = key("moth");
    public static final ResourceKey<Enchantment> CAIN = key("cain");
    public static final ResourceKey<Enchantment> JUDAS = key("judas");
    public static final ResourceKey<Enchantment> LOTS_WIFE = key("lots_wife");
    public static final ResourceKey<Enchantment> LEECH = key("leech");
    public static final ResourceKey<Enchantment> WRATH = key("wrath");
    public static final ResourceKey<Enchantment> GREED = key("greed");
    public static final ResourceKey<Enchantment> LUST = key("lust");
    public static final ResourceKey<Enchantment> GLUTTONY = key("gluttony");
    public static final ResourceKey<Enchantment> SLOTH = key("sloth");
    public static final ResourceKey<Enchantment> ENVY = key("envy");
    public static final ResourceKey<Enchantment> PRIDE = key("pride");

    /** The seven lesser curses (vanilla Binding and Vanishing are lesser curses too). */
    public static final List<ResourceKey<Enchantment>> LESSER = List.of(NARCISSUS, ICARUS, MIDAS, ORPHEUS, SISYPHUS, TANTALUS, MOTH);
    /** Hidden curses: unnamed until discovered. */
    public static final List<ResourceKey<Enchantment>> HIDDEN = List.of(CAIN, JUDAS, LOTS_WIFE, LEECH);
    /** The seven sin enchantments (each its power and its major curse). */
    public static final List<ResourceKey<Enchantment>> SINS = List.of(WRATH, GREED, LUST, GLUTTONY, SLOTH, ENVY, PRIDE);

    private WWEnchantments() {}

    private static ResourceKey<Enchantment> key(String name) {
        return ResourceKey.create(Registries.ENCHANTMENT, Winterworks.id(name));
    }
}
