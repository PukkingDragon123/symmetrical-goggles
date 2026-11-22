package dev.lowpix.winterworks.client.endboss;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.endboss.Monolith;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;
import org.joml.Vector3f;

/**
 * The Monolith drawn from obsidian until its lowpix model is exported: a tall slab (crying-obsidian cap and foot,
 * side fins) with three almond eyes and glowing runes on its face, a ring of debris turning round it, and two great
 * hands (palm, four two-jointed fingers, a thumb) posed by what each hand is doing. Everything in blocks; the body is
 * drawn turned to its yaw (+Z forward, +X its left), the hands at their synced positions.
 */
final class MonolithStandIn {
    static final float FRONT = 0.66f;
    /** The eyes on its face (left, up, forward). */
    static final float[][] EYES = {{0f, 5.55f}, {-0.64f, 4.78f}, {0.64f, 4.78f}};

    private MonolithStandIn() {}

    static Vector3f[] eyesWorld(float yaw, float bob) {
        Vector3f[] out = new Vector3f[EYES.length];
        for (int i = 0; i < EYES.length; i++) {
            out[i] = new Vector3f(EYES[i][0], EYES[i][1] + bob, FRONT + 0.05f).rotateY(-yaw * Mth.DEG_TO_RAD);
        }
        return out;
    }

    static void render(Monolith e, PoseStack pose, MultiBufferSource buffers, int light, int overlay, float age, float yaw, float bob,
                       float death, float glow, Vector3f hl, Vector3f hr) {
        VertexConsumer obsidian = buffers.getBuffer(RenderType.entityCutoutNoCull(MonolithRenderer.OBSIDIAN));
        VertexConsumer crying = buffers.getBuffer(RenderType.entityCutoutNoCull(MonolithRenderer.CRYING));
        float clip = Mth.lerp(death, 7f, 0.4f);   // it crumbles from the top down
        pose.pushPose();
        pose.translate(0f, bob - death * 0.6f, 0f);
        pose.mulPose(Axis.YP.rotationDegrees(-yaw));
        PoseStack.Pose p = pose.last();
        box(obsidian, p, -1.3f, 0.9f, -0.65f, 1.3f, Math.min(clip, 6.3f), 0.65f, light, overlay);
        if (clip > 6.3f) {
            box(crying, p, -1.12f, 6.3f, -0.56f, 1.12f, Math.min(clip, 6.78f), 0.56f, light, overlay);
            box(obsidian, p, -0.5f, 6.78f, -0.3f, 0.5f, Math.min(clip, 7.05f), 0.3f, light, overlay);
        }
        box(crying, p, -1.06f, 0.42f, -0.55f, 1.06f, 0.9f, 0.55f, light, overlay);
        box(obsidian, p, -0.6f, 0.05f, -0.35f, 0.6f, 0.42f, 0.35f, light, overlay);
        for (int s = -1; s <= 1; s += 2) {   // fins down its sides
            box(obsidian, p, s > 0 ? 1.3f : -1.55f, 1.5f, -0.3f, s > 0 ? 1.55f : -1.3f, Math.min(clip, 5.7f), 0.3f, light, overlay);
            box(crying, p, s > 0 ? 1.55f : -1.72f, 2.6f, -0.16f, s > 0 ? 1.72f : -1.55f, Math.min(clip, 4.6f), 0.16f, light, overlay);
        }
        VertexConsumer fx = buffers.getBuffer(RenderType.dragonRays());
        Matrix4f m = p.pose();
        runes(fx, m, age, glow, clip);
        eyes(fx, m, e, age, glow, clip, yaw);
        shards(obsidian, crying, pose, light, overlay, age, death);
        pose.popPose();
        hand(e, true, hl, pose, buffers, obsidian, crying, light, overlay, age, yaw, glow, death);
        hand(e, false, hr, pose, buffers, obsidian, crying, light, overlay, age, yaw, glow, death);
    }

    // ------------------------------------------------------------------------------------------------ geometry

    /** A box tiled with its texture once per block. */
    static void box(VertexConsumer vc, PoseStack.Pose p, float x0, float y0, float z0, float x1, float y1, float z1, int light, int overlay) {
        if (y1 <= y0) {
            return;
        }
        float dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
        face(vc, p, light, overlay, 0, 0, 1, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, dx, dy);
        face(vc, p, light, overlay, 0, 0, -1, x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, dx, dy);
        face(vc, p, light, overlay, 1, 0, 0, x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, dz, dy);
        face(vc, p, light, overlay, -1, 0, 0, x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, dz, dy);
        face(vc, p, light, overlay, 0, 1, 0, x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, dx, dz);
        face(vc, p, light, overlay, 0, -1, 0, x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, dx, dz);
    }

    private static void face(VertexConsumer vc, PoseStack.Pose p, int light, int overlay, float nx, float ny, float nz,
                             float ax, float ay, float az, float bx, float by, float bz, float cx, float cy, float cz,
                             float qx, float qy, float qz, float du, float dv) {
        v(vc, p, ax, ay, az, 0, dv, light, overlay, nx, ny, nz);
        v(vc, p, bx, by, bz, du, dv, light, overlay, nx, ny, nz);
        v(vc, p, cx, cy, cz, du, 0, light, overlay, nx, ny, nz);
        v(vc, p, qx, qy, qz, 0, 0, light, overlay, nx, ny, nz);
    }

    private static void v(VertexConsumer vc, PoseStack.Pose p, float x, float y, float z, float u, float vv, int light, int overlay,
                          float nx, float ny, float nz) {
        vc.addVertex(p, x, y, z).setColor(0xFFFFFFFF).setUv(u, vv).setOverlay(overlay).setLight(light).setNormal(p, nx, ny, nz);
    }

    /** A glowing almond (additive): bright core, soft edge. */
    static void almond(VertexConsumer vc, Matrix4f m, float cx, float cy, float z, float rx, float ry, int r, int g, int b, int a) {
        int n = 20;
        for (int i = 0; i < n; i++) {
            float a0 = Mth.TWO_PI * i / n, a1 = Mth.TWO_PI * (i + 1) / n;
            float x0 = cx + Mth.cos(a0) * rx, y0 = cy + Mth.sin(a0) * ry * (0.6f + 0.4f * Math.abs(Mth.cos(a0)));
            float x1 = cx + Mth.cos(a1) * rx, y1 = cy + Mth.sin(a1) * ry * (0.6f + 0.4f * Math.abs(Mth.cos(a1)));
            vc.addVertex(m, cx, cy, z).setColor(r, g, b, a);
            vc.addVertex(m, x0, y0, z).setColor(r, g, b, 0);
            vc.addVertex(m, x1, y1, z).setColor(r, g, b, 0);
            vc.addVertex(m, cx, cy, z).setColor(r, g, b, a);
            vc.addVertex(m, x1, y1, z).setColor(r, g, b, 0);
            vc.addVertex(m, x0, y0, z).setColor(r, g, b, 0);
        }
    }

    /** A glowing line on the face (additive, soft sides). */
    private static void line(VertexConsumer vc, Matrix4f m, float x0, float y0, float x1, float y1, float w, float z, int r, int g, int b, int a) {
        float dx = x1 - x0, dy = y1 - y0, len = Mth.sqrt(dx * dx + dy * dy);
        if (len < 1.0E-4f) {
            return;
        }
        float nx = -dy / len * w, ny = dx / len * w;
        float[][] q = {{x0 - nx, y0 - ny, 0}, {x1 - nx, y1 - ny, 0}, {x1, y1, a}, {x0, y0, a}, {x1 + nx, y1 + ny, 0}, {x0 + nx, y0 + ny, 0}};
        int[][] tris = {{0, 1, 2}, {0, 2, 3}, {3, 2, 4}, {3, 4, 5}};
        for (int[] t : tris) {
            for (int k = 0; k < 2; k++) {
                int[] o = k == 0 ? t : new int[]{t[0], t[2], t[1]};
                for (int i : o) {
                    vc.addVertex(m, q[i][0], q[i][1], z).setColor(r, g, b, (int) q[i][2]);
                }
            }
        }
    }

    private static void runes(VertexConsumer fx, Matrix4f m, float age, float glow, float clip) {
        float z = FRONT + 0.012f;
        float k = Mth.clamp(glow, 0f, 1.5f);
        int a = (int) (150 * k * (0.75f + 0.25f * Mth.sin(age * 0.09f)));
        int r = 190, g = 80, b = 255;
        float top = Math.min(clip, 4.2f);
        if (top > 1.3f) {
            line(fx, m, 0f, 1.3f, 0f, top, 0.05f, z, r, g, b, a);
        }
        for (float y = 1.7f; y < Math.min(clip, 4.1f); y += 0.8f) {   // bars and diamonds down the spine
            float wob = 0.32f + 0.1f * Mth.sin(y * 3f);
            line(fx, m, -wob, y, wob, y, 0.04f, z, r, g, b, a);
            line(fx, m, -0.16f, y + 0.25f, 0f, y + 0.42f, 0.03f, z, r, g, b, a);
            line(fx, m, 0f, y + 0.42f, 0.16f, y + 0.25f, 0.03f, z, r, g, b, a);
        }
        // the eyes' frame: a triangle of runes round them
        if (clip > 5.9f) {
            line(fx, m, 0f, 6.05f, -1.05f, 4.35f, 0.035f, z, r, g, b, (int) (a * 0.8f));
            line(fx, m, 0f, 6.05f, 1.05f, 4.35f, 0.035f, z, r, g, b, (int) (a * 0.8f));
            line(fx, m, -1.05f, 4.35f, 1.05f, 4.35f, 0.035f, z, r, g, b, (int) (a * 0.8f));
        }
    }

    private static void eyes(VertexConsumer fx, Matrix4f m, Monolith e, float age, float glow, float clip, float yaw) {
        float z = FRONT + 0.02f;
        float k = Mth.clamp(glow, 0f, 1.6f);
        // where its pupils look: towards whoever it stares at (else ahead)
        float px = 0f, py = 0f;
        int id = e.stareTarget();
        Entity t = id >= 0 ? e.level().getEntity(id) : null;
        if (t != null) {
            Vec3 d = t.getEyePosition().subtract(e.getEyePosition());
            Vector3f local = new Vector3f((float) d.x, (float) d.y, (float) d.z).rotateY(yaw * Mth.DEG_TO_RAD).normalize();
            px = Mth.clamp(local.x, -1f, 1f) * 0.08f;
            py = Mth.clamp(local.y, -1f, 1f) * 0.05f;
        }
        for (int i = 0; i < EYES.length; i++) {
            float x = EYES[i][0], y = EYES[i][1];
            if (y > clip) {
                continue;
            }
            float big = i == 0 ? 1.2f : 1f;
            float open = e.isAwake() || e.isDeadOrDying() ? 1f : 0.35f;
            almond(fx, m, x, y, z, 0.62f * big * k, 0.42f * big * k, 160, 50, 255, (int) (90 * Math.min(1f, k)));
            almond(fx, m, x, y, z + 0.004f, 0.3f * big, 0.17f * big * open, 230, 140, 255, (int) (255 * Math.min(1f, k)));
            almond(fx, m, x + px, y + py, z + 0.008f, 0.13f * big, 0.1f * big * open, 255, 245, 255, (int) (255 * Math.min(1f, k * 1.2f)));
            if (glow > 1f) {   // the stare flares them
                almond(fx, m, x, y, z + 0.012f, 1.1f * big * (glow - 0.6f), 0.5f * big * (glow - 0.6f), 255, 150, 255,
                        (int) (120 * Math.min(1f, glow - 1f)));
            }
        }
    }

    private static void shards(VertexConsumer obsidian, VertexConsumer crying, PoseStack pose, int light, int overlay, float age, float death) {
        for (int i = 0; i < 11; i++) {
            float a = i * (Mth.TWO_PI / 11) + age * 0.009f;
            float r = 2.35f + 0.45f * Mth.sin(i * 1.7f);
            float y = 1.4f + (i * 7 % 5) * 0.95f + Mth.sin(age * 0.04f + i) * 0.22f;
            y = Mth.lerp(death, y, 0.15f + (i % 3) * 0.1f);
            float s = 0.16f + (i * 5 % 4) * 0.06f;
            pose.pushPose();
            pose.translate(Mth.cos(a) * r, y, Mth.sin(a) * r);
            pose.mulPose(Axis.YP.rotation(age * 0.03f + i));
            pose.mulPose(Axis.XP.rotation(age * 0.021f + i * 0.7f));
            box(i % 4 == 0 ? crying : obsidian, pose.last(), -s, -s * 0.8f, -s * 0.7f, s, s * 0.8f, s * 0.7f, light, overlay);
            pose.popPose();
        }
    }

    // ------------------------------------------------------------------------------------------------ the hands

    private static void hand(Monolith e, boolean left, Vector3f at, PoseStack pose, MultiBufferSource buffers, VertexConsumer obsidian,
                             VertexConsumer crying, int light, int overlay, float age, float yaw, float glow, float death) {
        byte st = e.handState(left);
        float pitch = 25f, roll = 18f, curl = 0.45f, spread = 0.06f, handYaw = yaw;
        switch (st) {
            case Monolith.H_SLAM_AIM -> {
                pitch = -12f;
                roll = 0f;
                curl = 0.12f;
                spread = 0.12f;
            }
            case Monolith.H_SLAM_FALL, Monolith.H_SLAM_DOWN -> {
                pitch = 0f;
                roll = 0f;
                curl = 0.04f;
                spread = 0.16f;
            }
            case Monolith.H_GRAB_WIND -> {
                pitch = -55f;
                roll = 0f;
                curl = 0.15f;
                spread = 0.22f;
            }
            case Monolith.H_GRAB_REACH -> {
                Vector3f o = left ? e.handLO : e.handRO, n = left ? e.handL : e.handR;
                if (n.distanceSquared(o) > 0.01f) {   // it reaches the way it is moving
                    handYaw = (float) (Mth.atan2(n.z - o.z, n.x - o.x) * Mth.RAD_TO_DEG) - 90f;
                }
                pitch = -75f;
                roll = 0f;
                curl = 0.25f;
                spread = 0.26f;
            }
            case Monolith.H_GRAB_HOLD -> {
                pitch = 10f;
                roll = 0f;
                curl = 1.35f;
                spread = 0f;
            }
            case Monolith.H_CLAP_SPREAD, Monolith.H_CLAP_HIT -> {
                pitch = 0f;
                roll = -88f;
                curl = 0.08f;
                spread = 0.05f;
            }
            case Monolith.H_SUMMON -> {
                pitch = -25f;
                roll = 175f;
                curl = 0.3f + 0.15f * Mth.sin(age * 0.3f);
                spread = 0.24f;
            }
            case Monolith.H_DEAD -> {
                pitch = 40f + death * 50f;
                roll = 30f * death;
                curl = 0.9f;
                spread = 0.1f;
            }
            default -> curl = 0.45f + 0.08f * Mth.sin(age * 0.07f + (left ? 0f : 2f));
        }
        pose.pushPose();
        pose.translate(at.x, at.y, at.z);
        pose.mulPose(Axis.YP.rotationDegrees(-handYaw));
        if (!left) {
            pose.scale(-1f, 1f, 1f);
        }
        pose.mulPose(Axis.ZP.rotationDegrees(roll));
        pose.mulPose(Axis.XP.rotationDegrees(pitch));
        if (death > 0f) {
            float s = 1f - death * 0.5f;
            pose.scale(s, s, s);
        }
        PoseStack.Pose p = pose.last();
        // the palm and the back of the hand
        box(obsidian, p, -0.62f, -0.22f, -0.78f, 0.62f, 0.22f, 0.56f, light, overlay);
        box(crying, p, -0.5f, 0.22f, -0.62f, 0.5f, 0.3f, 0.36f, light, overlay);
        box(obsidian, p, -0.42f, -0.18f, -1.05f, 0.42f, 0.18f, -0.78f, light, overlay);   // the wrist stump
        // four fingers, two joints each
        float[] xs = {0.45f, 0.15f, -0.15f, -0.45f};
        float[] lens = {0.5f, 0.56f, 0.53f, 0.42f};
        for (int i = 0; i < 4; i++) {
            pose.pushPose();
            pose.translate(xs[i], 0f, 0.56f);
            pose.mulPose(Axis.YP.rotationDegrees((1.5f - i) * spread * 40f));
            pose.mulPose(Axis.XP.rotationDegrees(curl * 52f));
            box(obsidian, pose.last(), -0.12f, -0.13f, 0f, 0.12f, 0.13f, lens[i], light, overlay);
            pose.translate(0f, 0f, lens[i]);
            pose.mulPose(Axis.XP.rotationDegrees(curl * 62f));
            box(obsidian, pose.last(), -0.11f, -0.12f, 0f, 0.11f, 0.12f, lens[i] * 0.82f, light, overlay);
            pose.popPose();
        }
        // the thumb, on the side towards the body
        pose.pushPose();
        pose.translate(-0.6f, -0.02f, -0.1f);
        pose.mulPose(Axis.YP.rotationDegrees(-38f - spread * 30f));
        pose.mulPose(Axis.XP.rotationDegrees(curl * 40f));
        box(obsidian, pose.last(), -0.13f, -0.13f, 0f, 0.13f, 0.13f, 0.45f, light, overlay);
        pose.translate(0f, 0f, 0.45f);
        pose.mulPose(Axis.XP.rotationDegrees(curl * 50f));
        box(obsidian, pose.last(), -0.12f, -0.12f, 0f, 0.12f, 0.12f, 0.36f, light, overlay);
        pose.popPose();
        // a rune eye on the back of the hand
        VertexConsumer fx = buffers.getBuffer(RenderType.dragonRays());
        pose.pushPose();
        pose.translate(0f, 0.305f, -0.13f);
        pose.mulPose(Axis.XP.rotationDegrees(-90f));
        Matrix4f top = pose.last().pose();
        float k = Mth.clamp(glow, 0f, 1.4f);
        boolean busy = st != Monolith.H_REST && st != Monolith.H_RETURN && st != Monolith.H_DEAD;
        float kk = k * (busy ? 1.25f : 0.8f);
        almond(fx, top, 0f, 0f, 0f, 0.34f * kk, 0.2f * kk, 190, 70, 255, (int) (110 * Math.min(1f, kk)));
        almond(fx, top, 0f, 0f, 0.002f, 0.12f, 0.07f, 255, 220, 255, (int) (230 * Math.min(1f, kk)));
        pose.popPose();
        pose.popPose();
    }
}
