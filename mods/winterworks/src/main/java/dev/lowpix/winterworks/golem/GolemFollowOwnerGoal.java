package dev.lowpix.winterworks.golem;

import java.util.EnumSet;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.pathfinder.PathType;
import org.jetbrains.annotations.Nullable;

/**
 * The Pot Golem follows its builder: walks after them past 10 blocks, stops within 4, and catches up by teleporting
 * when it falls more than 24 blocks behind. While fighting it only comes back when the owner is over 20 blocks away.
 */
public class GolemFollowOwnerGoal extends Goal {
    static final double START = 10, STOP = 4, FIGHT_LEASH = 20, TELEPORT = 24;
    private final PotGolemEntity golem;
    @Nullable private Player owner;
    private int recalc;
    private float oldWaterCost;

    public GolemFollowOwnerGoal(PotGolemEntity golem) {
        this.golem = golem;
        setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
    }

    @Override
    public boolean canUse() {
        Player o = golem.ownerPlayer();
        if (o == null || o.isSpectator() || golem.isPassenger() || golem.isLeashed()) {
            return false;
        }
        double d = golem.distanceToSqr(o);
        double start = golem.getTarget() == null ? START : FIGHT_LEASH;
        if (d < start * start) {
            return false;
        }
        owner = o;
        return true;
    }

    @Override
    public boolean canContinueToUse() {
        if (owner == null || !owner.isAlive() || owner.isSpectator() || golem.getNavigation().isDone() && golem.distanceToSqr(owner) < TELEPORT * TELEPORT) {
            return false;
        }
        double d = golem.distanceToSqr(owner);
        double stop = golem.getTarget() == null ? STOP : FIGHT_LEASH * 0.6;
        return d > stop * stop;
    }

    @Override
    public void start() {
        recalc = 0;
        oldWaterCost = golem.getPathfindingMalus(PathType.WATER);
        golem.setPathfindingMalus(PathType.WATER, 0f);
    }

    @Override
    public void stop() {
        owner = null;
        golem.getNavigation().stop();
        golem.setPathfindingMalus(PathType.WATER, oldWaterCost);
    }

    @Override
    public void tick() {
        if (owner == null) {
            return;
        }
        golem.getLookControl().setLookAt(owner, 10f, golem.getMaxHeadXRot());
        if (--recalc > 0) {
            return;
        }
        recalc = adjustedTickDelay(10);
        if (golem.distanceToSqr(owner) >= TELEPORT * TELEPORT) {
            teleportNear(owner);
        } else {
            golem.getNavigation().moveTo(owner, 1.1);
        }
    }

    /** Like a tamed wolf: a free spot with ground under it a few blocks from the owner. */
    private void teleportNear(Player o) {
        BlockPos at = o.blockPosition();
        for (int i = 0; i < 12; i++) {
            int dx = golem.getRandom().nextIntBetweenInclusive(-3, 3);
            int dz = golem.getRandom().nextIntBetweenInclusive(-3, 3);
            if (Math.abs(dx) < 2 && Math.abs(dz) < 2) {
                continue;
            }
            for (int dy = 1; dy >= -1; dy--) {
                BlockPos p = at.offset(dx, dy, dz);
                if (canStandAt(p)) {
                    golem.moveTo(p.getX() + 0.5, p.getY(), p.getZ() + 0.5, golem.getYRot(), golem.getXRot());
                    golem.getNavigation().stop();
                    return;
                }
            }
        }
    }

    private boolean canStandAt(BlockPos p) {
        var level = golem.level();
        if (!level.getBlockState(p.below()).isFaceSturdy(level, p.below(), net.minecraft.core.Direction.UP)) {
            return false;
        }
        var box = golem.getBoundingBox().move(p.getX() + 0.5 - golem.getX(), p.getY() - golem.getY(), p.getZ() + 0.5 - golem.getZ());
        return level.noCollision(golem, box) && !level.containsAnyLiquid(box);
    }
}
