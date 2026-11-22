package dev.lowpix.winterworks.icebreaker;

import dev.lowpix.winterworks.registry.WWSounds;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.Set;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.phys.Vec3;

/** Wind up (pawing, head down, a roar), then a straight heavy charge that bowls targets over and smashes ice. */
class IcebreakerChargeGoal extends Goal {
    private static final int WINDUP = 22, RUSH = 36, RECOVER = 24;
    private final IcebreakerEntity mob;
    private int phase, timer;
    private Vec3 dir = Vec3.ZERO;
    private final Set<Integer> hit = new HashSet<>();

    IcebreakerChargeGoal(IcebreakerEntity mob) {
        this.mob = mob;
        setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK, Flag.JUMP));
    }

    @Override
    public boolean canUse() {
        LivingEntity t = mob.getTarget();
        if (t == null || !t.isAlive() || mob.isBaby() || mob.chargeCooldown > 0 || !mob.onGround() || mob.isInWater() || mob.isAsleep()) {
            return false;
        }
        double d = mob.distanceToSqr(t);
        double min = guarding(t) ? 3.0 : 4.5;   // guarding its cubs it charges even at close range
        return d > min * min && d < 18 * 18 && mob.getSensing().hasLineOfSight(t);
    }

    /** It is charging someone who came too near its cubs. */
    private boolean guarding(LivingEntity t) {
        return t instanceof net.minecraft.world.entity.player.Player && mob.nearCub(t);
    }

    @Override
    public boolean canContinueToUse() {
        return phase < 3 && mob.isAlive() && !mob.isInWater();
    }

    @Override
    public boolean requiresUpdateEveryTick() {
        return true;
    }

    @Override
    public void start() {
        phase = 0;
        timer = WINDUP;
        hit.clear();
        mob.getNavigation().stop();
        mob.bellySlap();   // the warning display: rears up and drums its belly, then charges
        mob.level().broadcastEntityEvent(mob, IcebreakerEntity.EVENT_ROAR);
        mob.playSound(WWSounds.ICEBREAKER_ROAR, 2.0f, 0.9f + mob.getRandom().nextFloat() * 0.2f);
    }

    @Override
    public void stop() {
        mob.setCharging(false);
        LivingEntity t = mob.getTarget();
        // far more hostile near its cubs: it charges again and again
        mob.chargeCooldown = t != null && guarding(t) ? 30 + mob.getRandom().nextInt(20) : 70 + mob.getRandom().nextInt(60);
    }

    @Override
    public void tick() {
        LivingEntity t = mob.getTarget();
        switch (phase) {
            case 0 -> {   // wind-up: face the target, paw the ground
                if (t != null) {
                    mob.getLookControl().setLookAt(t, 30f, 30f);
                    Vec3 d = t.position().subtract(mob.position());
                    float yaw = (float) (Mth.atan2(d.z, d.x) * Mth.RAD_TO_DEG) - 90f;
                    mob.setYRot(Mth.approachDegrees(mob.getYRot(), yaw, 12f));
                    mob.yBodyRot = mob.getYRot();
                    mob.yHeadRot = mob.getYRot();
                }
                if (timer % 6 == 0 && mob.level() instanceof ServerLevel sl) {
                    BlockPos below = mob.getBlockPosBelowThatAffectsMyMovement();
                    sl.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, sl.getBlockState(below)),
                            mob.getX(), mob.getY() + 0.1, mob.getZ(), 12, 0.6, 0.1, 0.6, 0.15);
                    mob.playSound(SoundEvents.SNOW_STEP, 1.0f, 0.6f);
                }
                if (--timer <= 0) {
                    phase = 1;
                    timer = RUSH;
                    Vec3 look = Vec3.directionFromRotation(0, mob.getYRot());
                    dir = new Vec3(look.x, 0, look.z).normalize();
                    mob.setCharging(true);
                }
            }
            case 1 -> {   // the rush
                double speed = 0.62;
                Vec3 v = mob.getDeltaMovement();
                mob.setDeltaMovement(dir.x * speed, v.y, dir.z * speed);
                mob.setYRot((float) (Mth.atan2(dir.z, dir.x) * Mth.RAD_TO_DEG) - 90f);
                mob.yBodyRot = mob.getYRot();
                mob.yHeadRot = mob.getYRot();
                if (mob.tickCount % 4 == 0) {
                    mob.playSound(WWSounds.ICEBREAKER_STEP, 1.2f, 0.6f);
                }
                if (mob.level() instanceof ServerLevel sl) {
                    sl.sendParticles(ParticleTypes.SNOWFLAKE, mob.getX(), mob.getY() + 0.2, mob.getZ(), 3, 0.5, 0.1, 0.5, 0.05);
                    // ice ahead shatters
                    BlockPos ahead = BlockPos.containing(mob.position().add(dir.scale(1.6)));
                    mob.smashIce(ahead.below(), 1);
                    mob.smashIce(ahead, 1);
                }
                for (LivingEntity e : mob.level().getEntitiesOfClass(LivingEntity.class, mob.frontBox(1.1),
                        e -> e != mob && e.isAlive() && !(e instanceof IcebreakerEntity) && !hit.contains(e.getId()))) {
                    hit.add(e.getId());
                    float dmg = (float) mob.getAttributeValue(net.minecraft.world.entity.ai.attributes.Attributes.ATTACK_DAMAGE) * 1.5f;
                    e.hurt(mob.damageSources().mobAttack(mob), dmg);
                    e.knockback(2.2, -dir.x, -dir.z);
                    e.push(0, 0.55, 0);
                    e.hurtMarked = true;
                    mob.level().broadcastEntityEvent(mob, IcebreakerEntity.EVENT_RAM);
                    mob.playSound(WWSounds.ICEBREAKER_RAM, 1.6f, 0.7f);
                    if (e == t) {
                        timer = Math.min(timer, 6);   // ploughs on a little, then stops
                    }
                }
                if (mob.horizontalCollision) {   // ran into a wall: dazed
                    mob.playSound(SoundEvents.ANVIL_LAND, 0.6f, 0.5f);
                    mob.level().broadcastEntityEvent(mob, IcebreakerEntity.EVENT_ICE_SMASH);
                    timer = 0;
                }
                if (--timer <= 0) {
                    phase = 2;
                    timer = RECOVER;
                    mob.setCharging(false);
                }
            }
            case 2 -> {   // skid to a stop and pant
                mob.setDeltaMovement(mob.getDeltaMovement().multiply(0.7, 1, 0.7));
                if (--timer <= 0) {
                    phase = 3;
                }
            }
            default -> {
            }
        }
    }
}
