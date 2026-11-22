package dev.lowpix.winterworks.end;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.registry.EndItems;
import net.fabricmc.fabric.api.loot.v3.LootTableEvents;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.ItemLike;
import net.minecraft.world.level.storage.loot.BuiltInLootTables;
import net.minecraft.world.level.storage.loot.LootPool;
import net.minecraft.world.level.storage.loot.LootTable;
import net.minecraft.world.level.storage.loot.entries.LootItem;
import net.minecraft.world.level.storage.loot.functions.SetItemCountFunction;
import net.minecraft.world.level.storage.loot.predicates.LootItemRandomChanceCondition;
import net.minecraft.world.level.storage.loot.providers.number.ConstantValue;
import net.minecraft.world.level.storage.loot.providers.number.UniformGenerator;

/**
 * The Living End's loot tables (docs/END_UPDATE.md sections 2 and 3; the tables themselves are written by
 * tools/data_end_world.py), and what End City chests gain: a void rod (5%), obsidian shards and meteorites.
 */
public final class EndLoot {
    public static final ResourceKey<LootTable> DEAD_END_ARCHAEOLOGY = key("archaeology/dead_end");
    public static final ResourceKey<LootTable> RUINS_ARCHAEOLOGY = key("archaeology/obsidian_ruins");
    public static final ResourceKey<LootTable> RUINS_CHEST = key("chests/obsidian_ruins");
    public static final ResourceKey<LootTable> SHRINE_CHEST = key("chests/end_shrine");
    public static final ResourceKey<LootTable> TOWER_CHEST = key("chests/monolith_tower");
    public static final ResourceKey<LootTable> TOWER_TREASURE = key("chests/monolith_tower_treasure");

    /** The End City chest additions: chance of one void rod, of 1-4 obsidian shards, of 1-2 meteorites. */
    public static final float CITY_VOID_ROD = 0.05f, CITY_SHARDS = 0.35f, CITY_METEORITE = 0.15f;

    private EndLoot() {}

    private static ResourceKey<LootTable> key(String path) {
        return ResourceKey.create(Registries.LOOT_TABLE, Winterworks.id(path));
    }

    static void init() {
        LootTableEvents.MODIFY.register((key, builder, source, registries) -> {
            if (source.isBuiltin() && BuiltInLootTables.END_CITY_TREASURE.equals(key)) {
                builder.withPool(chance(EndItems.VOID_ROD, 1, 1, CITY_VOID_ROD));
                builder.withPool(chance(EndItems.OBSIDIAN_SHARD, 1, 4, CITY_SHARDS));
                builder.withPool(chance(dev.lowpix.winterworks.registry.EndBlocks.METEORITE, 1, 2, CITY_METEORITE));
            }
        });
    }

    private static LootPool.Builder chance(ItemLike item, int min, int max, float chance) {
        LootItem.Builder<?> entry = LootItem.lootTableItem(item);
        if (max > 1) {
            entry.apply(SetItemCountFunction.setCount(UniformGenerator.between(min, max)));
        }
        return LootPool.lootPool().setRolls(ConstantValue.exactly(1)).add(entry)
                .when(LootItemRandomChanceCondition.randomChance(chance));
    }
}
