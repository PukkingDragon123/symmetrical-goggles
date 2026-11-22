package dev.lowpix.winterworks.soulbull;

import dev.lowpix.winterworks.registry.WWSounds;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CampfireBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.gameevent.GameEvent;
import org.jetbrains.annotations.Nullable;

/**
 * What a Soul Bull can feed on (docs/FIXES_0_4.md "The Soul Bull"): soul torches, soul lanterns and soul campfires used on
 * it (big refills), and the same blocks near it, plus soul fire, which it drains (soul fire gives a little; torches and
 * lanterns break, campfires go out).
 */
public final class SoulSources {
    /** Soul energy (= health) per source. */
    public static final float FIRE = 4f, TORCH = 10f, LANTERN = 14f, CAMPFIRE = 20f;

    private SoulSources() {}

    /** Soul energy an item gives when used on a bull; 0 if it isn't a soul source. */
    public static float itemRefill(ItemStack stack) {
        if (stack.is(Items.SOUL_TORCH)) {
            return TORCH;
        }
        if (stack.is(Items.SOUL_LANTERN)) {
            return LANTERN;
        }
        if (stack.is(Items.SOUL_CAMPFIRE)) {
            return CAMPFIRE;
        }
        return 0f;
    }

    /** Soul energy a block holds for a draining bull; 0 if there's nothing to drain. */
    public static float blockRefill(BlockState s) {
        if (s.is(Blocks.SOUL_FIRE)) {
            return FIRE;
        }
        if (s.is(Blocks.SOUL_TORCH) || s.is(Blocks.SOUL_WALL_TORCH)) {
            return TORCH;
        }
        if (s.is(Blocks.SOUL_LANTERN)) {
            return LANTERN;
        }
        if (s.is(Blocks.SOUL_CAMPFIRE) && s.getValue(CampfireBlock.LIT)) {
            return CAMPFIRE;
        }
        return 0f;
    }

    /** The nearest drainable soul source within `r` blocks (and `ry` up or down), or null. */
    @Nullable
    public static BlockPos nearest(BlockGetter level, BlockPos centre, int r, int ry) {
        BlockPos best = null;
        double bestD = Double.MAX_VALUE;
        for (BlockPos p : BlockPos.betweenClosed(centre.offset(-r, -ry, -r), centre.offset(r, ry, r))) {
            if (blockRefill(level.getBlockState(p)) > 0f) {
                double d = p.distSqr(centre);
                if (d < bestD && d <= (double) r * r + ry * ry) {
                    bestD = d;
                    best = p.immutable();
                }
            }
        }
        return best;
    }

    /** Sucks the souls out of a source: soul fire goes out, torches and lanterns break, campfires go out. Returns the refill. */
    public static float drain(ServerLevel level, BlockPos pos) {
        BlockState s = level.getBlockState(pos);
        float refill = blockRefill(s);
        if (refill <= 0f) {
            return 0f;
        }
        if (s.is(Blocks.SOUL_FIRE)) {
            level.removeBlock(pos, false);
            level.playSound(null, pos, SoundEvents.FIRE_EXTINGUISH, SoundSource.BLOCKS, 0.6f, 1.4f);
        } else if (s.is(Blocks.SOUL_CAMPFIRE)) {
            CampfireBlock.dowse(null, level, pos, s);
            level.setBlock(pos, s.setValue(CampfireBlock.LIT, false), Block.UPDATE_ALL);
            level.playSound(null, pos, SoundEvents.GENERIC_EXTINGUISH_FIRE, SoundSource.BLOCKS, 0.8f, 0.8f);
            level.gameEvent(null, GameEvent.BLOCK_CHANGE, pos);
        } else {   // soul torches and lanterns crumble
            level.destroyBlock(pos, false);
        }
        level.sendParticles(ParticleTypes.SOUL, pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5, 8, 0.25, 0.25, 0.25, 0.02);
        level.playSound(null, pos, WWSounds.SOUL_BULL_DRAIN, SoundSource.NEUTRAL, 0.6f, 1.6f);
        return refill;
    }
}
