package dev.lowpix.winterworks.golem;

import java.util.EnumSet;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * The Miner shard's pickaxe arm: when there is nothing to fight, it digs natural ores (and stone while its owner holds
 * a pickaxe) around its owner, one block per swing. What it may dig is {@link GolemFeature#canMine}.
 */
public class GolemMineGoal extends Goal {
    static final double REACH = 3.6;
    static final int SWING = 16, HIT_AT = 10;
    private final PotGolemEntity golem;
    @Nullable private BlockPos target;
    private int cooldown, swing, giveUp, repath;

    public GolemMineGoal(PotGolemEntity golem) {
        this.golem = golem;
        setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
    }

    @Override
    public boolean canUse() {
        if (golem.shard() != PotGolemEntity.Shard.MINER || golem.getTarget() != null || golem.isBusy() || golem.isDazed()) {
            return false;
        }
        if (cooldown > 0) {
            cooldown--;
            return false;
        }
        cooldown = 20;
        Player owner = golem.ownerPlayer();
        if (owner == null || owner.isSpectator() || golem.distanceToSqr(owner) > 16 * 16) {
            return false;
        }
        target = GolemFeature.findMineable(golem.level(), owner, golem);
        return target != null;
    }

    @Override
    public boolean canContinueToUse() {
        return target != null && giveUp > 0 && golem.shard() == PotGolemEntity.Shard.MINER && golem.getTarget() == null
                && (swing > 0 || GolemFeature.canMine(golem.level(), target, golem.ownerPlayer(), golem));
    }

    @Override
    public void start() {
        giveUp = 200;
        swing = 0;
        repath = 0;
    }

    @Override
    public void stop() {
        target = null;
        swing = 0;
        golem.getNavigation().stop();
    }

    @Override
    public boolean requiresUpdateEveryTick() {
        return true;
    }

    @Override
    public void tick() {
        if (target == null) {
            return;
        }
        giveUp--;
        Vec3 c = Vec3.atCenterOf(target);
        golem.getLookControl().setLookAt(c.x, c.y, c.z);
        if (swing > 0) {
            if (++swing == HIT_AT && golem.level() instanceof ServerLevel sl) {
                GolemFeature.mine(sl, target, golem);
            }
            if (swing >= SWING) {
                target = null;   // done: look for the next one soon
                cooldown = 4;
            }
            return;
        }
        if (golem.position().add(0, 1.0, 0).distanceToSqr(c) <= REACH * REACH) {
            golem.getNavigation().stop();
            swing = 1;
            golem.swingPickaxe();
        } else if (--repath <= 0) {
            repath = 20;
            BlockPos stand = openSide(target);
            golem.getNavigation().moveTo(stand.getX() + 0.5, stand.getY(), stand.getZ() + 0.5, 1.0);
        }
    }

    /** Walk to the open face of the block (the side the golem can stand at). */
    private BlockPos openSide(BlockPos p) {
        var level = golem.level();
        for (Direction d : Direction.Plane.HORIZONTAL) {
            BlockPos n = p.relative(d);
            if (level.getBlockState(n).getCollisionShape(level, n).isEmpty()) {
                return n;
            }
        }
        return p.above();
    }
}
