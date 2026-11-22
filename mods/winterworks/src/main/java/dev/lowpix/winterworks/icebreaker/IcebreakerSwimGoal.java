package dev.lowpix.winterworks.icebreaker;

import java.util.EnumSet;
import net.minecraft.core.BlockPos;
import net.minecraft.tags.FluidTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.ai.behavior.BehaviorUtils;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * Swimming for the joy of it (docs/FIXES_0_4.md): in water an Icebreaker is always on the move. It alternates long
 * cruises just under the surface (where it porpoises: see IcebreakerEntity#tickWater) with deep dives to the bottom,
 * fast and smooth, one leg after another.
 */
class IcebreakerSwimGoal extends Goal {
    private final IcebreakerEntity mob;
    @Nullable
    private Vec3 target;
    private int timer;

    IcebreakerSwimGoal(IcebreakerEntity mob) {
        this.mob = mob;
        setFlags(EnumSet.of(Flag.MOVE));
    }

    @Override
    public boolean canUse() {
        if (!mob.isInWater() || mob.isAsleep() || mob.getRandom().nextInt(reducedTickDelay(8)) != 0) {
            return false;
        }
        target = pick();
        return target != null;
    }

    @Nullable
    private Vec3 pick() {
        RandomSource r = mob.getRandom();
        boolean dive = r.nextInt(3) == 0;
        Vec3 p = BehaviorUtils.getRandomSwimmablePos(mob, dive ? 12 : 18, dive ? 8 : 3);
        if (p == null) {
            return null;
        }
        Level level = mob.level();
        BlockPos.MutableBlockPos at = BlockPos.containing(p).mutable();
        if (dive) {   // down to just above the bottom
            while (at.getY() > level.getMinBuildHeight() && level.getFluidState(at.below()).is(FluidTags.WATER)) {
                at.move(0, -1, 0);
            }
        } else {      // up to just under the surface, where it can breathe and leap
            while (at.getY() < level.getMaxBuildHeight() && level.getFluidState(at.above()).is(FluidTags.WATER)) {
                at.move(0, 1, 0);
            }
            at.move(0, -1, 0);
            if (!level.getFluidState(at).is(FluidTags.WATER)) {
                at.move(0, 1, 0);
            }
        }
        return Vec3.atBottomCenterOf(at);
    }

    @Override
    public boolean canContinueToUse() {
        return timer > 0 && mob.isInWater() && !mob.isAsleep() && !mob.getNavigation().isDone();
    }

    @Override
    public void start() {
        timer = 200;
        mob.getNavigation().moveTo(target.x, target.y, target.z, mob.isBaby() ? 1.1 : 1.25);
    }

    @Override
    public void tick() {
        timer--;
    }

    @Override
    public void stop() {
        target = null;
    }
}
