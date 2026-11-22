package dev.lowpix.winterworks.client.soulbull;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.lowpix.LowpixGeometry;
import dev.lowpix.winterworks.client.render.WWModel;
import dev.lowpix.winterworks.soulbull.SoulBullSkullBlock;
import dev.lowpix.winterworks.soulbull.SoulBullSkullBlockEntity;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderer;
import net.minecraft.client.renderer.blockentity.BlockEntityRendererProvider;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;

/**
 * Draws the Soul Bull Skull (lowpix model `soul_bull_skull`: bones skull, jaw, horn_l/r, eye_fire). The eye sockets'
 * soul fire (`eye_fire`) only shows while the skull is lit, emissive, flaring up as it catches. The Wither Bones given
 * to it are drawn as the bull's own bones (the `soul_bull` model in its `revive` clip's opening heap), gathering round the
 * skull piece by piece until the heap is whole. The item is the same 3D skull everywhere.
 */
public class SoulBullSkullRenderer implements BlockEntityRenderer<SoulBullSkullBlockEntity> {
    /** The skull model is ~28 px across the horns: half size sits on one block. */
    private static final float SCALE = 0.5f;
    /** The heap gathers in this order (each stage: the parts under these bones); the head is the skull itself. */
    private static final String[][] STAGES = {
            {"leg_bl"}, {"leg_fr"}, {"pelvis"}, {"leg_br"}, {"body", "spine_0", "spine_1", "spine_2", "spine_3", "spine_4", "spine_5",
            "spine_6", "spine_7", "spine_8", "vert_0", "vert_1", "vert_2", "vert_3", "vert_4"}, {"leg_fl"},
            {"ribs", "rib_0l", "rib_0r", "rib_1l", "rib_1r", "sternum"}, {"tail"}, {"rib_2l", "rib_2r", "rib_3l", "rib_3r"},
            {"scapula_l", "scapula_r"}, {"rib_4l", "rib_4r", "rib_5l", "rib_5r"}, {"neck"}};
    /** Never part of the heap: the head (the skull is the head), the fire, saddle, armour and plates. */
    private static final Set<String> HIDDEN = Set.of("head", "soul_fire", "saddle", "armor_chest", "armor_flank_l", "armor_flank_r",
            "armor_rump", "armor_neck", "plate_chest", "plate_rump", "plate_flank_l", "plate_chain_l", "plate_flank_r", "plate_chain_r",
            "plate_hip_l", "plate_hip_r", "plate_neck", "plate_neck_1");

    private static WWModel<Entity> skull, heap;
    /** Heap part name -> its stage (-1: never drawn). */
    private static Map<String, Integer> stageOf;

    public SoulBullSkullRenderer(BlockEntityRendererProvider.Context ctx) {
        skull = new WWModel<>(ctx.bakeLayer(SoulBullClient.SKULL_LAYER), "soul_bull_skull");
        heap = new WWModel<>(ctx.bakeLayer(SoulBullClient.BULL_LAYER), "soul_bull");
        stageOf = null;
    }

    static WWModel<Entity> skull() {
        if (skull == null) {
            skull = new WWModel<>(Minecraft.getInstance().getEntityModels().bakeLayer(SoulBullClient.SKULL_LAYER), "soul_bull_skull");
        }
        return skull;
    }

    private static Map<String, Integer> stages() {
        if (stageOf == null) {
            Map<String, Integer> direct = new HashMap<>();
            for (int i = 0; i < STAGES.length; i++) {
                for (String n : STAGES[i]) {
                    direct.put(n, i);
                }
            }
            Map<String, String> parent = new HashMap<>();
            Map<String, Integer> out = new HashMap<>();
            try {
                for (JsonElement el : LowpixGeometry.read(Winterworks.MOD_ID, "soul_bull").getAsJsonArray("parts")) {
                    JsonObject p = el.getAsJsonObject();
                    parent.put(p.get("name").getAsString(), p.get("parent").isJsonNull() ? null : p.get("parent").getAsString());
                }
            } catch (RuntimeException e) {
                parent.clear();
            }
            for (String name : parent.keySet()) {
                int stage = -1;
                for (String n = name; n != null; n = parent.get(n)) {   // the nearest staged (or hidden) bone up the chain decides
                    if (HIDDEN.contains(n)) {
                        break;
                    }
                    if (direct.containsKey(n)) {
                        stage = direct.get(n);
                        break;
                    }
                }
                out.put(name, stage);
            }
            stageOf = out;
        }
        return stageOf;
    }

    @Override
    public void render(SoulBullSkullBlockEntity be, float partial, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
        var state = be.getBlockState();
        float yRot = state.hasProperty(SoulBullSkullBlock.FACING) ? -state.getValue(SoulBullSkullBlock.FACING).toYRot() : 0f;
        boolean lit = state.hasProperty(SoulBullSkullBlock.LIT) && state.getValue(SoulBullSkullBlock.LIT);
        float time = (be.getLevel() == null ? 0 : be.getLevel().getGameTime()) + partial;
        if (be.bones() > 0 && be.needed() > 0) {
            drawHeap(pose, buffers, light, overlay, yRot, be.progress(), be.sinceBone + partial);
        }
        draw(pose, buffers, light, overlay, yRot, lit ? be.litTicks + partial : -1f, time);
    }

    /** The bull's bones heaped round the skull, as far as `progress` (0..1) has gathered them. */
    private static void drawHeap(PoseStack pose, MultiBufferSource buffers, int light, int overlay, float yRot, float progress, float sinceBone) {
        if (heap == null) {
            return;
        }
        Map<String, Integer> st = stages();
        int shown = Mth.clamp(Mth.ceil(progress * STAGES.length), 1, STAGES.length);
        heap.reset();
        heap.clip("revive", 0f);   // the opening heap: everything lying in a pile on the ground
        heap.mask(n -> {
            Integer s = st.get(n);
            return s != null && s >= 0 && s < shown;
        });
        pose.pushPose();
        pose.translate(0.5, 0, 0.5);
        pose.mulPose(Axis.YP.rotationDegrees(yRot + 180f));
        if (sinceBone < 6f) {   // the heap shudders as a bone lands
            float k = (1f - sinceBone / 6f) * 0.03f;
            pose.translate(Mth.sin(sinceBone * 3.1f) * k, 0, Mth.cos(sinceBone * 2.7f) * k);
        }
        pose.scale(-1f, -1f, 1f);
        pose.translate(0, -1.501, 0);
        heap.renderToBuffer(pose, buffers.getBuffer(RenderType.entityCutoutNoCull(heap.texture)), light, overlay, 0xFFFFFFFF);
        heap.unmask();
        pose.popPose();
    }

    /** The skull; `lit` is -1 when unlit, else the ticks since its eye sockets caught. */
    static void draw(PoseStack pose, MultiBufferSource buffers, int light, int overlay, float yRot, float lit, float time) {
        WWModel<Entity> m = skull();
        m.reset();
        m.clip("idle", (time / 20f) % 2.0f);
        boolean burning = lit >= 0f;
        m.show("eye_fire", burning);
        if (burning) {   // the flames catch: a flare, then a steady flicker
            float catchUp = Mth.clamp(lit / 8f, 0f, 1f);
            float flare = lit < 20f ? 1f + 0.35f * Mth.sin(Mth.clamp(lit / 20f, 0f, 1f) * Mth.PI) : 1f;
            float s = 1.3f * catchUp * flare * (1f + 0.06f * Mth.sin(time * 0.7f));   // a touch larger than the socket: it reads at block scale
            m.get("eye_fire").ifPresent(p -> {
                p.xScale *= s;
                p.yScale *= s;
                p.zScale *= s;
            });
        }
        pose.pushPose();
        pose.translate(0.5, 0, 0.5);
        pose.mulPose(Axis.YP.rotationDegrees(yRot + 180f));
        pose.scale(SCALE, SCALE, SCALE);
        pose.translate(0, 1.5, 0);
        pose.scale(-1f, -1f, 1f);
        m.renderToBuffer(pose, buffers.getBuffer(RenderType.entityCutoutNoCull(m.texture)), light, overlay, 0xFFFFFFFF);
        if (burning && m.hasGlow) {
            float pulse = 0.8f + 0.2f * Mth.sin(time * 0.3f);
            int c = (int) (Mth.clamp(pulse, 0f, 1f) * 255);
            m.renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(m.glowTexture)), 0xF000F0, OverlayTexture.NO_OVERLAY,
                    0xFF000000 | (c << 16) | (c << 8) | c);
        }
        m.show("eye_fire", true);
        pose.popPose();
    }

    @Override
    public boolean shouldRenderOffScreen(SoulBullSkullBlockEntity be) {
        return be.bones() > 0;   // the heap reaches past the block
    }

    /** The skull as an item: the 3D skull everywhere, inventory slots included (the GUI pose is in its item model). */
    public static class Item implements BuiltinItemRendererRegistry.DynamicItemRenderer {
        @Override
        public void render(ItemStack stack, ItemDisplayContext mode, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
            Minecraft mc = Minecraft.getInstance();
            float time = mc.level == null ? 0 : mc.level.getGameTime() + mc.getTimer().getGameTimeDeltaPartialTick(false);
            draw(pose, buffers, light, overlay, 0f, -1f, time);
        }
    }
}
