package dev.lowpix.winterworks.client.endboss;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.lowpix.LowpixGeometry;
import dev.lowpix.winterworks.registry.EndEntities;
import dev.lowpix.winterworks.registry.EndParticles;
import net.fabricmc.fabric.api.client.particle.v1.ParticleFactoryRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;

/**
 * Client side of the Living End's bosses (docs/END_UPDATE.md sections 5, 10, 11): the eclipse (sky, light, fog,
 * motes, sounds), the Monolith's renderer, the dragon's light beam and its second pair of wings
 * (mixin.client.endboss.DragonModelMixin), and the dev screenshot harness (EndBossShots).
 */
public final class EndBossClient {
    public static final ModelLayerLocation MONOLITH_LAYER = new ModelLayerLocation(Winterworks.id("monolith"), "main");

    private EndBossClient() {}

    public static void init() {
        EntityModelLayerRegistry.registerModelLayer(MONOLITH_LAYER, () -> {
            try {
                return LowpixGeometry.layer(Winterworks.MOD_ID, "monolith");
            } catch (RuntimeException e) {   // the model isn't exported yet: MonolithRenderer draws its stand-in
                return LayerDefinition.create(new MeshDefinition(), 16, 16);
            }
        });
        EntityRendererRegistry.register(EndEntities.MONOLITH, MonolithRenderer::new);
        EntityRendererRegistry.register(EndEntities.DRAGON_LIGHT_BEAM, DragonLightBeamRenderer::new);
        ParticleFactoryRegistry.getInstance().register(EndParticles.ECLIPSE_MOTE, EclipseMoteParticle.Provider::new);
        EclipseClient.init();
        EndBossShots.init();
    }
}
