package dev.lowpix.winterworks.client.soulbull;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.lowpix.LowpixGeometry;
import dev.lowpix.winterworks.client.render.WWModel;
import dev.lowpix.winterworks.soulbull.SoulBull;
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
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;
import org.joml.Vector3f;

/**
 * Draws the Soul Bull (lowpix model `soul_bull`). The texture follows its state: plain, horse armour (iron, gold,
 * diamond) or the wild armoured variant's blackstone plates; each has a `_glow` twin drawn emissive (RenderType.eyes):
 * the soul fire in its ribs, its eye sockets and tail, pulsing, dimmer as its soul energy runs low. The saddle shows only
 * when saddled, and the soul fire in its ribs shrinks with its soul energy. Clips: idle, walk, run, ram, pin, drain, revive.
 */
public class SoulBullRenderer extends MobRenderer<SoulBull, SoulBullRenderer.Model> {
    private static final String[] SKINS = {"soul_bull", "soul_bull_armored", "soul_bull_armor_iron", "soul_bull_armor_gold",
            "soul_bull_armor_diamond"};
    private static final Map<String, ResourceLocation> TEXTURES = new HashMap<>(), GLOWS = new HashMap<>();

    static {
        for (String s : SKINS) {
            TEXTURES.put(s, Winterworks.id("textures/entity/" + s + ".png"));
            GLOWS.put(s, Winterworks.id("textures/entity/" + s + "_glow.png"));
        }
    }

    public SoulBullRenderer(EntityRendererProvider.Context ctx) {
        super(ctx, new Model(ctx.bakeLayer(SoulBullClient.BULL_LAYER)), 1.1f);
        addLayer(new Glow(this));
    }

    static String skin(SoulBull e) {
        ItemStack armor = e.getBodyArmorItem();
        if (armor.is(Items.IRON_HORSE_ARMOR)) {
            return "soul_bull_armor_iron";
        }
        if (armor.is(Items.GOLDEN_HORSE_ARMOR)) {
            return "soul_bull_armor_gold";
        }
        if (armor.is(Items.DIAMOND_HORSE_ARMOR)) {
            return "soul_bull_armor_diamond";
        }
        return e.isArmored() ? "soul_bull_armored" : "soul_bull";
    }

    @Override
    public ResourceLocation getTextureLocation(SoulBull e) {
        return TEXTURES.get(skin(e));
    }

    @Override
    public void render(SoulBull e, float yaw, float partial, PoseStack pose, MultiBufferSource buffers, int light) {
        model.partial = partial;
        shadowRadius = e.getBbWidth() * 0.8f;
        super.render(e, yaw, partial, pose, buffers, light);
    }

    /** The emissive soul fire (eye sockets, ribs, tail), and the flames and souls it sheds. */
    static final class Glow extends RenderLayer<SoulBull, Model> {
        Glow(RenderLayerParent<SoulBull, Model> parent) {
            super(parent);
        }

        @Override
        public void render(PoseStack pose, MultiBufferSource buffers, int light, SoulBull e, float limbSwing, float limbAmount,
                           float partial, float age, float headYaw, float headPitch) {
            if (e.isInvisible()) {
                return;
            }
            Model m = getParentModel();
            float energy = e.soulEnergy();
            float k = 0.55f + 0.35f * energy + 0.1f * Mth.sin(age * (0.15f + 0.25f * (1f - energy)));
            if (e.isPinning() || e.isRamming()) {
                k = 0.9f + 0.1f * Mth.sin(age * 0.9f);
            } else if (e.isDraining()) {
                k = 0.75f + 0.25f * Mth.sin(age * 0.5f);
            }
            if (e.isDeadOrDying()) {
                k *= Math.max(0f, 1f - (e.deathTime + partial) / 20f);
            }
            int c = (int) (Mth.clamp(k, 0f, 1f) * 255);
            m.renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(GLOWS.get(skin(e)))), 0xF000F0, OverlayTexture.NO_OVERLAY,
                    0xFF000000 | (c << 16) | (c << 8) | c);
            emit(pose, e, m);
        }

        /** Soul flames rise off the fire in its ribs, its eye sockets and its tail (once a tick, only in the world). */
        private void emit(PoseStack pose, SoulBull e, Model m) {
            Minecraft mc = Minecraft.getInstance();
            if (mc.level != e.level() || mc.isPaused() || e.lastFxTick == e.tickCount || e.isDeadOrDying()) {
                return;
            }
            if (e.isReviving() && e.reviveState.getAccumulatedTime() < 600) {
                return;   // the fire hasn't caught yet
            }
            e.lastFxTick = e.tickCount;
            float energy = e.soulEnergy();
            Vec3 cam = mc.gameRenderer.getMainCamera().getPosition();
            RandomSource r = e.getRandom();
            boolean fierce = e.isRamming() || e.isPinning();
            int every = fierce ? 1 : energy > 0.5f ? 3 : 5;
            if (e.tickCount % every == 0) {
                spawn(e, m, pose, cam, "soul_core", ParticleTypes.SOUL_FIRE_FLAME, 0.12, 0.012 + 0.012 * energy, r);
            }
            if (e.tickCount % 4 == 1) {
                spawn(e, m, pose, cam, "tail_flame", ParticleTypes.SOUL_FIRE_FLAME, 0.05, 0.01, r);
            }
            if (e.tickCount % (fierce ? 2 : 6) == 2) {
                spawn(e, m, pose, cam, r.nextBoolean() ? "eye_fire_l" : "eye_fire_r", ParticleTypes.SOUL_FIRE_FLAME, 0.03, 0.01, r);
            }
            if (e.tickCount % 37 == 0) {
                spawn(e, m, pose, cam, "soul_core", ParticleTypes.SOUL, 0.1, 0.03, r);
            }
        }

        private static void spawn(SoulBull e, Model m, PoseStack pose, Vec3 cam, String part, ParticleOptions type, double spread,
                                  double up, RandomSource r) {
            Vec3 p = m.partPosition(pose, part);
            if (p == null) {
                return;
            }
            p = p.add(cam);
            if (p.distanceToSqr(e.position()) > 25) {
                return;   // not drawn in the world (an inventory preview): no flames
            }
            e.level().addParticle(type, p.x + (r.nextDouble() - 0.5) * spread, p.y + (r.nextDouble() - 0.5) * spread,
                    p.z + (r.nextDouble() - 0.5) * spread, (r.nextDouble() - 0.5) * 0.01, up, (r.nextDouble() - 0.5) * 0.01);
        }
    }

    public static class Model extends WWModel<SoulBull> {
        float partial;
        /** For particle emitters: the chain of parts from the root to a part, and the middle of its cube (model pixels). */
        private final Map<String, List<ModelPart>> chains = new HashMap<>();
        private final Map<String, Vector3f> centres = new HashMap<>();

        public Model(ModelPart root) {
            super(root, "soul_bull");
            try {
                Map<String, JsonObject> parts = new HashMap<>();
                for (JsonElement el : LowpixGeometry.read(Winterworks.MOD_ID, "soul_bull").getAsJsonArray("parts")) {
                    JsonObject p = el.getAsJsonObject();
                    parts.put(p.get("name").getAsString(), p);
                }
                for (String name : new String[]{"soul_core", "tail_flame", "eye_fire_l", "eye_fire_r"}) {
                    JsonObject p = parts.get(name);
                    if (p == null) {
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
                    if (chain == null) {
                        continue;
                    }
                    chains.put(name, chain);
                    if (p.has("box")) {
                        var b = p.getAsJsonArray("box");
                        centres.put(name, new Vector3f(b.get(0).getAsFloat() + b.get(3).getAsFloat() / 2,
                                b.get(1).getAsFloat() + b.get(4).getAsFloat() / 2, b.get(2).getAsFloat() + b.get(5).getAsFloat() / 2));
                    } else {
                        centres.put(name, new Vector3f());
                    }
                }
            } catch (RuntimeException e) {   // no model: no flames
                chains.clear();
            }
        }

        /** Where a part is right now, relative to the camera (the entity pose stack is camera-relative). */
        @Nullable
        Vec3 partPosition(PoseStack pose, String name) {
            List<ModelPart> chain = chains.get(name);
            if (chain == null) {
                return null;
            }
            Vector3f c = centres.get(name);
            pose.pushPose();
            root().translateAndRotate(pose);
            for (ModelPart p : chain) {
                if (p != root()) {
                    p.translateAndRotate(pose);
                }
            }
            Vector3f v = pose.last().pose().transformPosition(c.x / 16f, c.y / 16f, c.z / 16f, new Vector3f());
            pose.popPose();
            return Float.isFinite(v.x) ? new Vec3(v.x, v.y, v.z) : null;
        }

        @Override
        public void setupAnim(SoulBull e, float limbSwing, float limbAmount, float age, float headYaw, float headPitch) {
            reset();
            byte mode = e.mode();
            if (mode == SoulBull.MODE_RAM && e.ramState.getAccumulatedTime() > 1000) {
                mode = SoulBull.MODE_NONE;   // a long ridden charge: the ram clip is done, gallop on
            }
            switch (mode) {
                case SoulBull.MODE_REVIVE -> play(e.reviveState, "revive", age, 1f);
                case SoulBull.MODE_RAM -> play(e.ramState, "ram", age, 1f);
                case SoulBull.MODE_PIN -> play(e.pinState, "pin", age, 1f);
                default -> {
                    // walk blends into run (the charge: head down, horns levelled) as it speeds up
                    float run = Mth.clamp((limbAmount - 0.55f) / 0.35f, 0f, 1f);
                    walk("walk", limbSwing, limbAmount * (1f - run), 1.6f, 2.2f);
                    walk("run", limbSwing, limbAmount * run, 1.4f, 1.6f);
                    if (mode == SoulBull.MODE_DRAIN) {
                        play(e.drainState, "drain", age, 1f);
                    } else {
                        play(e.idleState, "idle", age, 1f);
                        float yaw = Mth.clamp(headYaw, -40f, 40f) * Mth.DEG_TO_RAD, pitch = headPitch * Mth.DEG_TO_RAD;
                        get("neck").ifPresent(p -> p.yRot += yaw * 0.4f);
                        get("head").ifPresent(p -> {
                            p.yRot += yaw * 0.5f;
                            p.xRot += pitch * 0.4f;
                        });
                    }
                }
            }
            show("saddle", e.isSaddled());
            float k = 0.45f + 0.55f * e.soulEnergy();   // the fire in its ribs burns down with its soul energy
            get("soul_fire").ifPresent(p -> {
                p.xScale *= k;
                p.yScale *= k;
                p.zScale *= k;
            });
        }
    }
}
