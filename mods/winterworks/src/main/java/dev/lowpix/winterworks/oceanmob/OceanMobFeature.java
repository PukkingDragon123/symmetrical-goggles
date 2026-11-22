package dev.lowpix.winterworks.oceanmob;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.registry.OceanEntities;
import dev.lowpix.winterworks.registry.OceanItems;
import net.fabricmc.fabric.api.biome.v1.BiomeModifications;
import net.fabricmc.fabric.api.biome.v1.BiomeSelectors;
import net.fabricmc.fabric.api.biome.v1.ModificationPhase;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerEntityEvents;
import net.fabricmc.fabric.api.loot.v3.LootTableEvents;
import net.fabricmc.fabric.api.registry.FabricBrewingRecipeRegistryBuilder;
import net.minecraft.advancements.critereon.EntityFlagsPredicate;
import net.minecraft.advancements.critereon.EntityPredicate;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.SpawnPlacementTypes;
import net.minecraft.world.entity.SpawnPlacements;
import net.minecraft.world.item.alchemy.Potions;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.biome.MobSpawnSettings;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.storage.loot.LootContext;
import net.minecraft.world.level.storage.loot.LootPool;
import net.minecraft.world.level.storage.loot.LootTable;
import net.minecraft.world.level.storage.loot.entries.LootItem;
import net.minecraft.world.level.storage.loot.functions.SetItemCountFunction;
import net.minecraft.world.level.storage.loot.predicates.LootItemEntityPropertyCondition;
import net.minecraft.world.level.storage.loot.providers.number.ConstantValue;
import net.minecraft.world.level.storage.loot.providers.number.UniformGenerator;

/**
 * Tides & Treasures creatures (docs/OCEAN_UPDATE.md sections 3, 4): spawn rules by depth and the vanilla ocean biomes they
 * live in (the new ocean biomes list them in their own spawners), Night Vision brewed from an angler lure (the golden carrot
 * mix is removed by mixin.oceanmob.NightVisionBrewingMixin), turtle shell shards from turtles, more turtles on beaches,
 * and the anglerfish lure light's cleanup when an anglerfish stops being tracked (unload, removal).
 * The turtle overhaul itself is mixin.oceanmob.TurtleMixin / TurtleLayEggGoalMixin.
 */
public final class OceanMobFeature {
    public static final ResourceKey<LootTable> ANGLERFISH_FEMALE_LOOT = ResourceKey.create(Registries.LOOT_TABLE,
            Winterworks.id("entities/anglerfish_female"));
    /** Beach turtle spawn weight (vanilla 5). */
    public static final int BEACH_TURTLE_WEIGHT = 14;

    private OceanMobFeature() {}

    public static void init() {
        // spawn rules by depth: anglerfish below y 20 (females below -10, decided as they spawn), lionfish in the shallows
        // above 40, nautiluses in deep water below 35
        SpawnPlacements.register(OceanEntities.ANGLERFISH, SpawnPlacementTypes.IN_WATER, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES,
                Anglerfish::checkSpawnRules);
        SpawnPlacements.register(OceanEntities.LIONFISH, SpawnPlacementTypes.IN_WATER, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES,
                Lionfish::checkSpawnRules);
        SpawnPlacements.register(OceanEntities.NAUTILUS, SpawnPlacementTypes.IN_WATER, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES,
                Nautilus::checkSpawnRules);
        var deep = BiomeSelectors.includeByKey(Biomes.DEEP_OCEAN, Biomes.DEEP_COLD_OCEAN, Biomes.DEEP_LUKEWARM_OCEAN, Biomes.DEEP_FROZEN_OCEAN);
        var shallow = BiomeSelectors.includeByKey(Biomes.OCEAN, Biomes.COLD_OCEAN, Biomes.LUKEWARM_OCEAN, Biomes.WARM_OCEAN, Biomes.FROZEN_OCEAN);
        BiomeModifications.addSpawn(deep, MobCategory.WATER_CREATURE, OceanEntities.ANGLERFISH, 6, 1, 2);
        BiomeModifications.addSpawn(shallow, MobCategory.WATER_CREATURE, OceanEntities.ANGLERFISH, 1, 1, 1);
        BiomeModifications.addSpawn(deep, MobCategory.WATER_CREATURE, OceanEntities.NAUTILUS, 3, 1, 2);
        BiomeModifications.addSpawn(BiomeSelectors.includeByKey(Biomes.WARM_OCEAN), MobCategory.WATER_AMBIENT, OceanEntities.LIONFISH, 10, 1, 3);
        BiomeModifications.addSpawn(BiomeSelectors.includeByKey(Biomes.LUKEWARM_OCEAN, Biomes.DEEP_LUKEWARM_OCEAN), MobCategory.WATER_AMBIENT,
                OceanEntities.LIONFISH, 3, 1, 2);
        // turtles: more of them on beaches
        BiomeModifications.create(Winterworks.id("beach_turtles")).add(ModificationPhase.REPLACEMENTS, BiomeSelectors.includeByKey(Biomes.BEACH),
                ctx -> {
                    ctx.getSpawnSettings().removeSpawnsOfEntityType(EntityType.TURTLE);
                    ctx.getSpawnSettings().addSpawn(MobCategory.CREATURE, new MobSpawnSettings.SpawnerData(EntityType.TURTLE, BEACH_TURTLE_WEIGHT, 2, 5));
                });
        // a grown turtle drops 1-3 turtle shell shards (9 craft a Turtle Shell)
        LootTableEvents.MODIFY.register((key, table, source, registries) -> {
            if (source.isBuiltin() && key.equals(EntityType.TURTLE.getDefaultLootTable())) {
                table.withPool(LootPool.lootPool().setRolls(ConstantValue.exactly(1))
                        .add(LootItem.lootTableItem(OceanItems.TURTLE_SHELL_SHARD).apply(SetItemCountFunction.setCount(UniformGenerator.between(1, 3))))
                        .when(LootItemEntityPropertyCondition.hasProperties(LootContext.EntityTarget.THIS,
                                EntityPredicate.Builder.entity().flags(EntityFlagsPredicate.Builder.flags().setIsBaby(false)))));
            }
        });
        // Night Vision: awkward potion + angler lure
        FabricBrewingRecipeRegistryBuilder.BUILD.register(b -> b.addMix(Potions.AWKWARD, OceanItems.ANGLER_LURE, Potions.NIGHT_VISION));
        // the lure's light never stays behind: an anglerfish that stops being tracked (unloaded, removed) puts it back to water
        ServerEntityEvents.ENTITY_UNLOAD.register((entity, level) -> {
            if (entity instanceof Anglerfish a) {
                a.clearLight(level);
            }
        });
    }
}
