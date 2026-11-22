package dev.lowpix.winterworks.bear;

import java.util.EnumSet;
import java.util.List;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import org.jetbrains.annotations.Nullable;

/**
 * Salmon dropped near a polar bear (docs/COLD_UPDATE.md section 3): it forgets the fight, lumbers over and eats it, one
 * fish at a time (each counts towards calming it). It never eats the salmon it gave away itself.
 */
public class EatDroppedSalmonGoal extends Goal {
    public static final int BITE_TICKS = 20;
    private final PathfinderMob mob;
    private final RemadePolarBear bear;
    @Nullable
    private ItemEntity food;
    private int timer, chew, search;

    public EatDroppedSalmonGoal(PathfinderMob mob) {
        this.mob = mob;
        this.bear = (RemadePolarBear) mob;
        setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
    }

    private boolean edible(ItemEntity it) {
        return it.isAlive() && !it.getItem().isEmpty() && BearFeature.isSalmon(it.getItem()) && it.getOwner() != mob;
    }

    @Override
    public boolean canUse() {
        // canUse only runs on every other tick (by entity id parity), so count calls rather than test tickCount
        if (--search > 0 || mob.isPassenger()) {
            return false;
        }
        search = 4;
        List<ItemEntity> items = mob.level().getEntitiesOfClass(ItemEntity.class, mob.getBoundingBox().inflate(10, 4, 10), this::edible);
        food = null;
        double best = Double.MAX_VALUE;
        for (ItemEntity it : items) {
            double d = mob.distanceToSqr(it);
            if (d < best) {
                best = d;
                food = it;
            }
        }
        return food != null;
    }

    @Override
    public boolean canContinueToUse() {
        return food != null && edible(food) && timer > 0;
    }

    @Override
    public void start() {
        timer = 200;
        chew = 0;
        mob.setTarget(null);   // food first
        mob.getNavigation().moveTo(food, 1.3);
    }

    @Override
    public void stop() {
        food = null;
        mob.getNavigation().stop();
    }

    @Override
    public boolean requiresUpdateEveryTick() {
        return true;
    }

    @Override
    public void tick() {
        timer--;
        if (food == null) {
            return;
        }
        mob.getLookControl().setLookAt(food, 30f, 30f);
        double reach = mob.getBbWidth() * 0.5 + 1.2;
        if (mob.distanceToSqr(food) < reach * reach) {
            mob.getNavigation().stop();
            if (--chew <= 0) {
                chew = BITE_TICKS;
                Player thrower = food.getOwner() instanceof Player p ? p : null;
                food.getItem().shrink(1);
                if (food.getItem().isEmpty()) {
                    food.discard();
                }
                bear.ww$eatSalmon(thrower);
                timer = Math.max(timer, BITE_TICKS + 2);
            }
        } else if (mob.getNavigation().isDone()) {
            mob.getNavigation().moveTo(food, 1.3);
        }
    }
}
