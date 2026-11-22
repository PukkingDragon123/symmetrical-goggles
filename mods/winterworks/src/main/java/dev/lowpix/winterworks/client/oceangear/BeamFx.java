package dev.lowpix.winterworks.client.oceangear;

import com.mojang.blaze3d.vertex.VertexConsumer;
import net.minecraft.util.Mth;
import org.joml.Matrix4f;
import org.joml.Vector3f;

/**
 * Additive glow shapes for the Elder Guardian's stare (drawn into {@code RenderType.dragonRays()}: coloured triangles,
 * additive, depth-tested): camera-facing ribbons soft at their edges, soft flares and rings. Coordinates are relative
 * to the camera.
 */
final class BeamFx {
    private BeamFx() {}

    private static Vector3f side(Vector3f p, Vector3f dir, Vector3f cam) {
        Vector3f s = new Vector3f(dir).cross(new Vector3f(cam).sub(p));
        if (s.lengthSquared() < 1.0E-6f) {
            s.set(1, 0, 0);
        }
        return s.normalize();
    }

    /** A ribbon from a to b, `w` either side, bright down its middle and fading to nothing at its edges. */
    static void ribbon(VertexConsumer vc, Matrix4f m, Vector3f a, Vector3f b, Vector3f cam, float w, int r, int g, int bl, int al) {
        if (al <= 0) {
            return;
        }
        Vector3f dir = new Vector3f(b).sub(a);
        if (dir.lengthSquared() < 1.0E-6f) {
            return;
        }
        dir.normalize();
        Vector3f sa = side(a, dir, cam).mul(w), sb = side(b, dir, cam).mul(w);
        tri(vc, m, a.x - sa.x, a.y - sa.y, a.z - sa.z, r, g, bl, 0, a.x, a.y, a.z, r, g, bl, al, b.x, b.y, b.z, r, g, bl, al);
        tri(vc, m, a.x - sa.x, a.y - sa.y, a.z - sa.z, r, g, bl, 0, b.x, b.y, b.z, r, g, bl, al, b.x - sb.x, b.y - sb.y, b.z - sb.z, r, g, bl, 0);
        tri(vc, m, a.x, a.y, a.z, r, g, bl, al, a.x + sa.x, a.y + sa.y, a.z + sa.z, r, g, bl, 0, b.x + sb.x, b.y + sb.y, b.z + sb.z, r, g, bl, 0);
        tri(vc, m, a.x, a.y, a.z, r, g, bl, al, b.x + sb.x, b.y + sb.y, b.z + sb.z, r, g, bl, 0, b.x, b.y, b.z, r, g, bl, al);
    }

    /** A soft camera-facing disc of light at `p`. */
    static void flare(VertexConsumer vc, Matrix4f m, Vector3f p, Vector3f cam, float size, int r, int g, int b, int a) {
        if (a <= 0) {
            return;
        }
        Vector3f toCam = new Vector3f(cam).sub(p);
        if (toCam.lengthSquared() < 1.0E-6f) {
            return;
        }
        toCam.normalize();
        Vector3f up = Math.abs(toCam.y) > 0.95f ? new Vector3f(1, 0, 0) : new Vector3f(0, 1, 0);
        Vector3f right = new Vector3f(toCam).cross(up).normalize(), top = new Vector3f(right).cross(toCam).normalize();
        int n = 20;
        for (int i = 0; i < n; i++) {
            float a0 = Mth.TWO_PI * i / n, a1 = Mth.TWO_PI * (i + 1) / n;
            float x0 = p.x + (right.x * Mth.cos(a0) + top.x * Mth.sin(a0)) * size, y0 = p.y + (right.y * Mth.cos(a0) + top.y * Mth.sin(a0)) * size,
                    z0 = p.z + (right.z * Mth.cos(a0) + top.z * Mth.sin(a0)) * size;
            float x1 = p.x + (right.x * Mth.cos(a1) + top.x * Mth.sin(a1)) * size, y1 = p.y + (right.y * Mth.cos(a1) + top.y * Mth.sin(a1)) * size,
                    z1 = p.z + (right.z * Mth.cos(a1) + top.z * Mth.sin(a1)) * size;
            tri(vc, m, p.x, p.y, p.z, r, g, b, a, x0, y0, z0, r, g, b, 0, x1, y1, z1, r, g, b, 0);
        }
    }

    /** A thin camera-facing ring at `p` (radius, width). */
    static void ring(VertexConsumer vc, Matrix4f m, Vector3f p, Vector3f cam, float radius, float width, int r, int g, int b, int a) {
        if (a <= 0) {
            return;
        }
        Vector3f toCam = new Vector3f(cam).sub(p);
        if (toCam.lengthSquared() < 1.0E-6f) {
            return;
        }
        toCam.normalize();
        Vector3f up = Math.abs(toCam.y) > 0.95f ? new Vector3f(1, 0, 0) : new Vector3f(0, 1, 0);
        Vector3f right = new Vector3f(toCam).cross(up).normalize(), top = new Vector3f(right).cross(toCam).normalize();
        int n = 28;
        float in = radius - width * 0.5f, out = radius + width * 0.5f;
        for (int i = 0; i < n; i++) {
            float a0 = Mth.TWO_PI * i / n, a1 = Mth.TWO_PI * (i + 1) / n;
            float c0 = Mth.cos(a0), s0 = Mth.sin(a0), c1 = Mth.cos(a1), s1 = Mth.sin(a1);
            Vector3f i0 = at(p, right, top, c0 * in, s0 * in), i1 = at(p, right, top, c1 * in, s1 * in);
            Vector3f m0 = at(p, right, top, c0 * radius, s0 * radius), m1 = at(p, right, top, c1 * radius, s1 * radius);
            Vector3f o0 = at(p, right, top, c0 * out, s0 * out), o1 = at(p, right, top, c1 * out, s1 * out);
            tri(vc, m, i0.x, i0.y, i0.z, r, g, b, 0, m0.x, m0.y, m0.z, r, g, b, a, m1.x, m1.y, m1.z, r, g, b, a);
            tri(vc, m, i0.x, i0.y, i0.z, r, g, b, 0, m1.x, m1.y, m1.z, r, g, b, a, i1.x, i1.y, i1.z, r, g, b, 0);
            tri(vc, m, m0.x, m0.y, m0.z, r, g, b, a, o0.x, o0.y, o0.z, r, g, b, 0, o1.x, o1.y, o1.z, r, g, b, 0);
            tri(vc, m, m0.x, m0.y, m0.z, r, g, b, a, o1.x, o1.y, o1.z, r, g, b, 0, m1.x, m1.y, m1.z, r, g, b, a);
        }
    }

    private static Vector3f at(Vector3f p, Vector3f right, Vector3f top, float u, float v) {
        return new Vector3f(p).add(right.x * u + top.x * v, right.y * u + top.y * v, right.z * u + top.z * v);
    }

    /** A triangle with both windings (the render type culls nothing, but the cheap way is safe either way). */
    private static void tri(VertexConsumer vc, Matrix4f m, float x0, float y0, float z0, int r0, int g0, int b0, int a0,
                            float x1, float y1, float z1, int r1, int g1, int b1, int a1,
                            float x2, float y2, float z2, int r2, int g2, int b2, int a2) {
        vc.addVertex(m, x0, y0, z0).setColor(r0, g0, b0, a0);
        vc.addVertex(m, x1, y1, z1).setColor(r1, g1, b1, a1);
        vc.addVertex(m, x2, y2, z2).setColor(r2, g2, b2, a2);
        vc.addVertex(m, x0, y0, z0).setColor(r0, g0, b0, a0);
        vc.addVertex(m, x2, y2, z2).setColor(r2, g2, b2, a2);
        vc.addVertex(m, x1, y1, z1).setColor(r1, g1, b1, a1);
    }
}
