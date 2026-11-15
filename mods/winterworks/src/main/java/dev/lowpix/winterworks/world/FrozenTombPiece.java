package dev.lowpix.winterworks.world;

import dev.lowpix.winterworks.boss.FrozenTomb;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NbtUtils;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.StructureManager;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.StructurePiece;
import net.minecraft.world.level.levelgen.structure.pieces.StructurePieceSerializationContext;

/**
 * The one piece of a frozen tomb. The chamber (boss.FrozenTomb#build) is built in one go when the chunk holding its
 * centre is decorated: it reaches less than a chunk out from a chunk's middle, inside the region that step may write.
 */
public class FrozenTombPiece extends StructurePiece {
    public static final int RADIUS = 12, HEIGHT = 10;
    private final BlockPos centre;

    public FrozenTombPiece(BlockPos centre) {
        super(WWWorldgen.FROZEN_TOMB_PIECE, 0, new BoundingBox(centre.getX() - RADIUS, centre.getY() - HEIGHT,
                centre.getZ() - RADIUS, centre.getX() + RADIUS, centre.getY() + HEIGHT, centre.getZ() + RADIUS));
        this.centre = centre;
    }

    public FrozenTombPiece(CompoundTag tag) {
        super(WWWorldgen.FROZEN_TOMB_PIECE, tag);
        this.centre = NbtUtils.readBlockPos(tag, "Centre").orElse(getBoundingBox().getCenter());
    }

    @Override
    protected void addAdditionalSaveData(StructurePieceSerializationContext ctx, CompoundTag tag) {
        tag.put("Centre", NbtUtils.writeBlockPos(centre));
    }

    @Override
    public void postProcess(WorldGenLevel level, StructureManager structures, ChunkGenerator generator, RandomSource random,
                            BoundingBox chunkBox, ChunkPos chunkPos, BlockPos pivot) {
        if (chunkPos.equals(new ChunkPos(centre))) {
            FrozenTomb.build(level, centre, random);
        }
    }
}
