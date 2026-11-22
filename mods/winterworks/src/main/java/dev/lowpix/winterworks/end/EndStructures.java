package dev.lowpix.winterworks.end;

import dev.lowpix.winterworks.Winterworks;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.level.levelgen.structure.StructureType;
import net.minecraft.world.level.levelgen.structure.pieces.StructurePieceType;

/** Registration of the Living End's structure types and their piece type (EndStructure, EndStructurePiece). */
public final class EndStructures {
    public static final StructureType<EndStructure> RUINS_TYPE = Registry.register(BuiltInRegistries.STRUCTURE_TYPE,
            Winterworks.id("obsidian_ruins"), () -> EndStructure.RUINS_CODEC);
    public static final StructureType<EndStructure> SHRINE_TYPE = Registry.register(BuiltInRegistries.STRUCTURE_TYPE,
            Winterworks.id("end_shrine"), () -> EndStructure.SHRINE_CODEC);
    public static final StructureType<EndStructure> TOWER_TYPE = Registry.register(BuiltInRegistries.STRUCTURE_TYPE,
            Winterworks.id("monolith_tower"), () -> EndStructure.TOWER_CODEC);
    public static final StructurePieceType PIECE = Registry.register(BuiltInRegistries.STRUCTURE_PIECE,
            Winterworks.id("end_structure"), (StructurePieceType.ContextlessType) EndStructurePiece::new);

    private EndStructures() {}

    static void init() {}
}
