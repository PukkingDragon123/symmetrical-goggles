package dev.lowpix.winterworks.client.oceangear;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.lowpix.LowpixEntityModel;
import dev.lowpix.winterworks.oceangear.EyeOfTheOceanBlockEntity;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderer;
import net.minecraft.client.renderer.blockentity.BlockEntityRendererProvider;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.FastColor;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.Vec3;

/**
 * The Eye of the Ocean (lowpix {@code eye_of_the_ocean}): the cage of scales turning through its {@code idle} clip, the
 * eye inside turning to follow the nearest player (eased), the pupil and seams glowing full-bright in a slow pulse.
 * Block-entity transform as HexRender.enterModel; the item draws the same model.
 */
public class EyeOfTheOceanRenderer implements BlockEntityRenderer<EyeOfTheOceanBlockEntity> {
    public static final ResourceLocation TEXTURE = Winterworks.id("textures/entity/eye_of_the_ocean.png");
    public static final ResourceLocation GLOW = Winterworks.id("textures/entity/eye_of_the_ocean_glow.png");
    private static final double LOOK_RANGE = 20;
    private final EyeModel model;

    public EyeOfTheOceanRenderer(BlockEntityRendererProvider.Context ctx) {
        model = new EyeModel(ctx.bakeLayer(OceanGearClient.EYE_OF_THE_OCEAN));
    }

    static final class EyeModel extends LowpixEntityModel<Entity> {
        final ModelPart eye;

        EyeModel(ModelPart root) {
            super(root, Winterworks.MOD_ID, "eye_of_the_ocean");
            eye = part("eye");
        }

        @Override
        public void setupAnim(Entity e, float limbSwing, float limbAmount, float age, float headYaw, float headPitch) {}

        void draw(PoseStack pose, MultiBufferSource buffers, int light, int overlay, float seconds, float yaw, float pitch) {
            resetPose();
            poseAt("idle", seconds % 4f);
            eye.yRot += yaw;
            eye.xRot += pitch;
            pose.pushPose();
            pose.translate(0.5, 0, 0.5);
            pose.mulPose(Axis.YP.rotationDegrees(180f));
            pose.translate(0, 1.5, 0);
            pose.scale(-1f, -1f, 1f);
            renderToBuffer(pose, buffers.getBuffer(RenderType.entityCutoutNoCull(TEXTURE)), light, overlay, -1);
            int g = (int) (255 * (0.8f + 0.2f * Mth.sin(seconds * 1.6f)));
            renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(GLOW)), 0xF000F0, OverlayTexture.NO_OVERLAY, FastColor.ARGB32.color(255, g, g, g));
            pose.popPose();
        }
    }

    @Override
    public void render(EyeOfTheOceanBlockEntity be, float partial, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
        if (be.getLevel() == null) {
            return;
        }
        float seconds = (be.getLevel().getGameTime() % 24000L + partial) / 20f;
        Vec3 c = Vec3.atCenterOf(be.getBlockPos());
        Player p = be.getLevel().getNearestPlayer(c.x, c.y, c.z, LOOK_RANGE, false);
        float wantYaw, wantPitch;
        if (p != null) {
            Vec3 d = p.getEyePosition(partial).subtract(c);
            double len = d.length();
            // the eye looks down model -Z, which the block transform turns to world +Z: yaw atan2(-dx, dz), pitch asin(-dy)
            wantYaw = (float) Mth.atan2(-d.x, d.z);
            wantPitch = (float) Math.asin(Mth.clamp(-d.y / Math.max(len, 1.0E-3), -1, 1));
        } else {   // nobody near: it drifts, searching
            wantYaw = Mth.sin(seconds * 0.4f) * 0.9f;
            wantPitch = Mth.sin(seconds * 0.27f) * 0.25f;
        }
        if (!be.lookInit) {
            be.lookYaw = wantYaw;
            be.lookPitch = wantPitch;
            be.lookInit = true;
        }
        be.lookYaw += Mth.wrapDegrees((wantYaw - be.lookYaw) * Mth.RAD_TO_DEG) * Mth.DEG_TO_RAD * 0.12f;
        be.lookPitch += (wantPitch - be.lookPitch) * 0.12f;
        model.draw(pose, buffers, light, overlay, seconds, be.lookYaw, be.lookPitch);
    }

    @Override
    public int getViewDistance() {
        return 96;
    }

    /** The item: the same model, idling, its eye glancing about. */
    public static final class Item implements BuiltinItemRendererRegistry.DynamicItemRenderer {
        private EyeModel model;

        @Override
        public void render(ItemStack stack, ItemDisplayContext mode, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
            if (model == null) {
                model = new EyeModel(Minecraft.getInstance().getEntityModels().bakeLayer(OceanGearClient.EYE_OF_THE_OCEAN));
            }
            Minecraft mc = Minecraft.getInstance();
            float seconds = (mc.level != null ? mc.level.getGameTime() % 24000L : 0) / 20f + mc.getTimer().getGameTimeDeltaPartialTick(false) / 20f;
            model.draw(pose, buffers, light, overlay, seconds, Mth.sin(seconds * 0.5f) * 0.6f, Mth.sin(seconds * 0.33f) * 0.2f);
        }
    }
}
