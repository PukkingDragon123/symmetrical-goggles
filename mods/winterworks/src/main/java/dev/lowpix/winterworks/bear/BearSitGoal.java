package dev.lowpix.winterworks.bear;

import java.util.EnumSet;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.goal.Goal;

/** Calm polar bears sit down for a while (the `sit` loop), right after calming down and now and then afterwards. */
public class BearSitGoal extends Goal {
    private final PathfinderMob mob;
    private final RemadePolarBear bear;
    private int timer;

    public BearSitGoal(PathfinderMob mob) {
        this.mob = mob;
        this.bear = (RemadePolarBear) mob;
        setFlags(EnumSet.of(Flag.MOVE, Flag.JUMP));
    }

    private boolean canSit() {
        return bear.ww$isCalm() && !mob.isBaby() && mob.onGround() && !mob.isInWater() && !mob.isPassenger() && mob.getTarget() == null;
    }

    @Override
    public boolean canUse() {
        return canSit() && (bear.ww$takeSitRequest() || mob.getRandom().nextInt(400) == 0);
    }

    @Override
    public boolean canContinueToUse() {
        return timer > 0 && canSit();
    }

    @Override
    public void start() {
        timer = 300 + mob.getRandom().nextInt(600);
        mob.getNavigation().stop();
        bear.ww$setSitting(true);
    }

    @Override
    public void stop() {
        bear.ww$setSitting(false);
    }

    @Override
    public void tick() {
        timer--;
        mob.getNavigation().stop();
    }
}
