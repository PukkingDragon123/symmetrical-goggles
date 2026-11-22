package dev.lowpix.winterworks.client.oceangear;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.lowpix.LowpixGeometry;
import dev.lowpix.winterworks.oceangear.LionfishDart;
import dev.lowpix.winterworks.registry.OceanBlocks;
import dev.lowpix.winterworks.registry.OceanEntities;
import dev.lowpix.winterworks.registry.OceanItems;
import dev.lowpix.winterworks.registry.WWParticles;
import net.fabricmc.fabric.api.client.particle.v1.ParticleFactoryRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.ArmorRenderer;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import com.mojang.math.Axis;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.util.Mth;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderers;
import net.minecraft.client.renderer.entity.ArrowRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.EntityType;

/**
 * Client side of Tides & Treasures' gear and boss (docs/OCEAN_UPDATE.md sections 4-6, 11-12): the Elder Guardian boss
 * renderer (replacing vanilla's), its bubbles and their particle, lionfish darts, the Turtle Shell chestplate and
 * retreat, the Eye of the Ocean, and the dev-only screenshot harness (OceanGearShots).
 */
public final class OceanGearClient {
    public static final ModelLayerLocation ELDER_GUARDIAN = new ModelLayerLocation(Winterworks.id("elder_guardian"), "main");
    public static final ModelLayerLocation EYE_OF_THE_OCEAN = new ModelLayerLocation(Winterworks.id("eye_of_the_ocean"), "main");
    public static final ModelLayerLocation TURTLE_SHELL_ARMOR = new ModelLayerLocation(Winterworks.id("turtle_shell_armor"), "main");
    public static final ModelLayerLocation TURTLE_SHELL_RETREAT = new ModelLayerLocation(Winterworks.id("turtle_shell_retreat"), "main");

    private OceanGearClient() {}

    public static void init() {
        layer(ELDER_GUARDIAN, "elder_guardian");
        layer(EYE_OF_THE_OCEAN, "eye_of_the_ocean");
        layer(TURTLE_SHELL_ARMOR, "turtle_shell_armor");
        layer(TURTLE_SHELL_RETREAT, "turtle_shell_retreat");
        EntityRendererRegistry.register(EntityType.ELDER_GUARDIAN, ElderGuardianBossRenderer::new);
        EntityRendererRegistry.register(OceanEntities.ELDER_BUBBLE, ElderBubbleRenderer::new);
        EntityRendererRegistry.register(OceanEntities.LIONFISH_DART, DartRenderer::new);
        BlockEntityRenderers.register(OceanBlocks.EYE_OF_THE_OCEAN_BE, EyeOfTheOceanRenderer::new);
        BuiltinItemRendererRegistry.INSTANCE.register(OceanBlocks.EYE_OF_THE_OCEAN.asItem(), new EyeOfTheOceanRenderer.Item());
        ArmorRenderer.register(new TurtleShellRenderers.Chestplate(), OceanItems.TURTLE_SHELL_CHESTPLATE);
        ParticleFactoryRegistry.getInstance().register(WWParticles.ELDER_BUBBLE, ElderBubbleParticle.Provider::new);
        OceanGearShots.init();
    }

    /** A model layer straight from its lowpix export (assets/winterworks/lowpix/<name>.geo.json), so re-exports just work. */
    private static void layer(ModelLayerLocation loc, String name) {
        EntityModelLayerRegistry.registerModelLayer(loc, () -> {
            try {
                return LowpixGeometry.layer(Winterworks.MOD_ID, name);
            } catch (RuntimeException e) {   // a missing export must not crash the game: draw nothing instead
                Winterworks.LOG.error("model {} is missing: {}", name, e.getMessage());
                return LayerDefinition.create(new MeshDefinition(), 16, 16);
            }
        });
    }

    /**
     * Lionfish darts: vanilla's arrow geometry with the dart's own texture (arrow layout), its cross-section half as thick
     * again so the needle-thin spine reads at a distance.
     */
    static final class DartRenderer extends ArrowRenderer<LionfishDart> {
        static final ResourceLocation TEXTURE = Winterworks.id("textures/entity/projectiles/lionfish_dart.png");

        DartRenderer(EntityRendererProvider.Context ctx) {
            super(ctx);
        }

        @Override
        public ResourceLocation getTextureLocation(LionfishDart e) {
            return TEXTURE;
        }

        @Override
        public void render(LionfishDart d, float yaw, float partial, PoseStack pose, MultiBufferSource buffers, int light) {
            pose.pushPose();
            pose.mulPose(Axis.YP.rotationDegrees(Mth.lerp(partial, d.yRotO, d.getYRot()) - 90f));
            pose.mulPose(Axis.ZP.rotationDegrees(Mth.lerp(partial, d.xRotO, d.getXRot())));
            float shake = d.shakeTime - partial;
            if (shake > 0) {
                pose.mulPose(Axis.ZP.rotationDegrees(-Mth.sin(shake * 3f) * shake));
            }
            pose.mulPose(Axis.XP.rotationDegrees(45f));
            pose.scale(0.05625f, 0.05625f * 1.5f, 0.05625f * 1.5f);
            pose.translate(-4f, 0f, 0f);
            VertexConsumer vc = buffers.getBuffer(RenderType.entityCutout(TEXTURE));
            PoseStack.Pose p = pose.last();
            vertex(p, vc, -7, -2, -2, 0f, 0.15625f, -1, 0, 0, light);
            vertex(p, vc, -7, -2, 2, 0.15625f, 0.15625f, -1, 0, 0, light);
            vertex(p, vc, -7, 2, 2, 0.15625f, 0.3125f, -1, 0, 0, light);
            vertex(p, vc, -7, 2, -2, 0f, 0.3125f, -1, 0, 0, light);
            vertex(p, vc, -7, 2, -2, 0f, 0.15625f, 1, 0, 0, light);
            vertex(p, vc, -7, 2, 2, 0.15625f, 0.15625f, 1, 0, 0, light);
            vertex(p, vc, -7, -2, 2, 0.15625f, 0.3125f, 1, 0, 0, light);
            vertex(p, vc, -7, -2, -2, 0f, 0.3125f, 1, 0, 0, light);
            for (int i = 0; i < 4; i++) {
                pose.mulPose(Axis.XP.rotationDegrees(90f));
                vertex(p, vc, -8, -2, 0, 0f, 0f, 0, 1, 0, light);
                vertex(p, vc, 8, -2, 0, 0.5f, 0f, 0, 1, 0, light);
                vertex(p, vc, 8, 2, 0, 0.5f, 0.15625f, 0, 1, 0, light);
                vertex(p, vc, -8, 2, 0, 0f, 0.15625f, 0, 1, 0, light);
            }
            pose.popPose();
        }
    }
}
