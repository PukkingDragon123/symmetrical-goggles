package dev.lowpix.winterworks.world;

import com.mojang.serialization.Codec;
import dev.lowpix.winterworks.amber.AmberBlock;
import dev.lowpix.winterworks.registry.WWBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.tags.BlockTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.LegacyRandomSource;
import net.minecraft.world.level.levelgen.feature.Feature;
import net.minecraft.world.level.levelgen.feature.FeaturePlaceContext;
import net.minecraft.world.level.levelgen.feature.configurations.NoneFeatureConfiguration;
import net.minecraft.world.level.levelgen.synth.SimplexNoise;

/**
 * Turns the caves of one chunk into Dead Caves wherever the biome says so: a fossil desert that was a prehistoric
 * forest. Sand, gravel and coarse-dirt floors with dead bushes, banded sandstone walls with amber seams, lots of
 * suspicious sand and gravel, amber fossils, big boulders, and petrified trunks and stumps.
 */
public class DeadCaveSurfaceFeature extends Feature<NoneFeatureConfiguration> {
    private static SimplexNoise noise;
    private static long noiseSeed = Long.MIN_VALUE;

    public DeadCaveSurfaceFeature(Codec<NoneFeatureConfiguration> codec) {
        super(codec);
    }

    private static SimplexNoise noise(long seed) {
        if (noise == null || noiseSeed != seed) {
            noise = new SimplexNoise(new LegacyRandomSource(seed ^ 0xDEADCA7EL));
            noiseSeed = seed;
        }
        return noise;
    }

    private static boolean rock(BlockState s) {
        return s.is(BlockTags.BASE_STONE_OVERWORLD) || s.is(BlockTags.DIRT) || s.is(Blocks.GRAVEL) || s.is(Blocks.CALCITE);
    }

    private static boolean inBiome(WorldGenLevel level, BlockPos p) {
        return level.getBiome(p).is(WWWorldgen.DEAD_CAVES);
    }

    @Override
    public boolean place(FeaturePlaceContext<NoneFeatureConfiguration> ctx) {
        WorldGenLevel level = ctx.level();
        RandomSource r = ctx.random();
        SimplexNoise n = noise(level.getSeed());
        int x0 = ctx.origin().getX() & ~15, z0 = ctx.origin().getZ() & ~15;
        int minY = level.getMinBuildHeight() + 6;
        BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos();
        boolean any = false;
        for (int dx = 0; dx < 16; dx++) {
            for (int dz = 0; dz < 16; dz++) {
                int x = x0 + dx, z = z0 + dz;
                int top = level.getHeight(Heightmap.Types.OCEAN_FLOOR_WG, x, z) - 8;
                if (!level.getBiome(p.set(x, top + 8, z)).is(net.minecraft.tags.BiomeTags.IS_BADLANDS)) {
                    continue;   // the Dead Caves only lie under the badlands
                }
                boolean biome = false;
                for (int y = top; y >= minY; y--) {
                    if ((y & 3) == 3 || y == top) {
                        biome = inBiome(level, p.set(x, y, z));
                    }
                    if (!biome || !level.getBlockState(p.set(x, y, z)).isAir()) {
                        continue;
                    }
                    any |= decorate(level, r, n, p.immutable());
                }
            }
        }
        // set pieces: boulders and petrified trees on a few floor spots of this chunk
        for (int i = 0; i < 3; i++) {
            BlockPos start = new BlockPos(x0 + 2 + r.nextInt(12), minY + r.nextInt(Math.max(1, 60 - minY)), z0 + 2 + r.nextInt(12));
            BlockPos floor = CaveDepositsFeature.findFloor(level, start, 24);
            if (floor == null || !inBiome(level, floor.above()) || !level.getBlockState(floor.above(3)).isAir()) {
                continue;
            }
            switch (r.nextInt(3)) {
                case 0 -> boulder(level, r, floor.above());
                case 1 -> fallenTrunk(level, r, floor.above());
                default -> stump(level, r, floor.above());
            }
            any = true;
        }
        return any;
    }

    private boolean decorate(WorldGenLevel level, RandomSource r, SimplexNoise n, BlockPos air) {
        boolean placed = false;
        BlockPos below = air.below();
        BlockState floor = level.getBlockState(below);
        if (rock(floor)) {
            double v = n.getValue(air.getX() * 0.08, air.getZ() * 0.08);
            int roll = r.nextInt(100);
            if (roll < 6) {
                CaveDepositsFeature.place(level, below, (v > 0 ? Blocks.SUSPICIOUS_SAND : Blocks.SUSPICIOUS_GRAVEL).defaultBlockState(),
                        Archaeology.DEAD_CAVE, r);
            } else if (roll < 7) {
                CaveDepositsFeature.place(level, below, WWBlocks.AMBER_FOSSIL.defaultBlockState(), Archaeology.DEAD_CAVE, r);
            } else {
                level.setBlock(below, (v > 0.1 ? Blocks.SAND : v > -0.35 ? Blocks.GRAVEL : Blocks.COARSE_DIRT).defaultBlockState(), 2);
                if (v > 0.1 && r.nextInt(14) == 0 && level.getBlockState(air.above()).isAir()) {
                    level.setBlock(air, Blocks.DEAD_BUSH.defaultBlockState(), 2);
                }
            }
            placed = true;
        }
        BlockPos above = air.above();
        if (rock(level.getBlockState(above))) {
            level.setBlock(above, Blocks.SANDSTONE.defaultBlockState(), 2);
            placed = true;
        }
        for (Direction d : Direction.Plane.HORIZONTAL) {
            BlockPos w = air.relative(d);
            if (!rock(level.getBlockState(w))) {
                continue;
            }
            // horizontal strata, like a canyon wall; amber seams here and there
            double band = n.getValue(w.getX() * 0.02, w.getY() * 0.45, w.getZ() * 0.02);
            BlockState put;
            if (r.nextInt(60) == 0) {
                AmberBlock.Inclusion inc = r.nextInt(4) == 0 ? AmberBlock.Inclusion.MOSQUITO
                        : r.nextInt(3) == 0 ? AmberBlock.Inclusion.SEED : AmberBlock.Inclusion.NONE;
                put = WWBlocks.AMBER_BLOCK.defaultBlockState().setValue(AmberBlock.INCLUSION, inc);
            } else if (band > 0.45) {
                put = Blocks.SMOOTH_SANDSTONE.defaultBlockState();
            } else if (band > 0.0) {
                put = Blocks.SANDSTONE.defaultBlockState();
            } else if (band > -0.4) {
                put = Blocks.TERRACOTTA.defaultBlockState();
            } else {
                put = Blocks.BROWN_TERRACOTTA.defaultBlockState();
            }
            level.setBlock(w, put, 2);
            placed = true;
        }
        return placed;
    }

    /** A big lumpy boulder of mixed stone. */
    private static void boulder(WorldGenLevel level, RandomSource r, BlockPos at) {
        int rad = 2 + r.nextInt(2);
        BlockState[] mix = {Blocks.ANDESITE.defaultBlockState(), Blocks.COBBLESTONE.defaultBlockState(),
                Blocks.TUFF.defaultBlockState(), Blocks.STONE.defaultBlockState()};
        BlockPos c = at.above(rad - 1);
        for (BlockPos p : BlockPos.betweenClosed(c.offset(-rad, -rad, -rad), c.offset(rad, rad, rad))) {
            double d = p.distSqr(c) + r.nextFloat() * 2.5;
            if (d <= rad * rad + 1 && level.getBlockState(p).isAir() || d <= rad * rad && rock(level.getBlockState(p))) {
                level.setBlock(p, mix[r.nextInt(mix.length)], 2);
            }
        }
    }

    /** A fallen petrified trunk lying on the floor. */
    private static void fallenTrunk(WorldGenLevel level, RandomSource r, BlockPos at) {
        Direction d = r.nextBoolean() ? Direction.EAST : Direction.SOUTH;
        BlockState log = WWBlocks.PETRIFIED_LOG.defaultBlockState().setValue(RotatedPillarBlock.AXIS, d.getAxis());
        int len = 4 + r.nextInt(5);
        for (int i = 0; i < len; i++) {
            BlockPos p = at.relative(d, i);
            if (!level.getBlockState(p).isAir() && !level.getBlockState(p).canBeReplaced()) {
                break;
            }
            level.setBlock(p, log, 2);
        }
    }

    /** A petrified stump with a broken top. */
    private static void stump(WorldGenLevel level, RandomSource r, BlockPos at) {
        int h = 2 + r.nextInt(3);
        for (int i = 0; i < h; i++) {
            if (!level.getBlockState(at.above(i)).isAir()) {
                break;
            }
            level.setBlock(at.above(i), WWBlocks.PETRIFIED_LOG.defaultBlockState(), 2);
        }
        for (Direction d : Direction.Plane.HORIZONTAL) {   // splayed roots
            if (r.nextBoolean() && level.getBlockState(at.relative(d)).isAir()) {
                level.setBlock(at.relative(d), WWBlocks.PETRIFIED_LOG.defaultBlockState()
                        .setValue(RotatedPillarBlock.AXIS, d.getAxis()), 2);
            }
        }
    }
}
