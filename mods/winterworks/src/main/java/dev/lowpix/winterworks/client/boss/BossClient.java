package dev.lowpix.winterworks.client.boss;

import dev.lowpix.winterworks.registry.WWEntities;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.client.renderer.entity.NoopRenderer;

/** Client side of the boss feature: renderers, camera shake (docs/COLD_UPDATE.md 6-8). */
public final class BossClient {
    private BossClient() {}

    public static void init() {
        EntityRendererRegistry.register(WWEntities.FROST_MAULER, NoopRenderer::new);   // placeholder
        EntityRendererRegistry.register(WWEntities.FALLING_ICICLE, NoopRenderer::new);   // placeholder
    }
}
