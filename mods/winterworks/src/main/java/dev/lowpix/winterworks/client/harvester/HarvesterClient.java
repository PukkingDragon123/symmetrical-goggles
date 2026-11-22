package dev.lowpix.winterworks.client.harvester;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.lowpix.LowpixGeometry;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWParticles;
import net.fabricmc.fabric.api.blockrenderlayer.v1.BlockRenderLayerMap;
import net.fabricmc.fabric.api.client.particle.v1.ParticleFactoryRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.renderer.RenderType;

/**
 * Client side of the Harvester and the Amber Age plant fixes (docs/FIXES_0_4.md): the Harvester's renderer, the egg's
 * render layer, the pitcher plant's sweet scent particle, the torchflower / pitcher plant glow (GlowMaskSource +
 * GlowPlantModel) and the dev-only screenshot harness (HarvesterShots). The sniffer's sneeze is played by
 * mixin.harvester.client.SnifferSneezeModelMixin.
 */
public final class HarvesterClient {
    public static final ModelLayerLocation HARVESTER = new ModelLayerLocation(Winterworks.id("harvester"), "main");

    private HarvesterClient() {}

    public static void init() {
        EntityModelLayerRegistry.registerModelLayer(HARVESTER, () -> {
            try {
                return LowpixGeometry.layer(Winterworks.MOD_ID, "harvester");
            } catch (RuntimeException e) {   // a missing export must not crash the game: draw nothing instead
                Winterworks.LOG.error("model harvester is missing: {}", e.getMessage());
                return LayerDefinition.create(new MeshDefinition(), 16, 16);
            }
        });
        EntityRendererRegistry.register(WWEntities.HARVESTER, HarvesterRenderer::new);
        BlockRenderLayerMap.INSTANCE.putBlock(WWBlocks.HARVESTER_EGG, RenderType.cutout());
        ParticleFactoryRegistry.getInstance().register(WWParticles.SWEET_SCENT, SweetScentParticle.Provider::new);
        GlowMaskSource.register();
        GlowPlantModel.register();
        HarvesterShots.init();
    }
}
