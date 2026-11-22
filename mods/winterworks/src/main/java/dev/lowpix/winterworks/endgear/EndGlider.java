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
 * The End Glider (docs/END_UPDATE.md section 12): while fall-flying with an Elytra and the glider in either hand, the
 * player flies where they look at a cruising 1.1 blocks/tick, climbing included, without fireworks. Holding use boosts
 * to 2.2 blocks/tick, but the turns get heavy.
 *
 * <p>Steering replaces the elytra's physics in {@code LivingEntity.travel} (mixin.endgear.EndGearLivingEntityMixin) on
 * whichever side moves the player: the local client player (player movement is client-side, as with vanilla elytra and
 * firework boosting) and the server's copy, which keeps the server's idea of the velocity right for its movement checks.
 * Both sides decide from the same synced state (fall-flying flag, held items, chest slot, using-item flag), so the
 * client never waits for the server. The server alone wears the glider: 1 durability per second of glider flight.
 */
public final class EndGlider {
    public static final double CRUISE = 1.1, BOOST = 2.2;
    /** How fast the heading swings toward the look direction each tick (cruise, boost) and how fast speed settles. */
    public static final double TURN_CRUISE = 0.2, TURN_BOOST = 0.035, ACCEL = 0.12;
    private static final Map<UUID, Integer> FLIGHT_TICKS = new HashMap<>();

    private EndGlider() {}

    /** Gliding on an Elytra with the glider in either hand: the glider steers. */
    public static boolean active(Player p) {
        return p.isFallFlying() && hasElytra(p) && hand(p) != null && !p.isPassenger() && !p.getAbilities().flying
                && !p.isSpectator() && !Petrify.isFrozen(p);
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

    /** Holding use on the glider. */
    public static boolean boosting(LivingEntity e) {
        return e.isUsingItem() && e.getUseItem().is(EndItems.END_GLIDER);
    }

    /**
     * One tick of steering: the heading swings toward `look` (slowly while boosting) and the speed settles toward the
     * cruise or boost speed. No gravity: the glider climbs as readily as it dives.
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
     * Moves a gliding player (called from LivingEntity.travel on the side that moves them). Returns false if the glider
     * isn't steering, so the vanilla physics run instead.
     */
    public static boolean travel(Player p) {
        if (!p.isControlledByLocalInstance() || !active(p) || p.isInWater() || p.isInLava()) {
            return false;
        }
        p.checkSlowFallDistance();
        Vec3 before = p.getDeltaMovement();
        Vec3 v = steer(before, p.getLookAngle(), boosting(p));
        p.setDeltaMovement(v);
        p.move(MoverType.SELF, v);
        if (p.horizontalCollision && !p.level().isClientSide) {   // flying into a wall hurts, as with the elytra
            float damage = (float) ((before.horizontalDistance() - p.getDeltaMovement().horizontalDistance()) * 10.0 - 3.0);
            if (damage > 0) {
                p.playSound(damage > 4 ? p.getFallSounds().big() : p.getFallSounds().small(), 1.0f, 1.0f);
                p.hurt(p.damageSources().flyIntoWall(), damage);
            }
        }
        if (p.onGround() && !p.level().isClientSide) {
            p.stopFallFlying();
        }
        p.calculateEntityAnimation(false);
        return true;
    }

    /** Server tick: the glider wears 1 durability per second of glider flight. */
    public static void serverTick(MinecraftServer server) {
        for (ServerPlayer p : server.getPlayerList().getPlayers()) {
            InteractionHand hand = hand(p);
            if (hand == null || !active(p)) {
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
