package dev.lowpix.winterworks.client.golem;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.SheetedDecalTextureGenerator;
import com.mojang.blaze3d.vertex.VertexConsumer;
import com.mojang.blaze3d.vertex.VertexMultiConsumer;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.lowpix.LowpixGeometry;
import dev.lowpix.winterworks.client.render.WWModel;
import dev.lowpix.winterworks.golem.PotGolemEntity;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.ItemRenderer;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.client.resources.model.ModelBakery;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;

/**
 * The Pot Golem (docs/AMBER_UPDATE.md section 9): the lowpix model {@code pot_golem} with the real decorated pot drawn on
 * its {@code head} bone (the vanilla pot, sherds and all, through the item renderer), cracks drawn over the pot with the
 * block-breaking textures, the {@code face} bone only when it has no pot, the shard arms ({@code blade}, {@code pickaxe},
 * {@code bow}) only for the equipped shard, and {@code jelly_*} bones wobbling on a spring. Missing art draws nothing
 * (but the pot) and missing clips are no-ops.
 */
public class PotGolemRenderer extends MobRenderer<PotGolemEntity, PotGolemRenderer.Model> {
    /** The pot is drawn at its real block size. */
    static final float POT_SCALE = 1.0f;
    /** Destroy stage (0..9) shown for 1, 2 and 3 cracks. */
    private static final int[] CRACK_STAGE = {0, 3, 6, 9};

    public PotGolemRenderer(EntityRendererProvider.Context ctx) {
        super(ctx, new Model(ctx.bakeLayer(GolemClient.POT_GOLEM)), 0.9f);
        addLayer(new OpaqueLayer(this));
        addLayer(new PotHeadLayer(this, ctx.getItemRenderer()));
        if (model.hasGlow) {
            addLayer(new GlowLayer(this));
        }
    }

    @Override
    public ResourceLocation getTextureLocation(PotGolemEntity e) {
        return model.texture;
    }

    /** The amber body is see-through jelly (the texture's alpha); arm tools and sherds come after, opaque (OpaqueLayer). */
    @Override
    protected RenderType getRenderType(PotGolemEntity e, boolean bodyVisible, boolean translucent, boolean glowing) {
        return bodyVisible && !translucent ? RenderType.entityTranslucent(getTextureLocation(e))
                : super.getRenderType(e, bodyVisible, translucent, glowing);
    }

    @Override
    public void render(PotGolemEntity e, float yaw, float partial, PoseStack pose, MultiBufferSource buffers, int light) {
        model.partial = partial;
        super.render(e, yaw, partial, pose, buffers, light);
    }

    /** The Danger fuse flashes white like a creeper. */
    @Override
    protected float getWhiteOverlayProgress(PotGolemEntity e, float partial) {
        float f = e.fuseProgress(partial);
        return f <= 0f || (int) (f * 10f) % 2 == 0 ? 0f : Mth.clamp(f, 0.5f, 1f);
    }

    float whiteness(PotGolemEntity e, float partial) {
        return getWhiteOverlayProgress(e, partial);
    }

    // ------------------------------------------------------------------------------------------------ model

    public static class Model extends WWModel<PotGolemEntity> {
        private static final String[] CLIPS = {"attack", "slash", "mine", "shoot", "howl", "beam", "giggle", "sneeze", "fuse"};
        private static final Set<String> OPAQUE_ROOTS = Set.of("blade", "pickaxe", "bow");
        float partial;
        /** root ... head: the bones to pose through to reach the pot seat. */
        private final List<ModelPart> headChain = new ArrayList<>();
        private final List<ModelPart> jelly = new ArrayList<>();
        /** Drawn opaque, not as amber jelly: the shard arms (blade, pickaxe, bow) and the sherds, with everything under them. */
        final Set<String> opaque = new HashSet<>();
        /** Where the pot sits in head-bone space (pixels): the top centre of the head bone's box. */
        private float seatX, seatY, seatZ;

        Model(ModelPart root) {
            super(root, "pot_golem");
            Map<String, String> parents = new HashMap<>();
            try {
                for (JsonElement el : LowpixGeometry.read(Winterworks.MOD_ID, "pot_golem").getAsJsonArray("parts")) {
                    JsonObject p = el.getAsJsonObject();
                    String n = p.get("name").getAsString();
                    parents.put(n, p.get("parent").isJsonNull() ? null : p.get("parent").getAsString());
                    if (n.startsWith("jelly_")) {
                        get(n).ifPresent(jelly::add);
                    }
                    if (n.equals("head") && p.has("box")) {
                        JsonArray b = p.getAsJsonArray("box");
                        seatX = b.get(0).getAsFloat() + b.get(3).getAsFloat() / 2f;
                        seatY = b.get(1).getAsFloat();   // Y is down: the box's top face
                        seatZ = b.get(2).getAsFloat() + b.get(5).getAsFloat() / 2f;
                    }
                }
            } catch (RuntimeException e) {   // no export yet: WWModel has logged it
                parents.clear();
            }
            for (String n : parents.keySet()) {
                for (String a = n; a != null; a = parents.get(a)) {
                    if (OPAQUE_ROOTS.contains(a) || a.startsWith("sherd")) {
                        opaque.add(n);
                        break;
                    }
                }
            }
            List<ModelPart> chain = new ArrayList<>();
            for (String n = parents.containsKey("head") ? "head" : null; n != null; n = parents.get(n)) {
                var part = get(n);
                if (part.isEmpty()) {
                    chain.clear();
                    break;
                }
                chain.add(0, part.get());
            }
            if (!chain.isEmpty()) {
                headChain.add(root);
                headChain.addAll(chain);
            }
        }

        @Override
        public void setupAnim(PotGolemEntity e, float limbSwing, float limbAmount, float age, float headYaw, float headPitch) {
            reset();
            if (e.isDazed()) {
                play(e.dazedState, "dazed", age, 1f);
            } else {
                walk("walk", limbSwing, limbAmount, 2.5f, 2.0f);
                play(e.idleState, "idle", age, 1f);
            }
            PotGolemEntity.Clip[] clips = {e.attackClip, e.slashClip, e.mineClip, e.shootClip, e.howlClip, e.beamClip, e.giggleClip,
                    e.sneezeClip, e.fuseClip};
            for (int i = 0; i < clips.length; i++) {
                play(clips[i].state, CLIPS[i], age, 1f);
            }
            if (!e.isDazed()) {
                float yaw = headYaw * Mth.DEG_TO_RAD, pitch = headPitch * Mth.DEG_TO_RAD;
                get("head").ifPresent(p -> {
                    p.yRot += yaw * 0.6f;
                    p.xRot += pitch * 0.4f;
                });
            }
            show("face", !e.hasPot());   // the dumb face: two tiny dot eyes, one bigger
            PotGolemEntity.Shard shard = e.shard();
            show("blade", shard == PotGolemEntity.Shard.BLADE);
            show("pickaxe", shard == PotGolemEntity.Shard.MINER);
            show("bow", shard == PotGolemEntity.Shard.ARCHER);
            // amber jelly: hits and footfalls kick a spring; each wobbly bit lags a little differently
            float j = e.jelly(partial);
            for (int i = 0; i < jelly.size(); i++) {
                ModelPart p = jelly.get(i);
                float k = j * (1f + 0.3f * (i % 3));
                p.yScale *= 1f - k * 0.5f;
                p.xScale *= 1f + k * 0.28f;
                p.zScale *= 1f + k * 0.28f;
                p.zRot += k * 0.12f * (i % 2 == 0 ? 1f : -1f);
            }
            get("chest").ifPresent(p -> {
                p.yScale *= 1f - j * 0.08f;
                p.xScale *= 1f + j * 0.05f;
            });
            get("body").ifPresent(p -> p.zRot += j * 0.04f);
            mask(n -> !opaque.contains(n));   // the translucent main pass: amber only
        }

        /** Moves `pose` from model space to the top of the pot seat; false (left at the model origin) without the bone. */
        boolean toPotSeat(PoseStack pose) {
            if (headChain.isEmpty()) {
                return false;
            }
            for (ModelPart p : headChain) {
                p.translateAndRotate(pose);
            }
            pose.translate(seatX / 16f, seatY / 16f, seatZ / 16f);
            return true;
        }
    }

    // ------------------------------------------------------------------------------------------------ layers

    /** The shard arms and the sherds, opaque over the jelly body; then the whole model is unmasked for the other layers. */
    static class OpaqueLayer extends RenderLayer<PotGolemEntity, Model> {
        private final PotGolemRenderer renderer;

        OpaqueLayer(PotGolemRenderer renderer) {
            super(renderer);
            this.renderer = renderer;
        }

        @Override
        public void render(PoseStack pose, MultiBufferSource buffers, int light, PotGolemEntity e, float limbSwing, float limbAmount,
                           float partial, float age, float headYaw, float headPitch) {
            Model m = getParentModel();
            if (!e.isInvisible() && !m.opaque.isEmpty()) {
                m.mask(m.opaque::contains);
                int overlay = LivingEntityRenderer.getOverlayCoords(e, renderer.whiteness(e, partial));
                m.renderToBuffer(pose, buffers.getBuffer(RenderType.entityCutoutNoCull(m.texture)), light, overlay, 0xFFFFFFFF);
            }
            m.unmask();
        }
    }

    /** The real decorated pot, with its sherds, on the head bone; cracks drawn over it with the breaking textures. */
    static class PotHeadLayer extends RenderLayer<PotGolemEntity, Model> {
        private final PotGolemRenderer renderer;
        private final ItemRenderer items;

        PotHeadLayer(PotGolemRenderer renderer, ItemRenderer items) {
            super(renderer);
            this.renderer = renderer;
            this.items = items;
        }

        @Override
        public void render(PoseStack pose, MultiBufferSource buffers, int light, PotGolemEntity e, float limbSwing, float limbAmount,
                           float partial, float age, float headYaw, float headPitch) {
            ItemStack pot = e.head();
            if (pot.isEmpty() || e.isInvisible()) {
                return;
            }
            pose.pushPose();
            getParentModel().toPotSeat(pose);   // without the bone: the model origin, 1.5 blocks up
            pose.mulPose(Axis.XP.rotationDegrees(180f));   // model space (Y down, front -Z) -> pot space (Y up, front sherd forward)
            float j = e.jelly(partial);
            pose.mulPose(Axis.ZP.rotation(j * 0.3f));
            pose.mulPose(Axis.XP.rotation(-j * 0.15f));
            float fuse = e.fuseProgress(partial);
            float s = POT_SCALE * (1f + fuse * 0.25f + Mth.sin(age * 2.7f) * 0.03f * fuse);
            pose.scale(s, s * (1f - j * 0.12f), s);
            pose.translate(0f, 0.5f, 0f);   // the item renderer centres the pot block on the origin: sit it on the seat
            int overlay = LivingEntityRenderer.getOverlayCoords(e, renderer.whiteness(e, partial));
            MultiBufferSource out = buffers;
            int cracks = Mth.clamp(e.cracks(), 0, CRACK_STAGE.length - 1);
            if (cracks > 0) {
                pose.pushPose();
                pose.translate(-0.5f, -0.5f, -0.5f);   // the pot block's own corner, as the item renderer will draw it
                PoseStack.Pose decal = pose.last().copy();
                pose.popPose();
                RenderType crack = ModelBakery.DESTROY_TYPES.get(CRACK_STAGE[cracks]);
                out = type -> {
                    VertexConsumer vc = buffers.getBuffer(type);
                    return type.affectsCrumbling()
                            ? VertexMultiConsumer.create(new SheetedDecalTextureGenerator(buffers.getBuffer(crack), decal, 1.0f), vc) : vc;
                };
            }
            items.renderStatic(e, pot, ItemDisplayContext.NONE, false, pose, out, e.level(), light, overlay, e.getId());
            pose.popPose();
        }
    }

    /** The emissive layer, if the art has one (textures/entity/pot_golem_glow.png and parts flagged glow). */
    static class GlowLayer extends RenderLayer<PotGolemEntity, Model> {
        GlowLayer(RenderLayerParent<PotGolemEntity, Model> parent) {
            super(parent);
        }

        @Override
        public void render(PoseStack pose, MultiBufferSource buffers, int light, PotGolemEntity e, float limbSwing, float limbAmount,
                           float partial, float age, float headYaw, float headPitch) {
            if (e.isInvisible()) {
                return;
            }
            Model m = getParentModel();
            m.renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(m.glowTexture)), 0xF000F0, OverlayTexture.NO_OVERLAY, 0xFFFFFFFF);
        }
    }
}
