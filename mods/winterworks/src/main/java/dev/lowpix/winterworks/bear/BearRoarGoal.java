package dev.lowpix.winterworks.bear;

import dev.lowpix.winterworks.registry.WWParticles;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.EnumSet;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;

/**
 * The first-sight roar (docs/COLD_UPDATE.md section 3): the first time a bear spots a player it stops, faces them and
 * roars (the `roar` clip, a shockwave ring and a cloud of breath), then it is ready to leap straight away.
 */
public class BearRoarGoal extends Goal {
    public static final int LENGTH = 30, PEAK = 8, COOLDOWN = 240;
    private final PathfinderMob mob;
    private final BearLike bear;
    private LivingEntity target;
    private int timer;

    public BearRoarGoal(PathfinderMob mob) {
        this.mob = mob;
        this.bear = (BearLike) mob;
        setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
    }

    @Override
    public boolean canUse() {
        BearState s = bear.ww$bear();
        LivingEntity t = mob.getTarget();
        return t instanceof Player && t.isAlive() && bear.ww$mayFight() && s.roarCooldown <= 0 && !t.getUUID().equals(s.roaredAt)
                && mob.onGround() && !mob.isInWater() && !mob.isPassenger() && mob.distanceToSqr(t) < 18 * 18
                && mob.getSensing().hasLineOfSight(t);
    }

    @Override
    public boolean canContinueToUse() {
        return timer > 0 && mob.isAlive();
    }

    @Override
    public boolean requiresUpdateEveryTick() {
        return true;
    }

    @Override
    public void start() {
        target = mob.getTarget();
        timer = LENGTH;
        bear.ww$bear().roaredAt = target.getUUID();
        mob.getNavigation().stop();
        mob.level().broadcastEntityEvent(mob, BearState.EV_ROAR);
        boolean zombie = bear.ww$isZombie();
        mob.playSound(WWSounds.BEAR_ROAR, 2.5f, (zombie ? 0.65f : 0.95f) + mob.getRandom().nextFloat() * 0.1f);
        if (zombie) {
            mob.playSound(WWSounds.ZOMBIE_BEAR_AMBIENT, 1.5f, 0.7f);
        }
    }

    @Override
    public void stop() {
        BearState s = bear.ww$bear();
        s.roarCooldown = COOLDOWN;
        s.leapCooldown = Math.min(s.leapCooldown, 4);   // roar, then pounce
        target = null;
    }

    @Override
    public void tick() {
        timer--;
        if (target != null) {
            mob.getLookControl().setLookAt(target, 30f, 30f);
            float yaw = (float) (Mth.atan2(target.getZ() - mob.getZ(), target.getX() - mob.getX()) * Mth.RAD_TO_DEG) - 90f;
            mob.setYRot(Mth.approachDegrees(mob.getYRot(), yaw, 15f));
            mob.yBodyRot = mob.getYRot();
        }
        mob.setDeltaMovement(mob.getDeltaMovement().multiply(0.5, 1.0, 0.5));
        if (timer == LENGTH - PEAK && mob.level() instanceof ServerLevel sl) {
            Vec3 m = BearState.mouth(mob);
            sl.sendParticles(WWParticles.ROAR_WAVE, m.x, m.y, m.z, 0, 3.5, 0, 0, 1.0);   // dx = final size (blocks)
            sl.sendParticles(net.minecraft.core.particles.ParticleTypes.SNOWFLAKE, mob.getX(), mob.getY() + 0.2, mob.getZ(),
                    12, 1.0, 0.1, 1.0, 0.06);
        }
    }
}
