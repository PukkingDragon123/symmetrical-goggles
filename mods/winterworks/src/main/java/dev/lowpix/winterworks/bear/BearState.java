package dev.lowpix.winterworks.bear;

import dev.lowpix.winterworks.registry.WWParticles;
import java.util.UUID;
import net.minecraft.core.particles.ItemParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * Fight and animation state shared by remade polar bears and zombie polar bears (one per bear, see {@link BearLike}).
 * The server keeps the cooldowns; one-shot clips (leap, swipe, roar, eat, shake) are started on clients by entity events,
 * the loops (idle, swim, sit) follow the bear's state every client tick.
 */
public final class BearState {
    /** Entity events (clear of vanilla's ids): each starts its clip on clients, with its particles. */
    public static final byte EV_LEAP = 70, EV_SWIPE = 71, EV_ROAR = 72, EV_EAT = 73, EV_SHAKE = 74, EV_SHAKE_WET = 75,
            EV_HEARTS = 76;

    // ---- client animation states (docs/COLD_UPDATE.md section 3 clips)
    public final AnimationState idle = new AnimationState();
    public final AnimationState swim = new AnimationState();
    public final AnimationState sit = new AnimationState();
    public final AnimationState leap = new AnimationState();
    public final AnimationState swipe = new AnimationState();
    public final AnimationState roar = new AnimationState();
    public final AnimationState eat = new AnimationState();
    public final AnimationState shake = new AnimationState();
    private final AnimationState[] oneShots = {leap, swipe, roar, eat, shake};
    /** Clip lengths in ticks (leap 1.2 s, swipe 0.9 s, roar 1.6 s, eat 1.0 s, shake 0.8 s), plus a little settle time. */
    private static final int[] LENGTHS = {26, 20, 34, 22, 18};
    private final int[] startedAt = new int[oneShots.length];

    // ---- server
    public int leapCooldown = 40;
    public int roarCooldown;
    /** The last player it roared at: it roars once when it first spots someone. */
    @Nullable
    public UUID roaredAt;
    private int noTargetTicks;

    public void serverTick(Mob mob) {
        if (leapCooldown > 0) {
            leapCooldown--;
        }
        if (roarCooldown > 0) {
            roarCooldown--;
        }
        if (mob.getTarget() == null) {
            if (++noTargetTicks > 400) {   // lost you for a while: it will roar again next time
                roaredAt = null;
            }
        } else {
            noTargetTicks = 0;
        }
    }

    public void clientTick(Mob mob, boolean sitting) {
        boolean water = mob.isInWater();
        boolean moving = mob.walkAnimation.speed() > 0.06f || mob.getDeltaMovement().horizontalDistanceSqr() > 2.0e-4;
        swim.animateWhen(water, mob.tickCount);
        sit.animateWhen(sitting && !water, mob.tickCount);
        idle.animateWhen(!moving && !sitting && !water, mob.tickCount);
        for (int i = 0; i < oneShots.length; i++) {
            if (oneShots[i].isStarted() && mob.tickCount - startedAt[i] > LENGTHS[i]) {
                oneShots[i].stop();
            }
        }
    }

    private void startOneShot(Mob mob, AnimationState state) {
        for (int i = 0; i < oneShots.length; i++) {
            if (oneShots[i] == state) {
                startedAt[i] = mob.tickCount;
            }
        }
        state.start(mob.tickCount);
    }

    /** Client: handles a bear entity event (clip + particles). False if `id` is not a bear event. */
    public boolean handleEvent(Mob mob, byte id) {
        Level level = mob.level();
        RandomSource r = mob.getRandom();
        switch (id) {
            case EV_LEAP -> startOneShot(mob, leap);
            case EV_SWIPE -> startOneShot(mob, swipe);
            case EV_ROAR -> {
                startOneShot(mob, roar);
                if (!((BearLike) mob).ww$isZombie()) {   // a cloud of breath (zombie bears don't breathe)
                    Vec3 m = mouth(mob), f = forward(mob);
                    for (int i = 0; i < 14; i++) {
                        double s = 0.08 + r.nextDouble() * 0.14;
                        level.addParticle(WWParticles.FROST_BREATH, m.x, m.y, m.z, f.x * s + (r.nextDouble() - 0.5) * 0.06,
                                0.02 + r.nextDouble() * 0.04, f.z * s + (r.nextDouble() - 0.5) * 0.06);
                    }
                }
            }
            case EV_EAT -> {
                startOneShot(mob, eat);
                Vec3 m = mouth(mob);
                ItemStack carried = ((BearLike) mob).ww$carried();   // eating its catch, or salmon it was given
                ItemParticleOption crumbs = new ItemParticleOption(ParticleTypes.ITEM,
                        carried.isEmpty() ? new ItemStack(Items.SALMON) : carried.copy());
                for (int i = 0; i < 8; i++) {
                    level.addParticle(crumbs, m.x, m.y, m.z, (r.nextDouble() - 0.5) * 0.15, 0.1 + r.nextDouble() * 0.1,
                            (r.nextDouble() - 0.5) * 0.15);
                }
            }
            case EV_SHAKE, EV_SHAKE_WET -> {
                startOneShot(mob, shake);
                for (int i = 0; i < 16; i++) {
                    double x = mob.getRandomX(0.9), y = mob.getY() + mob.getBbHeight() * (0.4 + r.nextDouble() * 0.5), z = mob.getRandomZ(0.9);
                    double vx = (x - mob.getX()) * 0.2, vz = (z - mob.getZ()) * 0.2;
                    if (id == EV_SHAKE_WET) {
                        level.addParticle(ParticleTypes.SPLASH, x, y, z, vx, 0.1, vz);
                    } else {
                        level.addParticle(WWParticles.FUR_TUFT, x, y, z, vx * 0.4, 0.05, vz * 0.4);
                    }
                }
            }
            case EV_HEARTS -> {
                for (int i = 0; i < 5; i++) {
                    level.addParticle(ParticleTypes.HEART, mob.getRandomX(1.0), mob.getRandomY() + 0.5, mob.getRandomZ(1.0),
                            r.nextGaussian() * 0.02, r.nextGaussian() * 0.02, r.nextGaussian() * 0.02);
                }
            }
            default -> {
                return false;
            }
        }
        return true;
    }

    /** The way the head points (flat). */
    public static Vec3 forward(Mob mob) {
        return Vec3.directionFromRotation(0, mob.getYHeadRot());
    }

    /** Roughly the front of the mouth, in world space (for breath, crumbs, gifts and roar waves). */
    public static Vec3 mouth(Mob mob) {
        Vec3 f = forward(mob);
        double reach = mob.getBbWidth() * 0.5 + 0.45 * mob.getScale() * (mob.isBaby() ? 0.6 : 1.0);
        return new Vec3(mob.getX() + f.x * reach, mob.getY() + mob.getBbHeight() * 0.62, mob.getZ() + f.z * reach);
    }
}
