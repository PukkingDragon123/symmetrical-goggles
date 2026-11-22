package dev.lowpix.winterworks.nether;

import com.mojang.serialization.MapCodec;
import java.util.List;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.NoiseColumn;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructureType;

/**
 * The Hex Fortress (docs/HEXES_UPDATE.md section 8, reworked by docs/FIXES_0_4.md "The Hex Fortress, reworked"): a
 * compact Nether-brick stronghold, about 40 x 40, built onto a block of bastion masonry, in any Nether biome (spacing
 * 20, separation 8; data from tools/data_nether.py). The bastion block holds the Piglin Witch's quarters, a lit Nether
 * Portal and her experiments; in front of it the brewing room, the wart-farm courtyard and the storeroom; then the
 * hoglin pen, the Soul Bull yard between the inner and outer gates, and the stair tower; and the gate bridge on its
 * piers. Eight pieces (HexFortressPiece), every one clipped to the chunk being decorated; the witch's crew lives there
 * (WitchCrew). It stands on the first solid floor with room above it, or on its piers over the lava sea. Find one with
 * /locate structure winterworks:hex_fortress, or build one with /winterworks hexfortress.
 */
public class HexFortress extends Structure {
    public static final MapCodec<HexFortress> CODEC = simpleCodec(HexFortress::new);
    /** How far the fortress reaches from its centre (the bridgeheads). */
    public static final int REACH = 21;

    public HexFortress(StructureSettings settings) {
        super(settings);
    }

    @Override
    protected Optional<GenerationStub> findGenerationPoint(GenerationContext ctx) {
        ChunkPos cp = ctx.chunkPos();
        int x = cp.getMiddleBlockX(), z = cp.getMiddleBlockZ();
        int sea = ctx.chunkGenerator().getSeaLevel();
        int minY = Math.max(ctx.heightAccessor().getMinBuildHeight() + 8, sea + 1);
        int maxY = Math.min(ctx.heightAccessor().getMaxBuildHeight() - 32, 100);
        NoiseColumn col = ctx.chunkGenerator().getBaseColumn(x, z, ctx.heightAccessor(), ctx.randomState());
        int y = floor(col, minY, maxY);
        if (y == Integer.MIN_VALUE) {
            // no open floor: over the lava sea it stands on pillars just above the lava, else it's cut into the rock
            y = col.getBlock(sea - 1).getFluidState().isEmpty() ? Mth.clamp(64, minY, maxY) : sea + 3;
        }
        BlockPos origin = new BlockPos(x, y, z);
        Rotation rot = Rotation.getRandom(ctx.random());
        long seed = ctx.random().nextLong();
        return Optional.of(new GenerationStub(origin, builder -> HexFortressPiece.layout(origin, rot, seed).forEach(builder::addPiece)));
    }

    /** The floor (first air above a solid block) with the most headroom (at least 10 blocks), or MIN_VALUE. */
    static int floor(NoiseColumn col, int minY, int maxY) {
        int best = Integer.MIN_VALUE, bestRoom = 0;
        for (int y = maxY; y >= minY; y--) {
            BlockState below = col.getBlock(y - 1);
            if (!col.getBlock(y).isAir() || below.isAir() || !below.getFluidState().isEmpty()) {
                continue;
            }
            int room = 0;
            while (room < 24 && col.getBlock(y + room).isAir()) {
                room++;
            }
            if (room >= 10 && room > bestRoom) {
                best = y;
                bestRoom = room;
            }
        }
        return best;
    }

    @Override
    public StructureType<?> type() {
        return NetherFeature.HEX_FORTRESS_TYPE;
    }

    /**
     * Builds a whole fortress now (the dev command and the tests): every piece, chunk by chunk, through the same
     * clipped postProcess as world generation. Returns the fortress's bounding box.
     */
    public static BoundingBox build(ServerLevel level, BlockPos origin, Rotation rotation, long seed) {
        List<HexFortressPiece> pieces = HexFortressPiece.layout(origin, rotation, seed);
        BoundingBox all = pieces.get(0).getBoundingBox();
        for (HexFortressPiece p : pieces) {
            all = BoundingBox.encapsulatingBoxes(List.of(all, p.getBoundingBox())).orElse(all);
        }
        for (int cx = all.minX() >> 4; cx <= all.maxX() >> 4; cx++) {
            for (int cz = all.minZ() >> 4; cz <= all.maxZ() >> 4; cz++) {
                ChunkPos chunk = new ChunkPos(cx, cz);
                BoundingBox chunkBox = new BoundingBox(chunk.getMinBlockX(), level.getMinBuildHeight(), chunk.getMinBlockZ(),
                        chunk.getMaxBlockX(), level.getMaxBuildHeight() - 1, chunk.getMaxBlockZ());
                for (HexFortressPiece p : pieces) {
                    if (p.getBoundingBox().intersects(chunkBox)) {
                        p.postProcess(level, level.structureManager(), level.getChunkSource().getGenerator(), level.getRandom(), chunkBox,
                                chunk, origin);
                    }
                }
            }
        }
        return all;
    }
}
