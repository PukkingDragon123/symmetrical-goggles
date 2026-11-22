package dev.lowpix.winterworks.client.endboss;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.endboss.DragonLightBeam;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;
import org.joml.Vector3f;

/**
 * The dragon's light beam: first a thin, flickering warning line with a ring of light gathering where it will land,
 * then the beam itself (the {@code entity/dragon_light_beam} strip, scrolling, additive) in a violet haze, flaring
 * where it strikes. Faces the camera as a ribbon, with a second ribbon across it.
 */
public class DragonLightBeamRenderer extends EntityRenderer<DragonLightBeam> {
    public static final ResourceLocation TEXTURE = Winterworks.id("textures/entity/dragon_light_beam.png");
    private static final ResourceLocation FALLBACK = ResourceLocation.withDefaultNamespace("textures/entity/beacon_beam.png");
    private static final ResourceLocation WHITE = ResourceLocation.withDefaultNamespace("textures/misc/white.png");

    public DragonLightBeamRenderer(EntityRendererProvider.Context ctx) {
        super(ctx);
        shadowRadius = 0f;
    }

    @Override
    public ResourceLocation getTextureLocation(DragonLightBeam e) {
        return TEXTURE;
    }

    private static ResourceLocation beamTexture() {
        return Minecraft.getInstance().getResourceManager().getResource(TEXTURE).isPresent() ? TEXTURE : FALLBACK;
    }

    @Override
    public void render(DragonLightBeam e, float yaw, float partial, PoseStack pose, MultiBufferSource buffers, int light) {
        float age = e.age() + partial;
        Vec3 rel = e.end();
        Vec3 cam = entityRenderDispatcher.camera.getPosition().subtract(e.getPosition(partial));
        Vector3f a = new Vector3f(), b = new Vector3f((float) rel.x, (float) rel.y, (float) rel.z);
        Vector3f c = new Vector3f((float) cam.x, (float) cam.y, (float) cam.z);
        Matrix4f m = pose.last().pose();
        float len = b.length();
        if (age < DragonLightBeam.WARNING) {
            float k = age / DragonLightBeam.WARNING;
            float flicker = 0.55f + 0.45f * Mth.sin(age * (1.2f + k * 2.5f));
            VertexConsumer glow = buffers.getBuffer(RenderType.dragonRays());
            float w = 0.05f + 0.12f * k;
            ribbon(glow, m, a, b, c, w, 255, 210, 255, (int) (220 * flicker * (0.4f + 0.6f * k)));
            ribbon(glow, m, a, b, c, w * 4f, 170, 80, 255, (int) (70 * flicker * k));
            ring(glow, m, b, 0.3f + 1.0f * k, 0.12f, 255, 200, 255, (int) (200 * flicker));
            ring(glow, m, b, (float) DragonLightBeam.RADIUS * (1.6f - 0.6f * k), 0.08f, 200, 120, 255, (int) (160 * k));
            return;
        }
        float t = age - DragonLightBeam.WARNING;
        if (t >= DragonLightBeam.FIRING) {
            return;
        }
        float env = Math.min(1f, t / 2f) * Math.min(1f, (DragonLightBeam.FIRING - t) / 5f);
        float pulse = 0.85f + 0.15f * Mth.sin(age * 2.3f);
        float k = env * pulse;
        // the core: the beam texture, scrolling down the beam
        VertexConsumer core = buffers.getBuffer(GlowRenderTypes.additiveAlpha(beamTexture()));
        float v0 = -age * 0.35f, v1 = v0 + len / 4.4f;
        int ci = (int) (255 * k);
        texturedRibbon(core, pose, a, b, c, 0.6f + 0.1f * Mth.sin(age * 1.7f), v0, v1, 255, 255, 255, ci, false);
        texturedRibbon(core, pose, a, b, c, 1.15f, v0 * 0.6f, v0 * 0.6f + len / 7f, 255, 200, 255, (int) (ci * 0.5f), false);
        // a hot white thread through it, and the violet haze round it
        VertexConsumer glow = buffers.getBuffer(RenderType.dragonRays());
        ribbon(glow, m, a, b, c, 0.18f, 255, 250, 235, (int) (255 * k));
        ribbon(glow, m, a, b, c, 1.8f, 190, 90, 255, (int) (90 * k));
        ribbon(glow, m, a, b, c, 3.4f, 140, 50, 220, (int) (40 * k));
        // where it strikes
        ring(glow, m, b, 0.2f, 2.4f + 0.4f * Mth.sin(age * 1.9f), 255, 235, 200, (int) (200 * k));
        ring(glow, m, b, 2.3f, 1.2f, 210, 110, 255, (int) (120 * k));
        flare(glow, m, b, c, 3.2f * (0.8f + 0.2f * pulse), 255, 240, 220, (int) (230 * k));
        flare(glow, m, a, c, 2.2f, 255, 220, 255, (int) (200 * k));
        VertexConsumer white = buffers.getBuffer(RenderType.eyes(WHITE));
        texturedRibbon(white, pose, a, b, c, 0.07f, 0f, 1f, (int) (255 * k), (int) (255 * k), (int) (255 * k), 255, true);
    }

    /** The side vector for a camera-facing ribbon at `p` along `dir`. */
    private static Vector3f side(Vector3f p, Vector3f dir, Vector3f cam) {
        Vector3f toCam = new Vector3f(cam).sub(p);
        Vector3f s = new Vector3f(dir).cross(toCam);
        if (s.lengthSquared() < 1.0E-6f) {
            s.set(1, 0, 0);
        }
        return s.normalize();
    }

    /** A soft ribbon (bright down the middle, fading to the edges) from a to b, `w` either side; additive vertex colours. */
    static void ribbon(VertexConsumer vc, Matrix4f m, Vector3f a, Vector3f b, Vector3f cam, float w, int r, int g, int bl, int al) {
        Vector3f dir = new Vector3f(b).sub(a).normalize();
        Vector3f sa = side(a, dir, cam).mul(w), sb = side(b, dir, cam).mul(w);
        int edge = 0;
        // two halves: edge -> centre -> edge
        tri(vc, m, a.x - sa.x, a.y - sa.y, a.z - sa.z, r, g, bl, edge, a.x, a.y, a.z, r, g, bl, al, b.x, b.y, b.z, r, g, bl, al);
        tri(vc, m, a.x - sa.x, a.y - sa.y, a.z - sa.z, r, g, bl, edge, b.x, b.y, b.z, r, g, bl, al, b.x - sb.x, b.y - sb.y, b.z - sb.z, r, g, bl, edge);
        tri(vc, m, a.x, a.y, a.z, r, g, bl, al, a.x + sa.x, a.y + sa.y, a.z + sa.z, r, g, bl, edge, b.x + sb.x, b.y + sb.y, b.z + sb.z, r, g, bl, edge);
        tri(vc, m, a.x, a.y, a.z, r, g, bl, al, b.x + sb.x, b.y + sb.y, b.z + sb.z, r, g, bl, edge, b.x, b.y, b.z, r, g, bl, al);
    }

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

    /** A flat ring on the ground round `c` (inner radius, width), soft on both edges. */
    static void ring(VertexConsumer vc, Matrix4f m, Vector3f c, float inner, float width, int r, int g, int b, int a) {
        int n = 40;
        float mid = inner + width * 0.5f, outer = inner + width, y = c.y + 0.06f;
        for (int i = 0; i < n; i++) {
            float a0 = Mth.TWO_PI * i / n, a1 = Mth.TWO_PI * (i + 1) / n;
            float c0 = Mth.cos(a0), s0 = Mth.sin(a0), c1 = Mth.cos(a1), s1 = Mth.sin(a1);
            float ix0 = c.x + c0 * inner, iz0 = c.z + s0 * inner, ix1 = c.x + c1 * inner, iz1 = c.z + s1 * inner;
            float mx0 = c.x + c0 * mid, mz0 = c.z + s0 * mid, mx1 = c.x + c1 * mid, mz1 = c.z + s1 * mid;
            float ox0 = c.x + c0 * outer, oz0 = c.z + s0 * outer, ox1 = c.x + c1 * outer, oz1 = c.z + s1 * outer;
            tri(vc, m, ix0, y, iz0, r, g, b, inner <= 0.01f ? a : 0, mx0, y, mz0, r, g, b, a, mx1, y, mz1, r, g, b, a);
            tri(vc, m, ix0, y, iz0, r, g, b, inner <= 0.01f ? a : 0, mx1, y, mz1, r, g, b, a, ix1, y, iz1, r, g, b, inner <= 0.01f ? a : 0);
            tri(vc, m, mx0, y, mz0, r, g, b, a, ox0, y, oz0, r, g, b, 0, ox1, y, oz1, r, g, b, 0);
            tri(vc, m, mx0, y, mz0, r, g, b, a, ox1, y, oz1, r, g, b, 0, mx1, y, mz1, r, g, b, a);
        }
    }

    /** A soft camera-facing glow at `p`. */
    static void flare(VertexConsumer vc, Matrix4f m, Vector3f p, Vector3f cam, float size, int r, int g, int b, int a) {
        Vector3f toCam = new Vector3f(cam).sub(p).normalize();
        Vector3f up = Math.abs(toCam.y) > 0.95f ? new Vector3f(1, 0, 0) : new Vector3f(0, 1, 0);
        Vector3f right = new Vector3f(toCam).cross(up).normalize(), top = new Vector3f(right).cross(toCam).normalize();
        int n = 24;
        for (int i = 0; i < n; i++) {
            float a0 = Mth.TWO_PI * i / n, a1 = Mth.TWO_PI * (i + 1) / n;
            Vector3f p0 = new Vector3f(p).add(new Vector3f(right).mul(Mth.cos(a0) * size)).add(new Vector3f(top).mul(Mth.sin(a0) * size));
            Vector3f p1 = new Vector3f(p).add(new Vector3f(right).mul(Mth.cos(a1) * size)).add(new Vector3f(top).mul(Mth.sin(a1) * size));
            tri(vc, m, p.x, p.y, p.z, r, g, b, a, p0.x, p0.y, p0.z, r, g, b, 0, p1.x, p1.y, p1.z, r, g, b, 0);
        }
    }

    /** A textured camera-facing ribbon (both windings when the render type culls). */
    private static void texturedRibbon(VertexConsumer vc, PoseStack pose, Vector3f a, Vector3f b, Vector3f cam, float w, float v0, float v1,
                                       int r, int g, int bl, int al, boolean bothSides) {
        Vector3f dir = new Vector3f(b).sub(a).normalize();
        Vector3f sa = side(a, dir, cam).mul(w), sb = side(b, dir, cam).mul(w);
        PoseStack.Pose p = pose.last();
        float[][] q = {{a.x - sa.x, a.y - sa.y, a.z - sa.z, 0, v0}, {a.x + sa.x, a.y + sa.y, a.z + sa.z, 1, v0},
                {b.x + sb.x, b.y + sb.y, b.z + sb.z, 1, v1}, {b.x - sb.x, b.y - sb.y, b.z - sb.z, 0, v1}};
        for (int[] order : bothSides ? new int[][]{{0, 1, 2, 3}, {3, 2, 1, 0}} : new int[][]{{0, 1, 2, 3}}) {
            for (int i : order) {
                vc.addVertex(p, q[i][0], q[i][1], q[i][2]).setColor(r, g, bl, al).setUv(q[i][3], q[i][4])
                        .setOverlay(OverlayTexture.NO_OVERLAY).setLight(0xF000F0).setNormal(p, 0, 1, 0);
            }
        }
    }

    @Override
    public boolean shouldRender(DragonLightBeam e, net.minecraft.client.renderer.culling.Frustum frustum, double x, double y, double z) {
        return true;
    }
}
