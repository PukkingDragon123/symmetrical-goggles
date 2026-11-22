package dev.lowpix.winterworks.client.nether;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.client.render.WWModel;
import dev.lowpix.winterworks.nether.PiglinWitch;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.ItemInHandRenderer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;

/**
 * The Piglin Witch: lowpix model `piglin_witch` (textures/entity/piglin_witch.png, plus piglin_witch_glow.png over the
 * parts flagged glow), her clips driven by the entity (walk, idle, trade loop; drink, hiccup, rummage, refuse, cackle,
 * throw one-shots) with a drunken sway, a jiggling belly and flopping ears on top; whatever she holds (flask, potion,
 * a trinket from the backpack) is drawn at the hand_r bone. Missing art draws nothing; missing clips are no-ops.
 */
public class PiglinWitchRenderer extends MobRenderer<PiglinWitch, PiglinWitchRenderer.Model> {
    public PiglinWitchRenderer(EntityRendererProvider.Context ctx) {
        super(ctx, new Model(ctx.bakeLayer(NetherClient.PIGLIN_WITCH)), 0.7f);
        addLayer(new GlowLayer(this));
        addLayer(new HeldItemLayer(this, ctx.getItemInHandRenderer()));
        addLayer(new SpellbookLayer(this, new net.minecraft.client.model.BookModel(ctx.bakeLayer(
                net.minecraft.client.model.geom.ModelLayers.BOOK))));
    }

    @Override
    public ResourceLocation getTextureLocation(PiglinWitch e) {
        return model.texture;
    }

    public static class Model extends WWModel<PiglinWitch> {
        final BoneChain hand;

        Model(ModelPart root) {
            super(root, "piglin_witch");
            hand = new BoneChain(root, "piglin_witch", "hand_r", this::get);
        }

        @Override
        public void setupAnim(PiglinWitch e, float limbSwing, float limbAmount, float age, float headYaw, float headPitch) {
            reset();
            if (e.isTradingSynced()) {
                play(e.tradeState, "trade", age, 1f);
            } else {
                walk("walk", limbSwing, limbAmount, 2.0f, 2.5f);
                play(e.idleState, "idle", age, 1f);
            }
            play(e.drinkState, "drink", age, 1f);
            play(e.hiccupState, "hiccup", age, 1f);
            play(e.rummageState, "rummage", age, 1f);
            play(e.refuseState, "refuse", age, 1f);
            play(e.cackleState, "cackle", age, 1f);
            play(e.throwState, "throw", age, 1f);
            // procedural touches: a drunk's slow sway, a belly that jiggles with her step, ears that flop
            float sway = Mth.sin(age * 0.07f) * 0.05f + Mth.sin(age * 0.023f) * 0.03f;
            get("body").ifPresent(p -> p.zRot += sway);
            float step = Mth.cos(limbSwing * 1.3f) * Mth.clamp(limbAmount, 0f, 1f);
            get("belly").ifPresent(p -> {
                p.yScale *= 1f + step * 0.04f;
                p.xScale *= 1f - step * 0.02f;
            });
            get("ear_l").ifPresent(p -> p.zRot += -0.1f + step * 0.25f + sway);
            get("ear_r").ifPresent(p -> p.zRot += 0.1f - step * 0.25f + sway);
            float k = e.rummageState.isStarted() || e.drinkState.isStarted() ? 0.3f : 1f;
            float yaw = Mth.clamp(headYaw, -50f, 50f) * Mth.DEG_TO_RAD * k, pitch = headPitch * Mth.DEG_TO_RAD * k;
            get("head").ifPresent(p -> {
                p.yRot += yaw * 0.8f;
                p.xRot += pitch * 0.6f;
                p.zRot -= sway * 0.6f;   // she keeps her head (more or less) level while the body sways
            });
            // casting: her right paw goes up over the book, her left hand spread over its pages
            if (e.castSpell() != PiglinWitch.Spell.NONE) {
                float c = Mth.clamp((age - e.castStartTick) / 5f, 0f, 1f);
                float shake = Mth.sin(age * 1.7f) * 0.06f * c;
                get("arm_r").ifPresent(p -> {
                    p.xRot += -2.3f * c + shake;
                    p.zRot += 0.25f * c;
                });
                get("arm_l").ifPresent(p -> {
                    p.xRot += -1.1f * c;
                    p.zRot -= 0.35f * c;
                });
            } else if (e.isFighting()) {
                get("arm_l").ifPresent(p -> p.xRot += -0.7f);   // a hand over the floating book
            }
        }
    }

    /**
     * Her spellbook while she fights: vanilla's book model, wide open, floating before her, its pages turned out to her foe,
     * bobbing, its pages riffling (faster while a spell gathers), in a hexed soul-blue, full bright.
     */
    static class SpellbookLayer extends RenderLayer<PiglinWitch, Model> {
        private final net.minecraft.client.model.BookModel book;

        SpellbookLayer(RenderLayerParent<PiglinWitch, Model> parent, net.minecraft.client.model.BookModel book) {
            super(parent);
            this.book = book;
        }

        @Override
        public void render(PoseStack pose, MultiBufferSource buffers, int light, PiglinWitch e, float limbSwing, float limbAmount,
                           float partial, float age, float headYaw, float headPitch) {
            if (!e.isFighting() || e.isInvisible()) {
                return;
            }
            boolean casting = e.castSpell() != PiglinWitch.Spell.NONE;
            pose.pushPose();
            // layer space is the model's (y down, 1.5 blocks above her feet, facing -z): out in front of her, clear of her belly
            pose.translate(0f, 1.501f - PiglinWitch.BOOK_HEIGHT - Mth.sin(age * 0.12f) * 0.05f, -PiglinWitch.BOOK_FORWARD);
            pose.scale(-1f, -1f, 1f);   // back to y up
            pose.mulPose(Axis.YP.rotationDegrees(90f + Mth.sin(age * 0.05f) * 6f));   // the open pages outward, toward her foe
            pose.mulPose(Axis.ZP.rotationDegrees(casting ? 62f : 52f));   // tilted up, as on a lectern
            pose.scale(1.2f, 1.2f, 1.2f);
            float flip = age * (casting ? 0.09f : 0.025f);
            float r = Mth.clamp(Mth.frac(flip + 0.25f) * 1.6f - 0.3f, 0f, 1f);
            float l = Mth.clamp(Mth.frac(flip + 0.75f) * 1.6f - 0.3f, 0f, 1f);
            book.setupAnim(age, r, l, 1f);
            var location = net.minecraft.client.renderer.blockentity.EnchantTableRenderer.BOOK_LOCATION;
            book.renderToBuffer(pose, location.buffer(buffers, RenderType::entityCutoutNoCull), 0xF000F0, OverlayTexture.NO_OVERLAY,
                    0xFFD8F4FF);
            // a hexed sheen over it: soul blue, brighter while a spell gathers
            int glow = casting ? 0xFF4FC8E8 : 0xFF2A7088;
            book.renderToBuffer(pose, location.buffer(buffers, RenderType::eyes), 0xF000F0, OverlayTexture.NO_OVERLAY, glow);
            pose.popPose();
        }
    }

    /** The emissive layer, when the art has one (piglin_witch_glow.png and parts flagged glow). */
    static class GlowLayer extends RenderLayer<PiglinWitch, Model> {
        GlowLayer(RenderLayerParent<PiglinWitch, Model> parent) {
            super(parent);
        }

        @Override
        public void render(PoseStack pose, MultiBufferSource buffers, int light, PiglinWitch e, float limbSwing, float limbAmount,
                           float partial, float age, float headYaw, float headPitch) {
            Model m = getParentModel();
            if (!e.isInvisible() && m.hasGlow) {
                m.renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(m.glowTexture)), 0xF000F0, OverlayTexture.NO_OVERLAY, 0xFFFFFFFF);
            }
        }
    }

    /** Her main-hand item at the hand_r bone. */
    static class HeldItemLayer extends RenderLayer<PiglinWitch, Model> {
        private final ItemInHandRenderer items;

        HeldItemLayer(RenderLayerParent<PiglinWitch, Model> parent, ItemInHandRenderer items) {
            super(parent);
            this.items = items;
        }

        @Override
        public void render(PoseStack pose, MultiBufferSource buffers, int light, PiglinWitch e, float limbSwing, float limbAmount,
                           float partial, float age, float headYaw, float headPitch) {
            ItemStack held = e.getMainHandItem();
            Model m = getParentModel();
            if (held.isEmpty() || e.isInvisible() || !m.hand.present()) {
                return;
            }
            pose.pushPose();
            m.hand.apply(pose);
            // as vanilla's held-item layer does from the arm, without the arm's length: hand_r is at the palm
            pose.mulPose(Axis.XP.rotationDegrees(-90f));
            pose.mulPose(Axis.YP.rotationDegrees(180f));
            pose.translate(1f / 16f, 0.0625f, 0f);
            items.renderItem(e, held, ItemDisplayContext.THIRD_PERSON_RIGHT_HAND, false, pose, buffers, light);
            pose.popPose();
        }
    }
}
