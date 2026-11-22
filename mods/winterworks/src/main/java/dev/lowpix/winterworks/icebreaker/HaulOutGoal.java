package dev.lowpix.winterworks.icebreaker;

import java.util.EnumSet;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import org.jetbrains.annotations.Nullable;

/**
 * After a long swim (or when night falls) an Icebreaker hauls out to rest (docs/FIXES_0_4.md): it finds the nearest
 * ice floe or shore at the water's edge, swims there, heaves itself up onto it and lies down (then it rests, or sleeps
 * at night, and soon wants the water again).
 */
class HaulOutGoal extends Goal {
    static final int RANGE = 16;
    private final IcebreakerEntity mob;
    @Nullable
    private BlockPos spot;
    private int timer;

    HaulOutGoal(IcebreakerEntity mob) {
        this.mob = mob;
        setFlags(EnumSet.of(Flag.MOVE));
    }

    @Override
    public boolean canUse() {
        if ((mob.tickCount + mob.getId()) % 10 != 0 || !mob.isInWater() || !mob.wantsToHaulOut()) {
            return false;
        }
        spot = find(mob.level(), mob.blockPosition());
        if (spot == null) {
            mob.noShoreNearby();
        }
        return spot != null;
    }

    /** A place to lie: firm ground (ice best, then snow, sand, gravel, stone...) right at the water's edge, open above. */
    @Nullable
    static BlockPos find(Level level, BlockPos from) {
        return BlockPos.findClosestMatch(from, RANGE, 4, p -> isShore(level, p)).map(BlockPos::immutable).orElse(null);
    }

    /** `p` is where it would lie: firm ground under it, room for its bulk, and water beside it. */
    static boolean isShore(Level level, BlockPos p) {
        BlockState below = level.getBlockState(p.below());
        if (!level.getFluidState(p.below()).isEmpty() || !below.isFaceSturdy(level, p.below(), Direction.UP)
                || !(below.is(BlockTags.ICE) || below.is(Blocks.SNOW_BLOCK) || below.is(BlockTags.SAND) || below.is(Blocks.GRAVEL)
                || below.is(BlockTags.DIRT) || below.is(BlockTags.BASE_STONE_OVERWORLD) || below.is(Blocks.SNOW))) {
            return false;
        }
        if (!level.getBlockState(p).getCollisionShape(level, p).isEmpty() || !level.getFluidState(p).isEmpty()
                || !level.getBlockState(p.above()).getCollisionShape(level, p.above()).isEmpty()) {
            return false;
        }
        for (Direction d : Direction.Plane.HORIZONTAL) {
            if (level.getFluidState(p.relative(d)).is(FluidTags.WATER) || level.getFluidState(p.below().relative(d)).is(FluidTags.WATER)) {
                return true;
            }
        }
        return false;
    }

    @Override
    public boolean canContinueToUse() {
        return spot != null && timer > 0 && mob.getTarget() == null && !mob.hasHauledOut(spot);
    }

    @Override
    public void start() {
        timer = 400;
        mob.getNavigation().moveTo(spot.getX() + 0.5, spot.getY(), spot.getZ() + 0.5, 1.0);
    }

    @Override
    public void tick() {
        timer--;
        if (spot != null && mob.getNavigation().isDone() && !mob.hasHauledOut(spot)) {
            if (mob.distanceToSqr(spot.getX() + 0.5, spot.getY(), spot.getZ() + 0.5) < 9.0) {
                mob.getMoveControl().setWantedPosition(spot.getX() + 0.5, spot.getY(), spot.getZ() + 0.5, 1.0);   // the last heave
            } else {
                mob.getNavigation().moveTo(spot.getX() + 0.5, spot.getY(), spot.getZ() + 0.5, 1.0);
            }
        }
    }

    @Override
    public void stop() {
        if (spot != null && mob.hasHauledOut(spot)) {
            mob.getNavigation().stop();
            mob.startResting();
        }
        spot = null;
    }
}
