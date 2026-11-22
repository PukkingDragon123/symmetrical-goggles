package dev.lowpix.winterworks.client.nether;

/** Client side of the nether feature (docs/HEXES_UPDATE.md). */
public final class NetherClient {
    private NetherClient() {}

    public static void init() {
        net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry.register(
                dev.lowpix.winterworks.registry.WWEntities.PIGLIN_WITCH, net.minecraft.client.renderer.entity.NoopRenderer::new);
        net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry.register(
                dev.lowpix.winterworks.registry.WWEntities.GOLDEN_PIGLIN, net.minecraft.client.renderer.entity.NoopRenderer::new);
    }
}
