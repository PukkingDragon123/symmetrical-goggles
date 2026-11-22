package dev.lowpix.winterworks.bear;

import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.goal.TemptGoal;

/** Adult polar bears come closer to a player holding salmon (cubs keep following their mother). */
public class SalmonTemptGoal extends TemptGoal {
    public SalmonTemptGoal(PathfinderMob mob) {
        super(mob, 1.1, BearFeature::isSalmon, false);
    }

    @Override
    public boolean canUse() {
        return !mob.isBaby() && super.canUse();
    }
}
