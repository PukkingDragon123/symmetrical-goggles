package dev.lowpix.winterworks.ocean;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NbtUtils;
import net.minecraft.resources.ResourceKey;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.RandomizableContainer;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.StructureManager;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ChestBlock;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.StructurePiece;
import net.minecraft.world.level.levelgen.structure.pieces.StructurePieceSerializationContext;
import net.minecraft.world.level.storage.loot.LootTable;

/**
 * The one piece of a deep shipwreck, sunken treasure or whale skeleton (OceanStructure). Drawn in its own canonical
 * frame (origin at the first water block over the floor, the length along +z), turned into place; postProcess runs
 * once for every chunk it reaches into, every block, chest and mob clipped to that chunk, and all randomness is hashed
 * from the structure's seed and the local position, so the chunks agree.
 */
public class OceanStructurePiece extends StructurePiece {
    private final OceanStructure.Kind kind;
    private final BlockPos origin;
    private final Rotation rot;
    private final long seed;

    public OceanStructurePiece(OceanStructure.Kind kind, BlockPos origin, Rotation rot, long seed) {
        super(OceanStructures.PIECE, 0, box(kind, origin, rot));
        this.kind = kind;
        this.origin = origin;
        this.rot = rot;
        this.seed = seed;
    }

    public OceanStructurePiece(CompoundTag tag) {
        super(OceanStructures.PIECE, tag);
        OceanStructure.Kind[] kinds = OceanStructure.Kind.values();
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

    public OceanStructure.Kind kind() {
        return kind;
    }

    public BlockPos origin() {
        return origin;
    }

    /** Blocks whose shape depends on their neighbours (fences, walls, bars and panes). */
    static boolean connects(BlockState s) {
        return s.is(net.minecraft.tags.BlockTags.FENCES) || s.is(net.minecraft.tags.BlockTags.WALLS)
                || s.getBlock() instanceof net.minecraft.world.level.block.IronBarsBlock;
    }

    static BlockPos transform(BlockPos origin, Rotation rot, int x, int y, int z) {
        return origin.offset(new BlockPos(x, y, z).rotate(rot));
    }

    static BoundingBox box(OceanStructure.Kind k, BlockPos origin, Rotation rot) {
        return BoundingBox.fromCorners(transform(origin, rot, -k.reach, k.bottom, -k.reach), transform(origin, rot, k.reach, k.top, k.reach));
    }

    @Override
    public void postProcess(WorldGenLevel level, StructureManager structures, ChunkGenerator generator, RandomSource random,
                            BoundingBox chunkBox, ChunkPos chunkPos, BlockPos pivot) {
        W w = new W(level, chunkBox);
        switch (kind) {
            case DEEP_SHIPWRECK -> DeepShipwreck.build(w);
            case SUNKEN_TREASURE -> SunkenTreasure.build(w);
            case WHALE_SKELETON -> WhaleSkeleton.build(w);
        }
    }

    // ============================================================================================ the writer

    /** Writes in the piece's canonical frame, clipped to one chunk's box. */
    public final class W {
        final WorldGenLevel level;
        final BoundingBox clip;
        /** A list to one side: y moves by round(x * roll) (a wreck heeled over). */
        double roll;

        W(WorldGenLevel level, BoundingBox clip) {
            this.level = level;
            this.clip = clip;
        }

        BlockPos at(int x, int y, int z) {
            return transform(origin, rot, x, y + (int) Math.floor(x * roll + 0.5), z);
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
            return in(p) ? level.getBlockState(p) : OceanGen.AIR;
        }

        void set(int x, int y, int z, BlockState s) {
            BlockPos p = at(x, y, z);
            if (in(p)) {
                level.setBlock(p, s.rotate(rot), OceanGen.FLAGS | Block.UPDATE_KNOWN_SHAPE);
                if (connects(s)) {   // fences and bars join up when the chunk is finished (vanilla's way)
                    level.getChunk(p).markPosForPostprocessing(p);
                }
            }
        }

        /** Sets the block, waterlogged where it can be (everything here is under the sea). */
        void wet(int x, int y, int z, BlockState s) {
            set(x, y, z, s.hasProperty(BlockStateProperties.WATERLOGGED) ? s.setValue(BlockStateProperties.WATERLOGGED, true) : s);
        }

        void water(int x, int y, int z) {
            set(x, y, z, OceanGen.WATER);
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

        /** Whether (x, y, z) holds water or air (open sea). */
        boolean open(int x, int y, int z) {
            BlockState s = get(x, y, z);
            return s.isAir() || s.is(Blocks.WATER);
        }

        /** The top of the sea floor under column (x, z), searched from `fromY` down `depth` blocks; MIN_VALUE if none here. */
        int floor(int x, int z, int fromY, int depth) {
            if (!column(x, z)) {
                return Integer.MIN_VALUE;
            }
            for (int y = fromY; y > fromY - depth; y--) {
                BlockState s = get(x, y, z);
                if (!s.isAir() && s.getFluidState().isEmpty() && s.blocksMotion()) {
                    return y;
                }
            }
            return Integer.MIN_VALUE;
        }

        /** Fills from `top` down through open water to the floor with `s`, at most `depth` blocks. */
        void foundation(int x, int z, int top, int depth, BlockState s) {
            for (int y = top; y > top - depth; y--) {
                BlockPos p = at(x, y, z);
                if (!in(p) || !open(x, y, z) && !level.getBlockState(p).canBeReplaced()) {
                    return;
                }
                level.setBlock(p, s, OceanGen.FLAGS);
            }
        }

        /** 0..1, the same for a local position whatever chunk is being built. */
        float rnd(int x, int y, int z, int salt) {
            return OceanGen.rnd(seed ^ (kind.ordinal() + 1L) * 0x9E3779B97F4A7C15L, x, y, z, salt);
        }

        /** A waterlogged chest holding `loot`, facing `facing` (canonical). */
        void chest(int x, int y, int z, Direction facing, ResourceKey<LootTable> loot) {
            BlockPos p = at(x, y, z);
            if (in(p)) {
                level.setBlock(p, Blocks.CHEST.defaultBlockState().setValue(ChestBlock.FACING, facing).setValue(ChestBlock.WATERLOGGED, true)
                        .rotate(rot), OceanGen.FLAGS);
                if (level.getBlockEntity(p) instanceof RandomizableContainer rc) {
                    rc.setLootTable(loot, OceanGen.mix(seed ^ p.asLong()));
                }
            }
        }

        /** A barrel holding `loot` (or empty). */
        void barrel(int x, int y, int z, Direction facing, ResourceKey<LootTable> loot) {
            BlockPos p = at(x, y, z);
            if (in(p)) {
                level.setBlock(p, Blocks.BARREL.defaultBlockState().setValue(BlockStateProperties.FACING, facing).rotate(rot), OceanGen.FLAGS);
                if (loot != null && level.getBlockEntity(p) instanceof RandomizableContainer rc) {
                    rc.setLootTable(loot, OceanGen.mix(seed ^ p.asLong() ^ 0x5EA));
                }
            }
        }

        /** A mob standing at (x, y, z), from the chunk it stands in; persistent. */
        void mob(EntityType<? extends Mob> type, double x, int y, double z, float yaw) {
            BlockPos p = at((int) Math.floor(x), y, (int) Math.floor(z));
            if (!in(p)) {
                return;
            }
            Mob mob = type.create(level.getLevel());
            if (mob == null) {
                return;
            }
            mob.moveTo(p.getX() + 0.5, p.getY() + 0.2, p.getZ() + 0.5, yaw + rot.ordinal() * 90f, 0f);
            mob.finalizeSpawn(level, level.getCurrentDifficultyAt(p), MobSpawnType.STRUCTURE, null);
            mob.setPersistenceRequired();
            level.addFreshEntityWithPassengers(mob);
        }

        /** The canonical direction `d` turned into the world. */
        Direction dir(Direction d) {
            return rot.rotate(d);
        }
    }
}
