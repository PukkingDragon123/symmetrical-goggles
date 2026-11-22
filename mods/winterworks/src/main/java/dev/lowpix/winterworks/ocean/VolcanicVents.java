package dev.lowpix.winterworks.ocean;

import dev.lowpix.winterworks.registry.OceanBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.tags.BlockTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.feature.FeaturePlaceContext;
import net.minecraft.world.level.levelgen.feature.configurations.NoneFeatureConfiguration;
import net.minecraft.world.level.levelgen.structure.BoundingBox;

/**
 * Hydrothermal vent fields (docs/OCEAN_UPDATE.md sections 1, 2): in the volcanic depths, a few chimneys of basalt,
 * blackstone and magma topped by hydrothermal vents, on mounds of basalt in drifts of ash sand, ringed by tube worms,
 * over huge seams of raw gold and raw iron blocks. Once a chunk (a third of them get a field), writing only to the chunk
 * and its neighbours.
 */
public final class VolcanicVents {
    /** The chance a volcanic-depths chunk has a vent field. */
    public static final float CHANCE = 0.34f;

    private VolcanicVents() {}

    static boolean place(FeaturePlaceContext<NoneFeatureConfiguration> ctx) {
        WorldGenLevel level = ctx.level();
        RandomSource r = ctx.random();
        int cx = ctx.origin().getX() & ~15, cz = ctx.origin().getZ() & ~15;
        int x = cx + 4 + r.nextInt(8), z = cz + 4 + r.nextInt(8);
        if (r.nextFloat() >= CHANCE) {
            return false;
        }
        int top = level.getHeight(Heightmap.Types.OCEAN_FLOOR_WG, x, z) - 1;
        if (top > 10 || !level.getBiome(new BlockPos(x, top + 1, z)).is(OceanWorldgen.VOLCANIC_DEPTHS)
                || !level.getBlockState(new BlockPos(x, top + 1, z)).is(Blocks.WATER)) {
            return false;
        }
        BoundingBox clip = new BoundingBox(cx - 16, level.getMinBuildHeight(), cz - 16, cx + 31, level.getMaxBuildHeight() - 1, cz + 31);
        return field(level, clip, new BlockPos(x, top, z), r) > 0;
    }

    /** Builds a vent field round the floor block `centre`, clipped to `clip`. Returns how many vents it made. */
    public static int field(WorldGenLevel level, BoundingBox clip, BlockPos centre, RandomSource r) {
        // seams of raw ore under the field
        int seams = 1 + r.nextInt(2);
        for (int i = 0; i < seams; i++) {
            double a = r.nextDouble() * Math.PI * 2;
            BlockPos at = centre.offset((int) (Math.cos(a) * (2 + r.nextInt(4))), -1 - r.nextInt(2), (int) (Math.sin(a) * (2 + r.nextInt(4))));
            seam(level, clip, at, r.nextFloat() < 0.4f ? Blocks.RAW_GOLD_BLOCK.defaultBlockState() : Blocks.RAW_IRON_BLOCK.defaultBlockState(),
                    4 + r.nextDouble() * 2.5, 1.8 + r.nextDouble() * 1.2, 2.2 + r.nextDouble() * 1.5, r.nextDouble() * Math.PI, r);
        }
        // ash drifts round it
        for (int dx = -8; dx <= 8; dx++) {
            for (int dz = -8; dz <= 8; dz++) {
                double d = Math.sqrt(dx * dx + dz * dz);
                if (d > 8 || r.nextFloat() > 0.45 - d * 0.04) {
                    continue;
                }
                BlockPos top = floor(level, clip, centre.getX() + dx, centre.getZ() + dz, centre.getY());
                if (top == null) {
                    continue;
                }
                BlockState s = level.getBlockState(top);
                if ((s.is(BlockTags.BASE_STONE_OVERWORLD) || s.is(Blocks.BASALT) || s.is(Blocks.SMOOTH_BASALT) || s.is(Blocks.GRAVEL))
                        && level.getBlockState(top.below()).blocksMotion()) {
                    set(level, clip, top, OceanBlocks.ASH_SAND.defaultBlockState());
                }
            }
        }
        int vents = 0, n = 2 + r.nextInt(5);
        for (int i = 0; i < n; i++) {
            double a = r.nextDouble() * Math.PI * 2, d = i == 0 ? 0 : 2.5 + r.nextDouble() * 4;
            BlockPos top = floor(level, clip, centre.getX() + (int) Math.round(Math.cos(a) * d), centre.getZ() + (int) Math.round(Math.sin(a) * d),
                    centre.getY());
            if (top != null && chimney(level, clip, top, i == 0 ? 3 + r.nextInt(4) : r.nextInt(5), r)) {
                vents++;
            }
        }
        return vents;
    }

    /** The sea-floor top block near height `y` in column (x, z), or null. */
    private static BlockPos floor(WorldGenLevel level, BoundingBox clip, int x, int z, int y) {
        BlockPos.MutableBlockPos m = new BlockPos.MutableBlockPos(x, y + 6, z);
        if (!clip.isInside(m)) {
            return null;
        }
        for (int k = 0; k < 14; k++, m.move(Direction.DOWN)) {
            BlockState s = level.getBlockState(m);
            if (!s.getFluidState().isEmpty() || s.isAir() || s.is(OceanBlocks.TUBE_WORMS)) {
                continue;
            }
            return level.getBlockState(m.above()).is(Blocks.WATER) && s.blocksMotion() ? m.immutable() : null;
        }
        return null;
    }

    private static boolean set(WorldGenLevel level, BoundingBox clip, BlockPos p, BlockState s) {
        if (!clip.isInside(p) || level.isOutsideBuildHeight(p)) {
            return false;
        }
        level.setBlock(p, s, OceanGen.FLAGS);
        return true;
    }

    private static BlockState basalt() {
        return Blocks.BASALT.defaultBlockState().setValue(RotatedPillarBlock.AXIS, Direction.Axis.Y);
    }

    /** A chimney `height` blocks tall on the floor block `top`, a vent on it, a mound round its foot and tube worms round that. */
    private static boolean chimney(WorldGenLevel level, BoundingBox clip, BlockPos top, int height, RandomSource r) {
        // the mound
        for (int dx = -2; dx <= 2; dx++) {
            for (int dz = -2; dz <= 2; dz++) {
                int d2 = dx * dx + dz * dz;
                if (d2 > 5 || d2 > 2 && r.nextFloat() < 0.4f) {
                    continue;
                }
                BlockPos p = top.offset(dx, 0, dz);
                BlockPos f = floor(level, clip, p.getX(), p.getZ(), top.getY());
                if (f == null) {
                    continue;
                }
                float k = r.nextFloat();
                set(level, clip, f, k < 0.2f ? Blocks.MAGMA_BLOCK.defaultBlockState() : k < 0.45f ? Blocks.SMOOTH_BASALT.defaultBlockState() : basalt());
                if (d2 <= 1 && f.getY() <= top.getY()) {
                    set(level, clip, f.above(), r.nextFloat() < 0.3f ? Blocks.BLACKSTONE.defaultBlockState() : basalt());
                }
            }
        }
        // the stack
        int base = top.getY() + 1;
        for (int y = base; y < base + height; y++) {
            float k = r.nextFloat();
            set(level, clip, new BlockPos(top.getX(), y, top.getZ()),
                    k < 0.22f ? Blocks.MAGMA_BLOCK.defaultBlockState() : k < 0.45f ? Blocks.BLACKSTONE.defaultBlockState() : basalt());
        }
        BlockPos vent = new BlockPos(top.getX(), base + height, top.getZ());
        if (!clip.isInside(vent) || !level.getBlockState(vent).is(Blocks.WATER) && !level.getBlockState(vent).is(OceanBlocks.HYDROTHERMAL_VENT)) {
            return false;
        }
        set(level, clip, vent, OceanBlocks.HYDROTHERMAL_VENT.defaultBlockState().setValue(HydrothermalVentBlock.WATERLOGGED, true));
        // tube worms
        int worms = 6 + r.nextInt(10);
        for (int i = 0; i < worms * 2 && worms > 0; i++) {
            double a = r.nextDouble() * Math.PI * 2, d = 1.4 + r.nextDouble() * 3.4;
            BlockPos f = floor(level, clip, top.getX() + (int) Math.round(Math.cos(a) * d), top.getZ() + (int) Math.round(Math.sin(a) * d),
                    top.getY() + 2);
            if (f == null || !level.getBlockState(f.above()).is(Blocks.WATER) || !level.getBlockState(f).isFaceSturdy(level, f, Direction.UP)) {
                continue;
            }
            if (set(level, clip, f.above(), OceanBlocks.TUBE_WORMS.defaultBlockState())) {
                worms--;
            }
        }
        return true;
    }

    /** An ellipsoid seam of `ore` (radii a along `angle`, b up, c across) replacing the rock and sediment round `at`. */
    private static void seam(WorldGenLevel level, BoundingBox clip, BlockPos at, BlockState ore, double a, double b, double c, double angle,
                             RandomSource r) {
        double ca = Math.cos(angle), sa = Math.sin(angle);
        int reach = (int) Math.ceil(Math.max(a, c)) + 1;
        BlockPos.MutableBlockPos m = new BlockPos.MutableBlockPos();
        for (int dx = -reach; dx <= reach; dx++) {
            for (int dy = -(int) Math.ceil(b) - 1; dy <= (int) Math.ceil(b) + 1; dy++) {
                for (int dz = -reach; dz <= reach; dz++) {
                    double u = dx * ca + dz * sa, w = -dx * sa + dz * ca;
                    double q = u * u / (a * a) + dy * dy / (b * b) + w * w / (c * c);
                    if (q > 1 || q > 0.7 && r.nextFloat() < 0.5f) {
                        continue;
                    }
                    m.set(at.getX() + dx, at.getY() + dy, at.getZ() + dz);
                    if (!clip.isInside(m)) {
                        continue;
                    }
                    BlockState s = level.getBlockState(m);
                    if (OceanGen.natural(s) || s.is(Blocks.BLACKSTONE)) {
                        level.setBlock(m, ore, OceanGen.FLAGS);
                    }
                }
            }
        }
    }
}
