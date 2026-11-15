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
    public static final Item TRAILER_CART = reg("trailer_cart", new WWCartItem(() -> WWEntities.TRAILER_CART, new Item.Properties().stacksTo(1)));

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
    public static final Item ZOMBIE_POLAR_BEAR_SPAWN_EGG = reg("zombie_polar_bear_spawn_egg",
            new SpawnEggItem(WWEntities.ZOMBIE_POLAR_BEAR, 0xBFC7AE, 0x4E5B3D, new Item.Properties()));

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
                        out.accept(TRAILER_CART);
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
