package dev.lowpix.winterworks.icebreaker;

import java.util.EnumSet;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/** Now and then an adult with a horn finds a frozen pond, builds up speed and smashes a hole in the ice to fish. */
class BreakIceGoal extends Goal {
    private final IcebreakerEntity mob;
    @Nullable
    private BlockPos ice;
    private int timer;

    BreakIceGoal(IcebreakerEntity mob) {
        this.mob = mob;
        setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
    }

    @Override
    public boolean canUse() {
        if (mob.isBaby() || !mob.hasHorn() || mob.getTarget() != null || mob.iceCooldown > 0 || mob.isInWater()
                || mob.getRandom().nextInt(120) != 0 || !mob.level().getGameRules().getBoolean(GameRules.RULE_MOBGRIEFING)) {
            return false;
        }
        ice = findIce();
        return ice != null;
    }

    @Nullable
    private BlockPos findIce() {
        BlockPos base = mob.blockPosition();
        BlockPos best = null;
        double bestD = Double.MAX_VALUE;
        for (BlockPos p : BlockPos.betweenClosed(base.offset(-12, -3, -12), base.offset(12, 2, 12))) {
            if (mob.level().getBlockState(p).is(Blocks.ICE) && mob.level().getBlockState(p.above()).isAir()
                    && mob.level().getBlockState(p.below()).is(Blocks.WATER)) {
                double d = p.distSqr(base);
                if (d > 9 && d < bestD) {
                    bestD = d;
                    best = p.immutable();
                }
            }
        }
        return best;
    }

    @Override
    public boolean canContinueToUse() {
        return ice != null && timer > 0 && mob.getTarget() == null;
    }

    @Override
    public void start() {
        timer = 200;
        mob.getNavigation().moveTo(ice.getX() + 0.5, ice.getY() + 1, ice.getZ() + 0.5, 1.0);
    }

    @Override
    public void stop() {
        mob.setCharging(false);
        mob.getNavigation().stop();
        ice = null;
        mob.iceCooldown = 20 * 40 + mob.getRandom().nextInt(20 * 60);
    }

    @Override
    public void tick() {
        timer--;
        if (ice == null) {
            return;
        }
        double d = mob.distanceToSqr(Vec3.atBottomCenterOf(ice.above()));
        mob.getLookControl().setLookAt(ice.getX() + 0.5, ice.getY(), ice.getZ() + 0.5);
        if (d < 7 * 7 && !mob.isCharging()) {
            mob.setCharging(true);
            mob.getNavigation().moveTo(ice.getX() + 0.5, ice.getY() + 1, ice.getZ() + 0.5, 2.1);
        }
        if (d < 2.6 * 2.6) {
            if (mob.smashIce(ice, 1) > 0) {
                mob.playSound(dev.lowpix.winterworks.registry.WWSounds.ICEBREAKER_ROAR, 1.2f, 1.2f);
            }
            timer = 0;
        } else if (mob.getNavigation().isDone()) {
            mob.getNavigation().moveTo(ice.getX() + 0.5, ice.getY() + 1, ice.getZ() + 0.5, mob.isCharging() ? 2.1 : 1.0);
        }
    }
}
