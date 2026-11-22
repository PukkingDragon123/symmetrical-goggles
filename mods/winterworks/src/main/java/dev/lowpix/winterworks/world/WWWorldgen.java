package dev.lowpix.winterworks.world;

import dev.lowpix.winterworks.Winterworks;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.levelgen.feature.Feature;
import net.minecraft.world.level.levelgen.feature.configurations.NoneFeatureConfiguration;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructureType;
import net.minecraft.world.level.levelgen.structure.pieces.StructurePieceType;

/**
 * The Ice Caves biome (added under frozen climates by mixin.OverworldBiomeBuilderMixin; its JSON is written by
 * tools/data_cold.py), its decoration feature and the frozen tomb structure (docs/COLD_UPDATE.md section 5).
 */
public final class WWWorldgen {
    public static final ResourceKey<Biome> ICE_CAVES = ResourceKey.create(Registries.BIOME, Winterworks.id("ice_caves"));
    public static final ResourceKey<Biome> DEAD_CAVES = ResourceKey.create(Registries.BIOME, Winterworks.id("dead_caves"));
    public static final ResourceKey<Structure> DIG_SITE = ResourceKey.create(Registries.STRUCTURE, Winterworks.id("dig_site"));
    public static final ResourceKey<Structure> FROZEN_TOMB = ResourceKey.create(Registries.STRUCTURE, Winterworks.id("frozen_tomb"));

    public static final Feature<NoneFeatureConfiguration> ICE_CAVE_SURFACE = Registry.register(BuiltInRegistries.FEATURE,
            Winterworks.id("ice_cave_surface"), new IceCaveSurfaceFeature(NoneFeatureConfiguration.CODEC));
    public static final StructureType<FrozenTombStructure> FROZEN_TOMB_TYPE = Registry.register(BuiltInRegistries.STRUCTURE_TYPE,
            Winterworks.id("frozen_tomb"), () -> FrozenTombStructure.CODEC);
    public static final StructurePieceType FROZEN_TOMB_PIECE = Registry.register(BuiltInRegistries.STRUCTURE_PIECE,
            Winterworks.id("frozen_tomb"), (StructurePieceType.ContextlessType) FrozenTombPiece::new);

    public static final Feature<NoneFeatureConfiguration> CAVE_DEPOSITS = Registry.register(BuiltInRegistries.FEATURE,
            Winterworks.id("cave_deposits"), new CaveDepositsFeature(NoneFeatureConfiguration.CODEC));
    public static final Feature<NoneFeatureConfiguration> DEAD_CAVE_SURFACE = Registry.register(BuiltInRegistries.FEATURE,
            Winterworks.id("dead_cave_surface"), new DeadCaveSurfaceFeature(NoneFeatureConfiguration.CODEC));
    public static final StructureType<DigSiteStructure> DIG_SITE_TYPE = Registry.register(BuiltInRegistries.STRUCTURE_TYPE,
            Winterworks.id("dig_site"), () -> DigSiteStructure.CODEC);
    public static final StructurePieceType DIG_SITE_PIECE = Registry.register(BuiltInRegistries.STRUCTURE_PIECE,
            Winterworks.id("dig_site"), (StructurePieceType.ContextlessType) DigSitePiece::new);

    private WWWorldgen() {}

    public static void init() {}
}
