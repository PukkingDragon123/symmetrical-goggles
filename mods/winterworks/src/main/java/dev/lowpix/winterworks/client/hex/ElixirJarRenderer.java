package dev.lowpix.winterworks.client.hex;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.hex.ElixirJarBlock;
import dev.lowpix.winterworks.hex.ElixirJarBlockEntity;
import dev.lowpix.winterworks.hex.ElixirType;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderer;
import net.minecraft.client.renderer.blockentity.BlockEntityRendererProvider;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.util.Mth;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.Blocks;

/**
 * The Elixir Jar from the lowpix model {@code elixir_jar}: brass and the opaque parts, then the {@code liquid} bone
 * (and its children) tinted with the elixir's colour and scaled up its height by how full the jar is (its pivot sits at
 * the bottom of the liquid), then the {@code glass*} parts, translucent. Clips: {@code idle} loops always,
 * {@code bubble} loops while it brews over heat; parts named {@code bubbles*} only show then.
 */
public class ElixirJarRenderer implements BlockEntityRenderer<ElixirJarBlockEntity> {
    private static HexModel model;

    public ElixirJarRenderer(BlockEntityRendererProvider.Context ctx) {
        model = new HexModel(HexLayers.ELIXIR_JAR, "elixir_jar");
    }

    static HexModel model() {
        if (model == null) {
            model = new HexModel(HexLayers.ELIXIR_JAR, "elixir_jar");
        }
        return model;
    }

    @Override
    public void render(ElixirJarBlockEntity jar, float partial, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
        float time = (jar.getLevel() == null ? 0 : jar.getLevel().getGameTime()) + partial;
        float yRot = jar.getBlockState().hasProperty(ElixirJarBlock.FACING) ? -jar.getBlockState().getValue(ElixirJarBlock.FACING).toYRot() : 0f;
        float fill;
        int color;
        ElixirType kind;
        if (jar.isBrewing()) {
            float f = jar.brewFraction();
            kind = jar.brewing();
            if (jar.liquid() == ElixirType.NONE) {
                fill = 0.08f + 0.92f * f;   // the brew rises as it cooks
                color = HexRender.lerpRgb(0.35f + 0.65f * f, 0x6B5A4A, kind.color);
            } else {
                fill = 1f;
                color = HexRender.lerpRgb(f, jar.liquid().color, kind.color);
            }
        } else {
            kind = jar.liquid();
            fill = jar.doses() / (float) ElixirJarBlockEntity.DOSES;
            color = kind.color;
        }
        draw(pose, buffers, light, overlay, time, yRot, fill, color, kind, jar.isBrewing() && jar.heated);
    }

    static void draw(PoseStack pose, MultiBufferSource buffers, int light, int overlay, float time, float yRot, float fill, int color,
                     ElixirType kind, boolean bubbling) {
        HexModel m = model();
        if (m.missing()) {
            HexRender.standIn(Blocks.LANTERN.defaultBlockState(), pose, buffers, light, overlay);
            return;
        }
        if (kind == ElixirType.CURSED) {   // gold bound with souls: soul blue swirls through it
            color = HexRender.lerpRgb(0.25f + 0.25f * Mth.sin(time * 0.09f), color, HexRender.SOUL_BLUE);
        }
        m.reset();
        m.loop("idle", time / 20f);
        if (bubbling) {
            m.loop("bubble", time / 20f);
        }
        ModelPart liquid = m.get("liquid").orElse(null);
        if (liquid != null) {
            liquid.yScale *= Math.max(0.001f, fill);
            if (bubbling) {   // a molten wobble on the surface
                liquid.xScale *= 1f + 0.03f * Mth.sin(time * 0.9f);
                liquid.zScale *= 1f + 0.03f * Mth.cos(time * 0.8f);
            }
        }
        pose.pushPose();
        HexRender.enterModel(pose, yRot);
        m.mask(n -> !HexRender.isGlass(n) && !n.startsWith("liquid") && (bubbling || !n.startsWith("bubbles")));
        m.renderToBuffer(pose, buffers.getBuffer(RenderType.entityCutoutNoCull(m.texture)), light, overlay, 0xFFFFFFFF);
        if (liquid != null && fill > 0.001f) {
            m.mask(n -> n.startsWith("liquid"));
            m.renderToBuffer(pose, buffers.getBuffer(RenderType.entityTranslucent(m.texture)), light, overlay, HexRender.argb(235, color));
            if (kind == ElixirType.SOUL || kind == ElixirType.CURSED || bubbling) {   // elixirs glow faintly
                float pulse = 0.35f + 0.15f * Mth.sin(time * 0.12f) + (bubbling ? 0.2f : 0f);
                m.renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(m.texture)), 0xF000F0, OverlayTexture.NO_OVERLAY,
                        HexRender.argb(255, HexRender.scale(color, pulse)));
            }
        }
        m.mask(HexRender::isGlass);
        m.renderToBuffer(pose, buffers.getBuffer(RenderType.entityTranslucent(m.texture)), light, overlay, 0xFFFFFFFF);
        m.unmask();
        HexRender.glow(m, pose, buffers);
        pose.popPose();
    }

    @Override
    public boolean shouldRenderOffScreen(ElixirJarBlockEntity jar) {
        return false;
    }

    /** The jar as an item: half a jar of Soul Elixir. */
    public static class Item implements BuiltinItemRendererRegistry.DynamicItemRenderer {
        @Override
        public void render(ItemStack stack, ItemDisplayContext mode, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
            Minecraft mc = Minecraft.getInstance();
            float time = mc.level == null ? 0 : mc.level.getGameTime() + mc.getTimer().getGameTimeDeltaPartialTick(false);
            draw(pose, buffers, light, overlay, time, 0f, 0.6f, ElixirType.SOUL.color, ElixirType.SOUL, false);
        }
    }
}
