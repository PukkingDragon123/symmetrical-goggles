package dev.lowpix.winterworks.end;

import dev.lowpix.winterworks.Winterworks;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.levelgen.structure.Structure;

/** Keys of the Living End's biomes and structures (docs/END_UPDATE.md sections 1 and 3). */
public final class EndWorldgen {
    public static final ResourceKey<Biome> CHORUS_MEADOWS = ResourceKey.create(Registries.BIOME, Winterworks.id("chorus_meadows"));
    public static final ResourceKey<Biome> DEAD_END = ResourceKey.create(Registries.BIOME, Winterworks.id("dead_end"));
    public static final ResourceKey<Structure> OBSIDIAN_RUINS = ResourceKey.create(Registries.STRUCTURE, Winterworks.id("obsidian_ruins"));
    public static final ResourceKey<Structure> END_SHRINE = ResourceKey.create(Registries.STRUCTURE, Winterworks.id("end_shrine"));
    public static final ResourceKey<Structure> MONOLITH_TOWER = ResourceKey.create(Registries.STRUCTURE, Winterworks.id("monolith_tower"));

    private EndWorldgen() {}
}
