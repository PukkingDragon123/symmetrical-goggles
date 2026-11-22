package dev.lowpix.winterworks.client.oceangear;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.lowpix.LowpixEntityModel;
import dev.lowpix.winterworks.oceangear.ElderBoss;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.monster.ElderGuardian;

/**
 * The Elder Guardian boss's model (lowpix {@code elder_guardian}, drawn at scale 1.0): {@code idle} / {@code swim} loops,
 * the attack clips started by the synced attack ({@code bubble}, {@code stare} holding its last frame through the beam,
 * {@code tail_whip}), a procedural roar for the summons, {@code death} over its last 2 s; the whole body turns to look,
 * the pupil card glances and contracts while it stares, the brow blinks, and the 12 spikes slide out along their own
 * directions (docs/OCEAN_UPDATE.md section 12) as it attacks and once it is enraged.
 */
public class ElderGuardianBossModel extends LowpixEntityModel<ElderGuardian> {
    /** Outward directions of spike_0..11 in model space. */
    private static final float[][] SPIKE_DIRS = {{-.41f, -.91f, -.09f}, {-.2f, -.98f, 0}, {0, -1, -.05f}, {.2f, -.98f, 0},
            {.41f, -.91f, -.09f}, {.93f, -.33f, .19f}, {.92f, .28f, .28f}, {-.93f, -.33f, .19f}, {-.92f, .28f, .28f},
            {-.36f, .89f, .27f}, {.36f, .89f, .27f}, {0, -.57f, .82f}};
    final ModelPart body, eye, pupil, laser, brow, jaw;
    private final ModelPart[] spikes = new ModelPart[12];
    /** Smoothed spike extension (px), per boss would be nicer; one model draws many bosses, so it is eased per entity id. */
    private final it.unimi.dsi.fastutil.ints.Int2FloatOpenHashMap ext = new it.unimi.dsi.fastutil.ints.Int2FloatOpenHashMap();
    private final it.unimi.dsi.fastutil.ints.Int2FloatOpenHashMap lastAge = new it.unimi.dsi.fastutil.ints.Int2FloatOpenHashMap();

    public ElderGuardianBossModel(ModelPart root) {
        super(root, Winterworks.MOD_ID, "elder_guardian");
        body = part("body");
        eye = part("eye");
        pupil = part("pupil");
        laser = part("laser");
        brow = part("brow");
        jaw = part("jaw");
        for (int i = 0; i < 12; i++) {
            spikes[i] = part("spike_" + i);
        }
    }

    @Override
    public void setupAnim(ElderGuardian e, float limbSwing, float limbAmount, float age, float netHeadYaw, float headPitch) {
        resetPose();
        ElderBoss.State s = ElderBoss.state(e);
        float partial = age - e.tickCount;
        if (e.deathTime > 0) {
            poseAt("death", Math.min(2f, (e.deathTime - 1 + partial) / 20f));
            return;
        }
        boolean moving = e.isMoving();
        s.idle.startIfStopped(e.tickCount);
        s.swim.startIfStopped(e.tickCount);
        play(moving ? s.swim : s.idle, moving ? "swim" : "idle", age, 1f);
        play(s.bubble, "bubble", age, 1f);
        play(s.stare, "stare", age, 1f);
        play(s.whip, "tail_whip", age, 1f);
        byte attack = ElderBoss.attack(e);
        // the whole fish turns to look (its eye is its head)
        body.yRot += netHeadYaw * Mth.DEG_TO_RAD;
        body.xRot += headPitch * Mth.DEG_TO_RAD;
        float target = ElderBoss.enraged(e) ? 1.5f : 0f;
        float stareT = s.stare.isStarted() ? s.stare.getAccumulatedTime() / 50f : 0f;
        switch (attack) {
            case ElderBoss.BUBBLE -> target = Math.max(target, 2f);
            case ElderBoss.STARE -> target = stareT < ElderBoss.STARE_TELEGRAPH ? 3f * stareT / ElderBoss.STARE_TELEGRAPH
                    : 3f + 0.4f * Mth.sin(age * 1.3f);
            case ElderBoss.TAIL_WHIP -> target = s.whip.getAccumulatedTime() < 400 ? 1f : 4f;
            case ElderBoss.ROAR -> target = 5f;
            default -> {
            }
        }
        float x = ext.getOrDefault(e.getId(), 0f), last = lastAge.getOrDefault(e.getId(), age);
        float dt = Mth.clamp(age - last, 0f, 5f);
        x += (target - x) * (1f - (float) Math.exp(-dt * (target > x ? 0.6f : 0.25f)));
        ext.put(e.getId(), x);
        lastAge.put(e.getId(), age);
        if (ext.size() > 64) {
            ext.clear();
            lastAge.clear();
        }
        for (int i = 0; i < 12; i++) {
            spikes[i].x += SPIKE_DIRS[i][0] * x;
            spikes[i].y += SPIKE_DIRS[i][1] * x;
            spikes[i].z += SPIKE_DIRS[i][2] * x;
        }
        // the pupil: a glance where it looks; tight while it stares
        pupil.x += Mth.clamp(-netHeadYaw / 40f, -1f, 1f) * 1.5f;   // the eye is 8 x 6 px, the pupil 2 x 2
        pupil.y += Mth.clamp(headPitch / 40f, -1f, 1f) * 1.0f;
        if (attack == ElderBoss.STARE) {
            float k = Math.min(1f, stareT / ElderBoss.STARE_TELEGRAPH);
            float sc = stareT < ElderBoss.STARE_TELEGRAPH ? 1f - 0.45f * k : 0.5f + 0.05f * Mth.sin(age * 2.1f);
            pupil.xScale *= sc;
            pupil.yScale *= sc;
        }
        // the roar: jaw wide, brow up, a shudder
        if (attack == ElderBoss.ROAR) {
            float t = (e.tickCount - s.roarStart + partial) / ElderBoss.ROAR_TICKS;
            float env = Mth.sin(Mth.clamp(t, 0f, 1f) * Mth.PI);
            jaw.xRot += 0.55f * env;
            brow.y -= 1.5f * env;
            body.zRot += Mth.sin(age * 2.6f) * 0.05f * env;
            body.y += Mth.sin(age * 3.1f) * 0.4f * env;
        }
        // a blink now and then (the brow slides down 7 px to shut), and a wince when hurt
        int cycle = (e.getId() * 37 + e.tickCount) % 110;
        if (cycle < 5 && attack != ElderBoss.STARE) {
            brow.y += 7f * Mth.sin((cycle + partial) / 5f * Mth.PI);
        }
        if (e.hurtTime > 0) {
            brow.y += 3f * (e.hurtTime - partial) / 10f;
        }
    }
}
