package dev.lowpix.winterworks.client.golem;

import dev.lowpix.winterworks.registry.WWEntities;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.client.renderer.entity.NoopRenderer;

/** Client side of the golem feature (docs/AMBER_UPDATE.md). */
public final class GolemClient {
    private GolemClient() {}

    public static void init() {
        EntityRendererRegistry.register(WWEntities.POT_GOLEM, NoopRenderer::new);   // placeholder
    }
}
