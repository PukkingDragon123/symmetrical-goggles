package dev.lowpix.winterworks.client.cold;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.icebreaker.RamHandler;
import java.util.Map;
import java.util.WeakHashMap;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;

/**
 * Potion of Ramming at top speed, on the client (docs/FIXES_0_4.md): speed lines streaming in from the edges of the
 * screen, fading with your speed; a running pose for every player at top speed (leaning forward, arms swept back:
 * mixin.client.RamPoseMixin); and in first person the hands drop back out of the way (mixin.client.RamHandMixin).
 * Who is at top speed comes from the synced attribute modifier ({@link RamHandler#atTopSpeed}).
 */
public final class RamClient {
    /** Per player: how far into the ramming pose (0..1), last tick and this tick. */
    private static final Map<Player, float[]> LEAN = new WeakHashMap<>();
    private static float lines, linesO;

    private RamClient() {}

    public static void init() {
        ClientTickEvents.END_CLIENT_TICK.register(RamClient::tick);
        HudRenderCallback.EVENT.register((g, tracker) -> speedLines(g, tracker.getGameTimeDeltaPartialTick(false)));
    }

    private static void tick(Minecraft mc) {
        if (mc.level == null || mc.isPaused()) {
            return;
        }
        for (Player p : mc.level.players()) {
            boolean on = RamHandler.atTopSpeed(p) && !p.isPassenger() && !p.isSwimming() && !p.isFallFlying();
            float[] k = LEAN.computeIfAbsent(p, x -> new float[2]);
            k[0] = k[1];
            k[1] = Mth.clamp(k[1] + (on ? 0.2f : -0.12f), 0f, 1f);
        }
        LocalPlayer me = mc.player;
        linesO = lines;
        float want = 0f;
        if (me != null && RamHandler.atTopSpeed(me)) {   // the faster you go, the stronger the streaks
            float speed = (float) me.getDeltaMovement().horizontalDistance();
            want = Mth.clamp((speed - 0.12f) / 0.22f, 0f, 1f);
        }
        lines += (want - lines) * (want > lines ? 0.35f : 0.15f);
    }

    /** 0..1 how far into the ramming pose this player is. */
    public static float lean(LivingEntity e, float partial) {
        if (!(e instanceof Player p)) {
            return 0f;
        }
        float[] k = LEAN.get(p);
        if (k == null) {
            return 0f;
        }
        float t = Mth.lerp(partial, k[0], k[1]);
        return t * t * (3f - 2f * t);
    }

    /**
     * The running pose, laid over the model's own (HumanoidModel#setupAnim's tail): the torso leans forward like a
     * charge, the head stays up looking ahead, the arms sweep straight back, the legs keep running under the hips.
     */
    public static void pose(HumanoidModel<?> m, LivingEntity e, float limbSwing, float k) {
        float swing = Mth.sin(limbSwing * 0.6662f) * 0.25f;
        m.body.xRot += 0.55f * k;
        m.body.y += 3.0f * k;
        m.head.y += 3.6f * k;
        m.head.xRot -= 0.35f * k;   // chin up: still looking where it's going
        m.rightArm.y += 3.0f * k;
        m.leftArm.y += 3.0f * k;
        m.rightArm.z += 1.5f * k;
        m.leftArm.z += 1.5f * k;
        m.rightArm.xRot = Mth.lerp(k, m.rightArm.xRot, 1.25f + swing);
        m.leftArm.xRot = Mth.lerp(k, m.leftArm.xRot, 1.25f - swing);
        m.rightArm.yRot = Mth.lerp(k, m.rightArm.yRot, 0f);
        m.leftArm.yRot = Mth.lerp(k, m.leftArm.yRot, 0f);
        m.rightArm.zRot = Mth.lerp(k, m.rightArm.zRot, 0.22f);
        m.leftArm.zRot = Mth.lerp(k, m.leftArm.zRot, -0.22f);
        m.rightLeg.z += 3.6f * k;
        m.leftLeg.z += 3.6f * k;
        m.rightLeg.y += 0.4f * k;
        m.leftLeg.y += 0.4f * k;
        m.hat.copyFrom(m.head);
    }

    /** First person: the hands drop down and back, swept out of the way. */
    public static void firstPerson(PoseStack pose, float partial) {
        Minecraft mc = Minecraft.getInstance();
        float k = mc.player == null ? 0f : lean(mc.player, partial);
        if (k <= 0f) {
            return;
        }
        pose.translate(0f, -0.32f * k, 0.22f * k);
        pose.mulPose(Axis.XP.rotationDegrees(-22f * k));
    }

    /** Speed lines: thin white streaks rushing in from the edges toward the middle, thicker and brighter with speed. */
    private static void speedLines(GuiGraphics g, float partial) {
        Minecraft mc = Minecraft.getInstance();
        float a = Mth.lerp(partial, linesO, lines);
        if (a <= 0.01f || mc.player == null || mc.level == null || mc.options.hideGui) {
            return;
        }
        float scale = mc.options.screenEffectScale().get().floatValue();
        a *= 0.35f + 0.65f * scale;
        int w = g.guiWidth(), h = g.guiHeight();
        float cx = w / 2f, cy = h / 2f, reach = (float) Math.sqrt(cx * cx + cy * cy);
        long frame = (long) ((mc.level.getGameTime() + partial) * 1.5f);   // the streaks re-roll fast, so they rush
        RandomSource r = RandomSource.create(frame * 341873128712L);
        int n = 22 + (int) (26 * a);
        PoseStack pose = g.pose();
        for (int i = 0; i < n; i++) {
            float angle = r.nextFloat() * 360f;
            float start = reach * (0.5f + r.nextFloat() * 0.3f);
            float len = reach * (0.18f + r.nextFloat() * 0.35f) * (0.6f + 0.4f * a);
            float thick = 0.5f + r.nextFloat() * (0.8f + a);
            int alpha = (int) (255 * a * (0.25f + 0.45f * r.nextFloat()));
            pose.pushPose();
            pose.translate(cx, cy, 0f);
            pose.mulPose(Axis.ZP.rotationDegrees(angle));
            g.fill(Math.round(start), Math.round(-thick), Math.round(start + len), Math.max(Math.round(thick), 1),
                    (alpha << 24) | 0xF4F8FF);
            pose.popPose();
        }
    }
}
