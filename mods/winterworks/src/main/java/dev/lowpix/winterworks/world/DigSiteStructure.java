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
 * An abandoned Dig Site underground (docs/AMBER_UPDATE.md section 3), in the Dead Caves and wherever mineshafts can
 * be. Find one with /locate structure winterworks:dig_site.
 */
public class DigSiteStructure extends Structure {
    public static final MapCodec<DigSiteStructure> CODEC = simpleCodec(DigSiteStructure::new);

    public DigSiteStructure(StructureSettings settings) {
        super(settings);
    }

    @Override
    protected Optional<GenerationStub> findGenerationPoint(GenerationContext ctx) {
        ChunkPos cp = ctx.chunkPos();
        int x = cp.getMiddleBlockX(), z = cp.getMiddleBlockZ();
        int surface = ctx.chunkGenerator().getFirstOccupiedHeight(x, z, Heightmap.Types.OCEAN_FLOOR_WG, ctx.heightAccessor(),
                ctx.randomState());
        int min = ctx.heightAccessor().getMinBuildHeight() + 16;
        int y = Mth.clamp(surface - 30 - ctx.random().nextInt(30), Math.max(min, -20), 30);
        if (surface - y < 20) {
            return Optional.empty();   // too shallow to be in the caves
        }
        BlockPos centre = new BlockPos(x, y, z);
        // the biome check (#winterworks:has_dig_site) is made at this point, underground, by Structure#isValidBiome
        return Optional.of(new GenerationStub(centre, builder -> builder.addPiece(new DigSitePiece(centre))));
    }

    @Override
    public StructureType<?> type() {
        return WWWorldgen.DIG_SITE_TYPE;
    }
}
