package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.nether.WitheredCommander;
import net.minecraft.core.BlockPos;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.StructureManager;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.structures.NetherFortressPieces;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * The Withered Commander (docs/FIXES_0_4.md): one per vanilla Nether fortress, on its bull in the middle of the
 * fortress's first bridge crossing (its start piece). Spawned by the one chunk that holds that spot, so exactly once.
 */
@Mixin(NetherFortressPieces.BridgeCrossing.class)
public abstract class FortressCommanderMixin {
    @Unique
    private boolean winterworks$commanderPlaced;

    @Inject(method = "postProcess", at = @At("TAIL"))
    private void ww$commander(WorldGenLevel level, StructureManager structures, ChunkGenerator generator, RandomSource random,
                              BoundingBox chunkBox, ChunkPos chunk, BlockPos pivot, CallbackInfo ci) {
        if (!((Object) this instanceof NetherFortressPieces.StartPiece) || winterworks$commanderPlaced) {
            return;
        }
        BlockPos at = ((StructurePieceAccessor) this).winterworks$worldPos(9, 5, 9).immutable();
        if (chunkBox.isInside(at)) {
            winterworks$commanderPlaced = true;
            WitheredCommander.spawnInFortress(level, at, random);
        }
    }
}
