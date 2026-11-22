package dev.lowpix.winterworks.ocean;

import com.mojang.serialization.MapCodec;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.QuartPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructureType;

/**
 * The Tides & Treasures structures (docs/OCEAN_UPDATE.md section 7; data from tools/data_ocean_world.py): deep
 * shipwrecks (DeepShipwreck), sunken treasure (SunkenTreasure) and whale skeletons (WhaleSkeleton), each one
 * OceanStructurePiece. They sit on the deep floor (below y 20) that OceanDepths carves, so they work out that floor
 * from the same shape (the carving runs before any structure is placed), on fairly level ground away from rock
 * formations. Find one with /locate structure winterworks:..., or build one with /winterworks oceanstructure.
 */
public class OceanStructure extends Structure {
    public enum Kind {
        /** reach: half the (square, canonical) footprint; bottom/top: local y extent; slope: the most the floor may vary. */
        DEEP_SHIPWRECK("deep_shipwreck", 26, -12, 26, 7),
        SUNKEN_TREASURE("sunken_treasure", 7, -4, 4, 3),
        WHALE_SKELETON("whale_skeleton", 27, -4, 10, 6);

        public final String id;
        public final int reach, bottom, top, slope;

        Kind(String id, int reach, int bottom, int top, int slope) {
            this.id = id;
            this.reach = reach;
            this.bottom = bottom;
            this.top = top;
            this.slope = slope;
        }

        public static Kind byId(String id) {
            for (Kind k : values()) {
                if (k.id.equals(id)) {
                    return k;
                }
            }
            return null;
        }
    }

    /** Structures only start on the deep floor (docs/OCEAN_UPDATE.md section 1: "deep (y < 20)"). */
    public static final int MAX_FLOOR = 19;

    public static final MapCodec<OceanStructure> SHIPWRECK_CODEC = simpleCodec(s -> new OceanStructure(s, Kind.DEEP_SHIPWRECK));
    public static final MapCodec<OceanStructure> TREASURE_CODEC = simpleCodec(s -> new OceanStructure(s, Kind.SUNKEN_TREASURE));
    public static final MapCodec<OceanStructure> SKELETON_CODEC = simpleCodec(s -> new OceanStructure(s, Kind.WHALE_SKELETON));

    private final Kind kind;

    public OceanStructure(StructureSettings settings, Kind kind) {
        super(settings);
        this.kind = kind;
    }

    public Kind kind() {
        return kind;
    }

    /** Footprint sample points in the canonical frame (the ship and the skeleton lie along z). */
    private int[][] samples() {
        return switch (kind) {
            case DEEP_SHIPWRECK -> new int[][]{{0, 0}, {0, 15}, {0, -15}, {5, 0}, {-5, 0}, {0, 8}, {0, -8}};
            case SUNKEN_TREASURE -> new int[][]{{0, 0}, {3, 0}, {-3, 0}, {0, 3}, {0, -3}};
            case WHALE_SKELETON -> new int[][]{{0, 0}, {0, 16}, {0, -16}, {6, 2}, {-6, 2}, {0, 8}, {0, -8}};
        };
    }

    @Override
    protected Optional<GenerationStub> findGenerationPoint(GenerationContext ctx) {
        ChunkPos cp = ctx.chunkPos();
        int x = cp.getMiddleBlockX(), z = cp.getMiddleBlockZ();
        Rotation rot = Rotation.getRandom(ctx.random());
        long seed = ctx.random().nextLong();
        OceanDepths.ClimateField cf = new OceanDepths.Sampled(ctx.randomState().sampler());
        int lo = Integer.MAX_VALUE, hi = Integer.MIN_VALUE;
        int[] tops = new int[samples().length];
        int i = 0;
        for (int[] s : samples()) {
            BlockPos p = new BlockPos(s[0], 0, s[1]).rotate(rot).offset(x, 0, z);
            int vanilla = ctx.chunkGenerator().getFirstOccupiedHeight(p.getX(), p.getZ(), Heightmap.Types.OCEAN_FLOOR_WG,
                    ctx.heightAccessor(), ctx.randomState());
            int top = OceanDepths.floorTop(ctx.seed(), cf, p.getX(), p.getZ(), vanilla);
            tops[i++] = top;
            lo = Math.min(lo, top);
            hi = Math.max(hi, top);
        }
        if (hi > MAX_FLOOR || hi - lo > kind.slope || lo <= OceanDepths.BOTTOM - 2) {
            return Optional.empty();
        }
        int r = kind.reach;
        if (!OceanDepths.formations(ctx.seed(), cf, x - r, z - r, x + r, z + r).isEmpty()) {
            return Optional.empty();   // keep clear of pillars and arches
        }
        int y = switch (kind) {
            case DEEP_SHIPWRECK -> Math.round((lo + hi) / 2f) + 1;
            case SUNKEN_TREASURE -> tops[0] + 1;
            case WHALE_SKELETON -> lo + 1;
        };
        BlockPos origin = new BlockPos(x, y, z);
        return Optional.of(new GenerationStub(origin, b -> b.addPiece(new OceanStructurePiece(kind, origin, rot, seed))));
    }

    /** The biome is checked in the water column (at y 40), not down at the floor, where cave biomes may reach. */
    @Override
    public Optional<GenerationStub> findValidGenerationPoint(GenerationContext ctx) {
        return findGenerationPoint(ctx).filter(stub -> ctx.validBiome().test(ctx.biomeSource().getNoiseBiome(
                QuartPos.fromBlock(stub.position().getX()), QuartPos.fromBlock(40), QuartPos.fromBlock(stub.position().getZ()),
                ctx.randomState().sampler())));
    }

    @Override
    public StructureType<?> type() {
        return switch (kind) {
            case DEEP_SHIPWRECK -> OceanStructures.DEEP_SHIPWRECK_TYPE;
            case SUNKEN_TREASURE -> OceanStructures.SUNKEN_TREASURE_TYPE;
            case WHALE_SKELETON -> OceanStructures.WHALE_SKELETON_TYPE;
        };
    }

    /**
     * Builds one now (the dev command and the tests), chunk by chunk through the same clipped postProcess as world
     * generation. `origin` is the first water block over the floor. Returns its bounding box.
     */
    public static BoundingBox build(ServerLevel level, Kind kind, BlockPos origin, Rotation rot, long seed) {
        OceanStructurePiece piece = new OceanStructurePiece(kind, origin, rot, seed);
        BoundingBox all = piece.getBoundingBox();
        for (int cx = all.minX() >> 4; cx <= all.maxX() >> 4; cx++) {
            for (int cz = all.minZ() >> 4; cz <= all.maxZ() >> 4; cz++) {
                ChunkPos chunk = new ChunkPos(cx, cz);
                BoundingBox chunkBox = new BoundingBox(chunk.getMinBlockX(), level.getMinBuildHeight(), chunk.getMinBlockZ(),
                        chunk.getMaxBlockX(), level.getMaxBuildHeight() - 1, chunk.getMaxBlockZ());
                piece.postProcess(level, level.structureManager(), level.getChunkSource().getGenerator(), level.getRandom(), chunkBox,
                        chunk, origin);
            }
        }
        return all;
    }
}
