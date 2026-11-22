package dev.lowpix.winterworks.endgear;

import dev.lowpix.winterworks.end.Petrify;
import dev.lowpix.winterworks.registry.EndItems;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.MoverType;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ElytraItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * The End Glider (docs/END_UPDATE.md section 12), a glowing magic wing glider held overhead in both hands:
 * <ul>
 * <li><b>Alone</b>: hold it while falling and hold use to glide like a hang glider: about 0.6 blocks/tick forward,
 * sinking 0.08 blocks/tick, steered by where you look; no climbing, no fall damage while gliding.
 * <li><b>With an Elytra</b> (fall-flying with it in hand): free flight where you look at a cruising 1.1 blocks/tick,
 * climbing included, no fireworks; hold use to boost to 2.2 blocks/tick, with much heavier steering.
 * </ul>
 * The movement replaces the vanilla physics in {@code LivingEntity.travel} (mixin.endgear.EndGearLivingEntityMixin) on
 * whichever side moves the player: the local client player (player movement is client-side, as with vanilla elytra and
 * firework boosting) and the server's copy, which keeps the server's idea of the velocity right for its movement checks.
 * Both sides decide from the same synced state (fall-flying flag, held items, chest slot, using-item flag, on-ground),
 * so the client never waits for the server. The server alone wears the glider: 1 durability per second in use.
 */
public final class EndGlider {
    public static final double CRUISE = 1.1, BOOST = 2.2;
    /** How fast the heading swings toward the look direction each tick (cruise, boost) and how fast speed settles. */
    public static final double TURN_CRUISE = 0.2, TURN_BOOST = 0.035, ACCEL = 0.12;
    /** Hang-gliding alone: forward speed, sink rate, how fast the heading follows the look. */
    public static final double GLIDE_SPEED = 0.6, GLIDE_SINK = 0.08, GLIDE_TURN = 0.15;
    private static final Map<UUID, Integer> FLIGHT_TICKS = new HashMap<>();

    private EndGlider() {}

    /** Gliding on an Elytra with the glider in either hand: free flight. */
    public static boolean freeFlight(Player p) {
        return p.isFallFlying() && hasElytra(p) && hand(p) != null && free(p);
    }

    /** In the air with the glider in hand, not on an Elytra: holding use now would glide. */
    public static boolean canHangGlide(Player p) {
        return !p.onGround() && !p.isFallFlying() && hand(p) != null && free(p) && !p.isInWater() && !p.isInLava()
                && !p.onClimbable();
    }

    /** Hang-gliding alone: in the air holding use on the glider. */
    public static boolean hangGliding(Player p) {
        return canHangGlide(p) && using(p);
    }

    /** The glider is carrying the player, either way: held overhead, wearing out. */
    public static boolean inUse(Player p) {
        return freeFlight(p) || hangGliding(p);
    }

    /** Boosting free flight (holding use while flying on an Elytra). */
    public static boolean boosting(Player p) {
        return freeFlight(p) && using(p);
    }

    private static boolean free(Player p) {
        return !p.isPassenger() && !p.getAbilities().flying && !p.isSpectator() && !Petrify.isFrozen(p);
    }

    private static boolean using(LivingEntity e) {
        return e.isUsingItem() && e.getUseItem().is(EndItems.END_GLIDER);
    }

    public static boolean hasElytra(LivingEntity e) {
        ItemStack chest = e.getItemBySlot(EquipmentSlot.CHEST);
        return chest.getItem() instanceof ElytraItem && ElytraItem.isFlyEnabled(chest);
    }

    /** The hand holding the glider (main hand first), or null. */
    @Nullable
    public static InteractionHand hand(LivingEntity e) {
        if (e.getMainHandItem().is(EndItems.END_GLIDER)) {
            return InteractionHand.MAIN_HAND;
        }
        return e.getOffhandItem().is(EndItems.END_GLIDER) ? InteractionHand.OFF_HAND : null;
    }

    /**
     * One tick of free flight: the heading swings toward `look` (slowly while boosting) and the speed settles toward the
     * cruise or boost speed. No gravity: it climbs as readily as it dives.
     */
    public static Vec3 steer(Vec3 velocity, Vec3 look, boolean boost) {
        Vec3 aim = look.lengthSqr() < 1e-8 ? new Vec3(0, 0, 1) : look.normalize();
        double speed = velocity.length();
        Vec3 dir = speed > 1e-4 ? velocity.scale(1.0 / speed) : aim;
        Vec3 heading = dir.lerp(aim, boost ? TURN_BOOST : TURN_CRUISE);
        heading = heading.lengthSqr() < 1e-6 ? aim : heading.normalize();   // turning right round: take the look direction
        double target = boost ? BOOST : CRUISE;
        return heading.scale(speed + (target - speed) * ACCEL);
    }

    /**
     * One tick of hang-gliding: the horizontal heading swings toward where you look and settles at 0.6 blocks/tick; the
     * wings catch a fall and slow it to a 0.08 sink, and never lift you (rising momentum just runs out).
     */
    public static Vec3 glide(Vec3 velocity, Vec3 look) {
        Vec3 flat = new Vec3(velocity.x, 0, velocity.z);
        Vec3 lookFlat = new Vec3(look.x, 0, look.z);
        double speed = flat.length();
        Vec3 dir = speed > 1e-4 ? flat.scale(1.0 / speed) : lookFlat.lengthSqr() > 1e-8 ? lookFlat.normalize() : new Vec3(0, 0, 1);
        Vec3 aim = lookFlat.lengthSqr() > 1e-8 ? lookFlat.normalize() : dir;
        Vec3 heading = dir.lerp(aim, GLIDE_TURN);
        heading = heading.lengthSqr() < 1e-6 ? aim : heading.normalize();
        double vy = velocity.y > -GLIDE_SINK ? Math.max(-GLIDE_SINK, velocity.y - 0.08) : velocity.y + (-GLIDE_SINK - velocity.y) * 0.3;
        return heading.scale(speed + (GLIDE_SPEED - speed) * 0.15).add(0, vy, 0);
    }

    /**
     * Moves a player the glider is carrying (called from LivingEntity.travel on the side that moves them). Returns false
     * if the glider isn't carrying them, so the vanilla physics run instead.
     */
    public static boolean travel(Player p) {
        if (!p.isControlledByLocalInstance()) {
            return false;
        }
        boolean flight = freeFlight(p) && !p.isInWater() && !p.isInLava();
        boolean glide = !flight && hangGliding(p);
        if (!flight && !glide) {
            return false;
        }
        Vec3 before = p.getDeltaMovement();
        Vec3 v;
        if (flight) {
            p.checkSlowFallDistance();
            v = steer(before, p.getLookAngle(), using(p));
        } else {
            p.resetFallDistance();   // no fall damage while gliding
            v = glide(before, p.getLookAngle());
        }
        p.setDeltaMovement(v);
        p.move(MoverType.SELF, v);
        if (flight && p.horizontalCollision && !p.level().isClientSide) {   // flying into a wall hurts, as with the elytra
            float damage = (float) ((before.horizontalDistance() - p.getDeltaMovement().horizontalDistance()) * 10.0 - 3.0);
            if (damage > 0) {
                p.playSound(damage > 4 ? p.getFallSounds().big() : p.getFallSounds().small(), 1.0f, 1.0f);
                p.hurt(p.damageSources().flyIntoWall(), damage);
            }
        }
        if (flight && p.onGround() && !p.level().isClientSide) {
            p.stopFallFlying();
        }
        if (glide) {
            p.resetFallDistance();
        }
        p.calculateEntityAnimation(false);
        return true;
    }

    /** Server tick: the glider wears 1 durability per second in use. */
    public static void serverTick(MinecraftServer server) {
        for (ServerPlayer p : server.getPlayerList().getPlayers()) {
            InteractionHand hand = hand(p);
            if (hand == null || !inUse(p)) {
                continue;
            }
            int t = FLIGHT_TICKS.merge(p.getUUID(), 1, Integer::sum);
            if (t >= 20) {
                FLIGHT_TICKS.put(p.getUUID(), 0);
                wear(p, hand);
            }
        }
    }

    /** One second of flight on the glider in `hand`. */
    public static void wear(Player p, InteractionHand hand) {
        if (!p.getAbilities().instabuild) {
            p.getItemInHand(hand).hurtAndBreak(1, p, LivingEntity.getSlotForHand(hand));
        }
    }

    public static void forget(Player p) {
        FLIGHT_TICKS.remove(p.getUUID());
    }
}
