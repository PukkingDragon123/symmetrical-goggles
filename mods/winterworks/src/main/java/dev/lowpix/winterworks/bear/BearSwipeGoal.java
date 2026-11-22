package dev.lowpix.winterworks.bear;

import dev.lowpix.winterworks.registry.WWParticles;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.goal.MeleeAttackGoal;

/**
 * The swipe (docs/COLD_UPDATE.md section 3): in reach, the bear rears up on its hind legs with a growl (the `swipe` clip
 * starts), and 8 ticks later both paws come down: the attack damage plus a shove. Out of reach by then, it misses.
 */
public class BearSwipeGoal extends MeleeAttackGoal {
    public static final int WINDUP = 8;
    private final BearLike bear;
    private int windup;

    public BearSwipeGoal(PathfinderMob mob, double speed) {
        super(mob, speed, true);
        this.bear = (BearLike) mob;
    }

    @Override
    public boolean canUse() {
        return bear.ww$mayFight() && super.canUse();
    }

    @Override
    public boolean canContinueToUse() {
        return bear.ww$mayFight() && super.canContinueToUse();
    }

    @Override
    public void start() {
        super.start();
        windup = 0;
    }

    @Override
    public void stop() {
        super.stop();
        windup = 0;
        bear.ww$standUp(false);
    }

    private boolean inReach(LivingEntity t, double extra) {
        if (mob.isWithinMeleeAttackRange(t)) {
            return true;
        }
        double r = mob.getBbWidth() * 0.5 + t.getBbWidth() * 0.5 + extra;
        return mob.distanceToSqr(t) < r * r && Math.abs(t.getY() - mob.getY()) < 2.5;
    }

    @Override
    protected void checkAndPerformAttack(LivingEntity t) {
        if (windup > 0) {
            mob.getLookControl().setLookAt(t, 30f, 30f);
            if (--windup > 0) {
                return;
            }
            bear.ww$standUp(false);
            resetAttackCooldown();
            mob.swing(InteractionHand.MAIN_HAND);
            if (inReach(t, 1.2) && mob.getSensing().hasLineOfSight(t) && mob.doHurtTarget(t)) {
                impact(t);
            } else {
                mob.playSound(SoundEvents.PLAYER_ATTACK_SWEEP, 0.8f, 0.6f);
            }
            return;
        }
        if (isTimeToAttack() && inReach(t, 0.6) && mob.getSensing().hasLineOfSight(t)) {
            windup = WINDUP;
            bear.ww$standUp(true);
            mob.level().broadcastEntityEvent(mob, BearState.EV_SWIPE);
            mob.playSound(bear.ww$growlSound(), 1.2f, 0.9f + mob.getRandom().nextFloat() * 0.2f);
        }
    }

    private void impact(LivingEntity t) {
        double dx = t.getX() - mob.getX(), dz = t.getZ() - mob.getZ();
        double d = Math.max(1.0e-3, Math.sqrt(dx * dx + dz * dz));
        t.knockback(0.7, -dx / d, -dz / d);
        t.hurtMarked = true;
        mob.playSound(SoundEvents.PLAYER_ATTACK_STRONG, 1.0f, 0.6f);
        if (mob.level() instanceof ServerLevel sl) {
            sl.sendParticles(WWParticles.SNOW_PUFF, t.getX(), t.getY() + 0.1, t.getZ(), 6, 0.3, 0.05, 0.3, 0.04);
            sl.sendParticles(net.minecraft.core.particles.ParticleTypes.SWEEP_ATTACK, (mob.getX() + t.getX()) * 0.5,
                    t.getY() + t.getBbHeight() * 0.5, (mob.getZ() + t.getZ()) * 0.5, 1, 0, 0, 0, 0);
        }
    }
}
