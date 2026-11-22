package dev.lowpix.winterworks.ocean;

import dev.lowpix.winterworks.Winterworks;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.levelgen.structure.Structure;

/** Keys of the Tides & Treasures biomes, structures and the whale belly dimension (docs/OCEAN_UPDATE.md). */
public final class OceanWorldgen {
    public static final ResourceKey<Biome> VOLCANIC_DEPTHS = ResourceKey.create(Registries.BIOME, Winterworks.id("volcanic_depths"));
    public static final ResourceKey<Biome> ABYSSAL_TRENCH = ResourceKey.create(Registries.BIOME, Winterworks.id("abyssal_trench"));
    public static final ResourceKey<Structure> DEEP_SHIPWRECK = ResourceKey.create(Registries.STRUCTURE, Winterworks.id("deep_shipwreck"));
    public static final ResourceKey<Structure> SUNKEN_TREASURE = ResourceKey.create(Registries.STRUCTURE, Winterworks.id("sunken_treasure"));
    public static final ResourceKey<Structure> WHALE_SKELETON = ResourceKey.create(Registries.STRUCTURE, Winterworks.id("whale_skeleton"));
    public static final ResourceKey<Level> WHALE_BELLY = ResourceKey.create(Registries.DIMENSION, Winterworks.id("whale_belly"));

    private OceanWorldgen() {}
}
