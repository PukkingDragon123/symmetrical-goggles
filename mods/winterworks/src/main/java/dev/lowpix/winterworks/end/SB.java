package dev.lowpix.winterworks.end;

import dev.lowpix.winterworks.registry.EndBlocks;
import net.minecraft.core.Direction;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.SlabBlock;
import net.minecraft.world.level.block.StairBlock;
import net.minecraft.world.level.block.WallBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.Half;
import net.minecraft.world.level.block.state.properties.SlabType;
import net.minecraft.world.level.block.state.properties.WallSide;

/** Structure blocks for the Living End's builds (the new obsidian and meteorite sets, purpur, end stone bricks). */
final class SB {
    static final BlockState AIR = Blocks.AIR.defaultBlockState();
    static final BlockState OBSIDIAN = Blocks.OBSIDIAN.defaultBlockState();
    static final BlockState CRYING = Blocks.CRYING_OBSIDIAN.defaultBlockState();
    static final BlockState POLISHED = EndBlocks.POLISHED_OBSIDIAN.defaultBlockState();
    static final BlockState BRICKS = EndBlocks.OBSIDIAN_BRICKS.defaultBlockState();
    static final BlockState CRACKED = EndBlocks.CRACKED_OBSIDIAN_BRICKS.defaultBlockState();
    static final BlockState TILES = EndBlocks.OBSIDIAN_TILES.defaultBlockState();
    static final BlockState CRACKED_TILES = EndBlocks.CRACKED_OBSIDIAN_TILES.defaultBlockState();
    static final BlockState CHISELED = EndBlocks.CHISELED_OBSIDIAN.defaultBlockState();
    static final BlockState GLOW = EndBlocks.POLISHED_METEORITE.defaultBlockState();
    static final BlockState GLOW_BRICKS = EndBlocks.METEORITE_BRICKS.defaultBlockState();
    static final BlockState END_BRICKS = Blocks.END_STONE_BRICKS.defaultBlockState();
    static final BlockState PURPUR = Blocks.PURPUR_BLOCK.defaultBlockState();
    static final BlockState SAND = EndBlocks.END_SAND.defaultBlockState();
    static final BlockState MOSS = EndBlocks.END_MOSS_BLOCK.defaultBlockState();
    static final BlockState MOSS_CARPET = EndBlocks.END_MOSS_CARPET.defaultBlockState();
    static final BlockState GRASS = EndBlocks.END_GRASS_BLOCK.defaultBlockState();
    static final BlockState END_ROD = Blocks.END_ROD.defaultBlockState();

    private SB() {}

    static BlockState purpurPillar(Direction.Axis axis) {
        return Blocks.PURPUR_PILLAR.defaultBlockState().setValue(RotatedPillarBlock.AXIS, axis);
    }

    static BlockState stairs(Block b, Direction facing, boolean top) {
        return b.defaultBlockState().setValue(StairBlock.FACING, facing).setValue(StairBlock.HALF, top ? Half.TOP : Half.BOTTOM);
    }

    static BlockState slab(Block b, boolean top) {
        return b.defaultBlockState().setValue(SlabBlock.TYPE, top ? SlabType.TOP : SlabType.BOTTOM);
    }

    /** A free-standing wall post (no sides). */
    static BlockState post(Block b) {
        return b.defaultBlockState().setValue(WallBlock.UP, true).setValue(WallBlock.NORTH_WALL, WallSide.NONE)
                .setValue(WallBlock.EAST_WALL, WallSide.NONE).setValue(WallBlock.SOUTH_WALL, WallSide.NONE)
                .setValue(WallBlock.WEST_WALL, WallSide.NONE);
    }

    /** The horizontal direction pointing from (x, z) towards the origin, the nearest of the four. */
    static Direction towardsCentre(double x, double z) {
        if (Math.abs(x) > Math.abs(z)) {
            return x > 0 ? Direction.WEST : Direction.EAST;
        }
        return z > 0 ? Direction.NORTH : Direction.SOUTH;
    }

    /** The horizontal direction of travel round the origin, anticlockwise seen from above (increasing atan2(z, x)). */
    static Direction tangent(double x, double z) {
        double a = Math.atan2(z, x);
        double tx = -Math.sin(a), tz = Math.cos(a);
        if (Math.abs(tx) > Math.abs(tz)) {
            return tx > 0 ? Direction.EAST : Direction.WEST;
        }
        return tz > 0 ? Direction.SOUTH : Direction.NORTH;
    }
}
