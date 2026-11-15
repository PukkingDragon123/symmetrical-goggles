package dev.lowpix.winterworks.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.client.WWLayers;
import dev.lowpix.winterworks.globe.SnowGlobeBlock;
import dev.lowpix.winterworks.globe.SnowGlobeBlockEntity;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderer;
import net.minecraft.client.renderer.blockentity.BlockEntityRendererProvider;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;

/** Draws the snow globe: wooden base and scene, then the glass (translucent), then the glowing cabin window. */
public class SnowGlobeRenderer implements BlockEntityRenderer<SnowGlobeBlockEntity> {
    private static WWModel<Entity> model;

    public SnowGlobeRenderer(BlockEntityRendererProvider.Context ctx) {
        model = new WWModel<>(ctx.bakeLayer(WWLayers.SNOW_GLOBE), "snow_globe");
    }

    static WWModel<Entity> model() {
        if (model == null) {
            model = new WWModel<>(Minecraft.getInstance().getEntityModels().bakeLayer(WWLayers.SNOW_GLOBE), "snow_globe");
        }
        return model;
    }

    @Override
    public void render(SnowGlobeBlockEntity be, float partial, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
        float t = be.getLevel() == null ? 0 : (be.getLevel().getGameTime() - be.shakeTime + partial) / 20f;
        float yRot = be.getBlockState().hasProperty(SnowGlobeBlock.FACING) ? -be.getBlockState().getValue(SnowGlobeBlock.FACING).toYRot() : 0f;
        draw(pose, buffers, light, overlay, t, yRot, (be.getLevel() == null ? 0 : be.getLevel().getGameTime()) + partial);
    }

    static void draw(PoseStack pose, MultiBufferSource buffers, int light, int overlay, float sinceShake, float yRot, float time) {
        WWModel<Entity> m = model();
        m.reset();
        m.clip("idle", (time / 20f) % 3.0f);
        if (sinceShake >= 0 && sinceShake < 0.9f) {
            m.clip("shake", sinceShake);
        }
        pose.pushPose();
        pose.translate(0.5, 0, 0.5);
        pose.mulPose(Axis.YP.rotationDegrees(yRot + 180f));
        pose.translate(0, 1.5, 0);
        pose.scale(-1f, -1f, 1f);
        // opaque pass: everything but the glass
        m.get("glass").ifPresent(p -> p.visible = false);
        m.renderToBuffer(pose, buffers.getBuffer(RenderType.entityCutoutNoCull(m.texture)), light, overlay, 0xFFFFFFFF);
        // glass pass
        m.get("glass").ifPresent(p -> p.visible = true);
        m.mask(n -> n.startsWith("glass"));
        m.renderToBuffer(pose, buffers.getBuffer(RenderType.entityTranslucent(m.texture)), light, overlay, 0xFFFFFFFF);
        m.unmask();
        if (m.hasGlow) {
            m.get("glass").ifPresent(p -> p.visible = false);
            m.renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(m.glowTexture)), 0xF000F0, OverlayTexture.NO_OVERLAY, 0xFFFFFFFF);
            m.get("glass").ifPresent(p -> p.visible = true);
        }
        pose.popPose();
    }

    @Override
    public boolean shouldRenderOffScreen(SnowGlobeBlockEntity be) {
        return false;
    }

    /** The globe as an item (in hand, on the ground, in slots): the same model, with a gentle idle. */
    public static class Item implements BuiltinItemRendererRegistry.DynamicItemRenderer {
        @Override
        public void render(ItemStack stack, ItemDisplayContext mode, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
            Minecraft mc = Minecraft.getInstance();
            float time = mc.level == null ? 0 : mc.level.getGameTime() + mc.getTimer().getGameTimeDeltaPartialTick(false);
            draw(pose, buffers, light, overlay, -1f, 0f, time);
        }
    }
}
