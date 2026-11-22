package dev.lowpix.winterworks.bear;

import dev.lowpix.winterworks.registry.WWParticles;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.EnumSet;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.phys.Vec3;

/**
 * The charge-jump (docs/COLD_UPDATE.md section 3), shared by polar bears and zombie polar bears: with a target 4-10
 * blocks away it crouches for half a second (growling, kicking up snow), leaps at it and lands with a slam that hurts and
 * throws back everything around (6 damage, 2.5 blocks), in a burst of snow. Cooldown 100 ticks.
 */
public class BearLeapGoal extends Goal {
    public static final int CROUCH = 10, MAX_AIR = 40, RECOVER = 10, COOLDOWN = 100;
    public static final double MIN_RANGE = 4.0, MAX_RANGE = 10.0, LEAP_SPEED = 1.1, LEAP_UP = 0.5, SLAM_RADIUS = 2.5;
    public static final float SLAM_DAMAGE = 6.0f;

    private final PathfinderMob mob;
    private final BearLike bear;
    private LivingEntity target;
    private int phase, timer, air;

    public BearLeapGoal(PathfinderMob mob) {
        this.mob = mob;
        this.bear = (BearLike) mob;
        setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK, Flag.JUMP));
    }

    @Override
    public boolean canUse() {
        LivingEntity t = mob.getTarget();
        if (t == null || !t.isAlive() || !bear.ww$mayFight() || bear.ww$bear().leapCooldown > 0 || !mob.onGround()
                || mob.isInWater() || mob.isPassenger()) {
            return false;
        }
        double dy = t.getY() - mob.getY();
        if (dy > 3.0 || dy < -4.0) {
            return false;
        }
        double h = Math.sqrt(Mth.square(t.getX() - mob.getX()) + Mth.square(t.getZ() - mob.getZ()));
        return h >= MIN_RANGE && h <= MAX_RANGE && mob.getSensing().hasLineOfSight(t);
    }

    @Override
    public boolean canContinueToUse() {
        if (!mob.isAlive() || phase >= 3) {
            return false;
        }
        // once airborne it is committed; the crouch is called off if the target goes away
        return phase > 0 || (target != null && target.isAlive() && bear.ww$mayFight());
    }

    @Override
    public boolean isInterruptable() {
        return phase == 0;
    }

    @Override
    public boolean requiresUpdateEveryTick() {
        return true;
    }

    @Override
    public void start() {
        target = mob.getTarget();
        phase = 0;
        timer = CROUCH;
        air = 0;
        mob.getNavigation().stop();
        mob.level().broadcastEntityEvent(mob, BearState.EV_LEAP);
        mob.playSound(bear.ww$growlSound(), 1.6f, 0.6f + mob.getRandom().nextFloat() * 0.15f);
    }

    @Override
    public void stop() {
        bear.ww$bear().leapCooldown = COOLDOWN + mob.getRandom().nextInt(30);
        target = null;
        phase = 0;
    }

    @Override
    public void tick() {
        switch (phase) {
            case 0 -> crouch();
            case 1 -> {   // airborne
                air++;
                Vec3 v = mob.getDeltaMovement();
                if (v.horizontalDistanceSqr() > 1.0e-3) {
                    float yaw = (float) (Mth.atan2(v.z, v.x) * Mth.RAD_TO_DEG) - 90f;
                    mob.setYRot(yaw);
                    mob.yBodyRot = yaw;
                }
                if ((air > 3 && mob.onGround()) || mob.isInWater()) {
                    slam(mob);
                    phase = 2;
                    timer = RECOVER;
                } else if (air > MAX_AIR) {
                    phase = 2;
                    timer = RECOVER;
                }
            }
            case 2 -> {   // shakes the snow off, catches its breath
                mob.setDeltaMovement(mob.getDeltaMovement().multiply(0.6, 1.0, 0.6));
                if (--timer <= 0) {
                    phase = 3;
                }
            }
            default -> {
            }
        }
    }

    private void crouch() {
        if (target != null) {
            mob.getLookControl().setLookAt(target, 30f, 30f);
            float yaw = (float) (Mth.atan2(target.getZ() - mob.getZ(), target.getX() - mob.getX()) * Mth.RAD_TO_DEG) - 90f;
            mob.setYRot(Mth.approachDegrees(mob.getYRot(), yaw, 20f));
            mob.yBodyRot = mob.getYRot();
            mob.yHeadRot = mob.getYRot();
        }
        mob.setDeltaMovement(mob.getDeltaMovement().multiply(0.3, 1.0, 0.3));
        if (timer % 3 == 0 && mob.level() instanceof ServerLevel sl) {   // back paws dig in
            Vec3 back = Vec3.directionFromRotation(0, mob.getYRot()).scale(-mob.getBbWidth() * 0.45);
            sl.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, ground(mob)), mob.getX() + back.x, mob.getY() + 0.1,
                    mob.getZ() + back.z, 6, 0.4, 0.05, 0.4, 0.1);
        }
        if (--timer <= 0) {
            launch();
        }
    }

    private void launch() {
        if (target == null || !target.isAlive()) {
            phase = 3;
            return;
        }
        // aim a little ahead of a running target, and scale the speed so it lands on it, not past it
        Vec3 aim = target.position().add(target.getDeltaMovement().multiply(5, 0, 5));
        double dx = aim.x - mob.getX(), dz = aim.z - mob.getZ();
        double h = Math.sqrt(dx * dx + dz * dz);
        if (h < 1.0e-3) {
            phase = 3;
            return;
        }
        double speed = Mth.clamp(h * 0.125, 0.45, LEAP_SPEED);
        mob.setDeltaMovement(dx / h * speed, LEAP_UP, dz / h * speed);
        mob.hasImpulse = true;
        mob.setOnGround(false);
        mob.playSound(WWSounds.BEAR_LEAP, 1.4f, bear.ww$isZombie() ? 0.7f : 0.95f + mob.getRandom().nextFloat() * 0.15f);
        if (mob.level() instanceof ServerLevel sl) {
            sl.sendParticles(WWParticles.SNOW_PUFF, mob.getX(), mob.getY() + 0.1, mob.getZ(), 10, 0.5, 0.05, 0.5, 0.05);
        }
        phase = 1;
        air = 0;
    }

    private static BlockState ground(PathfinderMob mob) {
        BlockState s = mob.level().getBlockState(mob.getOnPos());
        return s.isAir() ? Blocks.SNOW_BLOCK.defaultBlockState() : s;
    }

    /**
     * The landing slam: 6 damage and a heavy knockback to everything within 2.5 blocks (not the bear's rider or other
     * bears), a ring of snow puffs, flying ground debris and a thud. Returns how many it hit.
     */
    public static int slam(PathfinderMob mob) {
        if (!(mob.level() instanceof ServerLevel sl)) {
            return 0;
        }
        int hit = 0;
        double reach = SLAM_RADIUS + mob.getBbWidth() * 0.5;
        for (LivingEntity e : sl.getEntitiesOfClass(LivingEntity.class, mob.getBoundingBox().inflate(SLAM_RADIUS, 1.0, SLAM_RADIUS),
                e -> e != mob && e.isAlive() && !(e instanceof BearLike) && !mob.hasPassenger(e) && e != mob.getVehicle()
                        && !mob.isAlliedTo(e) && !e.isSpectator())) {
            double dx = e.getX() - mob.getX(), dz = e.getZ() - mob.getZ();
            double d = Math.sqrt(dx * dx + dz * dz);
            if (d > reach) {
                continue;
            }
            if (e.hurt(mob.damageSources().mobAttack(mob), SLAM_DAMAGE)) {
                double k = d < 1.0e-3 ? 0 : 1 / d;
                e.knockback(1.1 + (reach - d) * 0.2, -dx * k, -dz * k);
                e.push(0, 0.2, 0);
                e.hurtMarked = true;
                hit++;
            }
        }
        BlockState ground = ground(mob);
        double y = mob.getY() + 0.1;
        for (int i = 0; i < 18; i++) {   // a ring of puffs rolling outwards
            double a = i * Mth.TWO_PI / 18;
            double c = Math.cos(a), s = Math.sin(a);
            sl.sendParticles(WWParticles.SNOW_PUFF, mob.getX() + c * 0.8, y, mob.getZ() + s * 0.8, 0, c * 0.3, 0.03, s * 0.3, 1.0);
        }
        sl.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, ground), mob.getX(), y, mob.getZ(), 40, 1.1, 0.1, 1.1, 0.25);
        sl.sendParticles(ParticleTypes.SNOWFLAKE, mob.getX(), y + 0.3, mob.getZ(), 16, 1.2, 0.3, 1.2, 0.08);
        mob.playSound(WWSounds.BEAR_SLAM, 1.8f, ((BearLike) mob).ww$isZombie() ? 0.65f : 0.85f + mob.getRandom().nextFloat() * 0.15f);
        mob.gameEvent(GameEvent.HIT_GROUND);
        return hit;
    }
}
