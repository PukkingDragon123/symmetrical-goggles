package dev.lowpix.winterworks.client.boss;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import net.minecraft.client.Minecraft;
import net.minecraft.util.Mth;

/**
 * Camera shake (client): a decaying, smoothly random wobble of the view. Fed by CameraShakePayload, applied by
 * mixin.client.GameRendererMixin in GameRenderer#bobHurt. Several shakes add up (capped). Scaled by the
 * "Distortion Effects" accessibility slider, so it can be turned off. {@link #kick} is a single directional jolt
 * (the Fang Daggers' hits).
 */
public final class CameraShake {
    private static final int MAX = 8;
    private static final float[] strength = new float[MAX];
    private static final int[] age = new int[MAX], life = new int[MAX];
    private static long ticks;

    private CameraShake() {}

    /** Starts a shake: `degrees` peak tilt, dying away over `ticks`. */
    public static void add(float degrees, int ticks) {
        if (degrees <= 0 || ticks <= 0) {
            return;
        }
        int slot = 0;
        float weakest = Float.MAX_VALUE;
        for (int i = 0; i < MAX; i++) {
            float left = current(i, 0f);
            if (left < weakest) {
                weakest = left;
                slot = i;
            }
        }
        strength[slot] = Math.min(degrees, 6f);
        age[slot] = 0;
        life[slot] = ticks;
    }

    // a kick: one quick directional jolt of the view that springs back (a weapon's impact), not a wobble
    private static float kickYaw, kickPitch, kickRoll;
    private static int kickAge, kickLife;

    /** A little camera kick: jolts the view by these angles (degrees) at once, easing back over `ticks`. */
    public static void kick(float yaw, float pitch, float roll, int ticks) {
        float left = kickLeft(0f);
        kickYaw = kickYaw * left + yaw;
        kickPitch = kickPitch * left + pitch;
        kickRoll = kickRoll * left + roll;
        kickAge = 0;
        kickLife = Math.max(1, ticks);
    }

    private static float kickLeft(float partial) {
        if (kickLife <= 0 || kickAge >= kickLife) {
            return 0f;
        }
        float t = Math.min(1f, (kickAge + partial) / kickLife);
        float k = 1f - t;
        return k * k * Math.min(1f, (kickAge + partial) * 2.5f);   // snaps in within half a tick, then eases back
    }

    public static void tick() {
        ticks++;
        for (int i = 0; i < MAX; i++) {
            if (age[i] < life[i]) {
                age[i]++;
            }
        }
        if (kickAge < kickLife) {
            kickAge++;
        }
    }

    private static float current(int i, float partial) {
        if (life[i] <= 0 || age[i] >= life[i]) {
            return 0f;
        }
        float t = Math.min(1f, (age[i] + partial) / life[i]);
        float k = 1f - t;
        return strength[i] * k * k;
    }

    /** Total amplitude right now, in degrees. */
    public static float amplitude(float partial) {
        float a = 0f;
        for (int i = 0; i < MAX; i++) {
            a += current(i, partial);
        }
        return Math.min(a, 7f);
    }

    public static void apply(PoseStack pose, float partial) {
        Minecraft mc = Minecraft.getInstance();
        float k = kickLeft(partial);
        if (k > 0.001f) {
            float s = (mc.options == null ? 1f : mc.options.screenEffectScale().get().floatValue()) * k;
            pose.mulPose(Axis.XP.rotationDegrees(kickPitch * s));
            pose.mulPose(Axis.YP.rotationDegrees(kickYaw * s));
            pose.mulPose(Axis.ZP.rotationDegrees(kickRoll * s));
        }
        float amp = amplitude(partial);
        if (amp <= 0.001f) {
            return;
        }
        float scale = mc.options == null ? 1f : mc.options.screenEffectScale().get().floatValue();
        amp *= scale;
        if (amp <= 0.001f) {
            return;
        }
        float t = ticks + partial;
        // a few incommensurate sines: random-looking but smooth, so it rumbles instead of flickering
        float pitch = (Mth.sin(t * 1.9f) * 0.6f + Mth.sin(t * 3.7f + 1.3f) * 0.4f) * amp;
        float yaw = (Mth.sin(t * 2.3f + 0.7f) * 0.6f + Mth.sin(t * 4.1f + 2.1f) * 0.4f) * amp * 0.7f;
        float roll = (Mth.sin(t * 1.4f + 2.9f) * 0.7f + Mth.sin(t * 5.3f) * 0.3f) * amp * 0.5f;
        pose.mulPose(Axis.XP.rotationDegrees(pitch));
        pose.mulPose(Axis.YP.rotationDegrees(yaw));
        pose.mulPose(Axis.ZP.rotationDegrees(roll));
    }

    public static void clear() {
        for (int i = 0; i < MAX; i++) {
            life[i] = 0;
        }
        kickLife = 0;
    }
}
