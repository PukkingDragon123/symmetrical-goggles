package dev.lowpix.winterworks.end;

import dev.lowpix.winterworks.registry.EndEntities;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NbtUtils;
import net.minecraft.resources.ResourceKey;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.RandomizableContainer;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.StructureManager;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ChestBlock;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.StructurePiece;
import net.minecraft.world.level.levelgen.structure.pieces.StructurePieceSerializationContext;
import net.minecraft.world.level.storage.loot.LootTable;

/**
 * The one piece of an Obsidian Ruin, End Shrine or Monolith Tower (EndStructure). It is drawn in its own canonical
 * frame (origin at the floor centre, entrance towards +z), turned into place, and postProcess runs once for every chunk
 * it reaches into: every block, block entity, guard and the Monolith is clipped to that chunk, and all randomness is
 * hashed from the structure's seed and the local position, so the chunks agree.
 */
public class EndStructurePiece extends StructurePiece {
    private final EndStructure.Kind kind;
    private final BlockPos origin;
    private final Rotation rot;
    private final long seed;

    public EndStructurePiece(EndStructure.Kind kind, BlockPos origin, Rotation rot, long seed) {
        super(EndStructures.PIECE, 0, box(kind, origin, rot));
        this.kind = kind;
        this.origin = origin;
        this.rot = rot;
        this.seed = seed;
    }

    public EndStructurePiece(CompoundTag tag) {
        super(EndStructures.PIECE, tag);
        EndStructure.Kind[] kinds = EndStructure.Kind.values();
        this.kind = kinds[Mth.clamp(tag.getInt("Kind"), 0, kinds.length - 1)];
        this.origin = NbtUtils.readBlockPos(tag, "Origin").orElse(getBoundingBox().getCenter());
        this.rot = Rotation.values()[Mth.clamp(tag.getInt("Rot"), 0, 3)];
        this.seed = tag.getLong("Seed");
    }

    @Override
    protected void addAdditionalSaveData(StructurePieceSerializationContext ctx, CompoundTag tag) {
        tag.putInt("Kind", kind.ordinal());
        tag.put("Origin", NbtUtils.writeBlockPos(origin));
        tag.putInt("Rot", rot.ordinal());
        tag.putLong("Seed", seed);
    }

    public EndStructure.Kind kind() {
        return kind;
    }

    public BlockPos origin() {
        return origin;
    }

    static BlockPos transform(BlockPos origin, Rotation rot, int x, int y, int z) {
        return origin.offset(new BlockPos(x, y, z).rotate(rot));
    }

    static BoundingBox box(EndStructure.Kind k, BlockPos origin, Rotation rot) {
        return BoundingBox.fromCorners(transform(origin, rot, -k.reach, k.bottom, -k.reach), transform(origin, rot, k.reach, k.top, k.reach));
    }

    @Override
    public void postProcess(WorldGenLevel level, StructureManager structures, ChunkGenerator generator, RandomSource random,
                            BoundingBox chunkBox, ChunkPos chunkPos, BlockPos pivot) {
        W w = new W(level, chunkBox);
        switch (kind) {
            case OBSIDIAN_RUINS -> ObsidianRuins.build(w);
            case END_SHRINE -> EndShrine.build(w);
            case MONOLITH_TOWER -> MonolithTower.build(w);
        }
    }

    // ============================================================================================ the writer

    /** Writes in the piece's canonical frame, clipped to one chunk's box. */
    public final class W {
        final WorldGenLevel level;
        final BoundingBox clip;
        private final BlockPos.MutableBlockPos m = new BlockPos.MutableBlockPos();

        W(WorldGenLevel level, BoundingBox clip) {
            this.level = level;
            this.clip = clip;
        }

        BlockPos at(int x, int y, int z) {
            return transform(origin, rot, x, y, z);
        }

        boolean in(BlockPos p) {
            return clip.isInside(p) && !level.isOutsideBuildHeight(p);
        }

        /** Whether any of the column (x, z) lies in this chunk (cheap skip for whole columns). */
        boolean column(int x, int z) {
            BlockPos p = at(x, 0, z);
            return p.getX() >= clip.minX() && p.getX() <= clip.maxX() && p.getZ() >= clip.minZ() && p.getZ() <= clip.maxZ();
        }

        BlockState get(int x, int y, int z) {
            BlockPos p = at(x, y, z);
            return in(p) ? level.getBlockState(p) : EndGen.AIR;
        }

        void set(int x, int y, int z, BlockState s) {
            BlockPos p = at(x, y, z);
            if (in(p)) {
                level.setBlock(p, s.rotate(rot), EndGen.FLAGS | Block.UPDATE_KNOWN_SHAPE);
            }
        }

        void fill(int x0, int y0, int z0, int x1, int y1, int z1, BlockState s) {
            for (int x = x0; x <= x1; x++) {
                for (int y = y0; y <= y1; y++) {
                    for (int z = z0; z <= z1; z++) {
                        set(x, y, z, s);
                    }
                }
            }
        }

        /** Fills from `top` down to solid ground (through air and loose stuff), at most `depth` blocks. */
        void foundation(int x, int z, int top, int depth, BlockState s) {
            for (int y = top; y > top - depth; y--) {
                BlockPos p = at(x, y, z);
                if (!in(p)) {
                    return;
                }
                BlockState old = level.getBlockState(p);
                if (!old.isAir() && old.getFluidState().isEmpty() && !old.canBeReplaced() && !old.is(Blocks.CHORUS_PLANT)
                        && !old.is(Blocks.CHORUS_FLOWER)) {
                    return;
                }
                level.setBlock(p, s, EndGen.FLAGS);
            }
        }

        /** 0..1, the same for a local position whatever chunk is being built. */
        float rnd(int x, int y, int z, int salt) {
            return EndGen.rnd(seed ^ (kind.ordinal() + 1L) * 0x9E3779B97F4A7C15L, x, y, z, salt);
        }

        long hash(int x, int y, int z, int salt) {
            return EndGen.hash(seed, x, y, z, salt);
        }

        void chest(int x, int y, int z, Direction facing, ResourceKey<LootTable> loot) {
            BlockPos p = at(x, y, z);
            if (in(p)) {
                level.setBlock(p, Blocks.CHEST.defaultBlockState().setValue(ChestBlock.FACING, facing).rotate(rot), EndGen.FLAGS);
                if (level.getBlockEntity(p) instanceof RandomizableContainer rc) {
                    rc.setLootTable(loot, EndGen.mix(seed ^ p.asLong()));
                }
            }
        }

        void suspicious(int x, int y, int z, ResourceKey<LootTable> loot) {
            BlockPos p = at(x, y, z);
            if (in(p)) {
                level.setBlock(p, dev.lowpix.winterworks.registry.EndBlocks.SUSPICIOUS_END_SAND.defaultBlockState(), EndGen.FLAGS);
                level.getBlockEntity(p, BlockEntityType.BRUSHABLE_BLOCK).ifPresent(be -> be.setLootTable(loot, EndGen.mix(seed ^ p.asLong())));
            }
        }

        /** A disguised Obolisk standing at (x, y, z): queued from the chunk it stands in (EndGuards). */
        void guard(int x, int y, int z) {
            BlockPos p = at(x, y, z);
            if (in(p)) {
                EndGuards.queue(level.getLevel(), p);
            }
        }

        /** The Monolith, persistent, floating over (x, y, z): only from the chunk it is in. */
        void monolith(int x, int y, int z) {
            BlockPos p = at(x, y, z);
            if (!in(p)) {
                return;
            }
            Mob mob = EndEntities.MONOLITH.create(level.getLevel());
            if (mob == null) {
                return;
            }
            mob.moveTo(p.getX() + 0.5, p.getY(), p.getZ() + 0.5, rot.rotate(Direction.SOUTH).toYRot(), 0f);
            mob.setPersistenceRequired();
            level.addFreshEntity(mob);
        }
    }
}
