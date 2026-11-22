package dev.lowpix.winterworks.soulbull;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWItems;
import net.fabricmc.fabric.api.biome.v1.BiomeModifications;
import net.fabricmc.fabric.api.biome.v1.BiomeSelectors;
import net.fabricmc.fabric.api.itemgroup.v1.ItemGroupEvents;
import net.fabricmc.fabric.api.loot.v3.LootTableEvents;
import net.fabricmc.fabric.api.object.builder.v1.entity.FabricDefaultAttributeRegistry;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.SpawnPlacementTypes;
import net.minecraft.world.entity.SpawnPlacements;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.storage.loot.LootPool;
import net.minecraft.world.level.storage.loot.entries.LootItem;
import net.minecraft.world.level.storage.loot.predicates.LootItemRandomChanceCondition;
import net.minecraft.world.level.storage.loot.providers.number.ConstantValue;

/**
 * The Soul Bull (docs/FIXES_0_4.md "The Soul Bull"): attributes, spawning in Soul Sand Valleys (herds of 1-3), the
 * Wither Skeleton's Wither Bone (25%), and the creative tab entries. Registered in WWEntities/WWBlocks/WWItems/WWSounds
 * under "0.4 fixes: Soul Bull".
 */
public final class SoulBullFeature {
    /** Weight among the Soul Sand Valley's monsters (skeletons 20, ghasts 50, endermen 1). */
    public static final int SPAWN_WEIGHT = 12;
    /** A Wither Skeleton's chance to drop a Wither Bone. */
    public static final float WITHER_BONE_CHANCE = 0.25f;

    private SoulBullFeature() {}

    public static void init() {
        FabricDefaultAttributeRegistry.register(WWEntities.SOUL_BULL, SoulBull.createAttributes());
        SpawnPlacements.register(WWEntities.SOUL_BULL, SpawnPlacementTypes.ON_GROUND, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES,
                SoulBull::checkSoulBullSpawnRules);
        BiomeModifications.addSpawn(BiomeSelectors.includeByKey(Biomes.SOUL_SAND_VALLEY), MobCategory.MONSTER, WWEntities.SOUL_BULL,
                SPAWN_WEIGHT, 1, 3);
        LootTableEvents.MODIFY.register((key, table, source, registries) -> {
            if (source.isBuiltin() && key.equals(EntityType.WITHER_SKELETON.getDefaultLootTable())) {
                table.withPool(LootPool.lootPool().setRolls(ConstantValue.exactly(1)).add(LootItem.lootTableItem(WWItems.WITHER_BONE))
                        .when(LootItemRandomChanceCondition.randomChance(WITHER_BONE_CHANCE)));
            }
        });
        ResourceKey<CreativeModeTab> tab = ResourceKey.create(Registries.CREATIVE_MODE_TAB, Winterworks.id("main"));
        ItemGroupEvents.modifyEntriesEvent(tab).register(entries -> {
            for (Item i : new Item[]{WWItems.WITHER_BONE, WWItems.SOUL_BULL_SKULL, WWItems.SOUL_BULL_SPAWN_EGG}) {
                if (entries.getDisplayStacks().stream().noneMatch(s -> s.is(i))) {   // another feature may list the bone too
                    entries.accept(i);
                }
            }
        });
    }
}
