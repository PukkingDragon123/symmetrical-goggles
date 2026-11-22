package dev.lowpix.winterworks.harvester;

import dev.lowpix.winterworks.mixin.harvester.BlockStateLightAccessor;
import dev.lowpix.winterworks.registry.WWParticles;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.DoublePlantBlock;
import net.minecraft.world.level.block.PitcherCropBlock;
import net.minecraft.world.level.block.TorchflowerCropBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.phys.AABB;
import org.jetbrains.annotations.Nullable;

/**
 * Torchflowers and pitcher plants (docs/FIXES_0_4.md "Torchflowers, pitcher plants, mosquitoes and sniffers"). They keep
 * vanilla's textures and glow: every growth stage gives a little more light (a grown torchflower 15, a pitcher plant 12)
 * and the client draws their luminous parts full-bright (client.harvester.GlowPlantModel). A grown one used with an
 * empty hand is picked like sweet berries: 1-3 torchflower seeds or pitcher pods drop and it goes back to a young crop.
 * Pitcher plants give off a sweet scent (bees count them as flowers through the #minecraft:flowers tag, mosquitoes
 * hang around them: amber.MosquitoEntity's PitcherGoal); torchflowers set mosquitoes alight.
 */
public final class GlowPlants {
    /** Light by torchflower crop age (0, 1), then the grown torchflower. */
    public static final int[] TORCHFLOWER_LIGHT = {5, 10, 15};
    /** Light by pitcher crop age (0..4); the grown pitcher plant shines like a grown crop. */
    public static final int[] PITCHER_LIGHT = {2, 4, 7, 10, 12};
    public static final int TORCHFLOWER_FULL = 15, PITCHER_FULL = 12;

    private GlowPlants() {}

    // --------------------------------------------------------------------------------------- light

    /** Gives the vanilla plants their light levels (once, at mod init; the states are shared by client and server). */
    public static void initLight() {
        for (BlockState s : Blocks.TORCHFLOWER_CROP.getStateDefinition().getPossibleStates()) {
            light(s, TORCHFLOWER_LIGHT[s.getValue(TorchflowerCropBlock.AGE)]);
        }
        light(Blocks.TORCHFLOWER.defaultBlockState(), TORCHFLOWER_FULL);
        light(Blocks.POTTED_TORCHFLOWER.defaultBlockState(), TORCHFLOWER_FULL);
        for (BlockState s : Blocks.PITCHER_CROP.getStateDefinition().getPossibleStates()) {
            light(s, PITCHER_LIGHT[s.getValue(PitcherCropBlock.AGE)]);
        }
        for (BlockState s : Blocks.PITCHER_PLANT.getStateDefinition().getPossibleStates()) {
            light(s, PITCHER_FULL);
        }
    }

    private static void light(BlockState s, int level) {
        ((BlockStateLightAccessor) s).ww$setLightEmission(level);
    }

    // --------------------------------------------------------------------------------------- what is what

    /** A torchflower in any form: planted, potted or the crop. */
    public static boolean isTorchflower(BlockState s) {
        return s.is(Blocks.TORCHFLOWER) || s.is(Blocks.POTTED_TORCHFLOWER) || s.is(Blocks.TORCHFLOWER_CROP);
    }

    public static boolean isPitcher(BlockState s) {
        return s.is(Blocks.PITCHER_PLANT) || s.is(Blocks.PITCHER_CROP);
    }

    /** Is there a torchflower whose block touches `box`? */
    public static boolean torchflowerIn(BlockGetter level, AABB box) {
        BlockPos lo = BlockPos.containing(box.minX, box.minY, box.minZ), hi = BlockPos.containing(box.maxX, box.maxY, box.maxZ);
        for (BlockPos p : BlockPos.betweenClosed(lo, hi)) {
            if (isTorchflower(level.getBlockState(p))) {
                return true;
            }
        }
        return false;
    }

    /** The nearest torchflower within `radius` of `c`, or null. */
    @Nullable
    public static BlockPos nearestTorchflower(BlockGetter level, BlockPos c, int radius) {
        BlockPos best = null;
        double bestD = Double.MAX_VALUE;
        for (BlockPos p : BlockPos.betweenClosed(c.offset(-radius, -radius, -radius), c.offset(radius, radius, radius))) {
            if (isTorchflower(level.getBlockState(p))) {
                double d = p.distSqr(c);
                if (d < bestD) {
                    bestD = d;
                    best = p.immutable();
                }
            }
        }
        return best;
    }

    /** The lower block of a pitcher plant or crop (the one standing on the soil). */
    public static BlockPos pitcherBase(BlockState s, BlockPos pos) {
        return s.hasProperty(DoublePlantBlock.HALF) && s.getValue(DoublePlantBlock.HALF) == DoubleBlockHalf.UPPER ? pos.below() : pos;
    }

    /** A grown torchflower (the flower itself, not potted). */
    public static boolean isGrownTorchflower(BlockState s) {
        return s.is(Blocks.TORCHFLOWER);
    }

    /** A grown pitcher plant: the plant block, or a crop at its last stage (either half). */
    public static boolean isGrownPitcher(BlockState s) {
        return s.is(Blocks.PITCHER_PLANT) || (s.is(Blocks.PITCHER_CROP) && s.getValue(PitcherCropBlock.AGE) == PitcherCropBlock.MAX_AGE);
    }

    // --------------------------------------------------------------------------------------- picking

    /** Can this plant go back to a young crop here (farmland under it, or soil a hoe would till)? */
    public static boolean canReplant(BlockGetter level, BlockPos base) {
        BlockState soil = level.getBlockState(base.below());
        return soil.is(Blocks.FARMLAND) || tillable(soil);
    }

    private static boolean tillable(BlockState soil) {
        return soil.is(Blocks.DIRT) || soil.is(Blocks.GRASS_BLOCK) || soil.is(Blocks.DIRT_PATH);
    }

    /** A grown torchflower or pitcher plant that can be picked (used with an empty hand). */
    public static boolean canPick(BlockGetter level, BlockPos pos, BlockState s) {
        if (isGrownTorchflower(s)) {
            return canReplant(level, pos);
        }
        return isGrownPitcher(s) && canReplant(level, pitcherBase(s, pos));
    }

    /**
     * Picks a grown torchflower or pitcher plant: 1-3 torchflower seeds or pitcher pods pop out and the plant goes back
     * to a young crop (tilling the soil under it if it was planted on dirt or grass). Returns false if it can't.
     */
    public static boolean pick(ServerLevel level, BlockPos pos, BlockState s, @Nullable Entity picker) {
        if (!canPick(level, pos, s)) {
            return false;
        }
        boolean torch = isGrownTorchflower(s);
        BlockPos base = torch ? pos : pitcherBase(s, pos);
        RandomSource r = level.random;
        ItemStack drop = new ItemStack(torch ? Items.TORCHFLOWER_SEEDS : Items.PITCHER_POD, 1 + r.nextInt(3));
        replantYoung(level, base, torch);
        Block.popResource(level, base.above(torch ? 0 : 1), drop);
        level.playSound(null, base, SoundEvents.SWEET_BERRY_BUSH_PICK_BERRIES, SoundSource.BLOCKS, 1.0f, 0.8f + r.nextFloat() * 0.4f);
        level.gameEvent(GameEvent.BLOCK_CHANGE, base, GameEvent.Context.of(picker, level.getBlockState(base)));
        return true;
    }

    /**
     * Turns the grown plant standing on `base` back into a young crop (age 0): a torchflower into a torchflower crop, a
     * pitcher plant (both halves) into a pitcher crop. Dirt or grass under it becomes farmland.
     */
    public static void replantYoung(ServerLevel level, BlockPos base, boolean torchflower) {
        BlockState soil = level.getBlockState(base.below());
        if (tillable(soil)) {
            level.setBlockAndUpdate(base.below(), Blocks.FARMLAND.defaultBlockState());
        }
        if (!torchflower) {
            BlockPos up = base.above();
            if (isPitcher(level.getBlockState(up))) {   // the top half goes quietly, without drops
                level.setBlock(up, Blocks.AIR.defaultBlockState(), Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE | Block.UPDATE_SUPPRESS_DROPS);
            }
        }
        BlockState young = torchflower ? Blocks.TORCHFLOWER_CROP.defaultBlockState()
                : Blocks.PITCHER_CROP.defaultBlockState().setValue(PitcherCropBlock.AGE, 0).setValue(PitcherCropBlock.HALF, DoubleBlockHalf.LOWER);
        level.setBlock(base, young, Block.UPDATE_ALL);
    }

    // --------------------------------------------------------------------------------------- particles (client)

    /** Pitcher plants give off a sweet golden-pink scent; torchflowers send up a spark now and then. */
    public static void animateTick(BlockState s, Level level, BlockPos pos, RandomSource r) {
        if (s.is(Blocks.PITCHER_PLANT) || s.is(Blocks.PITCHER_CROP)) {
            boolean top = s.getValue(DoublePlantBlock.HALF) == DoubleBlockHalf.UPPER;
            int age = s.is(Blocks.PITCHER_CROP) ? s.getValue(PitcherCropBlock.AGE) : PitcherCropBlock.MAX_AGE;
            // the scent rises from the pitcher's mouth: the top half once it has one, the young crop's bud before that
            if (age == 0 || (age >= 3) != top || r.nextInt(age >= 3 ? 3 : 8) != 0) {
                return;
            }
            double y = pos.getY() + (top ? 0.75 : 0.55) + r.nextDouble() * 0.2;
            level.addParticle(WWParticles.SWEET_SCENT, pos.getX() + 0.3 + r.nextDouble() * 0.4, y, pos.getZ() + 0.3 + r.nextDouble() * 0.4,
                    (r.nextDouble() - 0.5) * 0.01, 0.012 + r.nextDouble() * 0.01, (r.nextDouble() - 0.5) * 0.01);
        } else if (s.is(Blocks.TORCHFLOWER) && r.nextInt(6) == 0) {
            level.addParticle(ParticleTypes.SMALL_FLAME, pos.getX() + 0.5 + (r.nextDouble() - 0.5) * 0.15, pos.getY() + 0.85,
                    pos.getZ() + 0.5 + (r.nextDouble() - 0.5) * 0.15, 0, 0.01, 0);
        } else if (s.is(Blocks.POTTED_TORCHFLOWER) && r.nextInt(8) == 0) {
            level.addParticle(ParticleTypes.SMALL_FLAME, pos.getX() + 0.5 + (r.nextDouble() - 0.5) * 0.12, pos.getY() + 0.95,
                    pos.getZ() + 0.5 + (r.nextDouble() - 0.5) * 0.12, 0, 0.008, 0);
        }
    }
}
