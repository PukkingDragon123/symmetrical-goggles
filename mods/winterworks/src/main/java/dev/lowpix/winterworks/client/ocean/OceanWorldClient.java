package dev.lowpix.winterworks.client.ocean;

import dev.lowpix.winterworks.registry.OceanBlocks;
import dev.lowpix.winterworks.registry.OceanParticles;
import net.fabricmc.fabric.api.blockrenderlayer.v1.BlockRenderLayerMap;
import net.fabricmc.fabric.api.client.particle.v1.ParticleFactoryRegistry;
import net.minecraft.client.renderer.RenderType;

/**
 * Client side of the Tides & Treasures world (world agent): the vent_smoke and bioluminescence particles, cut-out tube
 * worms, the vent's glowing mouth (VentGlowModel), and the dev screenshot harness (OceanShots).
 */
public final class OceanWorldClient {
    private OceanWorldClient() {}

    public static void init() {
        ParticleFactoryRegistry particles = ParticleFactoryRegistry.getInstance();
        particles.register(OceanParticles.VENT_SMOKE, s -> new OceanWorldParticle.Provider(s, OceanWorldParticle.Kind.SMOKE));
        particles.register(OceanParticles.BIOLUMINESCENCE, s -> new OceanWorldParticle.Provider(s, OceanWorldParticle.Kind.GLOW));
        BlockRenderLayerMap.INSTANCE.putBlock(OceanBlocks.TUBE_WORMS, RenderType.cutout());
        VentGlowModel.register();
        OceanShots.init();
    }
}
