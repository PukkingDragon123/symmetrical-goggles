package dev.lowpix.winterworks.client.hex;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.hex.HexingTableBlockEntity;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.BookModel;
import net.minecraft.client.model.geom.ModelLayers;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderer;
import net.minecraft.client.renderer.blockentity.BlockEntityRendererProvider;
import net.minecraft.client.renderer.blockentity.EnchantTableRenderer;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.util.Mth;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.Blocks;

/**
 * The Hexing Table from the lowpix model {@code hexing_table}. Its {@code book} bone bobs, turns to face the nearest
 * player (the book's front, the open pages, faces model -Z like a vanilla mob's face) and opens for them: the clip
 * {@code open} is posed at the open amount (0 shut, its end wide open); without that clip the bones {@code cover_l} /
 * {@code cover_r} swing open about Y instead. Clip {@code idle} loops always, {@code flip} loops while the book is open.
 * Parts flagged glow (soul flames, runes) are full-bright.
 */
public class HexingTableRenderer implements BlockEntityRenderer<HexingTableBlockEntity> {
    private static HexModel model;
    private static BookModel book;

    public HexingTableRenderer(BlockEntityRendererProvider.Context ctx) {
        model = new HexModel(HexLayers.HEXING_TABLE, "hexing_table");
        book = new BookModel(ctx.bakeLayer(ModelLayers.BOOK));
    }

    static HexModel model() {
        if (model == null) {
            model = new HexModel(HexLayers.HEXING_TABLE, "hexing_table");
        }
        return model;
    }

    static BookModel book() {
        if (book == null) {
            book = new BookModel(Minecraft.getInstance().getEntityModels().bakeLayer(ModelLayers.BOOK));
        }
        return book;
    }

    @Override
    public void render(HexingTableBlockEntity be, float partial, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
        float time = be.time + partial;
        float d = Mth.wrapDegrees((be.rot - be.oRot) * Mth.RAD_TO_DEG) * Mth.DEG_TO_RAD;
        float rot = be.oRot + d * partial;
        float open = Mth.lerp(partial, be.oOpen, be.open);
        float flip = Mth.lerp(partial, be.oFlip, be.flip);
        draw(pose, buffers, light, overlay, time, rot, open, flip);
    }

    static void draw(PoseStack pose, MultiBufferSource buffers, int light, int overlay, float time, float rot, float open, float flip) {
        HexModel m = model();
        if (m.missing()) {
            standIn(pose, buffers, light, overlay, time, rot, open, flip);
            return;
        }
        m.reset();
        m.loop("idle", time / 20f);
        ModelPart b = m.get("book").orElse(null);
        if (b != null) {
            b.yRot += rot;
            b.y -= 0.6f + Mth.sin(time * 0.1f) * 0.6f;
        }
        if (m.length("open") > 0) {
            m.at("open", open);
        } else {
            float a = (Mth.sin(time * 0.02f) * 0.1f + 1.25f) * open;
            m.get("cover_l").ifPresent(p -> p.yRot += a);
            m.get("cover_r").ifPresent(p -> p.yRot -= a);
        }
        if (open > 0.6f) {
            m.at("flip", Mth.frac(flip * 0.25f));
        }
        pose.pushPose();
        HexRender.enterModel(pose, 0f);
        m.renderToBuffer(pose, buffers.getBuffer(RenderType.entityCutoutNoCull(m.texture)), light, overlay, 0xFFFFFFFF);
        HexRender.glow(m, pose, buffers);
        pose.popPose();
    }

    /** While the lowpix model is missing: an enchanting table with a soul-blue vanilla book over it. */
    private static void standIn(PoseStack pose, MultiBufferSource buffers, int light, int overlay, float time, float rot, float open,
                                float flip) {
        HexRender.standIn(Blocks.ENCHANTING_TABLE.defaultBlockState(), pose, buffers, light, overlay);
        pose.pushPose();
        pose.translate(0.5f, 0.75f, 0.5f);
        pose.translate(0f, 0.1f + Mth.sin(time * 0.1f) * 0.01f, 0f);
        // vanilla turns its book by -atan2(dz, dx); rot is atan2(-dx, dz), a quarter turn behind
        pose.mulPose(Axis.YP.rotation(-(rot + Mth.HALF_PI)));
        pose.mulPose(Axis.ZP.rotationDegrees(80f));
        float r = Mth.clamp(Mth.frac(flip + 0.25f) * 1.6f - 0.3f, 0f, 1f);
        float l = Mth.clamp(Mth.frac(flip + 0.75f) * 1.6f - 0.3f, 0f, 1f);
        BookModel bm = book();
        bm.setupAnim(time, r, l, open);
        bm.render(pose, EnchantTableRenderer.BOOK_LOCATION.buffer(buffers, RenderType::entitySolid), light, overlay,
                HexRender.argb(255, HexRender.lerpRgb(0.55f, 0xFFFFFF, HexRender.SOUL_BLUE)));
        pose.popPose();
    }

    @Override
    public boolean shouldRenderOffScreen(HexingTableBlockEntity be) {
        return false;
    }

    /** The table as an item: the book half open, slowly turning. */
    public static class Item implements BuiltinItemRendererRegistry.DynamicItemRenderer {
        @Override
        public void render(ItemStack stack, ItemDisplayContext mode, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
            Minecraft mc = Minecraft.getInstance();
            float time = mc.level == null ? 0 : mc.level.getGameTime() + mc.getTimer().getGameTimeDeltaPartialTick(false);
            draw(pose, buffers, light, overlay, time, 0f, 0.55f, 0f);
        }
    }
}
