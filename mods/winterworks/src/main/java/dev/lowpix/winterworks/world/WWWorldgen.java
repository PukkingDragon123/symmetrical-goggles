package dev.lowpix.winterworks.world;

import dev.lowpix.winterworks.Winterworks;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.biome.Biome;

/** The Ice Caves biome, its decoration features and the frozen tomb structure (docs/COLD_UPDATE.md section 5). */
public final class WWWorldgen {
    public static final ResourceKey<Biome> ICE_CAVES = ResourceKey.create(Registries.BIOME, Winterworks.id("ice_caves"));

    private WWWorldgen() {}

    public static void init() {}
}
