package dev.lowpix.winterworks.icebreaker;

import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.animal.AbstractFish;
import net.minecraft.world.entity.animal.Cod;
import net.minecraft.world.entity.animal.Salmon;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * The hunt (docs/FIXES_0_4.md): a hungry Icebreaker (every couple of minutes) goes after the salmon or cod within
 * {@value #RANGE} blocks, violently: it chases it fast underwater, lunges, bites, shakes it, and eats it (the eat clip).
 * The kill itself is in IcebreakerEntity (#lungeAt, #biteCatch, #finishMeal), so tests and other goals can use it.
 */
class HuntFishGoal extends Goal {
    static final int RANGE = 16;
    /** Chase speed modifier: far faster than a cruise. */
    static final double CHASE = 2.0;
    private static final int SHAKE_TICKS = 12, EAT_TICKS = 24;
    private final IcebreakerEntity mob;
    @Nullable
    private AbstractFish prey;
    private int phase, timer;

    HuntFishGoal(IcebreakerEntity mob) {
        this.mob = mob;
        setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
    }

    static boolean isPrey(AbstractFish f) {
        return (f instanceof Salmon || f instanceof Cod) && f.isAlive() && f.isInWater();
    }

    @Override
    public boolean canUse() {
        if (!mob.isHungry() || mob.isBaby() || mob.isAsleep() || mob.getTarget() != null || (mob.tickCount + mob.getId()) % 6 != 0) {
            return false;
        }
        List<AbstractFish> fish = mob.level().getEntitiesOfClass(AbstractFish.class, mob.getBoundingBox().inflate(RANGE, 8, RANGE),
                f -> isPrey(f) && f.distanceToSqr(mob) < RANGE * RANGE);
        prey = fish.stream().min(Comparator.comparingDouble(f -> f.distanceToSqr(mob))).orElse(null);
        return prey != null;
    }

    @Override
    public boolean canContinueToUse() {
        if (phase > 0) {
            return timer > 0 || phase == 1;
        }
        return prey != null && isPrey(prey) && timer > 0 && mob.getTarget() == null && prey.distanceToSqr(mob) < 24 * 24;
    }

    @Override
    public boolean requiresUpdateEveryTick() {
        return true;
    }

    @Override
    public void start() {
        phase = 0;
        timer = 400;
        mob.getNavigation().moveTo(prey, CHASE);
    }

    @Override
    public void tick() {
        timer--;
        switch (phase) {
            case 0 -> {   // the chase
                if (prey == null) {
                    return;
                }
                mob.getLookControl().setLookAt(prey, 30f, 30f);
                if (timer % 4 == 0 || mob.getNavigation().isDone()) {
                    mob.getNavigation().moveTo(prey, CHASE);
                }
                double d2 = mob.distanceToSqr(prey);
                if (mob.isInWater() && d2 < 5.0 * 5.0 && d2 > 1.5 * 1.5) {
                    mob.lungeAt(prey);
                }
                if (mob.getBoundingBox().inflate(0.7).intersects(prey.getBoundingBox())) {
                    mob.biteCatch(prey);
                    prey = null;
                    phase = 1;
                    timer = SHAKE_TICKS;
                    mob.getNavigation().stop();
                }
            }
            case 1 -> {   // it shakes the catch, then eats it
                mob.setDeltaMovement(mob.getDeltaMovement().multiply(0.7, 0.9, 0.7));
                if (timer <= 0) {
                    phase = 2;
                    timer = EAT_TICKS;
                    mob.startEating();
                }
            }
            default -> mob.setDeltaMovement(mob.getDeltaMovement().multiply(0.7, 0.9, 0.7));
        }
    }

    @Override
    public void stop() {
        if (phase >= 1) {
            mob.finishMeal();
        }
        prey = null;
        phase = 0;
    }

    /** Where to lunge: just ahead of the fish (it keeps swimming). */
    static Vec3 lead(AbstractFish f) {
        return f.position().add(f.getDeltaMovement().scale(3.0)).add(0, f.getBbHeight() * 0.5, 0);
    }
}
