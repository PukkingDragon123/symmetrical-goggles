package dev.lowpix.winterworks.client.amber;

import dev.lowpix.winterworks.registry.WWEntities;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.client.renderer.entity.NoopRenderer;

/** Client side of the amber feature (docs/AMBER_UPDATE.md). */
public final class AmberClient {
    private AmberClient() {}

    public static void init() {
        EntityRendererRegistry.register(WWEntities.MOSQUITO, NoopRenderer::new);   // placeholder
    }
}
