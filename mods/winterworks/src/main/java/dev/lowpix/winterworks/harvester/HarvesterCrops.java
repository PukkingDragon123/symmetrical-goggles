package dev.lowpix.winterworks.harvester;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.block.AttachedStemBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CropBlock;
import net.minecraft.world.level.block.NetherWartBlock;
import net.minecraft.world.level.block.SweetBerryBushBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.gameevent.GameEvent;

/**
 * What a Harvester crops (docs/FIXES_0_4.md "Harvests crops"): mature wheat, carrots, potatoes, beetroots, nether wart,
 * melons and pumpkins (the fruit next to its stem), sweet berries, torchflowers and pitcher plants. Cropping one
 * gathers its drops and replants it: crops and nether wart go back to age 0 (using one of their own seeds), berry
 * bushes back to unripe, torchflowers and pitcher plants back to a young crop; melons and pumpkins just come off the
 * stem.
 */
public final class HarvesterCrops {
    private HarvesterCrops() {}

    /** Is the block at `pos` something the Harvester would crop right now? (For pitchers: either half of a grown one.) */
    public static boolean isRipe(BlockGetter level, BlockPos pos) {
        BlockState s = level.getBlockState(pos);
        if (s.is(Blocks.WHEAT) || s.is(Blocks.CARROTS) || s.is(Blocks.POTATOES) || s.is(Blocks.BEETROOTS)) {
            return ((CropBlock) s.getBlock()).isMaxAge(s);
        }
        if (s.is(Blocks.NETHER_WART)) {
            return s.getValue(NetherWartBlock.AGE) == NetherWartBlock.MAX_AGE;
        }
        if (s.is(Blocks.SWEET_BERRY_BUSH)) {
            return s.getValue(SweetBerryBushBlock.AGE) >= 2;
        }
        if (s.is(Blocks.MELON) || s.is(Blocks.PUMPKIN)) {
            return onStem(level, pos, s);
        }
        if (GlowPlants.isGrownTorchflower(s)) {
            return level.getBlockState(pos.below()).is(Blocks.FARMLAND);
        }
        if (GlowPlants.isGrownPitcher(s)) {
            return level.getBlockState(GlowPlants.pitcherBase(s, pos).below()).is(Blocks.FARMLAND);
        }
        return false;
    }

    /** A melon or pumpkin grown from a stem (a stem next to it points at it): not one that was placed. */
    private static boolean onStem(BlockGetter level, BlockPos pos, BlockState fruit) {
        Block stem = fruit.is(Blocks.MELON) ? Blocks.ATTACHED_MELON_STEM : Blocks.ATTACHED_PUMPKIN_STEM;
        for (Direction d : Direction.Plane.HORIZONTAL) {
            BlockState s = level.getBlockState(pos.relative(d));
            if (s.is(stem) && s.getValue(AttachedStemBlock.FACING) == d.getOpposite()) {
                return true;
            }
        }
        return false;
    }

    /**
     * Crops the ripe plant at `pos` and replants it. Returns what it gave (empty if it wasn't ripe).
     */
    public static List<ItemStack> harvest(ServerLevel level, BlockPos pos, Entity harvester) {
        List<ItemStack> out = new ArrayList<>();
        if (!isRipe(level, pos)) {
            return out;
        }
        BlockState s = level.getBlockState(pos);
        BlockPos at = pos;
        BlockState after;
        if (s.getBlock() instanceof CropBlock crop && !(GlowPlants.isGrownTorchflower(s))) {
            out.addAll(Block.getDrops(s, level, pos, null, harvester, ItemStack.EMPTY));
            takeOne(out, crop.getCloneItemStack(level, pos, s));   // the seed it replants with
            after = crop.getStateForAge(0);
            level.setBlock(pos, after, Block.UPDATE_ALL);
        } else if (s.is(Blocks.NETHER_WART)) {
            out.addAll(Block.getDrops(s, level, pos, null, harvester, ItemStack.EMPTY));
            takeOne(out, new ItemStack(Items.NETHER_WART));
            after = s.setValue(NetherWartBlock.AGE, 0);
            level.setBlock(pos, after, Block.UPDATE_ALL);
        } else if (s.is(Blocks.SWEET_BERRY_BUSH)) {
            boolean full = s.getValue(SweetBerryBushBlock.AGE) == 3;
            out.add(new ItemStack(Items.SWEET_BERRIES, 1 + level.random.nextInt(2) + (full ? 1 : 0)));
            after = s.setValue(SweetBerryBushBlock.AGE, 1);
            level.setBlock(pos, after, Block.UPDATE_CLIENTS);
        } else if (s.is(Blocks.MELON) || s.is(Blocks.PUMPKIN)) {
            out.addAll(Block.getDrops(s, level, pos, null, harvester, ItemStack.EMPTY));
            level.destroyBlock(pos, false, harvester);
            after = level.getBlockState(pos);
        } else if (GlowPlants.isGrownTorchflower(s)) {
            out.add(new ItemStack(Items.TORCHFLOWER));
            GlowPlants.replantYoung(level, pos, true);
            after = level.getBlockState(pos);
        } else {   // a grown pitcher plant: the plant itself, and a young crop in its place
            at = GlowPlants.pitcherBase(s, pos);
            out.add(new ItemStack(Items.PITCHER_PLANT));
            GlowPlants.replantYoung(level, at, false);
            after = level.getBlockState(at);
        }
        level.levelEvent(2001, at, Block.getId(s));   // the break particles
        level.playSound(null, at, s.getSoundType().getBreakSound(), SoundSource.BLOCKS, 0.7f, 0.9f);
        level.gameEvent(GameEvent.BLOCK_CHANGE, at, GameEvent.Context.of(harvester, after));
        out.removeIf(ItemStack::isEmpty);
        return out;
    }

    private static void takeOne(List<ItemStack> drops, ItemStack seed) {
        if (seed.isEmpty()) {
            return;
        }
        for (ItemStack d : drops) {
            if (ItemStack.isSameItem(d, seed) && !d.isEmpty()) {
                d.shrink(1);
                return;
            }
        }
    }

    /** The harvest sound for a mouthful (used by the Harvester). */
    public static void chompSound(ServerLevel level, BlockPos at) {
        level.playSound(null, at, SoundEvents.CROP_BREAK, SoundSource.BLOCKS, 0.6f, 0.8f);
    }
}
