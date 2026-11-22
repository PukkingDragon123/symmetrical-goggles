package dev.lowpix.winterworks.world;

import com.mojang.serialization.MapCodec;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.util.Mth;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructureType;

/**
 * A frozen tomb deep under frozen land, in the Ice Caves: the Frost Mauler frozen in a block of ancient ice
 * (docs/COLD_UPDATE.md sections 5 and 7). Find one with /locate structure winterworks:frozen_tomb.
 */
public class FrozenTombStructure extends Structure {
    public static final MapCodec<FrozenTombStructure> CODEC = simpleCodec(FrozenTombStructure::new);

    public FrozenTombStructure(StructureSettings settings) {
        super(settings);
    }

    @Override
    protected Optional<GenerationStub> findGenerationPoint(GenerationContext ctx) {
        ChunkPos cp = ctx.chunkPos();
        int x = cp.getMiddleBlockX(), z = cp.getMiddleBlockZ();
        int surface = ctx.chunkGenerator().getFirstOccupiedHeight(x, z, Heightmap.Types.OCEAN_FLOOR_WG, ctx.heightAccessor(),
                ctx.randomState());
        int min = ctx.heightAccessor().getMinBuildHeight() + 16;
        int y = Mth.clamp(surface - 36 - ctx.random().nextInt(24), min, 30);
        if (surface - y < 24) {
            return Optional.empty();   // too shallow to be in the caves
        }
        BlockPos centre = new BlockPos(x, y, z);
        // the biome check (Ice Caves only) is made at this point, deep underground, by Structure#isValidBiome
        return Optional.of(new GenerationStub(centre, builder -> builder.addPiece(new FrozenTombPiece(centre))));
    }

    @Override
    public StructureType<?> type() {
        return WWWorldgen.FROZEN_TOMB_TYPE;
    }
}
