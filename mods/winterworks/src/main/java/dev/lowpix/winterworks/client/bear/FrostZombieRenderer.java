package dev.lowpix.winterworks.client.bear;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.bear.FrostZombie;
import net.minecraft.client.model.ZombieModel;
import net.minecraft.client.model.geom.EntityModelSet;
import net.minecraft.client.model.geom.ModelLayers;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.AbstractZombieRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.monster.Zombie;

/**
 * The frost zombie (docs/COLD_UPDATE.md section 4): vanilla zombie geometry with its own 64x64 skin (zombie UV layout), an
 * outer frost layer drawn like the drowned's (the drowned outer-layer geometry and UV layout) and glowing eyes.
 */
public class FrostZombieRenderer extends AbstractZombieRenderer<FrostZombie, ZombieModel<FrostZombie>> {
    public static final ResourceLocation TEXTURE = Winterworks.id("textures/entity/frost_zombie.png");
    public static final ResourceLocation OUTER = Winterworks.id("textures/entity/frost_zombie_outer.png");
    public static final ResourceLocation EYES = Winterworks.id("textures/entity/frost_zombie_eyes.png");
    private static final ResourceLocation VANILLA = ResourceLocation.withDefaultNamespace("textures/entity/zombie/zombie.png");
    private final ResourceLocation texture;

    public FrostZombieRenderer(EntityRendererProvider.Context ctx) {
        super(ctx, new ZombieModel<>(ctx.bakeLayer(ModelLayers.ZOMBIE)), new ZombieModel<>(ctx.bakeLayer(ModelLayers.ZOMBIE_INNER_ARMOR)),
                new ZombieModel<>(ctx.bakeLayer(ModelLayers.ZOMBIE_OUTER_ARMOR)));
        texture = BearClient.exists(TEXTURE) ? TEXTURE : VANILLA;   // missing art: a plain zombie rather than a checkerboard
        if (BearClient.exists(OUTER)) {
            addLayer(new FrostLayer(this, ctx.getModelSet()));
        }
        if (BearClient.exists(EYES)) {
            addLayer(new GlowEyesLayer<>(this, EYES));
        }
    }

    @Override
    public ResourceLocation getTextureLocation(Zombie zombie) {
        return texture;
    }

    /** The outer frost crust: the zombie re-drawn slightly larger, like the drowned's outer layer. */
    static class FrostLayer extends RenderLayer<FrostZombie, ZombieModel<FrostZombie>> {
        private final ZombieModel<FrostZombie> crust;

        FrostLayer(RenderLayerParent<FrostZombie, ZombieModel<FrostZombie>> parent, EntityModelSet models) {
            super(parent);
            this.crust = new ZombieModel<>(models.bakeLayer(ModelLayers.DROWNED_OUTER_LAYER));
        }

        @Override
        public void render(PoseStack pose, MultiBufferSource buffers, int light, FrostZombie zombie, float limbSwing, float limbAmount,
                           float partial, float age, float headYaw, float headPitch) {
            coloredCutoutModelCopyLayerRender(getParentModel(), crust, OUTER, pose, buffers, light, zombie, limbSwing, limbAmount, age,
                    headYaw, headPitch, partial, -1);
        }
    }
}
