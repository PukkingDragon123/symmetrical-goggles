package dev.lowpix.winterworks.soulbull;

import java.util.EnumSet;
import net.minecraft.world.entity.EntitySelector;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;

/**
 * A wild Soul Bull's fight: it closes in on its target at a run, and from {@link SoulBull#RAM_RANGE} blocks (with a
 * clear line) it rams; what the horns catch is pinned ({@link SoulBull} does the ram and the pin). Between rams it
 * keeps its distance, pawing and snorting, until the ram is ready again.
 */
public class SoulBullRamGoal extends Goal {
    private final SoulBull bull;
    private int repath;

    public SoulBullRamGoal(SoulBull bull) {
        this.bull = bull;
        setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
    }

    private boolean validTarget(LivingEntity t) {
        return t != null && t.isAlive() && EntitySelector.NO_CREATIVE_OR_SPECTATOR.test(t) && bull.distanceToSqr(t) < 32 * 32;
    }

    @Override
    public boolean canUse() {
        return !bull.isTamed() && !(bull.getControllingPassenger() instanceof Player) && validTarget(bull.getTarget());
    }

    @Override
    public boolean canContinueToUse() {
        return canUse() || bull.isRamming() || bull.isPinning();
    }

    @Override
    public void start() {
        repath = 0;
        bull.setAggressive(true);
    }

    @Override
    public void stop() {
        bull.setAggressive(false);
        bull.getNavigation().stop();
    }

    @Override
    public boolean requiresUpdateEveryTick() {
        return true;
    }

    @Override
    public void tick() {
        if (bull.isRamming() || bull.isPinning() || bull.isReviving()) {
            bull.getNavigation().stop();
            return;
        }
        LivingEntity t = bull.getTarget();
        if (!validTarget(t)) {
            return;
        }
        bull.getLookControl().setLookAt(t, 30f, 30f);
        double d = bull.distanceTo(t);
        boolean ready = bull.ramCooldown() == 0 && !bull.isDraining();
        if (ready && d <= SoulBull.RAM_RANGE && bull.getSensing().hasLineOfSight(t) && Math.abs(t.getY() - bull.getY()) < 2.5) {
            Vec3 dir = t.position().subtract(bull.position());
            bull.getNavigation().stop();
            bull.startRam(1f, dir);
            return;
        }
        if (--repath <= 0) {
            repath = 6 + bull.getRandom().nextInt(5);
            if (ready || d > 4.5) {
                bull.getNavigation().moveTo(t, ready ? 1.35 : 1.0);
            } else {
                bull.getNavigation().stop();   // cooling down at close range: stand off and glare
            }
        }
    }
}
