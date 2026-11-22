package dev.lowpix.winterworks.end;

import com.mojang.serialization.MapCodec;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructureType;

/**
 * The Living End's structures (docs/END_UPDATE.md section 3; data from tools/data_end_world.py): Obsidian Ruins and
 * the Monolith Tower in the Dead End, End Shrines in Chorus Meadows. Each is one EndStructurePiece, built by
 * ObsidianRuins, EndShrine and MonolithTower. They need solid island under their whole footprint. Find one with
 * /locate structure winterworks:..., or build one with /winterworks endstructure.
 */
public class EndStructure extends Structure {
    public enum Kind {
        /** reach: half the footprint; bottom/top: local y extent (bottom includes the foundations). */
        OBSIDIAN_RUINS("obsidian_ruins", 14, -16, 14),
        END_SHRINE("end_shrine", 14, -18, 18),
        MONOLITH_TOWER("monolith_tower", 14, -24, 76);

        public final String id;
        final int reach, bottom, top;

        Kind(String id, int reach, int bottom, int top) {
            this.id = id;
            this.reach = reach;
            this.bottom = bottom;
            this.top = top;
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

    public static final MapCodec<EndStructure> RUINS_CODEC = simpleCodec(s -> new EndStructure(s, Kind.OBSIDIAN_RUINS));
    public static final MapCodec<EndStructure> SHRINE_CODEC = simpleCodec(s -> new EndStructure(s, Kind.END_SHRINE));
    public static final MapCodec<EndStructure> TOWER_CODEC = simpleCodec(s -> new EndStructure(s, Kind.MONOLITH_TOWER));

    private final Kind kind;

    public EndStructure(StructureSettings settings, Kind kind) {
        super(settings);
        this.kind = kind;
    }

    public Kind kind() {
        return kind;
    }

    @Override
    protected Optional<GenerationStub> findGenerationPoint(GenerationContext ctx) {
        ChunkPos cp = ctx.chunkPos();
        int x = cp.getMiddleBlockX(), z = cp.getMiddleBlockZ();
        int r = kind == Kind.OBSIDIAN_RUINS ? 10 : 11;
        int[] hs = new int[9];
        int i = 0, min = Integer.MAX_VALUE, max = Integer.MIN_VALUE;
        for (int dx = -1; dx <= 1; dx++) {
            for (int dz = -1; dz <= 1; dz++) {
                int h = ctx.chunkGenerator().getFirstOccupiedHeight(x + dx * r, z + dz * r, Heightmap.Types.WORLD_SURFACE_WG,
                        ctx.heightAccessor(), ctx.randomState());
                hs[i++] = h;
                min = Math.min(min, h);
                max = Math.max(max, h);
            }
        }
        if (min < 40 || max - min > (kind == Kind.MONOLITH_TOWER ? 10 : 14)) {
            return Optional.empty();   // over the void or the edge of an island, or too steep
        }
        int centre = hs[4];
        int y = switch (kind) {
            case OBSIDIAN_RUINS -> centre - 1;      // half buried: the court lies a couple of blocks down
            case END_SHRINE -> Math.round((min + centre) / 2f) + 2;
            case MONOLITH_TOWER -> min + 1;
        };
        BlockPos origin = new BlockPos(x, y, z);
        Rotation rot = Rotation.getRandom(ctx.random());
        long seed = ctx.random().nextLong();
        return Optional.of(new GenerationStub(origin, b -> b.addPiece(new EndStructurePiece(kind, origin, rot, seed))));
    }

    @Override
    public StructureType<?> type() {
        return switch (kind) {
            case OBSIDIAN_RUINS -> EndStructures.RUINS_TYPE;
            case END_SHRINE -> EndStructures.SHRINE_TYPE;
            case MONOLITH_TOWER -> EndStructures.TOWER_TYPE;
        };
    }

    /**
     * Builds one now (the dev command and the tests), chunk by chunk through the same clipped postProcess as world
     * generation. Returns its bounding box.
     */
    public static BoundingBox build(ServerLevel level, Kind kind, BlockPos origin, Rotation rot, long seed) {
        EndStructurePiece piece = new EndStructurePiece(kind, origin, rot, seed);
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
