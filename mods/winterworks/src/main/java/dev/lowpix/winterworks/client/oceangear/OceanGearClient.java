package dev.lowpix.winterworks.client.oceangear;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.lowpix.EyeOfTheOceanModel;
import dev.lowpix.winterworks.client.lowpix.ElderGuardianModel;
import dev.lowpix.winterworks.client.lowpix.TurtleShellArmorModel;
import dev.lowpix.winterworks.client.lowpix.TurtleShellRetreatModel;
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
import net.minecraft.client.model.geom.ModelLayerLocation;
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
        EntityModelLayerRegistry.registerModelLayer(ELDER_GUARDIAN, ElderGuardianModel::createBodyLayer);
        EntityModelLayerRegistry.registerModelLayer(EYE_OF_THE_OCEAN, EyeOfTheOceanModel::createBodyLayer);
        EntityModelLayerRegistry.registerModelLayer(TURTLE_SHELL_ARMOR, TurtleShellArmorModel::createBodyLayer);
        EntityModelLayerRegistry.registerModelLayer(TURTLE_SHELL_RETREAT, TurtleShellRetreatModel::createBodyLayer);
        EntityRendererRegistry.register(EntityType.ELDER_GUARDIAN, ElderGuardianBossRenderer::new);
        EntityRendererRegistry.register(OceanEntities.ELDER_BUBBLE, ElderBubbleRenderer::new);
        EntityRendererRegistry.register(OceanEntities.LIONFISH_DART, DartRenderer::new);
        BlockEntityRenderers.register(OceanBlocks.EYE_OF_THE_OCEAN_BE, EyeOfTheOceanRenderer::new);
        BuiltinItemRendererRegistry.INSTANCE.register(OceanBlocks.EYE_OF_THE_OCEAN.asItem(), new EyeOfTheOceanRenderer.Item());
        ArmorRenderer.register(new TurtleShellRenderers.Chestplate(), OceanItems.TURTLE_SHELL_CHESTPLATE);
        ParticleFactoryRegistry.getInstance().register(WWParticles.ELDER_BUBBLE, ElderBubbleParticle.Provider::new);
        OceanGearShots.init();
    }

    /** Lionfish darts: the arrow renderer with the dart's own texture (arrow layout). */
    static final class DartRenderer extends ArrowRenderer<LionfishDart> {
        static final ResourceLocation TEXTURE = Winterworks.id("textures/entity/projectiles/lionfish_dart.png");

        DartRenderer(EntityRendererProvider.Context ctx) {
            super(ctx);
        }

        @Override
        public ResourceLocation getTextureLocation(LionfishDart e) {
            return TEXTURE;
        }
    }
}
