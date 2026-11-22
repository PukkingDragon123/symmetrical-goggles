package dev.lowpix.winterworks.client.endboss;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.lowpix.winterworks.endboss.DragonRework;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.boss.enderdragon.EnderDragon;

/**
 * The second pair of wings the Ender Dragon grows in its second phase (from health <= half; drawn by
 * mixin.client.endboss.DragonModelMixin inside the dragon model's body transform). They reuse the model's wing parts:
 * set to their own flap (a beat behind the front pair, swept further back), drawn smaller behind the first pair, and
 * put back as they were.
 */
public final class DragonWings {
    /** How far back along the body (blocks, model space) and how big the second pair is. */
    private static final float BACK = 1.55f, DOWN = -0.06f, SCALE = 0.8f, LAG = 1.4f;

    private DragonWings() {}

    public static boolean shown(EnderDragon d) {
        return DragonRework.phaseTwo(d) || (d.getHealth() <= d.getMaxHealth() * 0.5f && d.getHealth() > 0f);
    }

    public static void render(EnderDragon d, float partial, PoseStack pose, VertexConsumer buffer, int light, int overlay, int color,
                              ModelPart leftWing, ModelPart leftTip, ModelPart rightWing, ModelPart rightTip) {
        float lx = leftWing.xRot, ly = leftWing.yRot, lz = leftWing.zRot, ltz = leftTip.zRot;
        float rx = rightWing.xRot, ry = rightWing.yRot, rz = rightWing.zRot, rtz = rightTip.zRot;
        float f = Mth.lerp(partial, d.oFlapTime, d.flapTime);
        float t = f * Mth.TWO_PI - LAG;
        leftWing.xRot = 0.2f - Mth.cos(t) * 0.24f;
        leftWing.yRot = -0.55f;
        leftWing.zRot = -(Mth.sin(t) + 0.2f) * 0.72f;
        leftTip.zRot = (Mth.sin(t + 2.0f) + 0.55f) * 0.8f;
        rightWing.xRot = leftWing.xRot;
        rightWing.yRot = -leftWing.yRot;
        rightWing.zRot = -leftWing.zRot;
        rightTip.zRot = -leftTip.zRot;
        pose.pushPose();
        pose.translate(0f, DOWN, BACK);
        pose.scale(SCALE, SCALE, SCALE);
        leftWing.render(pose, buffer, light, overlay, color);
        rightWing.render(pose, buffer, light, overlay, color);
        pose.popPose();
        leftWing.xRot = lx;
        leftWing.yRot = ly;
        leftWing.zRot = lz;
        leftTip.zRot = ltz;
        rightWing.xRot = rx;
        rightWing.yRot = ry;
        rightWing.zRot = rz;
        rightTip.zRot = rtz;
    }
}
