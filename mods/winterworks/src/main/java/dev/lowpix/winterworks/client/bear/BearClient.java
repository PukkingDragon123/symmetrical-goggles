package dev.lowpix.winterworks.client.bear;

import dev.lowpix.winterworks.registry.WWEntities;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.client.renderer.entity.NoopRenderer;
import net.minecraft.client.renderer.entity.ZombieRenderer;

/** Client side of the bear feature: polar bear, zombie polar bear and frost zombie renderers (docs/COLD_UPDATE.md 3-4). */
public final class BearClient {
    private BearClient() {}

    public static void init() {
        EntityRendererRegistry.register(WWEntities.FROST_ZOMBIE, ZombieRenderer::new);   // placeholder
        EntityRendererRegistry.register(WWEntities.ZOMBIE_POLAR_BEAR, NoopRenderer::new);   // placeholder
    }
}
