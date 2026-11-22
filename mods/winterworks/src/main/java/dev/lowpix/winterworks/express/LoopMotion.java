package dev.lowpix.winterworks.express;

import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NbtUtils;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;
import org.joml.Quaternionf;

/**
 * A cart riding a Coaster Loop: scripted motion round a vertical circle of {@link #RADIUS} blocks. The server and the
 * clients run exactly the same steps from the same state (see LoopPayload), so the client draws a smooth loop while
 * the server stays authoritative.
 *
 * <p>The angle {@code theta} is 0 at the bottom (the loop block) and grows in the direction of travel: at pi/2 the cart
 * is on the far side climbing, at pi it is upside down at the top. Speed follows the cart's energy (it slows on the
 * way up and gains it back on the way down), so a cart leaves at the speed it came in. Too slow
 * ({@code < MIN_SPEED}) and it climbs only part of the way (never past {@link #MAX_CLIMB}), stops and rolls back out
 * the way it came, a little slower.
 */
public final class LoopMotion {
    /** The loop's radius to the ride surface (the rail tops), in blocks. */
    public static final double RADIUS = 3.0;
    /** The ride surface (rail tops) at the bottom of the loop: 2 px above the loop block's floor, like coaster rails. */
    public static final double RIDE = 2.0 / 16.0;
    /** A cart's origin sits 1 px below the rail tops (vanilla carts ride at y + 1/16), so it runs on this radius. */
    public static final double PATH = RADIUS + 1.0 / 16.0;
    /** Entry speed (blocks/tick) needed to go all the way round: what real gravity needs for this radius, about 0.8. */
    public static final double MIN_SPEED = 0.78;
    public static final double GRAVITY = 0.04;
    /** A slow cart never climbs past this (it would fall off the track): it stops below it and rolls back. */
    public static final double MAX_CLIMB = Math.toRadians(75);
    /** A slow cart leaves the loop with this share of its speed. */
    public static final double ROLLBACK_KEEP = 0.9;
    private static final double TWO_PI = Math.PI * 2;

    public final BlockPos loop;
    public final boolean alongX;
    /** +1 when the cart came in travelling toward +x / +z, -1 the other way. */
    public final int sign;
    /** Entry speed, blocks per tick. */
    public final double speed;
    /** Fast enough to go all the way round. */
    public final boolean full;
    private final double gravity, turn;
    public double theta, prevTheta;
    /** +1 climbing, -1 rolling back (slow carts only). */
    public int dir = 1;
    public int ticks;
    public boolean done;

    public LoopMotion(BlockPos loop, boolean alongX, int sign, double speed, double theta) {
        this.loop = loop.immutable();
        this.alongX = alongX;
        this.sign = sign >= 0 ? 1 : -1;
        this.speed = speed;
        this.theta = theta;
        this.prevTheta = theta;
        this.full = speed >= MIN_SPEED;
        if (full) {
            gravity = GRAVITY;
            turn = 0;
        } else {
            double k = speed * speed / (2 * GRAVITY * PATH);   // 1 - cos(theta where it would stop)
            double maxK = 1 - Math.cos(MAX_CLIMB);
            if (k <= maxK) {
                gravity = GRAVITY;
                turn = Math.max(0.02, Math.acos(1 - k));
            } else {   // it would reach the overhang and fall off: it loses its grip a little earlier instead
                gravity = speed * speed / (2 * PATH * maxK);
                turn = MAX_CLIMB;
            }
        }
    }

    /** How far a slow cart climbs before it rolls back (radians); 0 for a full loop. */
    public double turn() {
        return turn;
    }

    private double speedAt(double th) {
        double h = PATH * (1 - Math.cos(th));
        return Math.sqrt(Math.max(0, speed * speed - 2 * gravity * h));
    }

    /** Current speed along the track, blocks per tick. */
    public double currentSpeed() {
        return full ? Math.max(0.25, speedAt(theta)) : Math.max(0.05, speedAt(theta));
    }

    /** Advances one tick. */
    public void step() {
        prevTheta = theta;
        ticks++;
        if (full) {
            theta += currentSpeed() / PATH;
            if (theta >= TWO_PI) {
                done = true;
            }
        } else {
            theta += dir * currentSpeed() / PATH;
            if (dir > 0 && theta >= turn) {
                theta = 2 * turn - theta;
                dir = -1;
            }
            if (dir < 0 && theta <= 0) {
                done = true;
            }
        }
        if (ticks > 400) {   // can't happen (a loop takes well under 100 ticks), but never hang a cart in the air
            done = true;
        }
    }

    /** Unit direction of travel at the bottom of the loop (the way it came in). */
    public Vec3 axis() {
        return alongX ? new Vec3(sign, 0, 0) : new Vec3(0, 0, sign);
    }

    public Vec3 center() {
        return new Vec3(loop.getX() + 0.5, loop.getY() + RIDE + RADIUS, loop.getZ() + 0.5);
    }

    /** The cart's "up" (toward the loop's centre) at angle th. */
    public Vec3 up(double th) {
        Vec3 a = axis();
        double s = Math.sin(th), c = Math.cos(th);
        return new Vec3(-a.x * s, c, -a.z * s);
    }

    /** Forward along the track at angle th (the way a full-loop cart travels). */
    public Vec3 tangent(double th) {
        Vec3 a = axis();
        double s = Math.sin(th), c = Math.cos(th);
        return new Vec3(a.x * c, s, a.z * c);
    }

    /** Where the cart's origin is at angle th. */
    public Vec3 cartPos(double th) {
        return center().subtract(up(th).scale(PATH));
    }

    public Vec3 cartPos() {
        return cartPos(theta);
    }

    /** Where the cart comes out once done: past the bottom by however far it overshot this tick. */
    public Vec3 exitPos() {
        Vec3 bottom = cartPos(0);
        double over = full ? (theta - TWO_PI) * PATH : -theta * PATH;
        return bottom.add(axis().scale((full ? 1 : -1) * Math.max(0, over)));
    }

    /** Velocity on leaving: the entry speed and direction for a full loop, back the way it came (a bit slower) else. */
    public Vec3 exitVelocity() {
        return axis().scale(full ? speed : -speed * ROLLBACK_KEEP);
    }

    public float interpolatedTheta(float partial) {
        return (float) Mth.lerp(partial, prevTheta, theta);
    }

    /** The rotation that tips a cart (and its rider) from level to its place on the loop at angle th. */
    public Quaternionf rotation(float th) {
        Vec3 a = axis();   // about axis x up = a x (0, 1, 0)
        return new Quaternionf().rotationAxis(th, (float) -a.z, 0f, (float) a.x);
    }

    public CompoundTag save() {
        CompoundTag t = new CompoundTag();
        t.put("Loop", NbtUtils.writeBlockPos(loop));
        t.putBoolean("AlongX", alongX);
        t.putInt("Sign", sign);
        t.putDouble("Speed", speed);
        t.putDouble("Theta", theta);
        t.putInt("Dir", dir);
        t.putInt("Ticks", ticks);
        return t;
    }

    public static LoopMotion load(CompoundTag t) {
        BlockPos pos = NbtUtils.readBlockPos(t, "Loop").orElse(BlockPos.ZERO);
        LoopMotion m = new LoopMotion(pos, t.getBoolean("AlongX"), t.getInt("Sign"), t.getDouble("Speed"), t.getDouble("Theta"));
        m.dir = t.getInt("Dir") < 0 ? -1 : 1;
        m.ticks = t.getInt("Ticks");
        return m;
    }

    /** A copy with the same state (for the client). */
    public static LoopMotion of(BlockPos loop, boolean alongX, int sign, double speed, double theta, int dir, int ticks) {
        LoopMotion m = new LoopMotion(loop, alongX, sign, speed, theta);
        m.dir = dir < 0 ? -1 : 1;
        m.ticks = ticks;
        return m;
    }
}
