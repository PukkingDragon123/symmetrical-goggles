package dev.lowpix.winterworks.client.boss;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.boss.FrostMaulerSkullBlock;
import dev.lowpix.winterworks.boss.FrostMaulerSkullBlockEntity;
import dev.lowpix.winterworks.client.render.WWModel;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderer;
import net.minecraft.client.renderer.blockentity.BlockEntityRendererProvider;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.client.resources.model.BakedModel;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;

/**
 * Draws the Frost Mauler skull (lowpix model `frost_mauler_skull`: bones skull, jaw, fang_l, fang_r, eye). The eye is
 * only drawn while the skull is lit (the revival), emissive and pulsing brighter as the ritual builds; the jaw
 * trembles open. In inventory slots the item shows its 2D icon (textures/item/frost_mauler_skull.png).
 */
public class FrostMaulerSkullRenderer implements BlockEntityRenderer<FrostMaulerSkullBlockEntity> {
    public static final ResourceLocation ICON_MODEL = Winterworks.id("item/frost_mauler_skull_icon");
    private static WWModel<Entity> model;

    public FrostMaulerSkullRenderer(BlockEntityRendererProvider.Context ctx) {
        model = new WWModel<>(ctx.bakeLayer(BossClient.SKULL_LAYER), "frost_mauler_skull");
    }

    static WWModel<Entity> model() {
        if (model == null) {
            model = new WWModel<>(Minecraft.getInstance().getEntityModels().bakeLayer(BossClient.SKULL_LAYER), "frost_mauler_skull");
        }
        return model;
    }

    @Override
    public void render(FrostMaulerSkullBlockEntity be, float partial, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
        var state = be.getBlockState();
        float yRot = state.hasProperty(FrostMaulerSkullBlock.FACING) ? -state.getValue(FrostMaulerSkullBlock.FACING).toYRot() : 0f;
        float time = (be.getLevel() == null ? 0 : be.getLevel().getGameTime()) + partial;
        draw(pose, buffers, light, overlay, yRot, be.isLit() ? be.ritualProgress(partial) : -1f, time);
    }

    /** `ritual` is -1 when unlit, else 0..1 through the revival. */
    static void draw(PoseStack pose, MultiBufferSource buffers, int light, int overlay, float yRot, float ritual, float time) {
        WWModel<Entity> m = model();
        m.reset();
        m.clip("idle", (time / 20f) % 2.0f);
        boolean lit = ritual >= 0f;
        if (lit) {   // the jaw shudders open as the Mauler stirs
            float k = 0.2f + 0.8f * ritual;
            m.get("jaw").ifPresent(p -> p.xRot += (0.12f + Mth.sin(time * 1.3f) * 0.05f) * k);
            m.get("skull").ifPresent(p -> p.zRot += Mth.sin(time * 2.1f) * 0.02f * k);
        }
        pose.pushPose();
        pose.translate(0.5, 0, 0.5);
        pose.mulPose(Axis.YP.rotationDegrees(yRot + 180f));
        pose.translate(0, 1.5, 0);
        pose.scale(-1f, -1f, 1f);
        m.show("eye", false);
        m.renderToBuffer(pose, buffers.getBuffer(RenderType.entityCutoutNoCull(m.texture)), light, overlay, 0xFFFFFFFF);
        if (lit) {
            m.show("eye", true);
            m.mask("eye"::equals);
            float pulse = 0.55f + 0.25f * ritual + 0.2f * Mth.sin(time * (0.25f + ritual * 0.5f));
            int c = (int) (Mth.clamp(pulse, 0f, 1f) * 255);
            m.renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(m.hasGlow ? m.glowTexture : m.texture)), 0xF000F0,
                    OverlayTexture.NO_OVERLAY, 0xFF000000 | (c << 16) | (c << 8) | c);
            m.unmask();
        }
        m.show("eye", true);
        pose.popPose();
    }

    @Override
    public boolean shouldRenderOffScreen(FrostMaulerSkullBlockEntity be) {
        return false;
    }

    /** The skull as an item: 3D in hand, on the ground and in frames; the 2D icon in inventory slots. */
    public static class Item implements BuiltinItemRendererRegistry.DynamicItemRenderer {
        @Override
        public void render(ItemStack stack, ItemDisplayContext mode, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
            Minecraft mc = Minecraft.getInstance();
            if (mode == ItemDisplayContext.GUI) {
                BakedModel icon = mc.getModelManager().getModel(ICON_MODEL);
                pose.pushPose();
                pose.translate(0.5f, 0.5f, 0.5f);
                mc.getItemRenderer().render(stack, mode, false, pose, buffers, light, overlay, icon);
                pose.popPose();
                return;
            }
            float time = mc.level == null ? 0 : mc.level.getGameTime() + mc.getTimer().getGameTimeDeltaPartialTick(false);
            draw(pose, buffers, light, overlay, 0f, -1f, time);
        }
    }
}
