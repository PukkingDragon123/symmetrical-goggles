package dev.lowpix.winterworks.client.oceanmob;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.oceanmob.Nautilus;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;

/**
 * The nautilus (lowpix `nautilus`, 1.0): idle and swim loops blended by speed (the tentacles stream back as it jets),
 * the `dash` clip on a dash, the `saddle` shown when saddled; the shell pitches gently with its swimming (the rider's seat,
 * the `rider` locator, follows the same pitch: see oceanmob.Nautilus#modelPoint).
 */
public class NautilusRenderer extends MobRenderer<Nautilus, NautilusRenderer.Model> {
    public NautilusRenderer(EntityRendererProvider.Context ctx) {
        super(ctx, new Model(ctx.bakeLayer(OceanMobClient.NAUTILUS)), 0.8f);
    }

    @Override
    public ResourceLocation getTextureLocation(Nautilus e) {
        return model.texture;
    }

    @Override
    protected void setupRotations(Nautilus e, PoseStack pose, float bob, float yaw, float partial, float scale) {
        super.setupRotations(e, pose, bob, yaw, partial, scale);
        float pitch = Nautilus.renderPitch(Mth.lerp(partial, e.xRotO, e.getXRot()));
        float pivot = (float) (Nautilus.PIVOT_Y / 16.0);
        pose.translate(0f, pivot, 0f);
        pose.mulPose(Axis.XP.rotationDegrees(-pitch));
        pose.translate(0f, -pivot, 0f);
        if (e.isInWater() && !e.isVehicle()) {   // a slow hovering bob
            pose.translate(0f, Mth.sin((e.tickCount + partial) * 0.07f + e.getId()) * 0.04f, 0f);
        }
    }

    public static class Model extends OceanModel<Nautilus> {
        Model(ModelPart root) {
            super(root, "nautilus");
        }

        @Override
        public void setupAnim(Nautilus e, float limbSwing, float limbAmount, float age, float headYaw, float headPitch) {
            reset();
            show("saddle", e.isSaddled());
            float t = age / 20f;
            float partial = age - e.tickCount;
            float sw = Mth.lerp(partial, e.swimBlendO, e.swimBlend);
            blend("idle", t, 1f - sw);
            blend("swim", t, sw);
            oneShot(e.dashState, "dash", age);
        }
    }
}
