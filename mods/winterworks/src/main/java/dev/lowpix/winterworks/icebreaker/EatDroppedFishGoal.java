package dev.lowpix.winterworks.icebreaker;

import java.util.EnumSet;
import java.util.List;
import net.minecraft.tags.ItemTags;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.item.ItemEntity;
import org.jetbrains.annotations.Nullable;

/** Fish dropped on the ground calms any Icebreaker that smells it: it waddles over, gobbles it and forgets its anger. */
class EatDroppedFishGoal extends Goal {
    private final IcebreakerEntity mob;
    @Nullable
    private ItemEntity fish;
    private int timer;

    EatDroppedFishGoal(IcebreakerEntity mob) {
        this.mob = mob;
        setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
    }

    @Override
    public boolean canUse() {
        // + id: Mob only polls goals on ticks where tickCount + id is even, so an odd id would never see tickCount % 8 == 0
        if ((mob.tickCount + mob.getId()) % 8 != 0) {
            return false;
        }
        List<ItemEntity> items = mob.level().getEntitiesOfClass(ItemEntity.class, mob.getBoundingBox().inflate(10, 4, 10),
                it -> it.isAlive() && it.getItem().is(ItemTags.FISHES));
        fish = items.isEmpty() ? null : items.get(0);
        return fish != null;
    }

    @Override
    public boolean canContinueToUse() {
        return fish != null && fish.isAlive() && timer > 0;
    }

    @Override
    public void start() {
        timer = 160;
        mob.setTarget(null);   // food first
        mob.getNavigation().moveTo(fish, 1.3);
    }

    @Override
    public void tick() {
        timer--;
        if (fish == null) {
            return;
        }
        mob.getLookControl().setLookAt(fish, 30f, 30f);
        if (mob.distanceToSqr(fish) < 2.2 * 2.2) {
            mob.eatFish(fish.getItem());
            if (fish.getItem().isEmpty()) {
                fish.discard();
            }
            timer = 0;
        } else if (mob.getNavigation().isDone()) {
            mob.getNavigation().moveTo(fish, 1.3);
        }
    }
}
