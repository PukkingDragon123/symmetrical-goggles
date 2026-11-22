package dev.lowpix.winterworks.client.endboss;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.lowpix.LowpixGeometry;
import dev.lowpix.winterworks.client.render.WWModel;
import dev.lowpix.winterworks.endboss.Monolith;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.CollisionContext;
import org.jetbrains.annotations.Nullable;
import org.joml.Matrix4f;
import org.joml.Vector3f;

/**
 * Draws the Monolith from its lowpix model {@code monolith} (client/lowpix/MonolithModel: bones {@code body},
 * {@code eye_0..2} with {@code _ball} and {@code _pupil}, {@code hand_l}, {@code hand_r}, {@code shards}): the clips
 * (idle under everything; stare, slam_l, slam_r, clap and summon as overlays at the server's timing; grab posed by
 * what the right hand is doing; death alone), its {@code _glow} texture as a breathing emissive pass that blazes while
 * it stares, and pupils that follow whoever it stares at (or you).
 *
 * <p>The hands are drawn where the server says they are (Monolith's synced hand positions): after the clips each hand
 * bone is moved so the middle of its boxes sits there, keeping the clip's turn and its fingers. So you see the hands
 * where they hit.
 *
 * <p>Telegraphs: a slam's shadow darkens on the floor under the rising fist, ringed in violet at its exact radius; the
 * clap's shockwave is a glowing ring running out along the floor (jump it); while it stares, a gaze streams from its
 * eyes to you, brighter the nearer you are to being petrified.
 */
public class MonolithRenderer extends EntityRenderer<Monolith> {
    static final ResourceLocation SHADOW = ResourceLocation.withDefaultNamespace("textures/misc/shadow.png");
    /** The slam clip strikes at 0.9 s, the clap's palms meet at 0.62 s: played so they land on the server's ticks. */
    private static final float SLAM_SPEED = 0.9f * 20f / Monolith.SLAM_TELEGRAPH,
            CLAP_SPEED = 0.62f * 20f / (Monolith.CLAP_SPREAD + Monolith.CLAP_HIT);
    @Nullable
    private final Model model;
    private final Vector3f[] eyes = {new Vector3f(), new Vector3f(), new Vector3f()};
    private boolean warned;

    public MonolithRenderer(EntityRendererProvider.Context ctx) {
        super(ctx);
        shadowRadius = 1.4f;
        shadowStrength = 0.55f;
        Model m = null;
        try {
            m = new Model(ctx.bakeLayer(EndBossClient.MONOLITH_LAYER));
        } catch (RuntimeException ex) {
            Winterworks.LOG.error("monolith model: {}", ex.getMessage());
        }
        model = m;
    }

    @Override
    public ResourceLocation getTextureLocation(Monolith e) {
        return model != null ? model.texture : Winterworks.id("textures/entity/monolith.png");
    }

    @Override
    public boolean shouldRender(Monolith e, net.minecraft.client.renderer.culling.Frustum frustum, double x, double y, double z) {
        return e.shouldRender(x, y, z);   // its hands and telegraphs reach far past its box
    }

    @Override
    public void render(Monolith e, float entityYaw, float partial, PoseStack pose, MultiBufferSource buffers, int light) {
        if (model == null || model.empty) {
            if (!warned) {
                warned = true;
                Winterworks.LOG.error("the monolith model is missing: nothing to draw");
            }
            return;
        }
        float age = e.tickCount + partial;
        float yaw = Mth.rotLerp(partial, e.yRotO, e.getYRot());
        boolean dying = e.isDeadOrDying();
        float bob = dying ? 0f : Mth.sin(age * 0.05f) * 0.12f;
        Vector3f hl = new Vector3f(e.handLO).lerp(e.handL, partial), hr = new Vector3f(e.handRO).lerp(e.handR, partial);
        int overlay = OverlayTexture.pack(0f, e.hurtTime > 0 && !dying);
        float glow = glowLevel(e, age);
        renderModel(e, model, pose, buffers, light, overlay, age, partial, yaw, bob, glow, hl, hr);
        if (!dying) {
            telegraphs(e, pose, buffers, age, hl, hr);
            gaze(e, pose, buffers, age, partial);
        }
        ring(e, pose, buffers, age);
        super.render(e, entityYaw, partial, pose, buffers, light);
    }

    /** How bright the eyes and runes are: dim asleep, awake and breathing, blazing as the stare closes in. */
    static float glowLevel(Monolith e, float age) {
        if (e.isDeadOrDying()) {
            return Math.max(0f, 1f - e.deathTime / (float) Monolith.DEATH_TICKS) * (0.6f + 0.4f * Mth.sin(age * 1.3f));
        }
        if (!e.isAwake()) {
            return 0.3f + 0.05f * Mth.sin(age * 0.05f);
        }
        float k = 0.7f + 0.14f * Mth.sin(age * 0.11f) + 0.06f * (e.phase() - 1);
        if (e.stareTarget() >= 0) {
            k = 0.95f + 0.6f * e.stareProgress() + 0.08f * Mth.sin(age * (0.6f + e.stareProgress()));
        }
        return k;
    }

    private void renderModel(Monolith e, Model m, PoseStack pose, MultiBufferSource buffers, int light, int overlay, float age, float partial,
                             float yaw, float bob, float glow, Vector3f hl, Vector3f hr) {
        pose.pushPose();
        pose.translate(0f, bob, 0f);
        pose.mulPose(Axis.YP.rotationDegrees(180f - yaw));
        pose.scale(-1f, -1f, 1f);
        pose.translate(0f, -1.501f, 0f);
        m.setupAnim(e, 0f, 0f, age, 0f, 0f);
        if (!e.isDeadOrDying()) {   // dying, the death clip lets the hands fall where it likes
            m.placeHand("hand_l", new Vector3f(hl).sub(0, bob, 0), yaw);
            m.placeHand("hand_r", new Vector3f(hr).sub(0, bob, 0), yaw);
            m.lookAt(e, partial, yaw);
        }
        PoseStack model = new PoseStack();   // the same turn, flip and lift, from the entity itself (not the camera)
        model.translate(0f, bob, 0f);
        model.mulPose(Axis.YP.rotationDegrees(180f - yaw));
        model.scale(-1f, -1f, 1f);
        model.translate(0f, -1.501f, 0f);
        m.eyePositions(model, eyes);
        m.renderToBuffer(pose, buffers.getBuffer(RenderType.entityCutoutNoCull(m.texture)), light, overlay, 0xFFFFFFFF);
        if (m.hasGlow) {
            int c = (int) (Mth.clamp(glow, 0f, 1f) * 255);
            m.renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(m.glowTexture)), 0xF000F0, OverlayTexture.NO_OVERLAY,
                    0xFF000000 | c << 16 | c << 8 | c);
            if (glow > 1f) {   // the stare: the eyes alone again, flaring
                int x = (int) (Mth.clamp(glow - 1f, 0f, 1f) * 255);
                m.mask(n -> n.startsWith("eye"));
                m.renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(m.glowTexture)), 0xF000F0, OverlayTexture.NO_OVERLAY,
                        0xFF000000 | x << 16 | x << 8 | x);
                m.unmask();
            }
        }
        pose.popPose();
    }

    /** The exported model with its clips, a way to put each hand bone where the server put the hand, and looking pupils. */
    static final class Model extends WWModel<Monolith> {
        /** Each hand bone's ancestors (root first) and the middle of its boxes in its own space (model pixels). */
        private final Map<String, List<ModelPart>> chains = new HashMap<>();
        private final Map<String, Vector3f> centres = new HashMap<>();
        final boolean empty;

        Model(ModelPart root) {
            super(root, "monolith");
            boolean none = true;
            try {
                Map<String, JsonObject> parts = new HashMap<>();
                for (JsonElement el : LowpixGeometry.read(Winterworks.MOD_ID, "monolith").getAsJsonArray("parts")) {
                    JsonObject p = el.getAsJsonObject();
                    parts.put(p.get("name").getAsString(), p);
                }
                none = parts.isEmpty();
                for (String hand : new String[]{"hand_l", "hand_r"}) {
                    if (!parts.containsKey(hand) || get(hand).isEmpty()) {
                        continue;
                    }
                    List<ModelPart> chain = new ArrayList<>();
                    JsonObject p = parts.get(hand);
                    String parent = p.get("parent").isJsonNull() ? null : p.get("parent").getAsString();
                    while (parent != null) {
                        JsonObject q = parts.get(parent);
                        ModelPart mp = get(parent).orElse(null);
                        if (q == null || mp == null) {
                            break;
                        }
                        chain.add(0, mp);
                        parent = q.get("parent").isJsonNull() ? null : q.get("parent").getAsString();
                    }
                    chains.put(hand, chain);
                    centres.put(hand, boxCentre(parts, hand));
                }
            } catch (RuntimeException ex) {
                chains.clear();
            }
            empty = none;
        }

        /** The middle of all boxes under `bone`, in its own space (rest pose, digits straight). */
        private static Vector3f boxCentre(Map<String, JsonObject> parts, String bone) {
            Vector3f min = new Vector3f(Float.MAX_VALUE), max = new Vector3f(-Float.MAX_VALUE);
            collect(parts, bone, new Vector3f(), min, max, true);
            return min.x > max.x ? new Vector3f() : new Vector3f(min).add(max).mul(0.5f);
        }

        private static void collect(Map<String, JsonObject> parts, String bone, Vector3f at, Vector3f min, Vector3f max, boolean top) {
            JsonObject p = parts.get(bone);
            if (p == null) {
                return;
            }
            if (p.has("box")) {
                var b = p.getAsJsonArray("box");
                Vector3f lo = new Vector3f(b.get(0).getAsFloat(), b.get(1).getAsFloat(), b.get(2).getAsFloat()).add(at);
                Vector3f hi = new Vector3f(lo).add(b.get(3).getAsFloat(), b.get(4).getAsFloat(), b.get(5).getAsFloat());
                min.min(lo);
                max.max(hi);
            }
            for (var e : parts.entrySet()) {
                JsonObject q = e.getValue();
                if (!q.get("parent").isJsonNull() && q.get("parent").getAsString().equals(bone)) {
                    var o = q.getAsJsonArray("offset");
                    collect(parts, e.getKey(), new Vector3f(at).add(o.get(0).getAsFloat(), o.get(1).getAsFloat(), o.get(2).getAsFloat()),
                            min, max, false);
                }
            }
        }

        /** Moves a hand bone so its boxes' middle sits at `rel` (blocks, world axes, from the entity), the body turned `yaw`. */
        void placeHand(String bone, Vector3f rel, float yaw) {
            ModelPart hand = get(bone).orElse(null);
            List<ModelPart> chain = chains.get(bone);
            if (hand == null || chain == null) {
                return;
            }
            // world offset -> the model's space (undo the renderer's turn, flip and lift), in pixels
            Vector3f local = new Vector3f(rel).rotateY(-(180f - yaw) * Mth.DEG_TO_RAD);
            Vector3f p = new Vector3f(-local.x, 1.501f - local.y, local.z).mul(16f);
            PoseStack s = new PoseStack();
            root().translateAndRotate(s);
            for (ModelPart a : chain) {
                a.translateAndRotate(s);
            }
            Matrix4f inv = new Matrix4f(s.last().pose()).invert();
            Vector3f inParent = inv.transformPosition(new Vector3f(p).div(16f), new Vector3f()).mul(16f);
            Vector3f c = centres.getOrDefault(bone, new Vector3f());
            Vector3f turned = new Vector3f(c).rotateX(hand.xRot).rotateY(hand.yRot).rotateZ(hand.zRot);   // as ModelPart turns (Z * Y * X)
            hand.x = inParent.x - turned.x;
            hand.y = inParent.y - turned.y;
            hand.z = inParent.z - turned.z;
        }

        /** Its pupils turn to whoever it stares at, else to the player watching (when awake). */
        void lookAt(Monolith e, float partial, float yaw) {
            Minecraft mc = Minecraft.getInstance();
            Entity t = e.stareTarget() >= 0 ? e.level().getEntity(e.stareTarget()) : e.isAwake() ? mc.getCameraEntity() : null;
            if (t == null || t.distanceToSqr(e) > 48 * 48) {
                return;
            }
            Vec3 d = t.getEyePosition(partial).subtract(e.getEyePosition(partial));
            Vector3f l = new Vector3f((float) d.x, (float) d.y, (float) d.z).rotateY(yaw * Mth.DEG_TO_RAD).normalize();   // +x its left, +z ahead
            for (int i = 0; i < 3; i++) {
                int eye = i;
                get("eye_" + i + "_pupil").ifPresent(p -> {
                    p.x += Mth.clamp(l.x, -1f, 1f) * (eye == 0 ? 2.6f : 2.2f);
                    p.y -= Mth.clamp(l.y, -1f, 1f) * 1.2f;
                });
            }
        }

        /** The pupils' positions (relative to the entity, world axes) in the pose the model is drawn with. */
        void eyePositions(PoseStack pose, Vector3f[] out) {
            for (int i = 0; i < out.length; i++) {
                ModelPart body = get("body").orElse(null), eye = get("eye_" + i).orElse(null), pupil = get("eye_" + i + "_pupil").orElse(null);
                if (body == null || eye == null) {
                    continue;
                }
                pose.pushPose();
                root().translateAndRotate(pose);
                body.translateAndRotate(pose);
                eye.translateAndRotate(pose);
                if (pupil != null) {
                    pupil.translateAndRotate(pose);
                }
                pose.last().pose().transformPosition(0f, 0f, 0f, out[i]);
                pose.popPose();
            }
        }

        @Override
        public void setupAnim(Monolith e, float limbSwing, float limbAmount, float age, float headYaw, float headPitch) {
            reset();
            if (e.isDeadOrDying()) {
                play(e.deathState, "death", age, 1f);
                return;
            }
            play(e.idleState, "idle", age, 1f);
            play(e.stareState, "stare", age, 1f);
            play(e.slamLState, "slam_l", age, SLAM_SPEED);
            play(e.slamRState, "slam_r", age, SLAM_SPEED);
            play(e.clapState, "clap", age, CLAP_SPEED);
            play(e.summonState, "summon", age, 1f);
            // the grab follows the right hand: open as it winds back and reaches, closing on you, then the fist held
            byte st = e.clientHandState[1];
            float since = age - e.clientHandSince[1];
            switch (st) {
                case Monolith.H_GRAB_WIND -> clip("grab", 0.3f * Mth.clamp(since / Monolith.GRAB_WIND, 0f, 1f));
                case Monolith.H_GRAB_REACH -> clip("grab", 0.3f + 0.12f * Mth.clamp(since / 10f, 0f, 1f));
                case Monolith.H_GRAB_HOLD -> clip("grab", Math.min(1f, 0.45f + since / 20f));
                default -> {}
            }
        }
    }

    // ------------------------------------------------------------------------------------------------ telegraphs

    /** The floor under a point (client raycast), or NaN. */
    static double floorUnder(Monolith e, Vec3 at) {
        var hit = e.level().clip(new ClipContext(at, at.add(0, -32, 0), ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE,
                CollisionContext.empty()));
        return hit.getType() == HitResult.Type.MISS ? Double.NaN : hit.getLocation().y;
    }

    private void telegraphs(Monolith e, PoseStack pose, MultiBufferSource buffers, float age, Vector3f hl, Vector3f hr) {
        for (int i = 0; i < 2; i++) {
            boolean left = i == 0;
            byte st = e.handState(left);
            if (st != Monolith.H_SLAM_AIM && st != Monolith.H_SLAM_FALL) {
                continue;
            }
            Vector3f rel = left ? hl : hr;
            Vec3 world = e.position().add(rel.x, rel.y, rel.z);
            double fy = floorUnder(e, world);
            if (Double.isNaN(fy)) {
                continue;
            }
            float since = age - (left ? e.slamLStart : e.slamRStart);
            float k = Mth.clamp(since / Monolith.SLAM_TELEGRAPH, 0f, 1f);
            Vector3f c = new Vector3f(rel.x, (float) (fy - e.getY()), rel.z);
            float r = (float) Monolith.SLAM_RADIUS;
            // the shadow, darkening as it comes
            VertexConsumer shadow = buffers.getBuffer(RenderType.entityShadow(SHADOW));
            PoseStack.Pose p = pose.last();
            float a = 0.4f + 0.55f * k, s = r * (1.3f - 0.2f * k), y = c.y + 0.03f;
            shadowVertex(shadow, p, c.x - s, y, c.z - s, 0, 0, a);
            shadowVertex(shadow, p, c.x - s, y, c.z + s, 0, 1, a);
            shadowVertex(shadow, p, c.x + s, y, c.z + s, 1, 1, a);
            shadowVertex(shadow, p, c.x + s, y, c.z - s, 1, 0, a);
            // its reach: a violet ring at the slam's radius, pulsing faster as it falls
            VertexConsumer glow = buffers.getBuffer(RenderType.dragonRays());
            float pulse = 0.6f + 0.4f * Mth.sin(age * (0.4f + k * 1.6f));
            DragonLightBeamRenderer.ring(glow, p.pose(), c, r - 0.2f, 0.4f, 210, 100, 255, (int) (200 * pulse * (0.4f + 0.6f * k)));
            DragonLightBeamRenderer.ring(glow, p.pose(), c, 0f, r * 0.9f, 150, 60, 230, (int) (85 * k));
        }
    }

    private static void shadowVertex(VertexConsumer vc, PoseStack.Pose p, float x, float y, float z, float u, float v, float a) {
        vc.addVertex(p, x, y, z).setColor(1f, 1f, 1f, a).setUv(u, v).setOverlay(OverlayTexture.NO_OVERLAY).setLight(0xF000F0)
                .setNormal(p, 0f, 1f, 0f);
    }

    /** The clap's shockwave: a bright band low along the floor, running out; a faint wall shows how high to jump. */
    private void ring(Monolith e, PoseStack pose, MultiBufferSource buffers, float age) {
        float t = age - e.ringStart;
        float r = (float) (0.8 + Monolith.RING_SPEED * t);
        if (t < 0 || r > Monolith.RING_MAX) {
            return;
        }
        Vec3 off = e.ringCentreOffset();
        Vector3f c = new Vector3f((float) off.x, (float) off.y, (float) off.z);
        float fade = 1f - r / (float) Monolith.RING_MAX;
        Matrix4f m = pose.last().pose();
        VertexConsumer glow = buffers.getBuffer(RenderType.dragonRays());
        float w = (float) Monolith.RING_WIDTH;
        DragonLightBeamRenderer.ring(glow, m, c, Math.max(0f, r - w), w * 2f, 255, 200, 255, (int) (230 * fade));
        DragonLightBeamRenderer.ring(glow, m, c, Math.max(0f, r - w * 2.5f), w * 5f, 170, 70, 255, (int) (90 * fade));
        int n = 64;   // the wall
        float h = (float) Monolith.RING_JUMP;
        int a = (int) (150 * fade);
        for (int i = 0; i < n; i++) {
            float a0 = Mth.TWO_PI * i / n, a1 = Mth.TWO_PI * (i + 1) / n;
            float x0 = c.x + Mth.cos(a0) * r, z0 = c.z + Mth.sin(a0) * r, x1 = c.x + Mth.cos(a1) * r, z1 = c.z + Mth.sin(a1) * r;
            for (int side = 0; side < 2; side++) {   // both windings
                float xa = side == 0 ? x0 : x1, za = side == 0 ? z0 : z1, xb = side == 0 ? x1 : x0, zb = side == 0 ? z1 : z0;
                glow.addVertex(m, xa, c.y, za).setColor(230, 160, 255, a);
                glow.addVertex(m, xb, c.y, zb).setColor(230, 160, 255, a);
                glow.addVertex(m, xb, c.y + h, zb).setColor(200, 120, 255, 0);
                glow.addVertex(m, xa, c.y, za).setColor(230, 160, 255, a);
                glow.addVertex(m, xb, c.y + h, zb).setColor(200, 120, 255, 0);
                glow.addVertex(m, xa, c.y + h, za).setColor(200, 120, 255, 0);
            }
        }
    }

    /** While it stares: a gaze from its eyes to you, flickering, brighter as you near petrification. */
    private void gaze(Monolith e, PoseStack pose, MultiBufferSource buffers, float age, float partial) {
        int id = e.stareTarget();
        if (id < 0) {
            return;
        }
        Entity t = e.level().getEntity(id);
        if (t == null) {
            return;
        }
        Vec3 origin = e.getPosition(partial);
        Vec3 to = t.getPosition(partial).add(0, t.getBbHeight() * 0.85, 0).subtract(origin);
        Vec3 cam = entityRenderDispatcher.camera.getPosition().subtract(origin);
        Vector3f c = new Vector3f((float) cam.x, (float) cam.y, (float) cam.z);
        Vector3f b = new Vector3f((float) to.x, (float) to.y, (float) to.z);
        float k = e.stareProgress();
        float flicker = 0.7f + 0.3f * Mth.sin(age * (1.1f + 2f * k));
        VertexConsumer glow = buffers.getBuffer(RenderType.dragonRays());
        Matrix4f m = pose.last().pose();
        for (Vector3f eye : eyes) {
            DragonLightBeamRenderer.ribbon(glow, m, eye, b, c, 0.07f + 0.08f * k, 235, 160, 255, (int) ((90 + 150 * k) * flicker));
            DragonLightBeamRenderer.flare(glow, m, eye, c, 0.35f + 0.5f * k, 230, 140, 255, (int) ((60 + 120 * k) * flicker));
        }
        if (k > 0.05f) {
            DragonLightBeamRenderer.flare(glow, m, b, c, 0.5f + 0.9f * k, 220, 120, 255, (int) (120 * k * flicker));
        }
    }
}
