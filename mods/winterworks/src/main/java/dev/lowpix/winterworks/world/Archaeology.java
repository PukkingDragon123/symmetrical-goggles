package dev.lowpix.winterworks.world;

import dev.lowpix.winterworks.Winterworks;
import net.fabricmc.fabric.api.biome.v1.BiomeModifications;
import net.fabricmc.fabric.api.biome.v1.BiomeSelectors;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.levelgen.GenerationStep;
import net.minecraft.world.level.storage.loot.LootTable;

/** Archaeology worldgen (docs/AMBER_UPDATE.md sections 1-3): deposits in every cave, the Dead Caves, Dig Sites. */
public final class Archaeology {
    public static final ResourceKey<LootTable> CAVE_AMBER = loot("archaeology/cave_amber");
    public static final ResourceKey<LootTable> CAVE_BONES = loot("archaeology/cave_bones");
    public static final ResourceKey<LootTable> DEAD_CAVE = loot("archaeology/dead_cave");
    public static final ResourceKey<LootTable> DIG_SITE = loot("archaeology/dig_site");
    public static final ResourceKey<LootTable> DIG_SITE_CHEST = loot("chests/dig_site");
    /** Amber sand and amber gravel (docs/FIXES_0_4.md): amber shards mostly, sometimes a whole amber block. */
    public static final ResourceKey<LootTable> AMBER_DEPOSIT = loot("archaeology/amber_deposit");

    private Archaeology() {}

    private static ResourceKey<LootTable> loot(String path) {
        return ResourceKey.create(Registries.LOOT_TABLE, Winterworks.id(path));
    }

    public static void init() {
        WWWorldgen.init();
        // a lot more suspicious sand and gravel: in every overworld cave
        BiomeModifications.addFeature(BiomeSelectors.foundInOverworld(), GenerationStep.Decoration.UNDERGROUND_DECORATION,
                ResourceKey.create(Registries.PLACED_FEATURE, Winterworks.id("cave_deposits")));
    }
}
