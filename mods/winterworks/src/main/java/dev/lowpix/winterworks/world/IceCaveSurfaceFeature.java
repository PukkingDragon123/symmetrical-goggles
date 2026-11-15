package dev.lowpix.winterworks.world;

import com.mojang.serialization.Codec;
import dev.lowpix.winterworks.registry.WWBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.tags.BlockTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.SnowLayerBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.LegacyRandomSource;
import net.minecraft.world.level.levelgen.feature.Feature;
import net.minecraft.world.level.levelgen.feature.FeaturePlaceContext;
import net.minecraft.world.level.levelgen.feature.configurations.NoneFeatureConfiguration;
import net.minecraft.world.level.levelgen.synth.SimplexNoise;
import net.minecraft.world.level.material.Fluids;

/**
 * Freezes the caves of one chunk wherever they are Ice Caves: snow and packed-ice floors with powder-snow traps,
 * packed and blue ice on the walls in noisy veins, ice ceilings with hanging icicles, frozen-over pools.
 * Runs once per chunk (no placement modifiers) and checks the biome at every block it touches.
 */
public class IceCaveSurfaceFeature extends Feature<NoneFeatureConfiguration> {
    private static SimplexNoise noise;
    private static long noiseSeed = Long.MIN_VALUE;

    public IceCaveSurfaceFeature(Codec<NoneFeatureConfiguration> codec) {
        super(codec);
    }

    private static SimplexNoise noise(long seed) {
        if (noise == null || noiseSeed != seed) {
            noise = new SimplexNoise(new LegacyRandomSource(seed ^ 0x1CEC4E5L));
            noiseSeed = seed;
        }
        return noise;
    }

    private static boolean freezable(BlockState s) {
        return s.is(BlockTags.BASE_STONE_OVERWORLD) || s.is(BlockTags.DIRT) || s.is(Blocks.GRAVEL) || s.is(Blocks.TUFF)
                || s.is(Blocks.CALCITE) || s.is(Blocks.SAND);
    }

    @Override
    public boolean place(FeaturePlaceContext<NoneFeatureConfiguration> ctx) {
        WorldGenLevel level = ctx.level();
        RandomSource random = ctx.random();
        SimplexNoise n = noise(level.getSeed());
        BlockPos origin = ctx.origin();
        int x0 = origin.getX() & ~15, z0 = origin.getZ() & ~15;
        int minY = level.getMinBuildHeight() + 6;
        BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos();
        boolean any = false;
        for (int dx = 0; dx < 16; dx++) {
            for (int dz = 0; dz < 16; dz++) {
                int x = x0 + dx, z = z0 + dz;
                int top = level.getHeight(Heightmap.Types.OCEAN_FLOOR_WG, x, z) - 8;
                boolean inBiome = false;
                for (int y = top; y >= minY; y--) {
                    if ((y & 3) == 3 || y == top) {   // biomes are 4x4x4 cells
                        inBiome = level.getBiome(p.set(x, y, z)).is(WWWorldgen.ICE_CAVES);
                    }
                    if (!inBiome) {
                        continue;
                    }
                    p.set(x, y, z);
                    BlockState here = level.getBlockState(p);
                    if (here.is(Blocks.WATER) && here.getFluidState().isSource()
                            && level.getBlockState(p.above()).isAir()) {
                        level.setBlock(p, n.getValue(x * 0.2, z * 0.2) > 0.5 ? Blocks.PACKED_ICE.defaultBlockState()
                                : Blocks.ICE.defaultBlockState(), 2);   // frozen-over pools
                        any = true;
                        continue;
                    }
                    if (!here.isAir()) {
                        continue;
                    }
                    any |= decorate(level, random, n, p.immutable());
                }
            }
        }
        return any;
    }

    /** One cave-air block: freeze the solid blocks around it. */
    private boolean decorate(WorldGenLevel level, RandomSource random, SimplexNoise n, BlockPos air) {
        boolean placed = false;
        double vein = n.getValue(air.getX() * 0.09, air.getY() * 0.14, air.getZ() * 0.09);
        // floor
        BlockPos below = air.below();
        BlockState floor = level.getBlockState(below);
        if (freezable(floor)) {
            BlockState put;
            if (vein > 0.55) {
                put = Blocks.PACKED_ICE.defaultBlockState();
            } else if (vein < -0.62 && random.nextInt(3) > 0 && solidAround(level, below)) {
                put = Blocks.POWDER_SNOW.defaultBlockState();   // a trap under a fresh dusting
            } else {
                put = Blocks.SNOW_BLOCK.defaultBlockState();
            }
            level.setBlock(below, put, 2);
            if (!put.is(Blocks.POWDER_SNOW) && random.nextInt(3) == 0 && level.getBlockState(air.above()).isAir()) {
                level.setBlock(air, Blocks.SNOW.defaultBlockState().setValue(SnowLayerBlock.LAYERS, 1 + random.nextInt(2)), 2);
            }
            placed = true;
        }
        // ceiling, and icicles hanging from it
        BlockPos above = air.above();
        BlockState ceiling = level.getBlockState(above);
        if (freezable(ceiling)) {
            level.setBlock(above, vein > 0.35 ? Blocks.BLUE_ICE.defaultBlockState() : Blocks.PACKED_ICE.defaultBlockState(), 2);
            placed = true;
            if (random.nextInt(7) == 0) {
                hangIcicle(level, random, air);
            }
        }
        // walls: veins of blue ice in packed ice, with patches of snow
        for (Direction d : Direction.Plane.HORIZONTAL) {
            BlockPos w = air.relative(d);
            BlockState wall = level.getBlockState(w);
            if (!freezable(wall)) {
                continue;
            }
            double v = n.getValue(w.getX() * 0.11, w.getY() * 0.11, w.getZ() * 0.11);
            BlockState put = v > 0.45 ? Blocks.BLUE_ICE.defaultBlockState()
                    : v > -0.25 ? Blocks.PACKED_ICE.defaultBlockState()
                    : v > -0.55 ? Blocks.SNOW_BLOCK.defaultBlockState() : null;
            if (put != null) {
                level.setBlock(w, put, 2);
                placed = true;
            }
        }
        return placed;
    }

    private static boolean solidAround(WorldGenLevel level, BlockPos pos) {
        for (Direction d : Direction.Plane.HORIZONTAL) {
            if (level.getBlockState(pos.relative(d)).isAir()) {
                return false;
            }
        }
        return true;
    }

    private static void hangIcicle(WorldGenLevel level, RandomSource random, BlockPos top) {
        int len = 1 + random.nextInt(3);
        int room = 0;
        while (room < len + 2 && level.getBlockState(top.below(room)).isAir()) {
            room++;
        }
        len = Math.min(len, room - 2);
        if (len <= 0) {
            return;
        }
        BlockState icicle = WWBlocks.ICICLE.defaultBlockState();
        for (int i = 0; i < len; i++) {
            BlockState s = icicle;
            var tip = s.getBlock().getStateDefinition().getProperty("tip");
            if (tip instanceof net.minecraft.world.level.block.state.properties.BooleanProperty bp) {
                s = s.setValue(bp, i == len - 1);
            }
            level.setBlock(top.below(i), s, 2);
        }
        if (level.getFluidState(top.below(len)).is(Fluids.WATER)) {
            level.setBlock(top.below(len), Blocks.ICE.defaultBlockState(), 2);
        }
    }
}
