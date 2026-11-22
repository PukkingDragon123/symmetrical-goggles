package dev.lowpix.winterworks.icebreaker;

import java.util.EnumSet;
import net.minecraft.world.entity.ai.goal.Goal;

/**
 * Sleep (docs/FIXES_0_4.md): hauled out on the ice or the shore, an Icebreaker sleeps flat on its belly, mostly at
 * night (now and then a nap while it rests by day), and only with no player near. What wakes it (being hurt, a player
 * coming close, a threat to its cubs, fish dropped nearby, getting wet) is in IcebreakerEntity#tickSleep; this goal
 * also ends the sleep in the morning or when the nap is over.
 */
class IcebreakerSleepGoal extends Goal {
    private final IcebreakerEntity mob;
    private int nap;

    IcebreakerSleepGoal(IcebreakerEntity mob) {
        this.mob = mob;
        setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK, Flag.JUMP));
    }

    @Override
    public boolean canUse() {
        if (mob.isAsleep()) {
            return true;   // put to sleep some other way: hold still for it
        }
        if ((mob.tickCount + mob.getId()) % 20 != 0 || mob.tickCount < 100 || !mob.canSettleDown()) {
            return false;
        }
        boolean night = mob.level().isNight();
        if (!(night ? mob.getRandom().nextInt(3) == 0 : mob.isResting() && mob.getRandom().nextInt(30) == 0)) {
            return false;
        }
        return mob.level().getNearestPlayer(mob, 8.0) == null && !mob.foodNear();
    }

    @Override
    public boolean canContinueToUse() {
        return mob.isAsleep() && (mob.level().isNight() || nap > 0);
    }

    @Override
    public void start() {
        nap = mob.level().isNight() ? 0 : 400 + mob.getRandom().nextInt(600);
        mob.getNavigation().stop();
        mob.fallAsleep();
    }

    @Override
    public void tick() {
        if (nap > 0) {
            nap--;
        }
    }

    @Override
    public void stop() {
        mob.wakeUp();
    }
}
