package dev.lowpix.winterworks.client.endgear;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.endgear.EndGlider;
import dev.lowpix.winterworks.registry.EndItems;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.HumanoidArm;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import org.jetbrains.annotations.Nullable;
import org.joml.Vector3f;

/**
 * The End Glider, the lowpix model {@code end_glider} (bones frame, handle, wing_l/r, jet_l/r, jet_flame_l/r; clips
 * flap and boost), in 3D everywhere, the GUI included.
 * <ul>
 * <li>Gliding with it (endgear.EndGlider): held overhead in both hands, the arms raised (poseArms), the wings flapping
 * and the jets flaring while boosting; in first person it hangs above the view.
 * <li>Otherwise: carried by its handle in one hand, in a three-quarter view in slots, upright on the ground and in
 * item frames.
 * </ul>
 * The item model's display transforms are identity: everything is placed here.
 */
public class EndGliderRenderer implements BuiltinItemRendererRegistry.DynamicItemRenderer {
    /** Wingspan in blocks: overhead in flight, carried in a hand, in first person. */
    private static final float SPAN_OVERHEAD = 1.9f, SPAN_CARRIED = 1.05f, SPAN_FIRST_PERSON = 1.35f;
    @Nullable private static GearModel model;

    static GearModel model() {
        if (model == null) {
            model = new GearModel(GearLayers.END_GLIDER, "end_glider", GearModel.vanilla("textures/block/purpur_block.png"));
        }
        return model;
    }

    private static float now() {
        Minecraft mc = Minecraft.getInstance();
        return (mc.level == null ? 0 : mc.level.getGameTime()) + mc.getTimer().getGameTimeDeltaPartialTick(false);
    }

    /** The handle (what the hands hold), lowpix space. */
    private static Vector3f grip(GearModel m) {
        Vector3f h = m.centerOf(n -> n.startsWith("handle"));
        return h != null ? h : new Vector3f(m.center().x, m.min.y, m.center().z);
    }

    private static float span(GearModel m) {
        Vector3f s = m.size();
        return Math.max(1e-3f, Math.max(s.x, s.z * 0.8f));
    }

    /** Flap (or boost) for a glider in use; still otherwise. */
    private static void animate(GearModel m, boolean flying, boolean boosting, float t) {
        m.model.reset();
        if (flying) {
            m.loop(boosting ? "boost" : "flap", t / 20f);
        }
    }

    // ------------------------------------------------------------------------------------------------ item renderer

    @Override
    public void render(ItemStack stack, ItemDisplayContext mode, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
        GearModel m = model();
        Minecraft mc = Minecraft.getInstance();
        LocalPlayer player = mc.player;
        float t = now();
        Vector3f c = m.center(), grip = grip(m), size = m.size();
        int tint = m.standIn ? 0xFFB08CD8 : 0xFFFFFFFF;
        pose.pushPose();
        pose.translate(0.5f, 0.5f, 0.5f);   // undo the item renderer's corner offset: the origin is the item's centre
        switch (mode) {
            case GUI -> {   // three-quarter view, filling the slot
                float s = 0.98f / Math.max(size.x, Math.max(size.y, size.z) * 1.15f);
                pose.mulPose(Axis.XP.rotationDegrees(48f));
                pose.mulPose(Axis.YP.rotationDegrees(-28f));
                pose.scale(s, s, s);
                pose.translate(-c.x, -c.y, -c.z);
                animate(m, false, false, t);
            }
            case GROUND, FIXED -> {
                float s = (mode == ItemDisplayContext.GROUND ? 0.55f : 0.9f) / Math.max(size.x, size.y);
                if (mode == ItemDisplayContext.FIXED) {
                    pose.mulPose(Axis.YP.rotationDegrees(180f));
                }
                pose.scale(s, s, s);
                pose.translate(-c.x, -c.y, -c.z);
                animate(m, false, false, t);
            }
            case FIRST_PERSON_RIGHT_HAND, FIRST_PERSON_LEFT_HAND -> {
                // back to view space: undo the arm offset ItemInHandRenderer applied (side * 0.56, -0.52, -0.72)
                float side = mode == ItemDisplayContext.FIRST_PERSON_RIGHT_HAND ? 1f : -1f;
                pose.translate(-side * 0.56f, 0.52f, 0.72f);
                boolean flying = player != null && EndGlider.active(player) && heldHere(player, stack);
                boolean boosting = flying && EndGlider.boosting(player);
                if (flying) {   // overhead, seen from below and behind: wings out, front away from the camera
                    float s = SPAN_FIRST_PERSON / span(m);
                    float bob = Mth.sin(t * 0.25f) * 0.015f;
                    pose.translate(0f, 0.32f + bob, -1.15f);
                    pose.mulPose(Axis.YP.rotationDegrees(180f));
                    pose.mulPose(Axis.XP.rotationDegrees(-12f));
                    pose.scale(s, s, s);
                    pose.translate(-grip.x, -grip.y, -grip.z);
                } else {        // carried low at the side by its handle
                    float s = SPAN_CARRIED * 0.62f / span(m);
                    pose.translate(side * 0.5f, -0.52f, -0.95f);
                    pose.mulPose(Axis.YP.rotationDegrees(180f + side * 25f));
                    pose.mulPose(Axis.XP.rotationDegrees(-8f));
                    pose.scale(s, s, s);
                    pose.translate(-grip.x, -grip.y, -grip.z);
                }
                animate(m, flying, boosting, t);
            }
            case THIRD_PERSON_RIGHT_HAND, THIRD_PERSON_LEFT_HAND -> {
                // back to the arm's frame (ItemInHandLayer: translateToHand, rotX -90, rotY 180, offset), then to the hand
                boolean left = mode == ItemDisplayContext.THIRD_PERSON_LEFT_HAND;
                pose.translate(left ? 1f / 16f : -1f / 16f, -0.125f, 0.625f);
                pose.mulPose(Axis.YP.rotationDegrees(-180f));
                pose.mulPose(Axis.XP.rotationDegrees(90f));
                pose.translate(left ? 1f / 16f : -1f / 16f, 10f / 16f, -1f / 16f);
                // lowpix up -> up the arm (-Y), front -> forward (-Z)
                float s = SPAN_CARRIED / span(m);
                pose.mulPose(Axis.XP.rotationDegrees(180f));
                pose.scale(s, s, s);
                pose.translate(-grip.x, -grip.y, -grip.z);
                animate(m, false, false, t);
            }
            default -> {
                float s = 1f / Math.max(size.x, size.y);
                pose.scale(s, s, s);
                pose.translate(-c.x, -c.y, -c.z);
                animate(m, false, false, t);
            }
        }
        m.draw(pose, buffers, light, overlay, stack.hasFoil(), tint);
        pose.popPose();
    }

    private static boolean heldHere(Player p, ItemStack stack) {
        InteractionHand hand = EndGlider.hand(p);
        return hand != null && p.getItemInHand(hand) == stack;
    }

    // ------------------------------------------------------------------------------------------------ overhead in flight

    /** Gliding with the glider: both arms raised overhead, a little apart. */
    public static void poseArms(HumanoidModel<?> model, LivingEntity entity, float age) {
        if (!(entity instanceof Player p) || !EndGlider.active(p)) {
            return;
        }
        boolean boost = EndGlider.boosting(p);
        float sway = Mth.sin(age * (boost ? 0.9f : 0.35f)) * (boost ? 0.03f : 0.05f);
        model.rightArm.xRot = (float) -Math.PI + 0.12f + sway;
        model.leftArm.xRot = (float) -Math.PI + 0.12f - sway;
        model.rightArm.yRot = 0f;
        model.leftArm.yRot = 0f;
        model.rightArm.zRot = 0.16f;
        model.leftArm.zRot = -0.16f;
    }

    /**
     * Called for each hand's item in ItemInHandLayer: while gliding, the glider is drawn once, overhead between the
     * raised hands, and not in the hand. True if it took over this hand's item.
     */
    public static boolean renderOverhead(LivingEntity entity, ItemStack stack, EntityModel<?> parent, PoseStack pose,
                                         MultiBufferSource buffers, int light) {
        if (!stack.is(EndItems.END_GLIDER) || !(entity instanceof Player p) || !EndGlider.active(p)
                || !(parent instanceof HumanoidModel<?> hm)) {
            return false;
        }
        if (p.getItemInHand(EndGlider.hand(p)) != stack) {
            return true;   // a second glider in the other hand: just the one overhead
        }
        GearModel m = model();
        float t = now();
        // the hands, in the model's root frame (pixels / 16): the end of each raised arm
        Vector3f right = hand(hm, HumanoidArm.RIGHT), left = hand(hm, HumanoidArm.LEFT);
        Vector3f mid = right.add(left).mul(0.5f);
        Vector3f grip = grip(m);
        float s = SPAN_OVERHEAD / span(m);
        pose.pushPose();
        pose.translate(mid.x, mid.y, mid.z);
        // lowpix front (+Z) -> toward the head, the flight direction (-Y); lowpix up (+Y) -> the back (+Z), up in flight
        pose.mulPose(Axis.XP.rotationDegrees(90f));
        pose.scale(s, s, s);
        pose.translate(-grip.x, -grip.y, -grip.z);
        animate(m, true, EndGlider.boosting(p), t + p.getId() * 7);
        m.draw(pose, buffers, light, OverlayTexture.NO_OVERLAY, stack.hasFoil(), m.standIn ? 0xFFB08CD8 : 0xFFFFFFFF);
        pose.popPose();
        return true;
    }

    /** Where a hand is in the model's root frame (blocks): the tip of the arm, through its current pose. */
    private static Vector3f hand(HumanoidModel<?> hm, HumanoidArm arm) {
        PoseStack ps = new PoseStack();
        (arm == HumanoidArm.RIGHT ? hm.rightArm : hm.leftArm).translateAndRotate(ps);
        org.joml.Vector4f v = ps.last().pose().transform(new org.joml.Vector4f(arm == HumanoidArm.RIGHT ? -1f / 16f : 1f / 16f,
                10f / 16f, 0f, 1f));
        return new Vector3f(v.x(), v.y(), v.z());
    }
}
