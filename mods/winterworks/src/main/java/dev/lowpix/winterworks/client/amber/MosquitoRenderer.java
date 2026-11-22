package dev.lowpix.winterworks.client.amber;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.amber.MosquitoEntity;
import dev.lowpix.winterworks.client.render.WWModel;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;

/**
 * The mosquito: lowpix model `mosquito`, textured by state (mosquito / mosquito_blood / mosquito_amber, same layout).
 * A blood mosquito's swollen abdomen glows faintly (mosquito_blood_glow if the art has one, else the abdomen re-drawn
 * emissive). Missing art draws nothing (or the missing texture) and missing clips are no-ops.
 */
public class MosquitoRenderer extends MobRenderer<MosquitoEntity, MosquitoRenderer.Model> {
    private static final ResourceLocation EMPTY = tex("mosquito"), BLOOD = tex("mosquito_blood"), AMBER = tex("mosquito_amber"),
            BLOOD_GLOW = tex("mosquito_blood_glow");

    public MosquitoRenderer(EntityRendererProvider.Context ctx) {
        super(ctx, new Model(ctx.bakeLayer(AmberClient.MOSQUITO)), 0.2f);
        addLayer(new BloodGlow(this));
    }

    private static ResourceLocation tex(String name) {
        return Winterworks.id("textures/entity/" + name + ".png");
    }

    @Override
    public ResourceLocation getTextureLocation(MosquitoEntity e) {
        return switch (e.state()) {
            case BLOOD -> BLOOD;
            case AMBER -> AMBER;
            default -> EMPTY;
        };
    }

    public static class Model extends WWModel<MosquitoEntity> {
        Model(ModelPart root) {
            super(root, "mosquito");
        }

        @Override
        public void setupAnim(MosquitoEntity e, float limbSwing, float limbAmount, float age, float headYaw, float headPitch) {
            reset();
            play(e.flyState, "fly", age, 1f);
            play(e.idleState, "idle", age, 1f);
            play(e.drinkState, "drink", age, 1f);
            play(e.stabState, "stab", age, 1f);
            play(e.spitState, "spit", age, 1f);
            float yaw = headYaw * Mth.DEG_TO_RAD, pitch = headPitch * Mth.DEG_TO_RAD;
            get("head").ifPresent(p -> {
                p.yRot += yaw * 0.5f;
                p.xRot += pitch * 0.5f;
            });
            // a full belly: swollen with blood (and throbbing a little) or with resin
            float swell = switch (e.state()) {
                case BLOOD -> 1.35f + Mth.sin(age * 0.2f) * 0.03f;
                case AMBER -> 1.3f;
                default -> 1f;
            };
            if (swell != 1f) {
                get("abdomen").ifPresent(p -> {
                    p.xScale *= swell;
                    p.yScale *= swell;
                    p.zScale *= 1f + (swell - 1f) * 0.6f;
                });
            }
        }
    }

    /** The faint glow of a belly full of blood. */
    static class BloodGlow extends RenderLayer<MosquitoEntity, Model> {
        private final boolean glowTexture;

        BloodGlow(RenderLayerParent<MosquitoEntity, Model> parent) {
            super(parent);
            this.glowTexture = Minecraft.getInstance().getResourceManager().getResource(BLOOD_GLOW).isPresent();
        }

        @Override
        public void render(PoseStack pose, MultiBufferSource buffers, int light, MosquitoEntity e, float limbSwing, float limbAmount,
                           float partial, float age, float headYaw, float headPitch) {
            if (!e.isBlood() || e.isInvisible()) {
                return;
            }
            Model m = getParentModel();
            if (glowTexture) {
                m.renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(BLOOD_GLOW)), 0xF000F0, OverlayTexture.NO_OVERLAY, 0xFFFFFFFF);
                return;
            }
            int k = (int) (90 + 30 * Mth.sin(age * 0.12f));   // additive: a dim, slowly pulsing red
            m.mask(n -> n.startsWith("abdomen"));
            m.renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(BLOOD)), 0xF000F0, OverlayTexture.NO_OVERLAY,
                    0xFF000000 | (k << 16) | ((k / 3) << 8) | (k / 3));
            m.unmask();
        }
    }
}
