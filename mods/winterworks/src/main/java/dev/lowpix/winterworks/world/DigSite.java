package dev.lowpix.winterworks.world;

import dev.lowpix.winterworks.amber.AmberBlock;
import dev.lowpix.winterworks.registry.WWBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.util.RandomSource;
import net.minecraft.world.RandomizableContainer;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ChestBlock;
import net.minecraft.world.level.block.FenceBlock;
import net.minecraft.world.level.block.LanternBlock;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.SlabBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.SlabType;

/**
 * An abandoned excavation (docs/AMBER_UPDATE.md section 3): a dug-out cavern shored up with mineshaft-style timber,
 * a deeper pit in the middle with a half-dug fossil skeleton, a plank bridge over it, scaffolding towers, a ruined
 * shack, a canvas tent, lanterns, chests and barrels of loot, and suspicious sand and gravel, amber and fossils
 * everywhere. Fits in a 25 x 19 x 25 box round `c` (the floor centre).
 */
public final class DigSite {
    public static final int R = 10;

    private DigSite() {}

    private static void set(WorldGenLevel level, BlockPos p, BlockState s) {
        level.setBlock(p, s, 2);
    }

    public static void build(WorldGenLevel level, BlockPos c, RandomSource r) {
        BlockState air = Blocks.AIR.defaultBlockState();
        // 1. the cavern: an elliptical room with a rough ceiling, dirt-and-gravel floor
        for (int dx = -R - 1; dx <= R + 1; dx++) {
            for (int dz = -R - 1; dz <= R + 1; dz++) {
                double e = (dx * dx + dz * dz) / (double) (R * R);
                if (e > 1.15) {
                    continue;
                }
                int h = 6 + (e < 0.6 ? 1 : 0) + r.nextInt(2);
                for (int dy = 0; dy <= h; dy++) {
                    BlockPos p = c.offset(dx, dy, dz);
                    if (e <= 1.0) {
                        set(level, p, air);
                    }
                }
                BlockPos f = c.offset(dx, -1, dz);
                int roll = r.nextInt(10);
                set(level, f, (roll < 4 ? Blocks.COARSE_DIRT : roll < 7 ? Blocks.GRAVEL : roll < 9 ? Blocks.SAND : Blocks.PACKED_MUD)
                        .defaultBlockState());
            }
        }
        // 2. the central pit, three deep, with a half-dug fossil skeleton and suspicious deposits
        int pr = 4;
        for (int dx = -pr; dx <= pr; dx++) {
            for (int dz = -pr + 1; dz <= pr - 1; dz++) {
                for (int dy = -3; dy <= -1; dy++) {
                    set(level, c.offset(dx, dy, dz), air);
                }
                BlockPos floor = c.offset(dx, -4, dz);
                int roll = r.nextInt(100);
                if (roll < 22) {
                    CaveDepositsFeature.place(level, floor, (r.nextBoolean() ? Blocks.SUSPICIOUS_SAND : Blocks.SUSPICIOUS_GRAVEL)
                            .defaultBlockState(), Archaeology.DIG_SITE, r);
                } else if (roll < 30) {   // amber sand and gravel (docs/FIXES_0_4.md)
                    CaveDepositsFeature.placeAmber(level, floor, r.nextBoolean(), r);
                } else if (roll < 35) {
                    CaveDepositsFeature.place(level, floor, WWBlocks.AMBER_FOSSIL.defaultBlockState(), Archaeology.DIG_SITE, r);
                } else {
                    set(level, floor, (r.nextBoolean() ? Blocks.SAND : Blocks.GRAVEL).defaultBlockState());
                }
            }
        }
        // the fossil: a spine of bone blocks with ribs, half buried in the pit floor
        BlockState spine = Blocks.BONE_BLOCK.defaultBlockState().setValue(RotatedPillarBlock.AXIS, Direction.Axis.X);
        BlockState rib = Blocks.BONE_BLOCK.defaultBlockState().setValue(RotatedPillarBlock.AXIS, Direction.Axis.Z);
        for (int dx = -3; dx <= 3; dx++) {
            set(level, c.offset(dx, -4, 0), spine);
            if (dx % 2 == 0 && dx > -3) {
                set(level, c.offset(dx, -3, 1), rib);
                set(level, c.offset(dx, -3, -1), rib);
            }
        }
        set(level, c.offset(4, -3, 0), Blocks.SKELETON_SKULL.defaultBlockState());
        // ladders down into the pit
        for (int dy = -3; dy <= -1; dy++) {
            set(level, c.offset(0, dy, -pr + 1), Blocks.LADDER.defaultBlockState()
                    .setValue(net.minecraft.world.level.block.LadderBlock.FACING, Direction.SOUTH));
        }
        // 3. a plank bridge across the pit with rope-and-post rails
        for (int dx = -pr - 1; dx <= pr + 1; dx++) {
            set(level, c.offset(dx, -1, 2), Blocks.SPRUCE_PLANKS.defaultBlockState());
            if (dx % 2 == 0) {
                set(level, c.offset(dx, 0, 3), Blocks.SPRUCE_FENCE.defaultBlockState().setValue(FenceBlock.WEST, true)
                        .setValue(FenceBlock.EAST, true));
            }
        }
        // 4. mineshaft-style shoring round the walls: posts and cross beams
        for (int a = 0; a < 360; a += 45) {
            double rad = Math.toRadians(a + 10);
            int x = (int) Math.round(Math.cos(rad) * (R - 1)), z = (int) Math.round(Math.sin(rad) * (R - 1));
            for (int dy = 0; dy < 5; dy++) {
                set(level, c.offset(x, dy, z), Blocks.STRIPPED_SPRUCE_LOG.defaultBlockState());
            }
            set(level, c.offset(x, 5, z), Blocks.SPRUCE_PLANKS.defaultBlockState());
            if (r.nextInt(3) > 0) {
                set(level, c.offset(x, 4, z).relative(x > 0 ? Direction.WEST : Direction.EAST),
                        Blocks.LANTERN.defaultBlockState().setValue(LanternBlock.HANGING, false));
            }
        }
        // 5. scaffolding towers in two corners
        for (int[] t : new int[][]{{-6, -5}, {6, -5}}) {
            for (int dy = 0; dy < 6; dy++) {
                for (int ox = 0; ox < 2; ox++) {
                    set(level, c.offset(t[0] + ox, dy, t[1]), Blocks.SCAFFOLDING.defaultBlockState());
                }
            }
        }
        // 6. a ruined shack with a chest, a barrel and a crafting table
        shack(level, r, c.offset(-7, 0, 4));
        // 7. a canvas tent with a chest and a cold campfire
        tent(level, r, c.offset(6, 0, 4));
        // 8. amber in the walls, loose deposits round the edge
        for (int i = 0; i < 8; i++) {
            double rad = r.nextDouble() * Math.PI * 2;
            BlockPos w = c.offset((int) Math.round(Math.cos(rad) * (R + 1)), 1 + r.nextInt(4), (int) Math.round(Math.sin(rad) * (R + 1)));
            AmberBlock.Inclusion inc = AmberBlock.Inclusion.values()[r.nextInt(3)];
            set(level, w, WWBlocks.AMBER_BLOCK.defaultBlockState().setValue(AmberBlock.INCLUSION, inc));
        }
        for (int i = 0; i < 10; i++) {
            double rad = r.nextDouble() * Math.PI * 2, d = 5 + r.nextDouble() * (R - 6);
            BlockPos f = c.offset((int) Math.round(Math.cos(rad) * d), -1, (int) Math.round(Math.sin(rad) * d));
            if (level.getBlockState(f.above()).isAir()) {
                if (r.nextInt(3) == 0) {
                    CaveDepositsFeature.placeAmber(level, f, r.nextBoolean(), r);
                } else {
                    CaveDepositsFeature.place(level, f, (r.nextBoolean() ? Blocks.SUSPICIOUS_GRAVEL : Blocks.SUSPICIOUS_SAND)
                            .defaultBlockState(), Archaeology.DIG_SITE, r);
                }
            }
        }
        // 9. crates of loot by the bridge
        crate(level, r, c.offset(-2, 0, 6));
        if (r.nextBoolean()) {
            crate(level, r, c.offset(2, 0, -7));
        }
    }

    private static void chest(WorldGenLevel level, RandomSource r, BlockPos p, Direction facing) {
        set(level, p, Blocks.CHEST.defaultBlockState().setValue(ChestBlock.FACING, facing));
        RandomizableContainer.setBlockEntityLootTable(level, r, p, Archaeology.DIG_SITE_CHEST);
    }

    private static void crate(WorldGenLevel level, RandomSource r, BlockPos p) {
        set(level, p, Blocks.BARREL.defaultBlockState());
        RandomizableContainer.setBlockEntityLootTable(level, r, p, Archaeology.DIG_SITE_CHEST);
        set(level, p.east(), Blocks.SPRUCE_SLAB.defaultBlockState());
    }

    /** A 5 x 4 x 5 spruce shack, a quarter of its walls and half its roof fallen in. */
    private static void shack(WorldGenLevel level, RandomSource r, BlockPos o) {
        for (int dx = 0; dx < 5; dx++) {
            for (int dz = 0; dz < 5; dz++) {
                boolean edge = dx == 0 || dx == 4 || dz == 0 || dz == 4;
                boolean corner = (dx == 0 || dx == 4) && (dz == 0 || dz == 4);
                for (int dy = 0; dy < 3; dy++) {
                    BlockPos p = o.offset(dx, dy, dz);
                    if (corner) {
                        set(level, p, Blocks.SPRUCE_LOG.defaultBlockState());
                    } else if (edge && !(dz == 0 && dx == 2 && dy < 2) && r.nextInt(4) > 0) {
                        set(level, p, (r.nextInt(5) == 0 ? Blocks.MOSSY_COBBLESTONE : Blocks.SPRUCE_PLANKS).defaultBlockState());
                    }
                }
                if (r.nextBoolean()) {
                    set(level, o.offset(dx, 3, dz), Blocks.SPRUCE_SLAB.defaultBlockState().setValue(SlabBlock.TYPE, SlabType.BOTTOM));
                }
            }
        }
        chest(level, r, o.offset(1, 0, 3), Direction.EAST);
        set(level, o.offset(3, 0, 3), Blocks.CRAFTING_TABLE.defaultBlockState());
        set(level, o.offset(3, 0, 1), Blocks.BARREL.defaultBlockState());
        RandomizableContainer.setBlockEntityLootTable(level, r, o.offset(3, 0, 1), Archaeology.DIG_SITE_CHEST);
        set(level, o.offset(2, 2, 2), Blocks.LANTERN.defaultBlockState().setValue(LanternBlock.HANGING, true));
    }

    /** An A-frame canvas tent (white and brown wool) open at both ends. */
    private static void tent(WorldGenLevel level, RandomSource r, BlockPos o) {
        for (int dz = 0; dz < 5; dz++) {
            BlockState cloth = (dz % 2 == 0 ? Blocks.WHITE_WOOL : Blocks.BROWN_WOOL).defaultBlockState();
            set(level, o.offset(-2, 0, dz), cloth);
            set(level, o.offset(2, 0, dz), cloth);
            set(level, o.offset(-1, 1, dz), cloth);
            set(level, o.offset(1, 1, dz), cloth);
            set(level, o.offset(0, 2, dz), cloth);
        }
        chest(level, r, o.offset(0, 0, 4), Direction.NORTH);
        set(level, o.offset(-1, 0, 2), Blocks.WHITE_CARPET.defaultBlockState());
        set(level, o.offset(0, 0, -2), Blocks.CAMPFIRE.defaultBlockState().setValue(
                net.minecraft.world.level.block.CampfireBlock.LIT, false));
    }
}
