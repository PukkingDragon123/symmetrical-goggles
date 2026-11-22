package dev.lowpix.winterworks.client.amber;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.Winterworks;
import net.minecraft.client.model.BoatModel;
import net.minecraft.client.model.ChestBoatModel;
import net.minecraft.client.model.ListModel;
import net.minecraft.client.model.WaterPatchModel;
import net.minecraft.client.model.geom.ModelLayers;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.vehicle.Boat;
import org.joml.Quaternionf;

/**
 * Amberwood boats (amber.AmberwoodBoat): vanilla's BoatRenderer, with vanilla's boat and chest-boat models and the
 * art pass's {@code entity/boat/amberwood} and {@code entity/chest_boat/amberwood} textures.
 */
public class AmberwoodBoatRenderer extends EntityRenderer<Boat> {
    private final ResourceLocation texture;
    private final ListModel<Boat> model;

    public AmberwoodBoatRenderer(EntityRendererProvider.Context ctx, boolean chest) {
        super(ctx);
        shadowRadius = 0.8f;
        texture = Winterworks.id("textures/entity/" + (chest ? "chest_boat" : "boat") + "/amberwood.png");
        model = chest ? new ChestBoatModel(ctx.bakeLayer(ModelLayers.createChestBoatModelName(Boat.Type.OAK)))
                : new BoatModel(ctx.bakeLayer(ModelLayers.createBoatModelName(Boat.Type.OAK)));
    }

    @Override
    public void render(Boat boat, float yaw, float partial, PoseStack pose, MultiBufferSource buffers, int light) {
        pose.pushPose();
        pose.translate(0.0f, 0.375f, 0.0f);
        pose.mulPose(Axis.YP.rotationDegrees(180.0f - yaw));
        float hurt = boat.getHurtTime() - partial;
        float damage = Math.max(0f, boat.getDamage() - partial);
        if (hurt > 0.0f) {
            pose.mulPose(Axis.XP.rotationDegrees(Mth.sin(hurt) * hurt * damage / 10.0f * boat.getHurtDir()));
        }
        float bubble = boat.getBubbleAngle(partial);
        if (!Mth.equal(bubble, 0.0f)) {
            pose.mulPose(new Quaternionf().setAngleAxis(bubble * Mth.DEG_TO_RAD, 1.0f, 0.0f, 1.0f));
        }
        pose.scale(-1.0f, -1.0f, 1.0f);
        pose.mulPose(Axis.YP.rotationDegrees(90.0f));
        model.setupAnim(boat, partial, 0.0f, -0.1f, 0.0f, 0.0f);
        model.renderToBuffer(pose, buffers.getBuffer(model.renderType(texture)), light, OverlayTexture.NO_OVERLAY);
        if (!boat.isUnderWater() && model instanceof WaterPatchModel patch) {
            patch.waterPatch().render(pose, buffers.getBuffer(RenderType.waterMask()), light, OverlayTexture.NO_OVERLAY);
        }
        pose.popPose();
        super.render(boat, yaw, partial, pose, buffers, light);
    }

    @Override
    public ResourceLocation getTextureLocation(Boat boat) {
        return texture;
    }
}
