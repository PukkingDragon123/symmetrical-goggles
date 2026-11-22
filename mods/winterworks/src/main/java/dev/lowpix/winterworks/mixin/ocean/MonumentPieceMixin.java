package dev.lowpix.winterworks.mixin.ocean;

import dev.lowpix.winterworks.ocean.MonumentRework;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.StructurePiece;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * One Elder Guardian per monument, in the core (docs/OCEAN_UPDATE.md section 6): the wings' elder spawns become
 * guardians and the penthouse's moves to the core (ocean.MonumentRework).
 */
@Mixin(targets = "net.minecraft.world.level.levelgen.structure.structures.OceanMonumentPieces$OceanMonumentPiece")
public abstract class MonumentPieceMixin {
    @Inject(method = "spawnElder", at = @At("HEAD"), cancellable = true)
    private void ww$oneElder(WorldGenLevel level, BoundingBox box, int x, int y, int z, CallbackInfo ci) {
        if (MonumentRework.replaceElder((StructurePiece) (Object) this, level, box, x, y, z)) {
            ci.cancel();
        }
    }
}
