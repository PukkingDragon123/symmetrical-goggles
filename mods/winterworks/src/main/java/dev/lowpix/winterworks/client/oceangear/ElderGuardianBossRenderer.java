package dev.lowpix.winterworks.client.oceangear;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.oceangear.ElderBoss;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.culling.Frustum;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.FastColor;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.monster.ElderGuardian;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;
import org.joml.Vector3f;

/**
 * Every Elder Guardian drawn as the boss (lowpix {@code elder_guardian} at scale 1.0, not vanilla's 2.35): the model,
 * its glow (the eye and the mauve seams, brighter as it charges its stare), and the stare itself from the
 * {@code laser} locator: a thin flickering lock-on line for the 2 s telegraph, then the beam, stopped by the first block
 * in its way. No death flip: the {@code death} clip plays instead.
 */
public class ElderGuardianBossRenderer extends MobRenderer<ElderGuardian, ElderGuardianBossModel> {
    public static final ResourceLocation TEXTURE = Winterworks.id("textures/entity/elder_guardian.png");
    public static final ResourceLocation GLOW = Winterworks.id("textures/entity/elder_guardian_glow.png");

    public ElderGuardianBossRenderer(EntityRendererProvider.Context ctx) {
        super(ctx, new ElderGuardianBossModel(ctx.bakeLayer(OceanGearClient.ELDER_GUARDIAN)), 1.1f);
        addLayer(new Glow(this));
        addLayer(new Stare(this));
    }

    @Override
    public ResourceLocation getTextureLocation(ElderGuardian e) {
        return TEXTURE;
    }

    @Override
    protected float getFlipDegrees(ElderGuardian e) {
        return 0f;
    }

    @Override
    public boolean shouldRender(ElderGuardian e, Frustum frustum, double x, double y, double z) {
        return ElderBoss.attack(e) == ElderBoss.STARE || super.shouldRender(e, frustum, x, y, z);
    }

    /** How charged the stare is, 0..1 over the telegraph (1 while the beam is on; 0 otherwise). */
    static float charge(ElderGuardian e) {
        ElderBoss.State s = ElderBoss.state(e);
        if (ElderBoss.attack(e) != ElderBoss.STARE || !s.stare.isStarted()) {
            return 0f;
        }
        return Math.min(1f, s.stare.getAccumulatedTime() / 50f / ElderBoss.STARE_TELEGRAPH);
    }

    private static final class Glow extends RenderLayer<ElderGuardian, ElderGuardianBossModel> {
        Glow(RenderLayerParent<ElderGuardian, ElderGuardianBossModel> parent) {
            super(parent);
        }

        @Override
        public void render(PoseStack pose, MultiBufferSource buffers, int light, ElderGuardian e, float limbSwing, float limbAmount,
                           float partial, float age, float headYaw, float headPitch) {
            float k = charge(e);
            float base = e.deathTime > 0 ? Math.max(0f, 1f - e.deathTime / 30f) : 0.75f + 0.1f * Mth.sin(age * 0.12f);
            float b = Math.min(1f, base + 0.25f * k + (ElderBoss.attack(e) == ElderBoss.ROAR ? 0.2f : 0f));
            int c = (int) (255 * b);
            getParentModel().renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(GLOW)), 0xF000F0, OverlayTexture.NO_OVERLAY,
                    FastColor.ARGB32.color(255, c, c, c));
        }
    }

    /** The stare: drawn in camera-relative world space from where the posed `laser` locator ends up. */
    private static final class Stare extends RenderLayer<ElderGuardian, ElderGuardianBossModel> {
        private static final Matrix4f IDENTITY = new Matrix4f();

        Stare(RenderLayerParent<ElderGuardian, ElderGuardianBossModel> parent) {
            super(parent);
        }

        @Override
        public void render(PoseStack pose, MultiBufferSource buffers, int light, ElderGuardian e, float limbSwing, float limbAmount,
                           float partial, float age, float headYaw, float headPitch) {
            if (ElderBoss.attack(e) != ElderBoss.STARE || e.deathTime > 0) {
                return;
            }
            ElderBoss.State s = ElderBoss.state(e);
            float t = s.stare.isStarted() ? s.stare.getAccumulatedTime() / 50f : 0f;
            ElderGuardianBossModel m = getParentModel();
            pose.pushPose();
            m.body.translateAndRotate(pose);
            m.eye.translateAndRotate(pose);
            m.pupil.translateAndRotate(pose);
            m.laser.translateAndRotate(pose);
            Vector3f o = pose.last().pose().transformPosition(new Vector3f());
            pose.popPose();
            Vec3 cam = Minecraft.getInstance().gameRenderer.getMainCamera().getPosition();
            Vec3 originW = cam.add(o.x, o.y, o.z);
            Vec3 aim = ElderBoss.aim(e);
            Vec3 dir = aim.subtract(originW);
            if (dir.lengthSqr() < 1.0E-4) {
                return;
            }
            Vec3 far = originW.add(dir.normalize().scale(ElderBoss.STARE_RANGE));
            HitResult hit = e.level().clip(new ClipContext(originW, far, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, e));
            Vec3 endW = hit.getType() == HitResult.Type.MISS ? far : hit.getLocation();
            boolean blocked = hit.getType() != HitResult.Type.MISS;
            Vector3f a = o, b = endW.subtract(cam).toVector3f(), c = new Vector3f();
            VertexConsumer vc = buffers.getBuffer(RenderType.dragonRays());
            if (t < ElderBoss.STARE_TELEGRAPH) {   // the lock-on: thin, flickering, growing hotter
                float k = t / ElderBoss.STARE_TELEGRAPH;
                float flick = 0.6f + 0.4f * Mth.sin(age * (1.5f + 3f * k));
                BeamFx.ribbon(vc, IDENTITY, a, b, c, 0.025f + 0.05f * k, 255, 150 + (int) (90 * k), 230, (int) (230 * flick * (0.35f + 0.65f * k)));
                BeamFx.ribbon(vc, IDENTITY, a, b, c, 0.18f * k, 200, 90, 220, (int) (70 * k * flick));
                BeamFx.flare(vc, IDENTITY, a, c, 0.25f + 0.55f * k, 255, 220, 255, (int) (220 * k));
                BeamFx.ring(vc, IDENTITY, b, c, 0.9f - 0.6f * k, 0.08f, 255, 170, 240, (int) (200 * k * flick));
                return;
            }
            float u = t - ElderBoss.STARE_TELEGRAPH;
            float env = Math.min(1f, u / 3f) * Mth.clamp((ElderBoss.STARE_BEAM + 2 - u) / 4f, 0f, 1f);
            float pulse = 0.85f + 0.15f * Mth.sin(age * 2.7f);
            float k = env * pulse;
            BeamFx.ribbon(vc, IDENTITY, a, b, c, 0.09f, 255, 255, 250, (int) (255 * k));
            BeamFx.ribbon(vc, IDENTITY, a, b, c, 0.28f + 0.03f * Mth.sin(age * 1.9f), 110, 255, 225, (int) (210 * k));
            BeamFx.ribbon(vc, IDENTITY, a, b, c, 0.75f, 190, 90, 210, (int) (80 * k));
            BeamFx.flare(vc, IDENTITY, a, c, 0.7f, 220, 255, 245, (int) (230 * k));
            BeamFx.flare(vc, IDENTITY, b, c, blocked ? 0.9f : 0.6f, 210, 255, 240, (int) (240 * k));
            BeamFx.ring(vc, IDENTITY, b, c, 0.6f + 0.2f * Mth.sin(age * 1.4f), 0.12f, 150, 255, 230, (int) (170 * k));
            if (blocked && e.getRandom().nextInt(3) == 0) {
                e.level().addParticle(net.minecraft.core.particles.ParticleTypes.BUBBLE_POP, endW.x, endW.y, endW.z,
                        (e.getRandom().nextFloat() - 0.5f) * 0.1, 0.05, (e.getRandom().nextFloat() - 0.5f) * 0.1);
            }
        }
    }
}
