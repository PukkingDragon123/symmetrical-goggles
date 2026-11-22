package dev.lowpix.winterworks.client.hex;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.Winterworks;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.client.resources.model.BakedModel;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;

/**
 * The Hex Core in 3D from the lowpix model {@code hex_core}: it turns slowly and its {@code souls} bone swirls inside
 * (spinning, glowing). Clip {@code idle} loops. In slots (and while the model is missing) it shows the 2D icon.
 */
public class HexCoreRenderer implements BuiltinItemRendererRegistry.DynamicItemRenderer {
    public static final ResourceLocation ICON_MODEL = Winterworks.id("item/hex_core_icon");
    private HexModel model;

    private HexModel model() {
        if (model == null) {
            model = new HexModel(HexLayers.HEX_CORE, "hex_core");
        }
        return model;
    }

    @Override
    public void render(ItemStack stack, ItemDisplayContext mode, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
        Minecraft mc = Minecraft.getInstance();
        HexModel m = model();
        if (m.missing() || mode == ItemDisplayContext.GUI) {
            BakedModel icon = mc.getModelManager().getModel(ICON_MODEL);
            pose.pushPose();
            pose.translate(0.5f, 0.5f, 0.5f);
            mc.getItemRenderer().render(stack, mode, false, pose, buffers, light, overlay, icon);
            pose.popPose();
            return;
        }
        float time = (mc.level == null ? 0 : mc.level.getGameTime()) + mc.getTimer().getGameTimeDeltaPartialTick(false);
        m.reset();
        m.loop("idle", time / 20f);
        ModelPart souls = m.get("souls").orElse(null);
        if (souls != null) {
            souls.yRot += time * 0.12f;
            souls.zRot += Mth.sin(time * 0.05f) * 0.3f;
        }
        pose.pushPose();
        pose.translate(0.5f, 0.5f, 0.5f);
        pose.mulPose(Axis.YP.rotationDegrees(time * 2.5f));
        pose.translate(0f, 0.05f * Mth.sin(time * 0.08f), 0f);
        pose.translate(-0.5f, -0.5f, -0.5f);
        pose.translate(0.5f, 1.5f, 0.5f);
        pose.scale(-1f, -1f, 1f);
        m.mask(n -> !n.startsWith("souls"));
        m.renderToBuffer(pose, buffers.getBuffer(RenderType.entityCutoutNoCull(m.texture)), light, overlay, 0xFFFFFFFF);
        if (souls != null) {
            m.mask(n -> n.startsWith("souls"));
            m.renderToBuffer(pose, buffers.getBuffer(RenderType.entityTranslucent(m.texture)), 0xF000F0, overlay, 0xE0FFFFFF);
            m.renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(m.texture)), 0xF000F0, OverlayTexture.NO_OVERLAY,
                    HexRender.argb(255, HexRender.scale(HexRender.SOUL_BLUE, 0.5f + 0.2f * Mth.sin(time * 0.2f))));
        }
        m.unmask();
        HexRender.glow(m, pose, buffers);
        pose.popPose();
    }
}
