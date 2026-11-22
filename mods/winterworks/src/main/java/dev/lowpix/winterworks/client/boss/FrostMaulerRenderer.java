package dev.lowpix.winterworks.client.boss;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.boss.FrostMaulerEntity;
import dev.lowpix.winterworks.client.lowpix.LowpixGeometry;
import dev.lowpix.winterworks.client.render.WWModel;
import dev.lowpix.winterworks.registry.WWParticles;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;
import org.joml.Vector3f;

/**
 * Draws the Frost Mauler (lowpix model `frost_mauler`, texture textures/entity/frost_mauler.png) with its glowing
 * parts (eyes, their flame cards, frost core: the `_glow` texture, an emissive pass that pulses): dim while it sleeps in the ice,
 * flickering as the tomb cracks, blazing when enraged. Ice-blue soul flames rise off its eye flame cards, taken from the posed
 * eye bones each tick, and flare up when it is enraged. Clips per state: frozen, wake, idle, walk/run, roar, claw_l,
 * claw_r (at the combo's pace), fury, stunned (its recharge), death (ends on its flank: no vanilla death flip).
 */
public class FrostMaulerRenderer extends MobRenderer<FrostMaulerEntity, FrostMaulerRenderer.Model> {
    public FrostMaulerRenderer(EntityRendererProvider.Context ctx) {
        super(ctx, new Model(ctx.bakeLayer(BossClient.MAULER_LAYER)), 1.7f);
        addLayer(new Eyes(this));
    }

    @Override
    public ResourceLocation getTextureLocation(FrostMaulerEntity e) {
        return model.texture;
    }

    @Override
    public void render(FrostMaulerEntity e, float yaw, float partial, PoseStack pose, MultiBufferSource buffers, int light) {
        shadowRadius = e.isDormant() ? 0.6f : 1.7f;
        pose.pushPose();
        if (e.mode() == FrostMaulerEntity.MODE_AWAKENING) {   // it strains against the cracking ice
            float t = e.tickCount + partial;
            pose.translate(Mth.sin(t * 2.7f) * 0.03f, Mth.sin(t * 3.9f) * 0.015f, Mth.cos(t * 3.1f) * 0.03f);
        }
        super.render(e, yaw, partial, pose, buffers, light);
        pose.popPose();
    }

    /** Its death is the `death` clip (it ends lying on its flank), not the vanilla tip-over. */
    @Override
    protected float getFlipDegrees(FrostMaulerEntity e) {
        return 0f;
    }

    /** The glowing eyes and frost core (emissive, pulsing), and the flames that trail from the eyes. */
    static final class Eyes extends RenderLayer<FrostMaulerEntity, Model> {
        Eyes(RenderLayerParent<FrostMaulerEntity, Model> parent) {
            super(parent);
        }

        @Override
        public void render(PoseStack pose, MultiBufferSource buffers, int light, FrostMaulerEntity e, float limbSwing, float limbAmount,
                           float partial, float age, float headYaw, float headPitch) {
            Model m = getParentModel();
            if (e.isInvisible()) {
                return;
            }
            float k;
            if (e.isDeadOrDying()) {
                k = Math.max(0f, 1f - (e.deathTime + partial) / FrostMaulerEntity.DEATH_TICKS);
            } else if (e.isDormant()) {
                k = e.mode() == FrostMaulerEntity.MODE_AWAKENING ? 0.5f + 0.5f * Math.abs(Mth.sin(age * 0.9f)) : 0.25f + 0.05f * Mth.sin(age * 0.08f);
            } else if (e.isStunned()) {
                k = 0.35f + 0.15f * Mth.sin(age * 0.5f);
            } else if (e.isEnraged()) {
                k = 0.85f + 0.15f * Mth.sin(age * 0.6f);
            } else {
                k = 0.72f + 0.18f * Mth.sin(age * 0.22f);
            }
            if (m.hasGlow) {
                int c = (int) (Mth.clamp(k, 0f, 1f) * 255);
                m.renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(m.glowTexture)), 0xF000F0, OverlayTexture.NO_OVERLAY,
                        0xFF000000 | (c << 16) | (c << 8) | c);
            }
            emitFlames(pose, e);
        }

        /** Ice-blue flame off each eye: a steady trail, guttering when it is winded, flaring when it is enraged. */
        private void emitFlames(PoseStack pose, FrostMaulerEntity e) {
            Minecraft mc = Minecraft.getInstance();
            if (mc.level != e.level() || mc.isPaused() || e.lastFlameTick == e.tickCount) {
                return;
            }
            boolean enraged = e.isEnraged();
            int every;
            if (e.isDeadOrDying()) {
                every = e.deathTime < 20 ? 3 : 0;
            } else if (e.isDormant()) {
                every = e.mode() == FrostMaulerEntity.MODE_AWAKENING ? 3 : 0;
            } else {
                every = e.isStunned() ? 4 : enraged ? 1 : 2;
            }
            if (every == 0 || e.tickCount % every != 0) {
                return;
            }
            e.lastFlameTick = e.tickCount;
            Model m = getParentModel();
            Vec3 cam = mc.gameRenderer.getMainCamera().getPosition();
            Vec3 facing = Vec3.directionFromRotation(0, e.yHeadRot);
            Vec3 back = facing.scale(-0.02), front = facing.scale(0.08);
            RandomSource r = e.getRandom();
            for (Model.Eye eye : m.eyes) {
                Vec3 p = m.eyePosition(pose, eye);
                if (p == null) {
                    continue;
                }
                p = p.add(cam).add(front.x, 0.04, front.z);   // just in front of the eye, not inside the head
                if (p.distanceToSqr(e.position()) > 100) {
                    continue;   // not drawn in the world (some preview): no flames
                }
                int n = enraged ? 3 : 1;
                double spread = enraged ? 0.1 : 0.03;
                for (int i = 0; i < n; i++) {
                    e.level().addParticle(ParticleTypes.SOUL_FIRE_FLAME, p.x + (r.nextDouble() - 0.5) * spread, p.y + (r.nextDouble() - 0.5) * spread,
                            p.z + (r.nextDouble() - 0.5) * spread, back.x + (r.nextDouble() - 0.5) * 0.01,
                            (enraged ? 0.022 : 0.01) + r.nextDouble() * 0.006, back.z + (r.nextDouble() - 0.5) * 0.01);
                }
                if (e.tickCount % (enraged ? 9 : 22) == 0) {   // soul eyes: now and then a soul rises out of each socket
                    e.level().addParticle(ParticleTypes.SOUL, p.x, p.y + 0.05, p.z, back.x * 0.5, 0.02 + r.nextDouble() * 0.01,
                            back.z * 0.5);
                }
                if (enraged && e.tickCount % 6 == 0) {   // the flare
                    e.level().addParticle(ParticleTypes.SOUL, p.x, p.y + 0.05, p.z, back.x, 0.035, back.z);
                    e.level().addParticle(WWParticles.ICE_CRIT, p.x, p.y, p.z, (r.nextDouble() - 0.5) * 0.1, 0.06, (r.nextDouble() - 0.5) * 0.1);
                }
            }
        }
    }

    public static class Model extends WWModel<FrostMaulerEntity> {
        /** An eye bone: the chain of parts from the root to it, and the middle of its cube (model pixels). */
        record Eye(List<ModelPart> chain, Vector3f centre) {}

        final List<Eye> eyes = new ArrayList<>();

        Model(ModelPart root) {
            super(root, "frost_mauler");
            try {
                Map<String, JsonObject> parts = new HashMap<>();
                for (JsonElement el : LowpixGeometry.read(Winterworks.MOD_ID, "frost_mauler").getAsJsonArray("parts")) {
                    JsonObject p = el.getAsJsonObject();
                    parts.put(p.get("name").getAsString(), p);
                }
                for (String eyeName : new String[]{"eye_l", "eye_r"}) {
                    // the flames rise from the emissive flame card over the eye (eye_*_flame) when the model has one
                    boolean card = parts.containsKey(eyeName + "_flame") && parts.get(eyeName + "_flame").has("box");
                    String name = card ? eyeName + "_flame" : eyeName;
                    JsonObject p = parts.get(name);
                    if (p == null || !p.has("box")) {
                        continue;
                    }
                    List<ModelPart> chain = new ArrayList<>();
                    for (String n = name; n != null; ) {
                        JsonObject q = parts.get(n);
                        ModelPart mp = get(n).orElse(null);
                        if (q == null || mp == null) {
                            chain = null;
                            break;
                        }
                        chain.add(0, mp);
                        n = q.get("parent").isJsonNull() ? null : q.get("parent").getAsString();
                    }
                    if (chain != null) {
                        var b = p.getAsJsonArray("box");
                        // a card: a third of the way up it (model Y is down: its base is the box's max y); an eye: its middle
                        float y = b.get(1).getAsFloat() + b.get(4).getAsFloat() * (card ? 0.67f : 0.5f);
                        eyes.add(new Eye(chain, new Vector3f(b.get(0).getAsFloat() + b.get(3).getAsFloat() / 2, y,
                                b.get(2).getAsFloat() + b.get(5).getAsFloat() / 2)));
                    }
                }
            } catch (RuntimeException e) {   // no model: no flames
                eyes.clear();
            }
        }

        /** Where an eye is right now, relative to the camera (the entity pose stack is camera-relative, unrotated). */
        @Nullable
        Vec3 eyePosition(PoseStack pose, Eye eye) {
            pose.pushPose();
            root().translateAndRotate(pose);
            for (ModelPart p : eye.chain) {
                p.translateAndRotate(pose);
            }
            Vector3f v = pose.last().pose().transformPosition(eye.centre.x / 16f, eye.centre.y / 16f, eye.centre.z / 16f, new Vector3f());
            pose.popPose();
            return Float.isFinite(v.x) ? new Vec3(v.x, v.y, v.z) : null;
        }

        @Override
        public void setupAnim(FrostMaulerEntity e, float limbSwing, float limbAmount, float age, float headYaw, float headPitch) {
            reset();
            if (e.isDormant()) {
                play(e.frozenState, "frozen", age, 1f);   // a 1 s loop holding the roar's peak
                return;
            }
            if (e.isDeadOrDying()) {
                play(e.deathState, "death", age, 1f);
                return;
            }
            byte mode = e.mode();
            if (mode == FrostMaulerEntity.MODE_WAKING) {
                play(e.wakeState, "wake", age, 1f);   // starts from the frozen pose
                return;
            }
            switch (mode) {
                case FrostMaulerEntity.MODE_STUNNED -> play(e.stunnedState, "stunned", age, 1f);
                case FrostMaulerEntity.MODE_FURY_CHARGE -> play(e.furyState, "fury", age, 1.25f);
                case FrostMaulerEntity.MODE_FURY_BITE -> play(e.furyState, "fury", age, 1.6f - 0.6f * e.fatigue());   // slows as it tires
                default -> {
                    // walk blends into run as it speeds up
                    float run = Mth.clamp((limbAmount - 0.55f) / 0.35f, 0f, 1f);
                    walk("walk", limbSwing, limbAmount * (1f - run), 1.6f, 2.0f);
                    walk("run", limbSwing, limbAmount * run, 1.4f, 1.5f);
                    play(e.idleState, "idle", age, 1f);
                }
            }
            play(e.roarState, "roar", age, 1f);
            play(e.clawLState, "claw_l", age, e.clawLSpeed);
            play(e.clawRState, "claw_r", age, e.clawRSpeed);
            play(e.snapState, "fury", age, e.snapSpeed);
            float sinceSlam = age - e.slamStart;
            if (sinceSlam >= 0 && sinceSlam < FrostMaulerEntity.SLAM_TICKS) {   // it rears before both paws come down
                float rear = Mth.sin(Mth.clamp(sinceSlam / FrostMaulerEntity.SLAM_HIT, 0f, 1f) * Mth.PI * 0.5f)
                        * (1f - Mth.clamp((sinceSlam - FrostMaulerEntity.SLAM_HIT) / 4f, 0f, 1f));
                get("neck").ifPresent(p -> p.xRot -= 0.35f * rear);
                get("jaw").ifPresent(p -> p.xRot += 0.4f * rear);
            }
            if (mode == FrostMaulerEntity.MODE_FURY_WINDUP) {   // crouch, head low, about to spring
                float k = Mth.clamp((age - e.furyStart) / 6f, 0f, 1f);
                float snarl = Mth.sin(age * 1.7f) * 0.04f * k;
                get("neck").ifPresent(p -> p.xRot += 0.3f * k);
                get("head").ifPresent(p -> p.xRot += 0.15f * k + snarl);
                get("jaw").ifPresent(p -> p.xRot += 0.35f * k);
            }
            if (mode == FrostMaulerEntity.MODE_NONE && !e.roarState.isStarted()) {
                float yaw = headYaw * Mth.DEG_TO_RAD, pitch = headPitch * Mth.DEG_TO_RAD;
                get("neck").ifPresent(p -> p.yRot += yaw * 0.4f);
                get("head").ifPresent(p -> {
                    p.yRot += yaw * 0.5f;
                    p.xRot += pitch * 0.5f;
                });
            }
        }
    }
}
