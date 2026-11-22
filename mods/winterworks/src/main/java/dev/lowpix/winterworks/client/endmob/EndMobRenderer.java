package dev.lowpix.winterworks.client.endmob;

import com.mojang.blaze3d.vertex.PoseStack;
import java.util.function.Predicate;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.Mob;

/** The End mobs' renderers: an {@link EndMobModel} (export or stand-in) and its glow pass. */
abstract class EndMobRenderer<T extends Mob> extends MobRenderer<T, EndMobModel<T>> {
    EndMobRenderer(EntityRendererProvider.Context ctx, EndMobModel<T> model, float shadow) {
        super(ctx, model, shadow);
        addLayer(new Glow<>(this));
    }

    @Override
    public ResourceLocation getTextureLocation(T e) {
        return model.texture;
    }

    /** Glow parts to leave dark right now (e.g. a shut eye). */
    protected Predicate<String> darkGlow(T e) {
        return n -> false;
    }

    /** How bright the glow pass is (ARGB multiplier). */
    protected int glowColor(T e, float partial) {
        return 0xFFFFFFFF;
    }

    static final class Glow<T extends Mob> extends RenderLayer<T, EndMobModel<T>> {
        private final EndMobRenderer<T> renderer;

        Glow(EndMobRenderer<T> parent) {
            super(parent);
            this.renderer = parent;
        }

        @Override
        public void render(PoseStack pose, MultiBufferSource buffers, int light, T e, float limbSwing, float limbAmount, float partial,
                           float age, float headYaw, float headPitch) {
            if (!e.isInvisible()) {
                getParentModel().renderGlow(pose, buffers, renderer.glowColor(e, partial), renderer.darkGlow(e));
            }
        }
    }
}
