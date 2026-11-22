package dev.lowpix.winterworks.registry;

import dev.lowpix.winterworks.Winterworks;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import net.fabricmc.fabric.api.itemgroup.v1.FabricItemGroup;
import net.minecraft.Util;
import net.minecraft.core.Holder;
import net.minecraft.core.Registry;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.ArmorItem;
import net.minecraft.world.item.ArmorMaterial;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.MobBucketItem;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.SpawnEggItem;
import net.minecraft.world.item.component.CustomData;
import net.minecraft.world.item.crafting.Ingredient;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.material.Fluids;

/** Tides & Treasures items, armour material and creative tab (docs/OCEAN_UPDATE.md section 10). */
public final class OceanItems {
    private static final List<Item> TAB_ITEMS = new ArrayList<>();

    static {
        for (Block b : OceanBlocks.ALL) {
            if (b == OceanBlocks.NAUTILUS_HORN || b == OceanBlocks.WHALE_FLESH || b == OceanBlocks.WHALE_HIDE) {
                continue;
            }
            reg(BuiltInRegistries.BLOCK.getKey(b).getPath(), new BlockItem(b, new Item.Properties()));
        }
    }

    public static final Holder<ArmorMaterial> TURTLE_SHELL_MATERIAL = Registry.registerForHolder(BuiltInRegistries.ARMOR_MATERIAL,
            Winterworks.id("turtle_shell"), new ArmorMaterial(Util.make(new EnumMap<>(ArmorItem.Type.class), m -> {
                m.put(ArmorItem.Type.BOOTS, 2);
                m.put(ArmorItem.Type.LEGGINGS, 5);
                m.put(ArmorItem.Type.CHESTPLATE, 6);
                m.put(ArmorItem.Type.HELMET, 2);
                m.put(ArmorItem.Type.BODY, 5);
            }), 9, SoundEvents.ARMOR_EQUIP_TURTLE, () -> Ingredient.of(Items.TURTLE_SCUTE),
                    List.of(new ArmorMaterial.Layer(Winterworks.id("turtle_shell"))), 1f, 0f));

    public static final Item RAW_ANGLERFISH = reg("raw_anglerfish", new Item(new Item.Properties().food(new FoodProperties.Builder()
            .nutrition(2).saturationModifier(0.2f).effect(new MobEffectInstance(MobEffects.NIGHT_VISION, 400), 1f).build())));
    public static final Item COOKED_ANGLERFISH = reg("cooked_anglerfish", new Item(new Item.Properties().food(new FoodProperties.Builder()
            .nutrition(6).saturationModifier(0.7f).effect(new MobEffectInstance(MobEffects.NIGHT_VISION, 800), 1f).build())));
    public static final Item ANGLER_LURE = reg("angler_lure", new Item(new Item.Properties()));
    public static final Item ANGLERFISH_BUCKET = reg("anglerfish_bucket", new MobBucketItem(OceanEntities.ANGLERFISH, Fluids.WATER,
            SoundEvents.BUCKET_EMPTY_FISH, new Item.Properties().stacksTo(1).component(DataComponents.BUCKET_ENTITY_DATA, CustomData.EMPTY)));
    public static final Item LIONFISH = reg("lionfish", new Item(new Item.Properties().food(new FoodProperties.Builder()
            .nutrition(2).saturationModifier(0.1f).effect(new MobEffectInstance(MobEffects.POISON, 100), 0.5f).build())));
    public static final Item COOKED_LIONFISH = reg("cooked_lionfish", new Item(new Item.Properties().food(new FoodProperties.Builder()
            .nutrition(6).saturationModifier(0.8f).build())));
    public static final Item LIONFISH_DART = reg("lionfish_dart", new dev.lowpix.winterworks.oceangear.LionfishDartItem(new Item.Properties()));
    public static final Item TURTLE_SHELL_SHARD = reg("turtle_shell_shard", new Item(new Item.Properties()));
    public static final Item TURTLE_SHELL_CHESTPLATE = reg("turtle_shell_chestplate", shell(ArmorItem.Type.CHESTPLATE));
    public static final Item TURTLE_SHELL_LEGGINGS = reg("turtle_shell_leggings", shell(ArmorItem.Type.LEGGINGS));
    public static final Item TURTLE_SHELL_BOOTS = reg("turtle_shell_boots", shell(ArmorItem.Type.BOOTS));
    public static final Item GUARDIAN_SCALE = reg("guardian_scale", new Item(new Item.Properties()));
    public static final Item ELDER_GUARDIAN_EYE = reg("elder_guardian_eye", new Item(new Item.Properties().rarity(Rarity.EPIC)
            .fireResistant()));
    public static final Item NAUTILUS_HORN = reg("nautilus_horn", new dev.lowpix.winterworks.whale.NautilusHornItem(OceanBlocks.NAUTILUS_HORN,
            new Item.Properties().stacksTo(1).rarity(Rarity.RARE)));
    public static final Item ANGLERFISH_SPAWN_EGG = reg("anglerfish_spawn_egg",
            new SpawnEggItem(OceanEntities.ANGLERFISH, 0x1E2230, 0x7FE8F0, new Item.Properties()));
    public static final Item LIONFISH_SPAWN_EGG = reg("lionfish_spawn_egg",
            new SpawnEggItem(OceanEntities.LIONFISH, 0xE85A3A, 0xF4E9D8, new Item.Properties()));
    public static final Item NAUTILUS_SPAWN_EGG = reg("nautilus_spawn_egg",
            new SpawnEggItem(OceanEntities.NAUTILUS, 0xEDE1CC, 0xB0553A, new Item.Properties()));
    public static final Item WHALE_SPAWN_EGG = reg("whale_spawn_egg",
            new SpawnEggItem(OceanEntities.WHALE, 0x3C5A78, 0xC9D6DE, new Item.Properties()));

    public static final CreativeModeTab TAB = Registry.register(BuiltInRegistries.CREATIVE_MODE_TAB, Winterworks.id("ocean"),
            FabricItemGroup.builder().title(Component.translatable("itemGroup.winterworks.ocean"))
                    .icon(() -> new ItemStack(ANGLER_LURE))
                    .displayItems((params, out) -> TAB_ITEMS.forEach(out::accept)).build());

    private OceanItems() {}

    private static Item shell(ArmorItem.Type type) {
        return new dev.lowpix.winterworks.oceangear.TurtleShellArmorItem(TURTLE_SHELL_MATERIAL, type,
                new Item.Properties().durability(type.getDurability(25)));
    }

    private static Item reg(String name, Item item) {
        Registry.register(BuiltInRegistries.ITEM, Winterworks.id(name), item);
        TAB_ITEMS.add(item);
        return item;
    }

    public static void init() {}
}
