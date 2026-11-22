package dev.lowpix.winterworks.client.oceanmob;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.oceanmob.Lionfish;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;

/**
 * The lionfish (lowpix `lionfish`, drawn at 0.6): the swim loop all the time (slower while it hovers), `hunt` and `flare`
 * on cue, and the venomous spines shortened to stubs when sheared, growing back in stages.
 */
public class LionfishRenderer extends MobRenderer<Lionfish, LionfishRenderer.Model> {
    public static final float SCALE = 0.6f;
    private static final float PIVOT_Y = 8.5f / 16f;

    public LionfishRenderer(EntityRendererProvider.Context ctx) {
        super(ctx, new Model(ctx.bakeLayer(OceanMobClient.LIONFISH)), 0.3f);
    }

    @Override
    public ResourceLocation getTextureLocation(Lionfish e) {
        return model.texture;
    }

    @Override
    protected void scale(Lionfish e, PoseStack pose, float partial) {
        pose.scale(SCALE, SCALE, SCALE);
    }

    @Override
    protected void setupRotations(Lionfish e, PoseStack pose, float bob, float yaw, float partial, float scale) {
        super.setupRotations(e, pose, bob, yaw, partial, scale);
        if (!e.isInWater() && e.deathTime <= 0) {
            pose.translate(0f, 0.35f, 0f);
            pose.mulPose(Axis.ZP.rotationDegrees(90f));
            return;
        }
        float pitch = Mth.lerp(partial, e.xRotO, e.getXRot());
        float pivot = PIVOT_Y * SCALE;
        pose.translate(0f, pivot, 0f);
        pose.mulPose(Axis.XP.rotationDegrees(-pitch * 0.7f));
        pose.translate(0f, -pivot, 0f);
    }

    @Override
    protected float getFlipDegrees(Lionfish e) {
        return 180f;
    }

    public static class Model extends OceanModel<Lionfish> {
        Model(ModelPart root) {
            super(root, "lionfish");
        }

        @Override
        public void setupAnim(Lionfish e, float limbSwing, float limbAmount, float age, float headYaw, float headPitch) {
            reset();
            float partial = age - e.tickCount;
            float sw = Mth.lerp(partial, e.swimBlendO, e.swimBlend);
            blend("swim", age / 20f, 0.45f + 0.55f * sw);
            oneShot(e.huntState, "hunt", age);
            oneShot(e.flareState, "flare", age);
            // sheared: stubs that grow back in stages
            float grow = 0.18f + 0.82f * e.spineGrowth();
            if (grow < 0.999f) {
                for (int i = 0; i < 6; i++) {
                    scalePart("spine_" + i, 1f, grow, 1f);
                }
            }
        }
    }
}
