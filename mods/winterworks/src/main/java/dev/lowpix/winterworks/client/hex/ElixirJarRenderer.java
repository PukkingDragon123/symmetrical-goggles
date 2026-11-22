package dev.lowpix.winterworks.client.hex;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.hex.ElixirJarBlock;
import dev.lowpix.winterworks.hex.ElixirJarBlockEntity;
import dev.lowpix.winterworks.hex.ElixirType;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
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
 * The Elixir Jar from the lowpix model {@code elixir_jar} (examples/src/elixir_jar.py): the brass {@code jar} and
 * {@code lid}, then the tint parts {@code liquid} and {@code bubble_0..3} (from the model's tint texture) in the
 * elixir's colour, {@code liquid} scaled up its height by how full the jar is (its pivot is the liquid's floor), then
 * the translucent {@code glass}. Clips: {@code idle} always, {@code bubble} while it brews over heat.
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

    private static boolean isLiquid(HexModel m, String part) {
        return m.isTint(part) || part.startsWith("liquid") || part.startsWith("bubble");
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
            } else if (jar.liquid() == ElixirType.BLOOD) {   // the gold melts into the blood and rises
                fill = Mth.lerp(f, 1f / ElixirJarBlockEntity.DOSES, 1f);
                color = HexRender.lerpRgb(f * f, jar.liquid().color, kind.color);
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
        boolean full = fill > 0.001f;
        if (liquid != null) {
            liquid.yScale *= Math.max(0.001f, fill);
            liquid.visible = full;
        }
        pose.pushPose();
        HexRender.enterModel(pose, yRot);
        m.mask(n -> !HexRender.isGlass(n) && !isLiquid(m, n));
        m.renderToBuffer(pose, buffers.getBuffer(RenderType.entityCutoutNoCull(m.texture)), light, overlay, 0xFFFFFFFF);
        if (liquid != null && full) {
            m.mask(n -> isLiquid(m, n));
            var tex = m.hasTint ? m.tintTexture : m.texture;
            m.renderToBuffer(pose, buffers.getBuffer(RenderType.entityTranslucent(tex)), light, overlay, HexRender.argb(235, color));
            if (kind.bottled()) {   // elixirs glow faintly (molten gold too); blood doesn't
                float pulse = 0.3f + 0.12f * Mth.sin(time * 0.12f) + (bubbling ? 0.15f : 0f);
                m.renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(tex)), 0xF000F0, OverlayTexture.NO_OVERLAY,
                        HexRender.argb(255, HexRender.scale(color, pulse)));
            }
        }
        m.mask(HexRender::isGlass);
        // thinner glass over a liquid, so the elixir's colour reads through it
        m.renderToBuffer(pose, buffers.getBuffer(RenderType.entityTranslucent(m.texture)), light, overlay,
                liquid != null && full ? 0xA0FFFFFF : 0xFFFFFFFF);
        m.unmask();
        HexRender.glow(m, pose, buffers);
        pose.popPose();
        if (liquid != null) {
            liquid.visible = true;
        }
    }

    @Override
    public boolean shouldRenderOffScreen(ElixirJarBlockEntity jar) {
        return false;
    }

    /** The jar as an item, in slots too (docs/FIXES_0_4.md "3D icons"): the 3D jar half full of Soul Elixir. */
    public static class Item implements BuiltinItemRendererRegistry.DynamicItemRenderer {
        @Override
        public void render(ItemStack stack, ItemDisplayContext mode, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
            if (model().missing()) {
                HexRender.icon(HexRender.JAR_ICON, stack, mode, pose, buffers, light, overlay);
                return;
            }
            draw(pose, buffers, light, overlay, HexRender.clientTime(), 0f, 0.6f, ElixirType.SOUL.color, ElixirType.SOUL, false);
        }
    }
}
