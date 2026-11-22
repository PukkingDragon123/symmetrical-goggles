package dev.lowpix.winterworks.client.endgear;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.util.Mth;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import org.jetbrains.annotations.Nullable;
import org.joml.Vector3f;

/**
 * The Monolith Wand, the lowpix model {@code monolith_wand} (bones rod, head, eye), in 3D everywhere, the GUI
 * included. It's fitted to the vanilla handheld layout (item model display transforms are item/handheld's), so it's
 * held like a sword or staff in either hand: the long axis along the sprite diagonal, head up and to the right, the
 * rod's lower end in the hand. In slots it lies along the same diagonal, turned a little for depth. The eye pulses, and
 * flares while the wand cools down.
 */
public class MonolithWandRenderer implements BuiltinItemRendererRegistry.DynamicItemRenderer {
    /** Where the grip sits in item space (a vanilla sword's handle) and how long the wand is held (px / 16). */
    private static final Vector3f GRIP_AT = new Vector3f(3.5f / 16f, 3.5f / 16f, 8f / 16f);
    private static final float LENGTH = 19f / 16f;
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

        Vector3f size = m.size();
        int along = size.y >= size.x * 0.8f && size.y >= size.z * 0.8f ? 1 : size.z >= size.x ? 2 : 0;
        float len = Math.max(1e-3f, size.get(along));
        // the grip: a quarter of the way up from the rod's lower end (the end away from the head)
        Vector3f head = m.centerOf(n -> n.startsWith("head") || n.startsWith("eye"));
        Vector3f c = m.center();
        boolean headHigh = head == null || head.get(along) >= c.get(along);
        Vector3f grip = new Vector3f(c);
        grip.setComponent(along, headHigh ? m.min.get(along) + 0.22f * len : m.max.get(along) - 0.22f * len);

        m.model.reset();
        m.loop("idle", now / 20f);
        float pulse = 0.5f + 0.5f * Mth.sin(now * 0.15f);
        m.model.get("eye").ifPresent(p -> {
            float s = 1f + 0.06f * pulse + 0.25f * cooldown;
            p.xScale *= s;
            p.yScale *= s;
            p.zScale *= s;
        });

        pose.pushPose();
        if (mode == ItemDisplayContext.GUI) {   // the inventory icon is the 3D wand itself, along the diagonal, turned for depth
            pose.translate(0.5f, 0.5f, 0.5f);
            pose.mulPose(Axis.YP.rotationDegrees(-30f));
            pose.mulPose(Axis.XP.rotationDegrees(14f));
            pose.scale(0.9f, 0.9f, 0.9f);
            pose.translate(-0.5f, -0.5f, -0.5f);
        }
        pose.translate(GRIP_AT.x, GRIP_AT.y, GRIP_AT.z);
        pose.mulPose(Axis.ZP.rotationDegrees(-45f));
        float s = LENGTH / len;
        pose.scale(s, s, s);
        if (along == 0) {
            pose.mulPose(Axis.ZP.rotationDegrees(headHigh ? 90f : -90f));
        } else if (along == 2) {
            pose.mulPose(Axis.XP.rotationDegrees(headHigh ? -90f : 90f));
        } else if (!headHigh) {
            pose.mulPose(Axis.ZP.rotationDegrees(180f));
        }
        pose.translate(-grip.x, -grip.y, -grip.z);
        m.draw(pose, buffers, light, overlay, stack.hasFoil(), m.standIn ? 0xFF8A6BC8 : 0xFFFFFFFF);
        pose.popPose();
    }
}
