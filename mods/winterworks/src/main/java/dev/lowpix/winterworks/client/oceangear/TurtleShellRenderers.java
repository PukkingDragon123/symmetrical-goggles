package dev.lowpix.winterworks.client.oceangear;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.lowpix.LowpixEntityModel;
import net.fabricmc.fabric.api.client.rendering.v1.ArmorRenderer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.ItemRenderer;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.Vec3;

/**
 * Turtle Shell armour on the client (docs/OCEAN_UPDATE.md sections 5 and 11): the chestplate as the 3D carapace on the
 * back and plastron in front (a Fabric ArmorRenderer on the body part), and a retreated player drawn as the closed
 * shell ({@code turtle_shell_retreat}: {@code idle} loop, {@code hit} when struck) instead of their body
 * (mixin.oceangear.client.ShellPlayerRendererMixin).
 */
public final class TurtleShellRenderers {
    public static final ResourceLocation ARMOR_TEXTURE = Winterworks.id("textures/entity/turtle_shell_armor.png");
    public static final ResourceLocation RETREAT_TEXTURE = Winterworks.id("textures/entity/turtle_shell_retreat.png");
    private static ModelPart armor;
    private static RetreatModel retreat;

    private TurtleShellRenderers() {}

    /** The chestplate. */
    public static final class Chestplate implements ArmorRenderer {
        @Override
        public void render(PoseStack pose, MultiBufferSource buffers, ItemStack stack, LivingEntity entity, EquipmentSlot slot, int light,
                           HumanoidModel<LivingEntity> ctx) {
            if (armor == null) {
                armor = Minecraft.getInstance().getEntityModels().bakeLayer(OceanGearClient.TURTLE_SHELL_ARMOR);
            }
            pose.pushPose();
            ctx.body.translateAndRotate(pose);
            armor.render(pose, ItemRenderer.getArmorFoilBuffer(buffers, RenderType.armorCutoutNoCull(ARMOR_TEXTURE), stack.hasFoil()),
                    light, OverlayTexture.NO_OVERLAY);
            pose.popPose();
        }
    }

    /** The closed shell's model and clips. */
    static final class RetreatModel extends LowpixEntityModel<Entity> {
        RetreatModel(ModelPart root) {
            super(root, Winterworks.MOD_ID, "turtle_shell_retreat");
        }

        @Override
        public void setupAnim(Entity e, float limbSwing, float limbAmount, float age, float headYaw, float headPitch) {}
    }

    /** Draws `player` as the closed shell, sitting on the ground (the renderer's crouch offset undone). */
    public static void renderRetreat(AbstractClientPlayer player, Vec3 renderOffset, float partial, PoseStack pose, MultiBufferSource buffers,
                                     int light) {
        if (retreat == null) {
            retreat = new RetreatModel(Minecraft.getInstance().getEntityModels().bakeLayer(OceanGearClient.TURTLE_SHELL_RETREAT));
        }
        float age = player.tickCount + partial;
        retreat.resetPose();
        retreat.poseAt("idle", (age / 20f) % 4f);
        if (player.hurtTime > 0) {
            retreat.poseAt("hit", Math.min(0.4f, (player.hurtDuration - player.hurtTime + partial) / 20f));
        }
        float bodyYaw = Mth.rotLerp(partial, player.yBodyRotO, player.yBodyRot);
        pose.pushPose();
        pose.translate(-renderOffset.x, -renderOffset.y, -renderOffset.z);
        pose.mulPose(Axis.YP.rotationDegrees(180f - bodyYaw));
        pose.scale(-1f, -1f, 1f);
        pose.translate(0f, -1.501f, 0f);
        retreat.renderToBuffer(pose, buffers.getBuffer(RenderType.entityCutoutNoCull(RETREAT_TEXTURE)), light, OverlayTexture.NO_OVERLAY, -1);
        pose.popPose();
    }
}
