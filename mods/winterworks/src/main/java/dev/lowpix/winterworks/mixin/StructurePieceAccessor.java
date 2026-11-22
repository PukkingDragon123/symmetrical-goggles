package dev.lowpix.winterworks.mixin;

import net.minecraft.core.BlockPos;
import net.minecraft.world.level.levelgen.structure.StructurePiece;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Invoker;

/** A structure piece's local-to-world position (mixin.FortressCommanderMixin). */
@Mixin(StructurePiece.class)
public interface StructurePieceAccessor {
    @Invoker("getWorldPos")
    BlockPos.MutableBlockPos winterworks$worldPos(int x, int y, int z);
}
