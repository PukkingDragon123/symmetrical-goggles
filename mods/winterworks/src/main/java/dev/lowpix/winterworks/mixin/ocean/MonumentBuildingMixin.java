package dev.lowpix.winterworks.mixin.ocean;

import dev.lowpix.winterworks.ocean.MonumentRework;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.StructureManager;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.StructurePiece;
import net.minecraft.world.level.levelgen.structure.structures.OceanMonumentPieces;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** After vanilla builds a chunk of an ocean monument, ocean.MonumentRework reworks that chunk of it. */
@Mixin(OceanMonumentPieces.MonumentBuilding.class)
public abstract class MonumentBuildingMixin implements MonumentRework.Building {
    @Shadow
    @Final
    private List<? extends StructurePiece> childPieces;

    @Override
    public List<? extends StructurePiece> ww$rooms() {
        return childPieces;
    }

    @Inject(method = "postProcess", at = @At("TAIL"))
    private void ww$rework(WorldGenLevel level, StructureManager structures, ChunkGenerator generator, RandomSource random, BoundingBox box,
                           ChunkPos chunkPos, BlockPos pivot, CallbackInfo ci) {
        MonumentRework.apply((StructurePiece) (Object) this, childPieces, level, box);
    }
}
