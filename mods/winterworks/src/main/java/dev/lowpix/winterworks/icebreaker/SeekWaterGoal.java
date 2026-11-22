package dev.lowpix.winterworks.icebreaker;

import java.util.EnumSet;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

/**
 * An Icebreaker on land soon wants the water again (docs/FIXES_0_4.md): once it has rested (or straight away if it
 * never meant to stay), it waddles to the nearest open water within {@value #RANGE} blocks and slips in.
 */
class SeekWaterGoal extends Goal {
    static final int RANGE = 20;
    private final IcebreakerEntity mob;
    @Nullable
    private BlockPos water;
    private int timer;

    SeekWaterGoal(IcebreakerEntity mob) {
        this.mob = mob;
        setFlags(EnumSet.of(Flag.MOVE));
    }

    @Override
    public boolean canUse() {
        // + id: Mob only polls goals on ticks where tickCount + id is even
        if ((mob.tickCount + mob.getId()) % 10 != 0 || !mob.wantsWater()) {
            return false;
        }
        water = find(mob.level(), mob.blockPosition()).orElse(null);
        if (water == null) {
            mob.noWaterNearby();
        }
        return water != null;
    }

    /** The nearest water you could swim in: a water block with water or air above it, at most a few blocks down. */
    static Optional<BlockPos> find(Level level, BlockPos from) {
        return BlockPos.findClosestMatch(from.below(2), RANGE, 4, p -> level.getFluidState(p).is(FluidTags.WATER)
                && (level.getFluidState(p.above()).is(FluidTags.WATER) || level.getBlockState(p.above()).isAir())
                && level.getFluidState(p.below()).is(FluidTags.WATER)).map(BlockPos::immutable);
    }

    @Override
    public boolean canContinueToUse() {
        return water != null && timer > 0 && !mob.isInWater() && !mob.isAsleep() && mob.getTarget() == null;
    }

    @Override
    public void start() {
        timer = 300;
        mob.getNavigation().moveTo(water.getX() + 0.5, water.getY() + 0.5, water.getZ() + 0.5, 1.2);
    }

    @Override
    public void tick() {
        timer--;
        if (water != null && mob.getNavigation().isDone()) {
            if (mob.distanceToSqr(water.getX() + 0.5, water.getY(), water.getZ() + 0.5) < 6.0) {
                // at the edge: flop in
                mob.getMoveControl().setWantedPosition(water.getX() + 0.5, water.getY() + 0.5, water.getZ() + 0.5, 1.2);
            } else {
                mob.getNavigation().moveTo(water.getX() + 0.5, water.getY() + 0.5, water.getZ() + 0.5, 1.2);
            }
        }
    }

    @Override
    public void stop() {
        water = null;
    }
}
