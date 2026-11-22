package dev.lowpix.winterworks.ocean;

import dev.lowpix.winterworks.Winterworks;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.chunk.ChunkAccess;
import net.minecraft.world.level.chunk.status.ChunkStatus;
import net.minecraft.world.level.levelgen.NoiseBasedChunkGenerator;
import net.minecraft.world.level.levelgen.RandomState;
import net.minecraft.world.level.levelgen.feature.Feature;
import net.minecraft.world.level.levelgen.feature.FeaturePlaceContext;
import net.minecraft.world.level.levelgen.feature.configurations.NoneFeatureConfiguration;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructureStart;
import net.minecraft.world.level.levelgen.structure.StructureType;

/**
 * The Tides & Treasures world features (docs/OCEAN_UPDATE.md sections 1, 2, 7; placed features from
 * tools/data_ocean_world.py):
 * <ul>
 * <li>{@code ocean_depths} (raw generation, every ocean biome, once a chunk): carves the chunk to OceanDepths' shape
 * with DepthCarver, writing only its own sections.</li>
 * <li>{@code volcanic_vents} (local modifications, the volcanic depths): vent fields with tube worms, basalt mounds,
 * ash and seams of raw gold and raw iron (VolcanicVents).</li>
 * <li>{@code reef_sponges} (vegetal decoration, warm and lukewarm oceans): natural sponge clusters (ReefSponges).</li>
 * </ul>
 */
public final class OceanFeatures {
    public static final Feature<NoneFeatureConfiguration> OCEAN_DEPTHS = reg("ocean_depths", OceanFeatures::depths);
    public static final Feature<NoneFeatureConfiguration> VOLCANIC_VENTS = reg("volcanic_vents", VolcanicVents::place);
    public static final Feature<NoneFeatureConfiguration> REEF_SPONGES = reg("reef_sponges", ReefSponges::place);

    /** How far (in chunks) the carver looks for structures to keep clear of: the radius world generation allows. */
    private static final int STRUCTURE_RADIUS = 8;

    private OceanFeatures() {}

    private interface Place {
        boolean place(FeaturePlaceContext<NoneFeatureConfiguration> ctx);
    }

    private static Feature<NoneFeatureConfiguration> reg(String name, Place p) {
        return Registry.register(BuiltInRegistries.FEATURE, Winterworks.id(name), new Feature<>(NoneFeatureConfiguration.CODEC) {
            @Override
            public boolean place(FeaturePlaceContext<NoneFeatureConfiguration> ctx) {
                return p.place(ctx);
            }
        });
    }

    static void init() {}

    private static boolean depths(FeaturePlaceContext<NoneFeatureConfiguration> ctx) {
        if (!(ctx.chunkGenerator() instanceof NoiseBasedChunkGenerator)) {
            return false;
        }
        WorldGenLevel level = ctx.level();
        ChunkPos cp = new ChunkPos(ctx.origin());
        RandomState rs = level.getLevel().getChunkSource().randomState();
        OceanDepths.Sampled climate = new OceanDepths.Sampled(rs.sampler());
        // the coast and the shelf: nothing to do (the cheap check first)
        int x0 = cp.getMinBlockX(), z0 = cp.getMinBlockZ();
        boolean far = false;
        for (int i = 0; i < 9 && !far; i++) {
            far = -climate.continentalness(x0 - 4 + (i % 3) * 12, z0 - 4 + (i / 3) * 12) > OceanDepths.SHELF - 0.045;
        }
        if (!far) {
            return false;
        }
        OceanDepths.Area area = OceanDepths.area(level.getSeed(), climate, x0 - 1, z0 - 1, 18, 18, protectedBoxes(level, cp));
        ChunkAccess chunk = level.getChunk(cp.x, cp.z);
        boolean carved = DepthCarver.carve(area, x0, z0, x0 + 15, z0 + 15, DepthCarver.chunk(chunk)) > 0;
        DepthCarver.rebiome(chunk, area);
        return carved;
    }

    /**
     * The boxes of the structures near chunk `cp` the carving must keep clear of: everything but our own (built on the
     * carved floor) and those that adapt: ocean monuments (their legs reach down to any floor), mineshafts (they skip
     * pieces in water).
     */
    static List<BoundingBox> protectedBoxes(WorldGenLevel level, ChunkPos cp) {
        List<BoundingBox> out = new ArrayList<>();
        int x0 = cp.getMinBlockX() - 1 - OceanDepths.PROTECT_OUT, z0 = cp.getMinBlockZ() - 1 - OceanDepths.PROTECT_OUT;
        int x1 = cp.getMaxBlockX() + 1 + OceanDepths.PROTECT_OUT, z1 = cp.getMaxBlockZ() + 1 + OceanDepths.PROTECT_OUT;
        var registry = level.registryAccess().registryOrThrow(Registries.STRUCTURE);
        for (int cx = cp.x - STRUCTURE_RADIUS; cx <= cp.x + STRUCTURE_RADIUS; cx++) {
            for (int cz = cp.z - STRUCTURE_RADIUS; cz <= cp.z + STRUCTURE_RADIUS; cz++) {
                ChunkAccess c = level.getChunk(cx, cz, ChunkStatus.STRUCTURE_STARTS, true);
                if (c == null) {
                    continue;
                }
                for (var e : c.getAllStarts().entrySet()) {
                    StructureStart start = e.getValue();
                    if (start == null || !start.isValid() || !keepsClear(registry.getKey(e.getKey()), e.getKey())) {
                        continue;
                    }
                    BoundingBox b = start.getBoundingBox();
                    if (b.maxX() >= x0 && b.minX() <= x1 && b.maxZ() >= z0 && b.minZ() <= z1) {
                        out.add(b);
                    }
                }
            }
        }
        return out;
    }

    private static boolean keepsClear(ResourceLocation id, Structure s) {
        if (id != null && id.getNamespace().equals(Winterworks.MOD_ID)) {
            return false;
        }
        StructureType<?> t = s.type();
        return t != StructureType.OCEAN_MONUMENT && t != StructureType.MINESHAFT;
    }
}
