package dev.lowpix.winterworks.mixin.ocean;

import net.minecraft.world.level.levelgen.structure.structures.OceanMonumentPieces;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** Which of its two designs a monument wing room has (ocean.MonumentRework puts its chests to suit). */
@Mixin(OceanMonumentPieces.OceanMonumentWingRoom.class)
public interface WingRoomAccessor {
    @Accessor("mainDesign")
    int ww$mainDesign();
}
