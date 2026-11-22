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
 * The End Glider (docs/END_UPDATE.md section 12), a glowing magic wing glider held overhead in both hands. It runs on
 * momentum and skill, not on an engine:
 * <ul>
 * <li><b>Alone</b>: hold it while falling and hold use to hang-glide. Pitch trades height for speed like an Elytra, only
 * slower and draggier: level flight settles near 0.32 blocks/tick sinking 0.064, a dive builds speed (at most 0.75),
 * pulling up zooms you a few blocks higher on that speed, and flying too slowly stalls the wings. Steady glides take no
 * fall damage; a steep dive into the ground does.
 * <li><b>With an Elytra</b> (fall-flying with it in hand): ordinary Elytra physics plus a <b>wing beat</b> on each press of
 * use: a push of 0.32 blocks/tick along your look (never past 1.2 total), then 1.4 s to recover (the item cooldown).
 * Timed beats on a gentle climb hold your height; diving and zooming up between beats is how you gain it.
 * </ul>
 * The movement replaces the vanilla physics in {@code LivingEntity.travel} (mixin.endgear.EndGearLivingEntityMixin) on
 * whichever side moves the player: the local client player (player movement is client-side, as with vanilla elytra and
 * firework boosting) and the server's copy, which keeps the server's idea of the velocity right for its movement checks.
 * Both sides decide from the same synced state (fall-flying flag, held items, chest slot, using-item flag, on-ground),
 * so the client never waits for the server. The server alone wears the glider: 1 durability per second of
 * hang-gliding, 1 per wing beat.
 */
public final class EndGlider {
    /** Wing beats on an Elytra: the push, the speed it can't push past, and the recovery (ticks) between beats. */
    public static final double BEAT = 0.32, BEAT_CAP = 1.2;
    public static final int BEAT_COOLDOWN = 28;
    /** How long (ticks) a beat shows as {@link #boosting}: the flare of the sigils and the hard wing stroke. */
    public static final int BEAT_SHOW = 10;
    /** Hang-gliding alone: gravity, lift, how much of a fall the wings turn into speed, how much speed pulls you up. */
    public static final double GRAVITY = 0.05, LIFT = 0.8, DIVE = 0.1, CLIMB = 4.0;
    /** Drag per tick (horizontal, vertical), how fast the heading follows the look, the stall speed and the top speed. */
    public static final double DRAG_H = 0.98, DRAG_V = 0.96, TURN = 0.1, STALL = 0.18, MAX_GLIDE = 0.75;
    /** Sinking faster than this is a dive, not a glide: fall damage counts again. */
    public static final double SAFE_SINK = 0.5;
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

    /** Just beat the wings in free flight (the beat shows for {@link #BEAT_SHOW} ticks of use). */
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
     * A wing beat on an Elytra: a push of {@link #BEAT} along the look, which can't take you past {@link #BEAT_CAP}
     * (but never slows a faster dive).
     */
    public static Vec3 beat(Vec3 velocity, Vec3 look) {
        Vec3 aim = look.lengthSqr() < 1e-8 ? new Vec3(0, 0, 1) : look.normalize();
        Vec3 v = velocity.add(aim.scale(BEAT));
        double before = velocity.length(), after = v.length();
        return after > BEAT_CAP && after > before ? v.scale(Math.max(BEAT_CAP, before) / after) : v;
    }

    /**
     * One tick of hang-gliding: Elytra-like physics, slower and draggier. Looking down turns height into speed, looking
     * up turns speed into height; below {@link #STALL} the wings lose their lift until you dive to pick up speed again.
     */
    public static Vec3 glide(Vec3 velocity, Vec3 look) {
        Vec3 aim = look.lengthSqr() < 1e-8 ? new Vec3(0, 0, 1) : look.normalize();
        double pitch = -Math.asin(Math.max(-1, Math.min(1, aim.y)));   // positive looking down, as Entity.getXRot
        double horiz = Math.sqrt(aim.x * aim.x + aim.z * aim.z);
        double hs = velocity.horizontalDistance();
        double cos2 = Math.cos(pitch) * Math.cos(pitch);
        double lift = cos2 * Math.min(1.0, hs / STALL);
        double vx = velocity.x, vy = velocity.y, vz = velocity.z;
        vy += GRAVITY * (-1 + lift * LIFT);
        if (vy < 0 && horiz > 1e-4) {   // the wings turn a fall into forward speed
            double k = vy * -DIVE * cos2;
            vx += aim.x * k / horiz;
            vy += k;
            vz += aim.z * k / horiz;
        }
        if (pitch < 0 && horiz > 1e-4) {   // pulling up spends speed on height
            double k = hs * -Math.sin(pitch) * 0.04;
            vx -= aim.x * k / horiz;
            vy += k * CLIMB;
            vz -= aim.z * k / horiz;
        }
        if (horiz > 1e-4) {   // the heading swings toward the look, keeping its speed
            vx += (aim.x / horiz * hs - vx) * TURN;
            vz += (aim.z / horiz * hs - vz) * TURN;
        }
        vx *= DRAG_H;
        vy *= DRAG_V;
        vz *= DRAG_H;
        double h = Math.sqrt(vx * vx + vz * vz);
        if (h > MAX_GLIDE) {
            vx *= MAX_GLIDE / h;
            vz *= MAX_GLIDE / h;
        }
        return new Vec3(vx, vy, vz);
    }

    /**
     * Moves a player the glider is carrying (called from LivingEntity.travel on the side that moves them). Returns false
     * if the glider isn't carrying them, so the vanilla physics run instead.
     */
    public static boolean travel(Player p) {
        if (!p.isControlledByLocalInstance() || !hangGliding(p)) {
            return false;   // free flight on an Elytra is the Elytra's own physics; beats push it (EndGliderItem.use)
        }
        Vec3 v = glide(p.getDeltaMovement(), p.getLookAngle());
        if (v.y > -SAFE_SINK) {
            p.resetFallDistance();   // a steady glide: no fall damage (a steep dive into the ground still hurts)
        }
        p.setDeltaMovement(v);
        p.move(MoverType.SELF, v);
        if (v.y > -SAFE_SINK) {
            p.resetFallDistance();
        }
        p.calculateEntityAnimation(false);
        return true;
    }

    /** Server tick: hang-gliding wears the glider 1 durability per second (beats wear it in EndGliderItem.use). */
    public static void serverTick(MinecraftServer server) {
        for (ServerPlayer p : server.getPlayerList().getPlayers()) {
            InteractionHand hand = hand(p);
            if (hand == null || !hangGliding(p)) {
                continue;
            }
            int t = FLIGHT_TICKS.merge(p.getUUID(), 1, Integer::sum);
            if (t >= 20) {
                FLIGHT_TICKS.put(p.getUUID(), 0);
                wear(p, hand);
            }
        }
    }

    /** One second of gliding, or one wing beat, on the glider in `hand`. */
    public static void wear(Player p, InteractionHand hand) {
        if (!p.getAbilities().instabuild) {
            p.getItemInHand(hand).hurtAndBreak(1, p, LivingEntity.getSlotForHand(hand));
        }
    }

    public static void forget(Player p) {
        FLIGHT_TICKS.remove(p.getUUID());
    }
}
