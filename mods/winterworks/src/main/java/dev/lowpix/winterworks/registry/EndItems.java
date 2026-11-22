package dev.lowpix.winterworks.registry;

import dev.lowpix.winterworks.Winterworks;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.itemgroup.v1.FabricItemGroup;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.SpawnEggItem;
import net.minecraft.world.item.alchemy.PotionContents;
import net.minecraft.world.level.block.Block;

/** The Living End's items and its creative tab (docs/END_UPDATE.md section 14). */
public final class EndItems {
    private static final List<Item> TAB_ITEMS = new ArrayList<>();

    static {
        for (Block b : EndBlocks.ALL) {
            Item.Properties p = new Item.Properties();
            if (b == EndBlocks.METEORITE || b == EndBlocks.METEORITE_CORE) {
                p = p.fireResistant().rarity(Rarity.UNCOMMON);
            }
            reg(BuiltInRegistries.BLOCK.getKey(b).getPath(), new BlockItem(b, p));
        }
    }

    public static final Item END_BULB = reg("end_bulb", new Item(new Item.Properties().food(new FoodProperties.Builder()
            .nutrition(2).saturationModifier(0.3f).alwaysEdible().effect(new MobEffectInstance(EndEffects.END_GLOW, 9600), 1f)
            .build())));
    public static final Item ENDERFLY_WING = reg("enderfly_wing", new Item(new Item.Properties()));
    public static final Item GUCKER_MEAT = reg("gucker_meat", new Item(new Item.Properties().food(new FoodProperties.Builder()
            .nutrition(3).saturationModifier(0.3f).build())));
    public static final Item COOKED_GUCKER_MEAT = reg("cooked_gucker_meat", new Item(new Item.Properties()
            .food(new FoodProperties.Builder().nutrition(8).saturationModifier(0.8f).build())));
    public static final Item GUCKER_GLAND = reg("gucker_gland", new Item(new Item.Properties()));
    public static final Item OBSIDIAN_SHARD = reg("obsidian_shard", new Item(new Item.Properties()));
    public static final Item OBSIDIAN_SHIELD = reg("obsidian_shield", new dev.lowpix.winterworks.endgear.ObsidianShieldItem(
            new Item.Properties().durability(1008).rarity(Rarity.UNCOMMON).fireResistant()));
    public static final Item END_GLIDER = reg("end_glider", new dev.lowpix.winterworks.endgear.EndGliderItem(
            new Item.Properties().durability(432).rarity(Rarity.RARE)));
    public static final Item MONOLITH_EYE = reg("monolith_eye", new Item(new Item.Properties().rarity(Rarity.EPIC).fireResistant()));
    public static final Item VOID_ROD = reg("void_rod", new Item(new Item.Properties().stacksTo(1).rarity(Rarity.RARE)));
    public static final Item MONOLITH_WAND = reg("monolith_wand", new dev.lowpix.winterworks.endgear.MonolithWandItem(
            new Item.Properties().durability(128).rarity(Rarity.EPIC).fireResistant()));
    public static final Item ENDERFLY_SPAWN_EGG = reg("enderfly_spawn_egg",
            new SpawnEggItem(EndEntities.ENDERFLY, 0x2A1838, 0xC86BF0, new Item.Properties()));
    public static final Item ENDLING_SPAWN_EGG = reg("endling_spawn_egg",
            new SpawnEggItem(EndEntities.ENDLING, 0x141018, 0xD58CFF, new Item.Properties()));
    public static final Item GUCKER_SPAWN_EGG = reg("gucker_spawn_egg",
            new SpawnEggItem(EndEntities.GUCKER, 0x8C8A6E, 0x5B3E6E, new Item.Properties()));
    public static final Item OBOLISK_SPAWN_EGG = reg("obolisk_spawn_egg",
            new SpawnEggItem(EndEntities.OBOLISK, 0x140C22, 0x9B4DFF, new Item.Properties()));
    public static final Item DRAGONLING_SPAWN_EGG = reg("dragonling_spawn_egg",
            new SpawnEggItem(EndEntities.DRAGONLING, 0x1C1424, 0xB070D8, new Item.Properties()));
    public static final Item MONOLITH_SPAWN_EGG = reg("monolith_spawn_egg",
            new SpawnEggItem(EndEntities.MONOLITH, 0x0E0A16, 0x7B3BFF, new Item.Properties()));

    public static final CreativeModeTab TAB = Registry.register(BuiltInRegistries.CREATIVE_MODE_TAB, Winterworks.id("end"),
            FabricItemGroup.builder().title(Component.translatable("itemGroup.winterworks.end"))
                    .icon(() -> new ItemStack(MONOLITH_EYE))
                    .displayItems((params, out) -> {
                        TAB_ITEMS.forEach(out::accept);
                        out.accept(PotionContents.createItemStack(Items.POTION, EndEffects.RECALL_POTION));
                        out.accept(PotionContents.createItemStack(Items.SPLASH_POTION, EndEffects.RECALL_POTION));
                    }).build());

    private EndItems() {}

    private static Item reg(String name, Item item) {
        Registry.register(BuiltInRegistries.ITEM, Winterworks.id(name), item);
        TAB_ITEMS.add(item);
        return item;
    }

    public static void init() {}
}
