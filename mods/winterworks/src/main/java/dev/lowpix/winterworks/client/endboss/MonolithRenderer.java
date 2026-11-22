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
 * Draws the Monolith: the exported lowpix model {@code monolith} (bones {@code body}, {@code eye_0..2}, {@code hand_l},
 * {@code hand_r}, {@code shards}; clips idle, stare, slam_l, slam_r, grab, clap, summon, death; its {@code _glow} texture
 * as a pulsing emissive pass), or, until that model is exported, a stand-in built here from obsidian. Either way the hands
 * are drawn where the server says they are (Monolith's synced hand positions), so you see the hands where they hit.
 *
 * <p>Telegraphs: a slam's shadow darkens on the floor under the rising hand, ringed in violet at its exact radius; the
 * clap's shockwave is a glowing ring running out along the floor (jump it); while it stares, its eyes flare and a gaze
 * streams to you, brighter the nearer you are to being petrified.
 */
public class MonolithRenderer extends EntityRenderer<Monolith> {
    static final ResourceLocation OBSIDIAN = ResourceLocation.withDefaultNamespace("textures/block/obsidian.png");
    static final ResourceLocation CRYING = ResourceLocation.withDefaultNamespace("textures/block/crying_obsidian.png");
    static final ResourceLocation WHITE = ResourceLocation.withDefaultNamespace("textures/misc/white.png");
    static final ResourceLocation SHADOW = ResourceLocation.withDefaultNamespace("textures/misc/shadow.png");
    @Nullable
    private final Model model;

    public MonolithRenderer(EntityRendererProvider.Context ctx) {
        super(ctx);
        shadowRadius = 1.6f;
        shadowStrength = 0.6f;
        Model m = null;
        if (MonolithRenderer.class.getResource("/assets/" + Winterworks.MOD_ID + "/lowpix/monolith.geo.json") != null) {
            try {
                m = new Model(ctx.bakeLayer(EndBossClient.MONOLITH_LAYER));
            } catch (RuntimeException ex) {
                Winterworks.LOG.error("monolith model: {}", ex.getMessage());
            }
        }
        model = m;
    }

    @Override
    public ResourceLocation getTextureLocation(Monolith e) {
        return model != null ? model.texture : OBSIDIAN;
    }

    @Override
    public boolean shouldRender(Monolith e, net.minecraft.client.renderer.culling.Frustum frustum, double x, double y, double z) {
        return e.shouldRender(x, y, z);   // its hands and telegraphs reach far past its box
    }

    @Override
    public void render(Monolith e, float entityYaw, float partial, PoseStack pose, MultiBufferSource buffers, int light) {
        float age = e.tickCount + partial;
        float yaw = Mth.rotLerp(partial, e.yRotO, e.getYRot());
        float death = e.deathTime > 0 ? Math.min(1f, (e.deathTime + partial) / Monolith.DEATH_TICKS) : 0f;
        float bob = Mth.sin(age * 0.05f) * 0.12f * (1 - death);
        Vector3f hl = new Vector3f(e.handLO).lerp(e.handL, partial), hr = new Vector3f(e.handRO).lerp(e.handR, partial);
        int overlay = OverlayTexture.pack(0f, e.hurtTime > 0 && death == 0);
        float glow = glowLevel(e, age);
        if (model != null) {
            renderModel(e, model, pose, buffers, light, overlay, age, yaw, bob, death, glow, hl, hr);
        } else {
            MonolithStandIn.render(e, pose, buffers, light, overlay, age, yaw, bob, death, glow, hl, hr);
        }
        if (death == 0f) {
            telegraphs(e, pose, buffers, age, hl, hr);
            gaze(e, pose, buffers, age, partial, yaw, bob);
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
            return 0.22f + 0.04f * Mth.sin(age * 0.05f);
        }
        float k = 0.68f + 0.14f * Mth.sin(age * 0.11f) + 0.06f * (e.phase() - 1);
        if (e.stareTarget() >= 0) {
            k = 0.9f + 0.5f * e.stareProgress() + 0.08f * Mth.sin(age * (0.6f + e.stareProgress()));
        }
        return k;
    }

    // ------------------------------------------------------------------------------------------------ the exported model

    private void renderModel(Monolith e, Model m, PoseStack pose, MultiBufferSource buffers, int light, int overlay, float age, float yaw,
                             float bob, float death, float glow, Vector3f hl, Vector3f hr) {
        pose.pushPose();
        pose.translate(0f, bob, 0f);
        pose.mulPose(Axis.YP.rotationDegrees(180f - yaw));
        pose.scale(-1f, -1f, 1f);
        pose.translate(0f, -1.501f, 0f);
        m.setupAnim(e, 0f, 0f, age, 0f, 0f);
        m.placeHand("hand_l", new Vector3f(hl).sub(0, bob, 0), yaw);
        m.placeHand("hand_r", new Vector3f(hr).sub(0, bob, 0), yaw);
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

    /** The exported model with its clips, and a way to put each hand bone where the server put the hand. */
    static final class Model extends WWModel<Monolith> {
        /** Each hand bone's ancestors (root first) and the centre of its boxes in its own space (model pixels). */
        private final Map<String, List<ModelPart>> chains = new HashMap<>();
        private final Map<String, Vector3f> centres = new HashMap<>();

        Model(ModelPart root) {
            super(root, "monolith");
            try {
                Map<String, JsonObject> parts = new HashMap<>();
                for (JsonElement el : LowpixGeometry.read(Winterworks.MOD_ID, "monolith").getAsJsonArray("parts")) {
                    JsonObject p = el.getAsJsonObject();
                    parts.put(p.get("name").getAsString(), p);
                }
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
        }

        /** The middle of all boxes under `bone`, in its own space (rest pose). */
        private static Vector3f boxCentre(Map<String, JsonObject> parts, String bone) {
            Vector3f min = new Vector3f(Float.MAX_VALUE), max = new Vector3f(-Float.MAX_VALUE);
            collect(parts, bone, new Vector3f(), min, max);
            return min.x > max.x ? new Vector3f() : new Vector3f(min).add(max).mul(0.5f);
        }

        private static void collect(Map<String, JsonObject> parts, String bone, Vector3f at, Vector3f min, Vector3f max) {
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
                    collect(parts, e.getKey(), new Vector3f(at).add(o.get(0).getAsFloat(), o.get(1).getAsFloat(), o.get(2).getAsFloat()), min, max);
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

        @Override
        public void setupAnim(Monolith e, float limbSwing, float limbAmount, float age, float headYaw, float headPitch) {
            reset();
            if (e.isDeadOrDying()) {
                play(e.deathState, "death", age, 1f);
                return;
            }
            play(e.idleState, "idle", age, 1f);
            play(e.stareState, "stare", age, 1f);
            play(e.slamLState, "slam_l", age, 1f);
            play(e.slamRState, "slam_r", age, 1f);
            play(e.grabState, "grab", age, 1f);
            play(e.clapState, "clap", age, 1f);
            play(e.summonState, "summon", age, 1f);
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
            float a = 0.35f + 0.6f * k, s = r * (1.25f - 0.15f * k), y = c.y + 0.03f;
            shadowVertex(shadow, p, c.x - s, y, c.z - s, 0, 0, a);
            shadowVertex(shadow, p, c.x - s, y, c.z + s, 0, 1, a);
            shadowVertex(shadow, p, c.x + s, y, c.z + s, 1, 1, a);
            shadowVertex(shadow, p, c.x + s, y, c.z - s, 1, 0, a);
            // its reach: a violet ring at the slam's radius, pulsing faster as it falls
            VertexConsumer glow = buffers.getBuffer(RenderType.dragonRays());
            float pulse = 0.6f + 0.4f * Mth.sin(age * (0.4f + k * 1.6f));
            DragonLightBeamRenderer.ring(glow, p.pose(), c, r - 0.18f, 0.36f, 200, 90, 255, (int) (180 * pulse * (0.4f + 0.6f * k)));
            DragonLightBeamRenderer.ring(glow, p.pose(), c, 0f, r * 0.9f, 120, 40, 200, (int) (50 * k));
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
        // the wall
        int n = 64;
        float h = (float) Monolith.RING_JUMP;
        for (int i = 0; i < n; i++) {
            float a0 = Mth.TWO_PI * i / n, a1 = Mth.TWO_PI * (i + 1) / n;
            float x0 = c.x + Mth.cos(a0) * r, z0 = c.z + Mth.sin(a0) * r, x1 = c.x + Mth.cos(a1) * r, z1 = c.z + Mth.sin(a1) * r;
            int a = (int) (150 * fade);
            glow.addVertex(m, x0, c.y, z0).setColor(230, 160, 255, a);
            glow.addVertex(m, x1, c.y, z1).setColor(230, 160, 255, a);
            glow.addVertex(m, x1, c.y + h, z1).setColor(200, 120, 255, 0);
            glow.addVertex(m, x0, c.y, z0).setColor(230, 160, 255, a);
            glow.addVertex(m, x1, c.y + h, z1).setColor(200, 120, 255, 0);
            glow.addVertex(m, x0, c.y + h, z0).setColor(200, 120, 255, 0);
            glow.addVertex(m, x0, c.y, z0).setColor(230, 160, 255, a);
            glow.addVertex(m, x1, c.y + h, z1).setColor(200, 120, 255, 0);
            glow.addVertex(m, x1, c.y, z1).setColor(230, 160, 255, a);
            glow.addVertex(m, x0, c.y, z0).setColor(230, 160, 255, a);
            glow.addVertex(m, x0, c.y + h, z0).setColor(200, 120, 255, 0);
            glow.addVertex(m, x1, c.y + h, z1).setColor(200, 120, 255, 0);
        }
    }

    /** While it stares: a gaze from its eyes to you, flickering, brighter as you near petrification. */
    private void gaze(Monolith e, PoseStack pose, MultiBufferSource buffers, float age, float partial, float yaw, float bob) {
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
        for (Vector3f eye : MonolithStandIn.eyesWorld(yaw, bob)) {
            DragonLightBeamRenderer.ribbon(glow, m, eye, b, c, 0.05f + 0.06f * k, 230, 150, 255, (int) ((40 + 150 * k) * flicker));
        }
        if (k > 0.05f) {
            DragonLightBeamRenderer.flare(glow, m, b, c, 0.5f + 0.9f * k, 220, 120, 255, (int) (120 * k * flicker));
        }
    }

    static Minecraft mc() {
        return Minecraft.getInstance();
    }
}
