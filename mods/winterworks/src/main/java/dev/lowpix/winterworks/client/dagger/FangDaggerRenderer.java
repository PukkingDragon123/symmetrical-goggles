package dev.lowpix.winterworks.client.dagger;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.render.WWModel;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.ItemRenderer;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.client.resources.model.BakedModel;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.HumanoidArm;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import org.jetbrains.annotations.Nullable;
import org.joml.Matrix3f;
import org.joml.Quaternionf;
import org.joml.Vector3f;
import org.joml.Vector4f;

/**
 * The Fang Dagger: the lowpix model {@code fang_dagger} (bone {@code dagger}) in hand, on the ground and in item
 * frames; the 2D icon {@code item/fang_dagger} in the GUI.
 *
 * <p>The model is fitted to the vanilla handheld layout, so the item model's display transforms (vanilla
 * {@code item/handheld}'s) hold it like a sword in either hand: its long axis is laid along the sprite diagonal with
 * the blade up and to the right, the grip centred where a sword's handle is, and it is scaled to 17 px long. The grip
 * is found from parts named grip/handle/hilt (else pommel, else the lower end of the model); the blade's curve stays
 * in the sprite plane. In first person each frenzy strike flicks the striking dagger, and while the frenzy is ready
 * a faint frost shimmer plays over both daggers (brighter for a moment when they recharge). If the model is missing,
 * the flat icon is held instead.
 */
public class FangDaggerRenderer implements BuiltinItemRendererRegistry.DynamicItemRenderer {
    public static final ResourceLocation ICON_MODEL = Winterworks.id("item/fang_dagger_icon");
    /** Where the grip sits in item space (a vanilla sword's handle). */
    private static final Vector3f GRIP_AT = new Vector3f(3f / 16f, 3f / 16f, 8f / 16f);
    private static final float LENGTH = 17f / 16f;
    private static final Pattern GRIP = Pattern.compile(".*(grip|handle|hilt|wrap).*");
    private static final Pattern POMMEL = Pattern.compile(".*pommel.*");

    private WWModel<Entity> model;
    @Nullable private Fit fit;

    /** How the model is laid into item space: rotation (lowpix space -> blade up), grip point (lowpix blocks), scale. */
    record Fit(Quaternionf orient, Vector3f grip, float scale) {}

    private WWModel<Entity> model() {
        if (model == null) {
            model = new WWModel<>(Minecraft.getInstance().getEntityModels().bakeLayer(DaggerClient.FANG_DAGGER), "fang_dagger");
            fit = fit(model);
        }
        return model;
    }

    @Override
    public void render(ItemStack stack, ItemDisplayContext mode, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
        Minecraft mc = Minecraft.getInstance();
        if (mode == ItemDisplayContext.GUI) {
            icon(mc, stack, mode, pose, buffers, light, overlay);
            return;
        }
        WWModel<Entity> m = model();
        if (mode.firstPerson()) {   // in first person, the crisp pixel-art dagger held like a vanilla blade
            icon(mc, stack, mode, pose, buffers, light, overlay);
            return;
        }
        if (fit == null) {   // no 3D model: hold the flat icon like a sword
            icon(mc, stack, ItemDisplayContext.NONE, pose, buffers, light, overlay);
            return;
        }
        float partial = mc.getTimer().getGameTimeDeltaPartialTick(false);
        float now = (mc.level == null ? 0 : mc.level.getGameTime()) + partial;
        LocalPlayer player = mc.player;
        boolean firstPerson = mode.firstPerson() && player != null;
        InteractionHand hand = hand(mode, player);
        float kick = 0f;
        if (firstPerson) {   // a quick flick of the dagger that just struck
            float since = DaggerClient.sinceStrike(hand, now);
            if (since >= 0f && since < 4f) {
                kick = (1f - since / 4f) * (1f - since / 4f);
            }
        }

        pose.pushPose();
        pose.translate(GRIP_AT.x, GRIP_AT.y, GRIP_AT.z);
        pose.mulPose(Axis.ZP.rotationDegrees(-45f - kick * 28f));
        pose.scale(fit.scale, fit.scale, fit.scale);
        pose.mulPose(fit.orient);
        pose.translate(-fit.grip.x, -fit.grip.y, -fit.grip.z);
        pose.translate(0f, 1.5f, 0f);   // Minecraft model space (Y down, ground at 24 px) -> lowpix space
        pose.scale(1f, -1f, -1f);
        m.reset();
        RenderType base = RenderType.entityCutoutNoCull(m.texture);
        m.renderToBuffer(pose, ItemRenderer.getFoilBufferDirect(buffers, base, false, stack.hasFoil()), light, overlay, 0xFFFFFFFF);
        if (m.hasGlow) {
            m.renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(m.glowTexture)), 0xF000F0, OverlayTexture.NO_OVERLAY, 0xFFFFFFFF);
        }
        if (firstPerson && DaggerClient.frenzyReady(player)) {   // frost shimmer: the frenzy is ready
            float sinceReady = DaggerClient.sinceReady(now);
            float flash = sinceReady >= 0f && sinceReady < 14f ? 1f - sinceReady / 14f : 0f;
            float pulse = 0.14f + 0.07f * Mth.sin(now * 0.2f + (hand == InteractionHand.OFF_HAND ? 1.9f : 0f)) + 0.55f * flash + 0.2f * kick;
            int r = (int) (255 * Mth.clamp(pulse * 0.35f, 0f, 1f));
            int g = (int) (255 * Mth.clamp(pulse * 0.75f, 0f, 1f));
            int b = (int) (255 * Mth.clamp(pulse, 0f, 1f));
            m.renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(m.texture)), 0xF000F0, OverlayTexture.NO_OVERLAY,
                    0xFF000000 | (r << 16) | (g << 8) | b);
        }
        pose.popPose();
    }

    private static void icon(Minecraft mc, ItemStack stack, ItemDisplayContext mode, PoseStack pose, MultiBufferSource buffers,
                             int light, int overlay) {
        BakedModel icon = mc.getModelManager().getModel(ICON_MODEL);
        pose.pushPose();
        pose.translate(0.5f, 0.5f, 0.5f);
        mc.getItemRenderer().render(stack, mode, false, pose, buffers, light, overlay, icon);
        pose.popPose();
    }

    /** Which hand a display context is for (the off hand is the left one for right-handed players). */
    private static InteractionHand hand(ItemDisplayContext mode, @Nullable LocalPlayer player) {
        boolean left = mode == ItemDisplayContext.FIRST_PERSON_LEFT_HAND || mode == ItemDisplayContext.THIRD_PERSON_LEFT_HAND;
        HumanoidArm arm = left ? HumanoidArm.LEFT : HumanoidArm.RIGHT;
        return player == null || arm == player.getMainArm() ? InteractionHand.MAIN_HAND : InteractionHand.OFF_HAND;
    }

    // ------------------------------------------------------------------------------------------------ fitting

    /** Measures the model (in lowpix space, blocks) and works out how to hold it; null if it has no geometry. */
    @Nullable
    static Fit fit(WWModel<?> m) {
        List<float[]> pts = new ArrayList<>();
        List<String> names = new ArrayList<>();
        m.reset();
        m.root().visit(new PoseStack(), (p, path, index, cube) -> {
            String name = path.substring(path.lastIndexOf('/') + 1);
            for (int c = 0; c < 8; c++) {
                float x = ((c & 1) == 0 ? cube.minX : cube.maxX) / 16f;
                float y = ((c & 2) == 0 ? cube.minY : cube.maxY) / 16f;
                float z = ((c & 4) == 0 ? cube.minZ : cube.maxZ) / 16f;
                Vector4f v = p.pose().transform(new Vector4f(x, y, z, 1f));
                pts.add(new float[]{v.x(), 1.5f - v.y(), -v.z()});
                names.add(name);
            }
        });
        if (pts.isEmpty()) {
            return null;
        }
        float[][] box = bounds(pts, names, null);
        float[] min = box[0], max = box[1];
        float[] ext = {max[0] - min[0], max[1] - min[1], max[2] - min[2]};
        int along = ext[1] >= ext[0] * 0.9f && ext[1] >= ext[2] * 0.9f ? 1 : ext[2] >= ext[0] ? 2 : 0;   // prefer upright
        int a1 = (along + 1) % 3, a2 = (along + 2) % 3;
        float len = Math.max(ext[along], 1e-3f);
        float mid = (min[along] + max[along]) * 0.5f;

        float[][] grip = bounds(pts, names, GRIP);
        float[][] ref = grip != null ? grip : bounds(pts, names, POMMEL);
        float refAt = ref == null ? Float.NaN : (ref[0][along] + ref[1][along]) * 0.5f;
        int dir = !Float.isNaN(refAt) && refAt > mid + 0.1f * len ? -1 : 1;   // +1: the handle is the low end
        // the blade's curve (measured on the outer 35%, well past the guard) goes in the sprite plane
        float end = dir > 0 ? min[along] : max[along];
        List<float[]> blade = new ArrayList<>();
        for (float[] q : pts) {
            if ((q[along] - end) * dir > 0.65f * len) {
                blade.add(q);
            }
        }
        float[][] bb = bounds(blade.isEmpty() ? pts : blade, null, null);
        int across = bb[1][a1] - bb[0][a1] >= bb[1][a2] - bb[0][a2] ? a1 : a2;
        float[] g = new float[3];
        if (grip != null) {
            for (int i = 0; i < 3; i++) {
                g[i] = (grip[0][i] + grip[1][i]) * 0.5f;
            }
        } else {   // the middle of the handle quarter, 18% in from the end
            float lo = dir > 0 ? end : end - 0.25f * len, hi = dir > 0 ? end + 0.25f * len : end;
            List<float[]> handle = new ArrayList<>();
            for (float[] q : pts) {
                if (q[along] >= lo - 1e-4f && q[along] <= hi + 1e-4f) {
                    handle.add(q);
                }
            }
            float[][] hb = bounds(handle.isEmpty() ? pts : handle, null, null);
            for (int i = 0; i < 3; i++) {
                g[i] = (hb[0][i] + hb[1][i]) * 0.5f;
            }
            g[along] = end + dir * 0.18f * len;
        }
        Vector3f eY = axis(along).mul(dir), eX = axis(across), eZ = new Vector3f(eX).cross(eY);
        Matrix3f rot = new Matrix3f().setRow(0, eX).setRow(1, eY).setRow(2, eZ);
        return new Fit(new Quaternionf().setFromNormalized(rot), new Vector3f(g[0], g[1], g[2]), LENGTH / len);
    }

    private static Vector3f axis(int i) {
        return new Vector3f(i == 0 ? 1 : 0, i == 1 ? 1 : 0, i == 2 ? 1 : 0);
    }

    /** Bounds {min, max} of the points (of parts whose name matches, if given); null if none. */
    @Nullable
    private static float[][] bounds(List<float[]> pts, @Nullable List<String> names, @Nullable Pattern only) {
        float[] min = {Float.MAX_VALUE, Float.MAX_VALUE, Float.MAX_VALUE};
        float[] max = {-Float.MAX_VALUE, -Float.MAX_VALUE, -Float.MAX_VALUE};
        boolean any = false;
        for (int k = 0; k < pts.size(); k++) {
            if (only != null && (names == null || !only.matcher(names.get(k)).matches())) {
                continue;
            }
            any = true;
            for (int i = 0; i < 3; i++) {
                min[i] = Math.min(min[i], pts.get(k)[i]);
                max[i] = Math.max(max[i], pts.get(k)[i]);
            }
        }
        return any ? new float[][]{min, max} : null;
    }
}
