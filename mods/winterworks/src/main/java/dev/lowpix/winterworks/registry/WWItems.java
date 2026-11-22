package dev.lowpix.winterworks.registry;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.express.WWCartItem;
import dev.lowpix.winterworks.icebreaker.HeavyShearsItem;
import dev.lowpix.winterworks.launcher.SnowballLauncherItem;
import net.fabricmc.fabric.api.itemgroup.v1.FabricItemGroup;
import net.minecraft.core.Registry;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.ShearsItem;
import net.minecraft.world.item.SpawnEggItem;
import net.minecraft.world.item.alchemy.PotionContents;

public final class WWItems {
    public static final Item SNOWBALL_LAUNCHER = reg("snowball_launcher", new SnowballLauncherItem(new Item.Properties()
            .stacksTo(1).durability(1500).rarity(Rarity.UNCOMMON)
            .component(WWComponents.HEAT, 0).component(WWComponents.MODE, 0).component(WWComponents.OVERHEATED, false)
            .component(WWComponents.LOADED, 0)));
    public static final Item COBBLE_BALL = reg("cobble_ball", new Item(new Item.Properties().stacksTo(16)));
    public static final Item HEAVY_SHEARS = reg("heavy_shears", new HeavyShearsItem(new Item.Properties()
            .durability(1200).rarity(Rarity.UNCOMMON).component(DataComponents.TOOL, ShearsItem.createToolProperties())));
    public static final Item ICEBREAKER_HORN = reg("icebreaker_horn", new Item(new Item.Properties().rarity(Rarity.UNCOMMON)));
    public static final Item ICEBREAKER_SPAWN_EGG = reg("icebreaker_spawn_egg",
            new SpawnEggItem(WWEntities.ICEBREAKER, 0x5E6469, 0xD9D4C7, new Item.Properties()));

    public static final Item LOCOMOTIVE = reg("locomotive", new WWCartItem(() -> WWEntities.LOCOMOTIVE, new Item.Properties().stacksTo(1)));
    public static final Item DRAGON_LOCOMOTIVE = reg("dragon_locomotive", new WWCartItem(() -> WWEntities.DRAGON_LOCOMOTIVE,
            new Item.Properties().stacksTo(1).rarity(Rarity.RARE)));
    public static final Item FOX_CART = reg("fox_cart", new WWCartItem(() -> WWEntities.FOX_CART, new Item.Properties().stacksTo(1)));
    public static final Item ZOMBIE_CART = reg("zombie_cart", new WWCartItem(() -> WWEntities.ZOMBIE_CART, new Item.Properties().stacksTo(1)));

    public static final Item COASTER_RAIL = reg("coaster_rail", new BlockItem(WWBlocks.COASTER_RAIL, new Item.Properties()));
    public static final Item BOOSTER_RAIL = reg("booster_rail", new BlockItem(WWBlocks.BOOSTER_RAIL, new Item.Properties()));
    public static final Item LIFT_RAIL = reg("lift_rail", new BlockItem(WWBlocks.LIFT_RAIL, new Item.Properties()));
    public static final Item TRAP_RAIL = reg("trap_rail", new BlockItem(WWBlocks.TRAP_RAIL, new Item.Properties()));
    public static final Item DROP_RAIL = reg("drop_rail", new BlockItem(WWBlocks.DROP_RAIL, new Item.Properties()));
    public static final Item SNOW_GLOBE = reg("snow_globe", new BlockItem(WWBlocks.SNOW_GLOBE, new Item.Properties().stacksTo(16)));

    // ---- Cold Zone update (docs/COLD_UPDATE.md section 11)
    public static final Item POLAR_BEAR_FUR = reg("polar_bear_fur", new Item(new Item.Properties()));
    public static final Item FUR_HOOD = reg("fur_hood", fur(net.minecraft.world.item.ArmorItem.Type.HELMET));
    public static final Item FUR_COAT = reg("fur_coat", fur(net.minecraft.world.item.ArmorItem.Type.CHESTPLATE));
    public static final Item FUR_LEGGINGS = reg("fur_leggings", fur(net.minecraft.world.item.ArmorItem.Type.LEGGINGS));
    public static final Item FUR_BOOTS = reg("fur_boots", fur(net.minecraft.world.item.ArmorItem.Type.BOOTS));
    public static final Item MAULER_FANG = reg("mauler_fang", new Item(new Item.Properties().rarity(Rarity.RARE)));
    public static final Item FANG_DAGGER = reg("fang_dagger", new dev.lowpix.winterworks.dagger.FangDaggerItem(new Item.Properties()
            .stacksTo(1).durability(1200).rarity(Rarity.EPIC)
            .attributes(dev.lowpix.winterworks.dagger.FangDaggerItem.createAttributes())));
    public static final Item ANCIENT_ICE = reg("ancient_ice", new BlockItem(WWBlocks.ANCIENT_ICE, new Item.Properties().rarity(Rarity.UNCOMMON)));
    public static final Item ICICLE = reg("icicle", new BlockItem(WWBlocks.ICICLE, new Item.Properties()));
    public static final Item FROST_MAULER_SKULL = reg("frost_mauler_skull", new BlockItem(WWBlocks.FROST_MAULER_SKULL,
            new Item.Properties().stacksTo(16).rarity(Rarity.EPIC)));
    public static final Item FROST_MAULER_SPAWN_EGG = reg("frost_mauler_spawn_egg",
            new SpawnEggItem(WWEntities.FROST_MAULER, 0xDCE6EC, 0x3A6F9C, new Item.Properties()));
    public static final Item FROST_ZOMBIE_SPAWN_EGG = reg("frost_zombie_spawn_egg",
            new SpawnEggItem(WWEntities.FROST_ZOMBIE, 0x8FB3C4, 0x2E4F5E, new Item.Properties()));
    // ---- Amber Age update (docs/AMBER_UPDATE.md)
    public static final Item AMBER_CHUNK = reg("amber_chunk", new Item(new Item.Properties()));
    public static final Item AMBER_BLOCK = reg("amber_block", new BlockItem(WWBlocks.AMBER_BLOCK, new Item.Properties()));
    public static final Item AMBER_FOSSIL = reg("amber_fossil", new BlockItem(WWBlocks.AMBER_FOSSIL, new Item.Properties()));
    public static final Item PETRIFIED_LOG = reg("petrified_log", new BlockItem(WWBlocks.PETRIFIED_LOG, new Item.Properties()));
    public static final Item AMBERWOOD_LOG = reg("amberwood_log", new BlockItem(WWBlocks.AMBERWOOD_LOG, new Item.Properties()));
    public static final Item AMBERWOOD_LEAVES = reg("amberwood_leaves", new BlockItem(WWBlocks.AMBERWOOD_LEAVES, new Item.Properties()));
    public static final Item AMBERWOOD_PLANKS = reg("amberwood_planks", new BlockItem(WWBlocks.AMBERWOOD_PLANKS, new Item.Properties()));
    public static final Item AMBERWOOD_SEED = reg("amberwood_seed", new net.minecraft.world.item.ItemNameBlockItem(
            WWBlocks.AMBERWOOD_SAPLING, new Item.Properties().rarity(Rarity.UNCOMMON)));
    public static final Item MOSQUITO_SPAWN_EGG = reg("mosquito_spawn_egg",
            new SpawnEggItem(WWEntities.MOSQUITO, 0xC8902E, 0x3A1F1A, new Item.Properties()));
    public static final Item POT_GOLEM_SPAWN_EGG = reg("pot_golem_spawn_egg",
            new SpawnEggItem(WWEntities.POT_GOLEM, 0xE39A2D, 0x8E5A3A, new Item.Properties()));
    public static final Item AMBERWOOD_BLOOM = reg("amberwood_bloom", new BlockItem(WWBlocks.AMBERWOOD_BLOOM, new Item.Properties()));
    // ---- Hexes & Havoc (docs/HEXES_UPDATE.md)
    public static final Item ELIXIR_BOTTLE = reg("elixir_bottle", new Item(new Item.Properties().stacksTo(16)));
    public static final Item SOUL_ELIXIR = reg("soul_elixir", new dev.lowpix.winterworks.hex.ElixirItem(new Item.Properties().stacksTo(16)));
    public static final Item ELIXIR_OF_GREED = reg("elixir_of_greed", new dev.lowpix.winterworks.hex.ElixirItem(
            new Item.Properties().stacksTo(16).rarity(Rarity.UNCOMMON)));
    public static final Item CURSED_ELIXIR = reg("cursed_elixir", new dev.lowpix.winterworks.hex.ElixirItem(
            new Item.Properties().stacksTo(16).rarity(Rarity.RARE)));
    public static final Item HEX_CORE = reg("hex_core", new Item(new Item.Properties().stacksTo(1).rarity(Rarity.EPIC).fireResistant()));
    public static final Item HEXED_BOOK = reg("hexed_book", new dev.lowpix.winterworks.hex.HexedBookItem(new Item.Properties()
            .stacksTo(1).rarity(Rarity.EPIC).component(net.minecraft.core.component.DataComponents.STORED_ENCHANTMENTS,
                    net.minecraft.world.item.enchantment.ItemEnchantments.EMPTY)));
    public static final Item ELIXIR_JAR = reg("elixir_jar", new BlockItem(WWBlocks.ELIXIR_JAR, new Item.Properties()));
    public static final Item SOUL_TANK = reg("soul_tank", new BlockItem(WWBlocks.SOUL_TANK, new Item.Properties().fireResistant()));
    public static final Item HEXING_TABLE = reg("hexing_table", new BlockItem(WWBlocks.HEXING_TABLE,
            new Item.Properties().rarity(Rarity.EPIC).fireResistant()));
    public static final Item PIGLIN_WITCH_SPAWN_EGG = reg("piglin_witch_spawn_egg",
            new SpawnEggItem(WWEntities.PIGLIN_WITCH, 0x8E5A44, 0x3C6E5A, new Item.Properties()));
    public static final Item GOLDEN_PIGLIN_SPAWN_EGG = reg("golden_piglin_spawn_egg",
            new SpawnEggItem(WWEntities.GOLDEN_PIGLIN, 0xF5C431, 0xA8741A, new Item.Properties()));
    public static final Item ZOMBIE_POLAR_BEAR_SPAWN_EGG = reg("zombie_polar_bear_spawn_egg",
            new SpawnEggItem(WWEntities.ZOMBIE_POLAR_BEAR, 0xBFC7AE, 0x4E5B3D, new Item.Properties()));

    // ---- 0.4 fixes: rails (docs/FIXES_0_4.md "Rails"; creative tab entries: express.ExpressFixes)
    public static final Item COASTER_LOOP = reg("coaster_loop", new BlockItem(WWBlocks.COASTER_LOOP, new Item.Properties().stacksTo(16)));
    public static final Item SWITCH_RAIL = reg("switch_rail", new BlockItem(WWBlocks.SWITCH_RAIL, new Item.Properties()));
    // ---- end 0.4 fixes: rails

    // ---- 0.4 fixes: shared items (docs/FIXES_0_4.md)
    /** From Soul Bulls and Wither Skeletons; brews the Potion of Decay. */
    public static final Item WITHER_BONE = reg("wither_bone", new Item(new Item.Properties()));

    // ---- 0.4 fixes: Soul Bull (docs/FIXES_0_4.md); creative tab entries: soulbull.SoulBullFeature
    public static final Item SOUL_BULL_SKULL = reg("soul_bull_skull", new BlockItem(WWBlocks.SOUL_BULL_SKULL,
            new Item.Properties().rarity(Rarity.UNCOMMON)));
    public static final Item SOUL_BULL_SPAWN_EGG = reg("soul_bull_spawn_egg",
            new SpawnEggItem(WWEntities.SOUL_BULL, 0x2F2E33, 0x46D2F2, new Item.Properties()));

    public static final CreativeModeTab TAB = Registry.register(BuiltInRegistries.CREATIVE_MODE_TAB, Winterworks.id("main"),
            FabricItemGroup.builder().title(Component.translatable("itemGroup.winterworks"))
                    .icon(() -> new ItemStack(ICEBREAKER_HORN))
                    .displayItems((params, out) -> {
                        out.accept(SNOWBALL_LAUNCHER);
                        out.accept(COBBLE_BALL);
                        out.accept(HEAVY_SHEARS);
                        out.accept(ICEBREAKER_HORN);
                        out.accept(ICEBREAKER_SPAWN_EGG);
                        out.accept(PotionContents.createItemStack(Items.POTION, WWEffects.RAMMING_POTION));
                        out.accept(PotionContents.createItemStack(Items.POTION, WWEffects.LONG_RAMMING_POTION));
                        out.accept(PotionContents.createItemStack(Items.POTION, WWEffects.STRONG_RAMMING_POTION));
                        out.accept(PotionContents.createItemStack(Items.SPLASH_POTION, WWEffects.RAMMING_POTION));
                        out.accept(LOCOMOTIVE);
                        out.accept(DRAGON_LOCOMOTIVE);
                        out.accept(FOX_CART);
                        out.accept(ZOMBIE_CART);
                        out.accept(COASTER_RAIL);
                        out.accept(BOOSTER_RAIL);
                        out.accept(LIFT_RAIL);
                        out.accept(TRAP_RAIL);
                        out.accept(DROP_RAIL);
                        out.accept(SNOW_GLOBE);
                        out.accept(POLAR_BEAR_FUR);
                        out.accept(FUR_HOOD);
                        out.accept(FUR_COAT);
                        out.accept(FUR_LEGGINGS);
                        out.accept(FUR_BOOTS);
                        out.accept(MAULER_FANG);
                        out.accept(FANG_DAGGER);
                        out.accept(ANCIENT_ICE);
                        out.accept(ICICLE);
                        out.accept(FROST_MAULER_SKULL);
                        out.accept(FROST_MAULER_SPAWN_EGG);
                        out.accept(FROST_ZOMBIE_SPAWN_EGG);
                        out.accept(ZOMBIE_POLAR_BEAR_SPAWN_EGG);
                        out.accept(AMBER_CHUNK);
                        out.accept(AMBER_BLOCK);
                        out.accept(AMBER_FOSSIL);
                        out.accept(PETRIFIED_LOG);
                        out.accept(AMBERWOOD_SEED);
                        out.accept(AMBERWOOD_LOG);
                        out.accept(AMBERWOOD_LEAVES);
                        out.accept(AMBERWOOD_PLANKS);
                        out.accept(PotionContents.createItemStack(Items.POTION, WWEffects.BLOOD_POTION));
                        out.accept(PotionContents.createItemStack(Items.SPLASH_POTION, WWEffects.BLOOD_POTION));
                        out.accept(PotionContents.createItemStack(Items.POTION, WWEffects.IMMUNITY_POTION));
                        out.accept(PotionContents.createItemStack(Items.POTION, WWEffects.LONG_IMMUNITY_POTION));
                        out.accept(MOSQUITO_SPAWN_EGG);
                        out.accept(POT_GOLEM_SPAWN_EGG);
                        out.accept(AMBERWOOD_BLOOM);
                        out.accept(WITHER_BONE);
                        for (Item i : new Item[]{ELIXIR_BOTTLE, SOUL_ELIXIR, ELIXIR_OF_GREED, CURSED_ELIXIR, ELIXIR_JAR, SOUL_TANK,
                                HEX_CORE, HEXING_TABLE, HEXED_BOOK, PIGLIN_WITCH_SPAWN_EGG, GOLDEN_PIGLIN_SPAWN_EGG}) {
                            out.accept(i);
                        }
                    }).build());

    private WWItems() {}

    private static Item fur(net.minecraft.world.item.ArmorItem.Type type) {
        return new net.minecraft.world.item.ArmorItem(WWArmor.FUR, type, new Item.Properties().durability(type.getDurability(12)));
    }

    private static Item reg(String name, Item item) {
        return Registry.register(BuiltInRegistries.ITEM, Winterworks.id(name), item);
    }

    public static void init() {}
}
