package dev.lowpix.winterworks.client.endboss;

import com.mojang.blaze3d.platform.GlStateManager;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.BufferBuilder;
import com.mojang.blaze3d.vertex.BufferUploader;
import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.Tesselator;
import com.mojang.blaze3d.vertex.VertexFormat;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.end.Eclipse;
import net.minecraft.Util;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;
import org.joml.Vector3f;

/**
 * The End sky during an eclipse (docs/END_UPDATE.md section 5), drawn instead of vanilla's End sky box while
 * {@link Eclipse#fraction} is above 0 (mixin.client.endboss.EndSkyMixin); everything scales with the fraction, so the
 * fades are smooth.
 * <ul>
 * <li>the End's sky box, finely divided, shading from deep violet overhead to magenta at the horizon and dark violet
 *     below it, with a warm haze towards the moon;</li>
 * <li>a massive moon low in the west (over the main island as you arrive), rising as the eclipse fades in: a dark disc
 *     ({@code environment/eclipse_moon}) in a blazing violet-gold corona ({@code environment/eclipse_corona}, additive,
 *     two layers turning slowly against each other and breathing: the shimmer).</li>
 * </ul>
 * Without the art (not yet painted), the moon and corona are drawn from vertex colours.
 */
public final class EclipseSky {
    private static final ResourceLocation END_SKY = ResourceLocation.withDefaultNamespace("textures/environment/end_sky.png");
    public static final ResourceLocation MOON = Winterworks.id("textures/environment/eclipse_moon.png");
    public static final ResourceLocation CORONA = Winterworks.id("textures/environment/eclipse_corona.png");
    /** The moon's direction: low in the west, a little to the south. Elevation rises from {@link #RISE_FROM} as it fades in. */
    private static final float AZIMUTH = 255f, ELEVATION = 17f, RISE_FROM = -14f, MOON_RADIUS = 24f, CORONA_SCALE = 2.5f, DIST = 100f;
    private static final int GRID = 10;
    private static int artChecked = -1;
    private static boolean hasMoon, hasCorona;

    private EclipseSky() {}

    /** Called from renderEndSky's head: true if it drew the eclipse sky (vanilla's is then skipped). */
    public static boolean render(PoseStack pose) {
        Minecraft mc = Minecraft.getInstance();
        float f = mc.level == null ? 0f : Eclipse.fraction(mc.level);
        if (f <= 0f) {
            return false;
        }
        checkArt(mc);
        float t = (Util.getMillis() % 3_600_000L) / 50f;
        float ease = f * f * (3 - 2 * f);
        Vector3f moon = moonDirection(ease);
        RenderSystem.enableBlend();
        RenderSystem.defaultBlendFunc();
        RenderSystem.depthMask(false);
        skyBox(pose, ease, moon);
        RenderSystem.blendFunc(GlStateManager.SourceFactor.SRC_ALPHA, GlStateManager.DestFactor.ONE);
        halo(pose, ease, moon, t);
        corona(pose, ease, moon, t);
        RenderSystem.defaultBlendFunc();
        moonDisc(pose, ease, moon, t);
        RenderSystem.depthMask(true);
        RenderSystem.defaultBlendFunc();
        RenderSystem.disableBlend();
        RenderSystem.setShaderColor(1f, 1f, 1f, 1f);
        return true;
    }

    private static void checkArt(Minecraft mc) {
        int gen = System.identityHashCode(mc.getResourceManager());
        if (gen != artChecked) {
            artChecked = gen;
            hasMoon = mc.getResourceManager().getResource(MOON).isPresent();
            hasCorona = mc.getResourceManager().getResource(CORONA).isPresent();
        }
    }

    /** Where the moon is (unit vector, world axes): it rises into place as the eclipse fades in. */
    public static Vector3f moonDirection(float ease) {
        float el = Mth.lerp(ease, RISE_FROM, ELEVATION) * Mth.DEG_TO_RAD, az = AZIMUTH * Mth.DEG_TO_RAD;   // compass bearing
        return new Vector3f(Mth.cos(el) * Mth.sin(az), Mth.sin(el), -Mth.cos(el) * Mth.cos(az)).normalize();
    }

    // ------------------------------------------------------------------------------------------------ the sky box

    /** Sky colour for a direction (before the End sky texture multiplies it), at full eclipse. */
    static void eclipseColour(Vector3f d, Vector3f moon, Vector3f out) {
        float y = d.y;
        float r, g, b;
        if (y >= 0) {   // magenta horizon -> deep violet zenith
            float k = (float) Math.pow(y, 0.55);
            r = Mth.lerp(k, 1.55f, 0.38f);
            g = Mth.lerp(k, 0.42f, 0.16f);
            b = Mth.lerp(k, 1.20f, 0.78f);
        } else {        // below the horizon: into the dark violet of the void
            float k = Math.min(1f, -y * 2.2f);
            r = Mth.lerp(k, 1.55f, 0.22f);
            g = Mth.lerp(k, 0.42f, 0.06f);
            b = Mth.lerp(k, 1.20f, 0.42f);
        }
        float m = Math.max(0f, d.dot(moon));
        float haze = (float) Math.pow(m, 6) * 0.9f + (float) Math.pow(m, 40) * 0.8f;   // a warm glow round the moon
        r += 0.9f * haze;
        g += 0.45f * haze;
        b += 0.15f * haze;
        out.set(r, g, b);
    }

    private static void skyBox(PoseStack pose, float f, Vector3f moon) {
        RenderSystem.setShader(GameRenderer::getPositionTexColorShader);
        RenderSystem.setShaderTexture(0, END_SKY);
        Tesselator tess = Tesselator.getInstance();
        Vector3f dir = new Vector3f(), col = new Vector3f();
        float base = 40f / 255f;   // vanilla's End sky tint (0x282828)
        for (int face = 0; face < 6; face++) {
            pose.pushPose();
            switch (face) {
                case 1 -> pose.mulPose(com.mojang.math.Axis.XP.rotationDegrees(90f));
                case 2 -> pose.mulPose(com.mojang.math.Axis.XP.rotationDegrees(-90f));
                case 3 -> pose.mulPose(com.mojang.math.Axis.XP.rotationDegrees(180f));
                case 4 -> pose.mulPose(com.mojang.math.Axis.ZP.rotationDegrees(90f));
                case 5 -> pose.mulPose(com.mojang.math.Axis.ZP.rotationDegrees(-90f));
                default -> {}
            }
            Matrix4f m = pose.last().pose();
            Matrix4f rot = faceRotation(face);
            BufferBuilder bb = tess.begin(VertexFormat.Mode.QUADS, DefaultVertexFormat.POSITION_TEX_COLOR);
            for (int i = 0; i < GRID; i++) {
                for (int j = 0; j < GRID; j++) {
                    vertex(bb, m, rot, i, j, f, base, moon, dir, col);
                    vertex(bb, m, rot, i, j + 1, f, base, moon, dir, col);
                    vertex(bb, m, rot, i + 1, j + 1, f, base, moon, dir, col);
                    vertex(bb, m, rot, i + 1, j, f, base, moon, dir, col);
                }
            }
            BufferUploader.drawWithShader(bb.buildOrThrow());
            pose.popPose();
        }
    }

    /** The same rotations as vanilla's End sky faces, as a matrix (to find each vertex's world direction). */
    private static Matrix4f faceRotation(int face) {
        Matrix4f r = new Matrix4f();
        switch (face) {
            case 1 -> r.rotateX(90f * Mth.DEG_TO_RAD);
            case 2 -> r.rotateX(-90f * Mth.DEG_TO_RAD);
            case 3 -> r.rotateX(180f * Mth.DEG_TO_RAD);
            case 4 -> r.rotateZ(90f * Mth.DEG_TO_RAD);
            case 5 -> r.rotateZ(-90f * Mth.DEG_TO_RAD);
            default -> {}
        }
        return r;
    }

    private static void vertex(BufferBuilder bb, Matrix4f m, Matrix4f rot, int i, int j, float f, float base, Vector3f moon,
                               Vector3f dir, Vector3f col) {
        float x = -100f + 200f * i / GRID, z = -100f + 200f * j / GRID;
        rot.transformPosition(x, -100f, z, dir).normalize();
        eclipseColour(dir, moon, col);
        float r = Mth.lerp(f, base, col.x * 0.62f), g = Mth.lerp(f, base, col.y * 0.62f), b = Mth.lerp(f, base, col.z * 0.62f);
        bb.addVertex(m, x, -100f, z).setUv(16f * i / GRID, 16f * j / GRID)
                .setColor(Math.min(1f, r), Math.min(1f, g), Math.min(1f, b), 1f);
    }

    // ------------------------------------------------------------------------------------------------ the moon

    /** A camera-facing square on the sky round `dir` with half-size `size`, turned `angle` radians. */
    private static void quad(BufferBuilder bb, Matrix4f m, Vector3f dir, float size, float angle, int r, int g, int b, int a) {
        Vector3f up = Math.abs(dir.y) > 0.95f ? new Vector3f(1, 0, 0) : new Vector3f(0, 1, 0);
        Vector3f right = new Vector3f(dir).cross(up).normalize();
        Vector3f top = new Vector3f(right).cross(dir).normalize();
        float c = Mth.cos(angle), s = Mth.sin(angle);
        Vector3f rr = new Vector3f(right).mul(c).add(new Vector3f(top).mul(s)).mul(size);
        Vector3f tt = new Vector3f(top).mul(c).sub(new Vector3f(right).mul(s)).mul(size);
        Vector3f centre = new Vector3f(dir).mul(DIST);
        corner(bb, m, centre, rr, tt, -1, -1, 0, 1, r, g, b, a);
        corner(bb, m, centre, rr, tt, 1, -1, 1, 1, r, g, b, a);
        corner(bb, m, centre, rr, tt, 1, 1, 1, 0, r, g, b, a);
        corner(bb, m, centre, rr, tt, -1, 1, 0, 0, r, g, b, a);
    }

    private static void corner(BufferBuilder bb, Matrix4f m, Vector3f c, Vector3f rr, Vector3f tt, float a, float b, float u, float v,
                               int cr, int cg, int cb, int ca) {
        bb.addVertex(m, c.x + rr.x * a + tt.x * b, c.y + rr.y * a + tt.y * b, c.z + rr.z * a + tt.z * b).setUv(u, v).setColor(cr, cg, cb, ca);
    }

    /** A soft glow round the moon (additive, vertex colours): it lights the sky round it. */
    private static void halo(PoseStack pose, float f, Vector3f moon, float t) {
        RenderSystem.setShader(GameRenderer::getPositionColorShader);
        Matrix4f m = pose.last().pose();
        Tesselator tess = Tesselator.getInstance();
        BufferBuilder bb = tess.begin(VertexFormat.Mode.TRIANGLES, DefaultVertexFormat.POSITION_COLOR);
        float pulse = 0.85f + 0.15f * Mth.sin(t * 0.031f);
        fan(bb, m, moon, MOON_RADIUS * 0.9f, MOON_RADIUS * 5.2f, 64, 255, 150, 120, (int) (150 * f * pulse), 120, 40, 150, 0, 0f, 0f);
        BufferUploader.drawWithShader(bb.buildOrThrow());
    }

    /** A ring (fan between two radii) on the sky round `dir`, colour fading from inner to outer; with optional rays. */
    private static void fan(BufferBuilder bb, Matrix4f m, Vector3f dir, float inner, float outer, int n, int r0, int g0, int b0, int a0,
                            int r1, int g1, int b1, int a1, float rays, float spin) {
        Vector3f up = Math.abs(dir.y) > 0.95f ? new Vector3f(1, 0, 0) : new Vector3f(0, 1, 0);
        Vector3f right = new Vector3f(dir).cross(up).normalize();
        Vector3f top = new Vector3f(right).cross(dir).normalize();
        Vector3f c = new Vector3f(dir).mul(DIST);
        for (int i = 0; i < n; i++) {
            float a0n = Mth.TWO_PI * i / n, a1n = Mth.TWO_PI * (i + 1) / n;
            float o0 = outer * (1 + rays * ray(a0n + spin)), o1 = outer * (1 + rays * ray(a1n + spin));
            Vector3f p0 = ring(c, right, top, a0n, inner), p1 = ring(c, right, top, a1n, inner);
            Vector3f q0 = ring(c, right, top, a0n, o0), q1 = ring(c, right, top, a1n, o1);
            bb.addVertex(m, p0.x, p0.y, p0.z).setColor(r0, g0, b0, a0);
            bb.addVertex(m, q0.x, q0.y, q0.z).setColor(r1, g1, b1, a1);
            bb.addVertex(m, q1.x, q1.y, q1.z).setColor(r1, g1, b1, a1);
            bb.addVertex(m, p0.x, p0.y, p0.z).setColor(r0, g0, b0, a0);
            bb.addVertex(m, q1.x, q1.y, q1.z).setColor(r1, g1, b1, a1);
            bb.addVertex(m, p1.x, p1.y, p1.z).setColor(r0, g0, b0, a0);
        }
    }

    private static float ray(float a) {
        float s = Mth.sin(a * 7f) * 0.5f + Mth.sin(a * 13f + 1.3f) * 0.3f + Mth.sin(a * 29f + 0.4f) * 0.2f;
        return Math.max(0f, s) * 0.6f;
    }

    private static Vector3f ring(Vector3f c, Vector3f right, Vector3f top, float a, float rad) {
        return new Vector3f(c).add(new Vector3f(right).mul(Mth.cos(a) * rad)).add(new Vector3f(top).mul(Mth.sin(a) * rad));
    }

    private static void corona(PoseStack pose, float f, Vector3f moon, float t) {
        Matrix4f m = pose.last().pose();
        Tesselator tess = Tesselator.getInstance();
        float breathe = 0.8f + 0.2f * Mth.sin(t * 0.045f);
        if (hasCorona) {
            RenderSystem.setShader(GameRenderer::getPositionTexColorShader);
            RenderSystem.setShaderTexture(0, CORONA);
            BufferBuilder bb = tess.begin(VertexFormat.Mode.QUADS, DefaultVertexFormat.POSITION_TEX_COLOR);
            float size = MOON_RADIUS * CORONA_SCALE;
            quad(bb, m, moon, size * (1f + 0.02f * Mth.sin(t * 0.05f)), t * 0.0012f, 255, 255, 255, (int) (255 * f * breathe));
            quad(bb, m, moon, size * 1.12f, -t * 0.0019f + 1.1f, 255, 220, 255, (int) (150 * f * (1.6f - breathe)));
            BufferUploader.drawWithShader(bb.buildOrThrow());
        } else {
            RenderSystem.setShader(GameRenderer::getPositionColorShader);
            BufferBuilder bb = tess.begin(VertexFormat.Mode.TRIANGLES, DefaultVertexFormat.POSITION_COLOR);
            int a = (int) (230 * f * breathe);
            fan(bb, m, moon, MOON_RADIUS * 0.96f, MOON_RADIUS * 1.9f, 96, 255, 214, 150, a, 200, 70, 255, 0, 0.9f, t * 0.0012f);
            fan(bb, m, moon, MOON_RADIUS * 0.96f, MOON_RADIUS * 2.6f, 96, 230, 120, 255, (int) (a * 0.55f), 120, 40, 200, 0, 1.2f,
                    -t * 0.0019f + 1.1f);
            fan(bb, m, moon, MOON_RADIUS * 0.98f, MOON_RADIUS * 1.12f, 96, 255, 240, 200, (int) (255 * f), 255, 160, 90, 0, 0f, 0f);
            BufferUploader.drawWithShader(bb.buildOrThrow());
        }
    }

    private static void moonDisc(PoseStack pose, float f, Vector3f moon, float t) {
        Matrix4f m = pose.last().pose();
        Tesselator tess = Tesselator.getInstance();
        if (hasMoon) {
            RenderSystem.setShader(GameRenderer::getPositionTexColorShader);
            RenderSystem.setShaderTexture(0, MOON);
            BufferBuilder bb = tess.begin(VertexFormat.Mode.QUADS, DefaultVertexFormat.POSITION_TEX_COLOR);
            quad(bb, m, moon, MOON_RADIUS * 1.04f, 0f, 255, 255, 255, (int) (255 * Math.min(1f, f * 1.4f)));
            BufferUploader.drawWithShader(bb.buildOrThrow());
        } else {
            RenderSystem.setShader(GameRenderer::getPositionColorShader);
            BufferBuilder bb = tess.begin(VertexFormat.Mode.TRIANGLES, DefaultVertexFormat.POSITION_COLOR);
            int a = (int) (255 * Math.min(1f, f * 1.4f));
            fan(bb, m, moon, 0f, MOON_RADIUS * 0.98f, 96, 10, 4, 18, a, 26, 10, 40, a, 0f, 0f);
            BufferUploader.drawWithShader(bb.buildOrThrow());
        }
    }

    /** The End's fog during an eclipse: towards a violet that matches the horizon. */
    public static Vec3 fog(Vec3 vanilla) {
        Minecraft mc = Minecraft.getInstance();
        float f = mc.level == null ? 0f : Eclipse.fraction(mc.level);
        if (f <= 0f) {
            return vanilla;
        }
        float ease = f * f * (3 - 2 * f);
        return vanilla.lerp(new Vec3(0.30, 0.10, 0.34), ease);
    }
}
