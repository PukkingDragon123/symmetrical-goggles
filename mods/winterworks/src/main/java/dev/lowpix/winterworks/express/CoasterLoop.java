package dev.lowpix.winterworks.express;

import dev.lowpix.winterworks.net.LoopPayload;
import dev.lowpix.winterworks.registry.WWSounds;
import net.fabricmc.fabric.api.networking.v1.EntityTrackingEvents;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.PlayerLookup;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.vehicle.AbstractMinecart;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * Riding the Coaster Loop. A minecart that rolls onto a loop block in line with it (RailPhysics, server) starts a
 * {@link LoopMotion}; from then on its own tick is replaced by {@link #tick} (mixin.AbstractMinecartMixin), on the
 * server and on every client that tracks it (LoopPayload carries the state, so both run the same steps). Couplings
 * leave looping cars alone, so a train loops one car after another. Riders are carried round with the cart
 * ({@link #riderPosition}) and drawn tipped with it (client mixins), and can't get off mid-loop.
 */
public final class CoasterLoop {
    private CoasterLoop() {}

    public static void init() {
        PayloadTypeRegistry.playS2C().register(LoopPayload.TYPE, LoopPayload.CODEC);
        EntityTrackingEvents.START_TRACKING.register((entity, player) -> {
            LoopMotion m = motion(entity);
            if (m != null) {
                ServerPlayNetworking.send(player, LoopPayload.start(entity.getId(), m));
            }
        });
    }

    @Nullable
    public static LoopMotion motion(@Nullable Entity e) {
        return e instanceof CartRide r ? r.ww$loop() : null;
    }

    public static boolean looping(@Nullable Entity e) {
        return motion(e) != null;
    }

    /** The loop ride of the cart this entity sits in, if it is looping. */
    @Nullable
    public static LoopMotion vehicleMotion(@Nullable Entity passenger) {
        return passenger == null ? null : motion(passenger.getVehicle());
    }

    /** Server, after a cart's normal tick: did it just roll onto a Coaster Loop, in line with it? Then start the ride. */
    static void checkEntry(AbstractMinecart cart, ServerLevel level) {
        CartRide ride = (CartRide) cart;
        BlockPos cooldown = ride.ww$loopCooldown();
        Vec3 from = new Vec3(cart.xo, cart.yo, cart.zo), to = cart.position();
        int n = Math.max(1, (int) Math.ceil(from.distanceTo(to) / 0.25));
        BlockPos found = null;
        boolean touchedCooldown = false;
        for (int i = 0; i <= n; i++) {   // fast carts can cross a whole block in one tick: look along the way
            BlockPos at = BlockPos.containing(from.lerp(to, i / (double) n));
            for (BlockPos q : new BlockPos[]{at, at.below()}) {
                if (level.getBlockState(q).getBlock() instanceof CoasterLoopBlock) {
                    if (q.equals(cooldown)) {
                        touchedCooldown = true;
                    } else if (found == null) {
                        found = q.immutable();
                    }
                }
            }
        }
        if (cooldown != null && !touchedCooldown) {
            ride.ww$setLoopCooldown(null);
        }
        if (found == null || Math.abs(cart.getY() - (found.getY() + 0.0625)) > 0.6) {
            return;
        }
        boolean alongX = CoasterLoopBlock.alongX(level.getBlockState(found));
        Vec3 v = cart.getDeltaMovement();
        double along = alongX ? v.x : v.z, across = alongX ? v.z : v.x;
        if (Math.abs(along) < 0.02 || Math.abs(across) > Math.abs(along) * 0.5) {
            return;   // not moving in line with the loop
        }
        int sign = along > 0 ? 1 : -1;
        // vanilla lets a fast cart's velocity run ahead of what it really moves (its speed limit clamps each step):
        // ride the loop at the speed it was actually going
        double limit = 0.4 * Math.max(1.0, ((CartSpeed) cart).ww$speedFactor());
        double speed = Math.min(Math.min(2.0, limit), new Vec3(v.x, 0, v.z).length());
        double off = alongX ? to.x - (found.getX() + 0.5) : to.z - (found.getZ() + 0.5);
        double theta = Mth.clamp(sign * off / LoopMotion.PATH, -0.2, 0.6);
        start(cart, level, new LoopMotion(found, alongX, sign, speed, theta));
    }

    /** Starts a loop ride (server). */
    public static void start(AbstractMinecart cart, ServerLevel level, LoopMotion m) {
        ((CartRide) cart).ww$setLoop(m);
        Vec3 p = m.cartPos();
        cart.setPos(p.x, p.y, p.z);
        LoopPayload pay = LoopPayload.start(cart.getId(), m);
        for (ServerPlayer sp : PlayerLookup.tracking(cart)) {
            ServerPlayNetworking.send(sp, pay);
        }
        if (m.full) {
            level.playSound(null, m.loop, WWSounds.BOOSTER, SoundSource.BLOCKS, 0.7f, 0.6f);
        }
    }

    /** One tick of a loop ride, in place of the minecart's own tick (both sides). */
    public static void tick(AbstractMinecart cart, LoopMotion m) {
        Level level = cart.level();
        if (!level.isClientSide) {
            if (cart.getHurtTime() > 0) {
                cart.setHurtTime(cart.getHurtTime() - 1);
            }
            if (cart.getDamage() > 0f) {
                cart.setDamage(cart.getDamage() - 1f);
            }
            if (!(level.getBlockState(m.loop).getBlock() instanceof CoasterLoopBlock)) {   // the loop was broken under it
                abort(cart, m);
                return;
            }
        }
        Vec3 before = cart.position();
        m.step();
        if (m.done) {
            finish(cart, m);
            return;
        }
        Vec3 p = m.cartPos();
        cart.setPos(p.x, p.y, p.z);
        cart.setDeltaMovement(p.subtract(before));
        cart.resetFallDistance();
        if (level.isClientSide) {   // vanilla's renderer: keep the cart level along the loop's axis (its tilt is added on top)
            float yaw = m.alongX ? 0f : 90f;
            if (Math.abs(Mth.wrapDegrees(cart.getYRot() - yaw)) > 90f) {
                yaw += 180f;
            }
            cart.setYRot(yaw);
            cart.yRotO = yaw;
            cart.setXRot(0f);
            cart.xRotO = 0f;
        } else if (m.full && level instanceof ServerLevel sl && cart.tickCount % 2 == 0) {   // sparks off the wheels
            Vec3 w = p.add(m.up(m.theta).scale(0.05));
            sl.sendParticles(ParticleTypes.CRIT, w.x, w.y, w.z, 1, 0.2, 0.05, 0.2, 0.05);
        }
    }

    private static void finish(AbstractMinecart cart, LoopMotion m) {
        CartRide ride = (CartRide) cart;
        ride.ww$setLoop(null);
        ride.ww$setLoopCooldown(m.loop);
        Vec3 p = m.exitPos();
        cart.setPos(p.x, p.y, p.z);
        cart.setDeltaMovement(m.exitVelocity());
        cart.resetFallDistance();
        // leave at the speed it came in: let the speed limit allow it (it relaxes again on the rails that follow)
        CartSpeed sp = (CartSpeed) cart;
        sp.ww$setSpeedFactor(Math.max(sp.ww$speedFactor(), m.speed / 0.4 + 0.05));
    }

    private static void abort(AbstractMinecart cart, LoopMotion m) {
        ((CartRide) cart).ww$setLoop(null);
        cart.setDeltaMovement(m.tangent(m.theta).scale(m.dir * m.currentSpeed()));
        LoopPayload pay = LoopPayload.stop(cart.getId());
        for (ServerPlayer sp : PlayerLookup.tracking(cart)) {
            ServerPlayNetworking.send(sp, pay);
        }
    }

    /** Where a passenger sits while the cart loops: its usual seat, tipped with the cart. Null when not looping. */
    @Nullable
    public static Vec3 riderPosition(AbstractMinecart cart, Entity passenger) {
        LoopMotion m = motion(cart);
        if (m == null) {
            return null;
        }
        Vec3 seat = cart.getPassengerRidingPosition(passenger).subtract(passenger.getVehicleAttachmentPoint(cart)).subtract(cart.position());
        Vec3 a = m.axis();
        double along = seat.dot(a);
        Vec3 side = seat.subtract(a.scale(along)).subtract(0, seat.y, 0);
        return cart.position().add(m.up(m.theta).scale(seat.y)).add(m.tangent(m.theta).scale(along)).add(side);
    }

    /** The cart's "up" right now: (0, 1, 0) unless it is looping. */
    public static Vec3 upOf(Entity e, float partial) {
        LoopMotion m = motion(e);
        return m == null ? new Vec3(0, 1, 0) : m.up(m.interpolatedTheta(partial));
    }
}
