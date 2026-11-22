package dev.lowpix.winterworks.client.endgear;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import org.jetbrains.annotations.Nullable;

/**
 * The Monolith Wand, the lowpix model {@code monolith_wand} (bones rod, head, eye; {@code idle} loop), in 3D everywhere,
 * the GUI included. The rod's grip is the model's origin and the head points up (-Y), so it is laid along the vanilla
 * sprite diagonal like a sword (grip at item (3, 3, 8) px, head up and to the right) and the item model's display
 * transforms are vanilla item/handheld's: held like a sword or staff in either hand. In slots it lies along the same
 * diagonal, turned a little for depth. The eye flares while the wand cools down.
 */
public class MonolithWandRenderer implements BuiltinItemRendererRegistry.DynamicItemRenderer {
    private static final float SCALE = 0.63f;
    @Nullable private GearModel model;

    private GearModel model() {
        if (model == null) {
            model = new GearModel(GearLayers.MONOLITH_WAND, "monolith_wand", GearModel.vanilla("textures/block/crying_obsidian.png"));
        }
        return model;
    }

    @Override
    public void render(ItemStack stack, ItemDisplayContext mode, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
        GearModel m = model();
        Minecraft mc = Minecraft.getInstance();
        float now = (mc.level == null ? 0 : mc.level.getGameTime()) + mc.getTimer().getGameTimeDeltaPartialTick(false);
        LocalPlayer player = mc.player;
        float cooldown = player == null ? 0f : player.getCooldowns().getCooldownPercent(stack.getItem(), 0f);
        m.model.reset();
        m.loop("idle", now / 20f);
        if (cooldown > 0f) {   // just fired: the eye is still blazing
            m.model.get("eye").ifPresent(p -> {
                float s = 1f + 0.3f * cooldown;
                p.xScale *= s;
                p.yScale *= s;
                p.zScale *= s;
            });
        }
        pose.pushPose();
        if (mode == ItemDisplayContext.GUI) {   // the inventory icon is the 3D wand itself, along the diagonal, turned for depth
            pose.translate(0.5f, 0.5f, 0.5f);
            pose.mulPose(Axis.YP.rotationDegrees(-30f));
            pose.mulPose(Axis.XP.rotationDegrees(14f));
            pose.scale(0.92f, 0.92f, 0.92f);
            pose.translate(-0.5f, -0.5f, -0.5f);
        }
        pose.translate(3f / 16f, 3f / 16f, 8f / 16f);
        pose.mulPose(Axis.ZP.rotationDegrees(-45f));
        pose.scale(SCALE, -SCALE, -SCALE);
        m.drawModelSpace(pose, buffers, light, overlay, stack.hasFoil(), 0xFFFFFFFF);
        pose.popPose();
    }
}
