package dev.lowpix.winterworks.ocean;

import net.minecraft.core.Direction;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ChainBlock;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.SeaPickleBlock;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Sunken treasure (docs/OCEAN_UPDATE.md section 7): a lone chest half buried in the deep sea floor, its lid level with
 * the silt (chests/sunken_treasure, where the Heart of the Sea may be), a little gold spilled round it, silt drifted
 * against it, the rusted chain and anchor it went down with trailing off across the floor, and a few sea pickles glowing
 * beside it.
 */
final class SunkenTreasure {
    private SunkenTreasure() {}

    static void build(OceanStructurePiece.W w) {
        BlockState silt = w.rnd(0, 0, 0, 1) < 0.5f ? Blocks.SAND.defaultBlockState() : Blocks.GRAVEL.defaultBlockState();
        // the chest, sunk to its lid
        if (w.column(0, 0)) {
            int f = w.floor(0, 0, 3, 8);
            if (f != Integer.MIN_VALUE) {
                w.set(0, f - 1, 0, Blocks.GRAVEL.defaultBlockState().is(silt.getBlock()) ? Blocks.TUFF.defaultBlockState() : Blocks.SANDSTONE.defaultBlockState());
                w.chest(0, f, 0, Direction.from2DDataValue((int) (w.rnd(0, 0, 0, 2) * 4)), OceanLoot.SUNKEN_TREASURE);
            }
        }
        // gold spilled round it, sunk flush with the floor, and silt drifted against its corners
        int[][] ring = {{1, 0}, {1, 1}, {0, 1}, {-1, 1}, {-1, 0}, {-1, -1}, {0, -1}, {1, -1}};
        for (int i = 0; i < ring.length; i++) {
            int x = ring[i][0], z = ring[i][1];
            if (!w.column(x, z)) {
                continue;
            }
            int f = w.floor(x, z, 3, 8);
            if (f == Integer.MIN_VALUE) {
                continue;
            }
            float r = w.rnd(x, 0, z, 3);
            boolean corner = x != 0 && z != 0;
            if (!corner && r < 0.35f) {
                w.set(x, f, z, (r < 0.15f ? Blocks.GOLD_BLOCK : Blocks.RAW_GOLD_BLOCK).defaultBlockState());
            } else if (corner && r < 0.6f) {
                w.set(x, f + 1, z, silt);
            }
        }
        // the anchor chain and the anchor, lying on the floor
        int len = 3 + (int) (w.rnd(0, 0, 0, 5) * 2);
        for (int x = 1; x <= len; x++) {
            int f = w.floor(x + 1, 0, 3, 8);
            if (f != Integer.MIN_VALUE) {
                w.wet(x + 1, f + 1, 0, Blocks.CHAIN.defaultBlockState().setValue(ChainBlock.AXIS, Direction.Axis.X));
            }
        }
        int ax = len + 2;
        int f = w.floor(ax, 0, 3, 8);
        if (f != Integer.MIN_VALUE) {
            w.set(ax, f + 1, 0, Blocks.IRON_BLOCK.defaultBlockState());   // the anchor's crown and stock
            for (int z = -2; z <= 2; z++) {
                if (z != 0) {
                    w.wet(ax + 1, f + 1, z, Blocks.IRON_BARS.defaultBlockState());
                }
            }
            w.wet(ax + 1, f + 1, 0, Blocks.IRON_BARS.defaultBlockState());
            w.set(ax - 1, f + 1, -1, Blocks.STRIPPED_OAK_LOG.defaultBlockState().setValue(RotatedPillarBlock.AXIS, Direction.Axis.Z));
        }
        // sea pickles: the only light down here
        int[][] glow = {{-2, 1}, {1, -2}, {-1, -3}};
        for (int[] g : glow) {
            int gf = w.floor(g[0], g[1], 3, 8);
            if (gf != Integer.MIN_VALUE && w.rnd(g[0], 0, g[1], 6) < 0.8f) {
                w.set(g[0], gf + 1, g[1], Blocks.SEA_PICKLE.defaultBlockState().setValue(SeaPickleBlock.PICKLES, 1 + (int) (w.rnd(g[0], 1, g[1], 7) * 3))
                        .setValue(SeaPickleBlock.WATERLOGGED, true));
            }
        }
        // a few bones of whoever was guarding it
        if (w.rnd(0, 0, 0, 8) < 0.6f) {
            int bf = w.floor(-1, 2, 3, 8);
            if (bf != Integer.MIN_VALUE) {
                w.set(-1, bf + 1, 2, Blocks.BONE_BLOCK.defaultBlockState().setValue(RotatedPillarBlock.AXIS, Direction.Axis.X));
                w.wet(-2, bf + 1, 2, Blocks.SKELETON_SKULL.defaultBlockState());
            }
        }
    }
}
