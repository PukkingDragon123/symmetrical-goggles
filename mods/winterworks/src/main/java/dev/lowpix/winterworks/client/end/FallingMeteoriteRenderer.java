package dev.lowpix.winterworks.client.end;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.lowpix.winterworks.client.render.WWModel;
import dev.lowpix.winterworks.end.FallingMeteorite;
import net.minecraft.client.Camera;
import net.minecraft.client.renderer.LightTexture;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;
import org.joml.Quaternionf;

/**
 * A falling meteorite: the lowpix model {@code falling_meteorite} (a molten-fissured rock trailing flames; clip
 * {@code fall}) drawn big and full bright, nose along its flight, in a fiery glow shell (a white-gold core, an orange
 * shell, a faint violet halo) at the head of a long glowing trail that cools from white-gold through orange and rose to
 * violet. When it lands: a bright flash swelling and fading at the impact, a shockwave ring racing out over the ground,
 * and the trail left hanging in the sky, fading. (Particles, smoke, the whistle and the screen flash: MeteorClient.)
 */
public class FallingMeteoriteRenderer extends EntityRenderer<FallingMeteorite> {
    /** The rock's size: the model (about 0.7 blocks) times this. */
    public static final float SCALE = 3.2f;
    /** The glowing trail's length, blocks. */
    public static final float TRAIL = 40f;
    static final int WHITE = 0xFFF4C2, GOLD = 0xFFD76A, AMBER = 0xFFAD35, ORANGE = 0xFF7D2A, ROSE = 0xE04A5A, MAGENTA = 0xA8237F,
            VIOLET = 0x6C1585;
    private static final int[] TRAIL_RAMP = {WHITE, GOLD, AMBER, ORANGE, ROSE, MAGENTA, VIOLET, VIOLET};
    private final WWModel<Entity> model;

    public FallingMeteoriteRenderer(EntityRendererProvider.Context ctx) {
        super(ctx);
        this.model = new WWModel<>(ctx.bakeLayer(MeteorClient.LAYER), "falling_meteorite");
        this.shadowRadius = 0f;
    }

    @Override
    public void render(FallingMeteorite e, float yaw, float partial, PoseStack pose, MultiBufferSource buffers, int light) {
        Camera cam = entityRenderDispatcher.camera;
        Vec3 at = e.getPosition(partial);
        Vec3 eye = cam.getPosition().subtract(at);                 // the camera, relative to the meteor
        Vec3 right = new Vec3(cam.getLeftVector()).scale(-1), up = new Vec3(cam.getUpVector());
        Vec3 dir = MeteorClient.direction(e);
        float now = e.tickCount + partial;
        if (e.flying()) {
            // the rock, nose along its flight
            pose.pushPose();
            pose.mulPose(new Quaternionf().rotationTo(0f, 0f, 1f, (float) dir.x, (float) dir.y, (float) dir.z));
            pose.scale(SCALE, -SCALE, -SCALE);
            model.reset();
            model.clip("fall", (now / 20f) % 2f);
            model.renderAll(pose, buffers, LightTexture.FULL_BRIGHT, OverlayTexture.NO_OVERLAY, 0, 0, RenderType.entityCutoutNoCull(model.texture));
            pose.popPose();
            float flown = Math.min(TRAIL, now * (float) e.getDeltaMovement().length());
            VertexConsumer vc = buffers.getBuffer(MeteorGlow.ADDITIVE);
            Matrix4f m = pose.last().pose();
            trail(vc, m, eye, Vec3.ZERO, dir, flown, 1f, now * 0.9f);
            float flicker = 0.9f + 0.1f * Mth.sin(now * 1.7f);
            MeteorGlow.glow(vc, m, Vec3.ZERO, right, up, 9.0f * flicker, 0.15f, 0xB040FF, 0.3f, 0x3A0C5C);
            MeteorGlow.glow(vc, m, Vec3.ZERO, right, up, 4.5f * flicker, 0.3f, 0xFFA040, 0.8f, ORANGE);
            MeteorGlow.glow(vc, m, dir.scale(0.8), right, up, 2.2f, 0.45f, WHITE, 1f, GOLD);
        } else {
            float age = e.sinceImpact() + partial;
            VertexConsumer vc = buffers.getBuffer(MeteorGlow.ADDITIVE);
            Matrix4f m = pose.last().pose();
            // the trail left hanging in the sky, fading
            if (age < 40) {
                trail(vc, m, eye, dir.scale(-2), dir, TRAIL, 1f - age / 40f, 0f);
            }
            // the flash: a white-hot ball swelling and fading, a pillar of light over it, a wide orange bloom
            if (age < 18) {
                float t = age / 18f, k = 1f - t;
                float r = 5f + 14f * (1f - k * k);
                MeteorGlow.glow(vc, m, new Vec3(0, 2.0, 0), right, up, r * 2.2f, 0.2f, 0xFF9040, 0.55f * k * k, MAGENTA);
                MeteorGlow.glow(vc, m, new Vec3(0, 1.5, 0), right, up, r, 0.4f, WHITE, Math.min(1f, 1.3f * k), GOLD);
                if (age < 12) {
                    float p = 1f - age / 12f;
                    Vec3[] pts = {Vec3.ZERO, new Vec3(0, 12, 0), new Vec3(0, 30, 0), new Vec3(0, 60, 0)};
                    MeteorGlow.ribbon(vc, m, eye, pts, new float[]{9f * p, 6f * p, 3f * p, 0.5f}, new int[]{WHITE, GOLD, ORANGE, ROSE},
                            new float[]{0.9f * p, 0.6f * p, 0.25f * p, 0f});
                }
            }
            // the shockwave: a ring racing out over the ground
            if (age < 16) {
                float t = age / 16f, k = 1f - t;
                float r = 1.5f + 20f * (1f - k * k * k), w = 0.6f + 3.0f * k;
                Vec3 c = new Vec3(0, 0.15, 0);
                MeteorGlow.ring(vc, m, c, Math.max(0f, r - w), r, ROSE, 0f, AMBER, 0.85f * k);
                MeteorGlow.ring(vc, m, c, r, r + w * 0.5f, AMBER, 0.85f * k, ROSE, 0f);
            }
        }
        super.render(e, yaw, partial, pose, buffers, light);
    }

    /** The trail behind a head at `head`, flying along `dir`: `length` blocks, `fade` 0..1. */
    private static void trail(VertexConsumer vc, Matrix4f m, Vec3 eye, Vec3 head, Vec3 dir, float length, float fade, float flick) {
        if (length < 0.5f || fade <= 0f) {
            return;
        }
        int n = 16;
        Vec3[] pts = new Vec3[n];
        float[] wide = new float[n], core = new float[n], aWide = new float[n], aCore = new float[n];
        int[] col = new int[n];
        for (int i = 0; i < n; i++) {
            float t = i / (n - 1f);
            pts[i] = head.subtract(dir.scale(length * t));
            float taper = (float) Math.pow(1f - t, 1.4f);
            float lick = 1f + 0.18f * Mth.sin(t * 19f - flick) * t;     // the trail licks and swells as it streams back
            wide[i] = (0.4f + 6.5f * taper) * lick;
            core[i] = (0.2f + 2.7f * taper) * lick;
            float c = t * (TRAIL_RAMP.length - 1);
            int k = Math.min((int) c, TRAIL_RAMP.length - 2);
            col[i] = MeteorGlow.mix(TRAIL_RAMP[k], TRAIL_RAMP[k + 1], c - k);
            aWide[i] = 0.38f * (1f - t) * (1f - t) * fade;
            aCore[i] = Math.min(1f, 1.15f * (float) Math.pow(1f - t, 2.2f)) * fade;
        }
        MeteorGlow.ribbon(vc, m, eye, pts, wide, col, aWide);
        MeteorGlow.ribbon(vc, m, eye, pts, core, col, aCore);
    }

    @Override
    public ResourceLocation getTextureLocation(FallingMeteorite e) {
        return model.texture;
    }
}
