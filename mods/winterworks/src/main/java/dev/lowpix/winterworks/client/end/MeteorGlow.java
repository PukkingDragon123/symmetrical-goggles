package dev.lowpix.winterworks.client.end;

import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.blaze3d.vertex.VertexConsumer;
import com.mojang.blaze3d.vertex.VertexFormat;
import net.minecraft.client.renderer.RenderStateShard;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;

/**
 * Glows for meteors and the Monolith Wand: an additive, untextured, unculled render type that keeps depth testing but
 * doesn't write depth (so glows behind terrain hide and glows overlap softly), and shapes drawn with it: camera-facing
 * soft discs (bright middle, fading edge), tapering ribbons through a line of points, and flat rings. Colours are
 * 0xRRGGBB, alphas 0..1 (additive: alpha scales the brightness added).
 */
public final class MeteorGlow {
    public static final RenderType ADDITIVE = RenderType.create("winterworks_meteor_glow", DefaultVertexFormat.POSITION_COLOR,
            VertexFormat.Mode.QUADS, 4096, false, true, RenderType.CompositeState.builder()
                    .setShaderState(RenderStateShard.RENDERTYPE_LIGHTNING_SHADER)
                    .setTransparencyState(RenderStateShard.LIGHTNING_TRANSPARENCY)
                    .setWriteMaskState(RenderStateShard.COLOR_WRITE)
                    .setCullState(RenderStateShard.NO_CULL)
                    .createCompositeState(false));

    private MeteorGlow() {}

    private static void v(VertexConsumer vc, Matrix4f m, Vec3 p, int rgb, float a) {
        vc.addVertex(m, (float) p.x, (float) p.y, (float) p.z).setColor((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255,
                (int) (255 * Math.max(0f, Math.min(1f, a))));
    }

    /**
     * A soft disc at `c` facing the camera (`right`, `up`: the camera's axes), `r` across: `inner` at the middle fading to
     * `outer` at the rim.
     */
    public static void disc(VertexConsumer vc, Matrix4f m, Vec3 c, Vec3 right, Vec3 up, float r, int inner, float innerA, int outer,
                            float outerA) {
        int n = 20;
        for (int i = 0; i < n; i++) {
            double a0 = i * Math.PI * 2 / n, a1 = (i + 1) * Math.PI * 2 / n;
            Vec3 p0 = c.add(right.scale(Math.cos(a0) * r)).add(up.scale(Math.sin(a0) * r));
            Vec3 p1 = c.add(right.scale(Math.cos(a1) * r)).add(up.scale(Math.sin(a1) * r));
            v(vc, m, c, inner, innerA);
            v(vc, m, p0, outer, outerA);
            v(vc, m, p1, outer, outerA);
            v(vc, m, c, inner, innerA);
        }
    }

    /**
     * A glow at `c` facing the camera, `r` across: an even `inner` core out to `core` (0..1) of the radius, then fading to
     * nothing through `outer` at the rim (reads bigger and brighter than a plain disc).
     */
    public static void glow(VertexConsumer vc, Matrix4f m, Vec3 c, Vec3 right, Vec3 up, float r, float core, int inner, float a, int outer) {
        int n = 24;
        for (int i = 0; i < n; i++) {
            double a0 = i * Math.PI * 2 / n, a1 = (i + 1) * Math.PI * 2 / n;
            Vec3 d0 = right.scale(Math.cos(a0)).add(up.scale(Math.sin(a0))), d1 = right.scale(Math.cos(a1)).add(up.scale(Math.sin(a1)));
            Vec3 i0 = c.add(d0.scale(r * core)), i1 = c.add(d1.scale(r * core)), o0 = c.add(d0.scale(r)), o1 = c.add(d1.scale(r));
            v(vc, m, c, inner, a);
            v(vc, m, i0, inner, a);
            v(vc, m, i1, inner, a);
            v(vc, m, c, inner, a);
            v(vc, m, i0, inner, a);
            v(vc, m, o0, outer, 0f);
            v(vc, m, o1, outer, 0f);
            v(vc, m, i1, inner, a);
        }
    }

    /**
     * A ribbon facing the camera (at `eye`) through `pts`, `widths[i]` across at each point, coloured `rgb[i]` / `alpha[i]`.
     */
    public static void ribbon(VertexConsumer vc, Matrix4f m, Vec3 eye, Vec3[] pts, float[] widths, int[] rgb, float[] alpha) {
        Vec3[] side = new Vec3[pts.length];
        for (int i = 0; i < pts.length; i++) {
            Vec3 along = pts[Math.min(i + 1, pts.length - 1)].subtract(pts[Math.max(i - 1, 0)]);
            Vec3 s = along.cross(pts[i].subtract(eye));
            if (s.lengthSqr() < 1e-9) {
                s = along.cross(new Vec3(0, 1, 0));
            }
            side[i] = s.lengthSqr() < 1e-9 ? new Vec3(1, 0, 0) : s.normalize();
        }
        for (int i = 0; i + 1 < pts.length; i++) {
            Vec3 a = side[i].scale(widths[i] / 2), b = side[i + 1].scale(widths[i + 1] / 2);
            v(vc, m, pts[i].subtract(a), rgb[i], alpha[i]);
            v(vc, m, pts[i + 1].subtract(b), rgb[i + 1], alpha[i + 1]);
            v(vc, m, pts[i + 1].add(b), rgb[i + 1], alpha[i + 1]);
            v(vc, m, pts[i].add(a), rgb[i], alpha[i]);
        }
    }

    /** A flat ring round `c` (horizontal), from radius `r0` (`in` colour) to `r1` (`out` colour). */
    public static void ring(VertexConsumer vc, Matrix4f m, Vec3 c, float r0, float r1, int in, float inA, int out, float outA) {
        int n = 40;
        for (int i = 0; i < n; i++) {
            double a0 = i * Math.PI * 2 / n, a1 = (i + 1) * Math.PI * 2 / n;
            v(vc, m, c.add(Math.cos(a0) * r0, 0, Math.sin(a0) * r0), in, inA);
            v(vc, m, c.add(Math.cos(a0) * r1, 0, Math.sin(a0) * r1), out, outA);
            v(vc, m, c.add(Math.cos(a1) * r1, 0, Math.sin(a1) * r1), out, outA);
            v(vc, m, c.add(Math.cos(a1) * r0, 0, Math.sin(a1) * r0), in, inA);
        }
    }

    /** Linear blend of two 0xRRGGBB colours. */
    public static int mix(int a, int b, float t) {
        t = Math.max(0f, Math.min(1f, t));
        int r = (int) (((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
        int g = (int) (((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
        int bl = (int) ((a & 255) * (1 - t) + (b & 255) * t);
        return (r << 16) | (g << 8) | bl;
    }
}
