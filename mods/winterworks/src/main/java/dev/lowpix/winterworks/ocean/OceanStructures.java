package dev.lowpix.winterworks.ocean;

import dev.lowpix.winterworks.Winterworks;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.level.levelgen.structure.StructureType;
import net.minecraft.world.level.levelgen.structure.pieces.StructurePieceType;

/** Registration of the Tides & Treasures structure types and their piece type (OceanStructure, OceanStructurePiece). */
public final class OceanStructures {
    public static final StructureType<OceanStructure> DEEP_SHIPWRECK_TYPE = Registry.register(BuiltInRegistries.STRUCTURE_TYPE,
            Winterworks.id("deep_shipwreck"), () -> OceanStructure.SHIPWRECK_CODEC);
    public static final StructureType<OceanStructure> SUNKEN_TREASURE_TYPE = Registry.register(BuiltInRegistries.STRUCTURE_TYPE,
            Winterworks.id("sunken_treasure"), () -> OceanStructure.TREASURE_CODEC);
    public static final StructureType<OceanStructure> WHALE_SKELETON_TYPE = Registry.register(BuiltInRegistries.STRUCTURE_TYPE,
            Winterworks.id("whale_skeleton"), () -> OceanStructure.SKELETON_CODEC);
    public static final StructurePieceType PIECE = Registry.register(BuiltInRegistries.STRUCTURE_PIECE,
            Winterworks.id("ocean_structure"), (StructurePieceType.ContextlessType) OceanStructurePiece::new);

    private OceanStructures() {}

    static void init() {}
}
