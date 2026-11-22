package dev.lowpix.winterworks.ocean;

import dev.lowpix.winterworks.Winterworks;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.storage.loot.LootTable;

/** The Tides & Treasures world's chest loot tables (data: tools/data_ocean_world.py). */
public final class OceanLoot {
    public static final ResourceKey<LootTable> DEEP_SHIPWRECK_SUPPLY = key("chests/deep_shipwreck_supply");
    public static final ResourceKey<LootTable> DEEP_SHIPWRECK_CARGO = key("chests/deep_shipwreck_cargo");
    public static final ResourceKey<LootTable> DEEP_SHIPWRECK_TREASURE = key("chests/deep_shipwreck_treasure");
    public static final ResourceKey<LootTable> SUNKEN_TREASURE = key("chests/sunken_treasure");
    public static final ResourceKey<LootTable> WHALE_SKELETON = key("chests/whale_skeleton");
    public static final ResourceKey<LootTable> MONUMENT_TREASURE = key("chests/monument_treasure");
    public static final ResourceKey<LootTable> MONUMENT_WING = key("chests/monument_wing");
    public static final ResourceKey<LootTable> MONUMENT_CORE = key("chests/monument_core");

    private OceanLoot() {}

    private static ResourceKey<LootTable> key(String path) {
        return ResourceKey.create(Registries.LOOT_TABLE, Winterworks.id(path));
    }
}
