package dev.lowpix.winterworks.client;

import dev.lowpix.winterworks.client.particle.GlobeSnowParticle;
import dev.lowpix.winterworks.client.particle.StunStarParticle;
import dev.lowpix.winterworks.client.render.IcebreakerRenderer;
import dev.lowpix.winterworks.client.render.LauncherItemRenderer;
import dev.lowpix.winterworks.client.render.SnowGlobeRenderer;
import dev.lowpix.winterworks.client.render.WWCartRenderer;
import dev.lowpix.winterworks.express.RailPaint;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.registry.WWParticles;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.blockrenderlayer.v1.BlockRenderLayerMap;
import net.fabricmc.fabric.api.client.model.loading.v1.ModelLoadingPlugin;
import net.fabricmc.fabric.api.client.particle.v1.ParticleFactoryRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.ColorProviderRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderers;
import net.minecraft.client.renderer.entity.ThrownItemRenderer;

public final class WinterworksClient implements ClientModInitializer {
    @Override
    public void onInitializeClient() {
        WWLayers.init();
        EntityRendererRegistry.register(WWEntities.ICEBREAKER, IcebreakerRenderer::new);
        EntityRendererRegistry.register(WWEntities.ICE_SHOT, ThrownItemRenderer::new);
        EntityRendererRegistry.register(WWEntities.COBBLE_BALL, ctx -> new ThrownItemRenderer<>(ctx, 1.4f, false));
        EntityRendererRegistry.register(WWEntities.LOCOMOTIVE, WWCartRenderer::new);
        EntityRendererRegistry.register(WWEntities.DRAGON_LOCOMOTIVE, WWCartRenderer::new);
        EntityRendererRegistry.register(WWEntities.FOX_CART, WWCartRenderer::new);
        EntityRendererRegistry.register(WWEntities.ZOMBIE_CART, WWCartRenderer::new);
        EntityRendererRegistry.register(WWEntities.TRAILER_CART, WWCartRenderer::new);
        BlockEntityRenderers.register(WWBlocks.SNOW_GLOBE_BE, SnowGlobeRenderer::new);

        LauncherItemRenderer launcher = new LauncherItemRenderer();
        BuiltinItemRendererRegistry.INSTANCE.register(WWItems.SNOWBALL_LAUNCHER, launcher);
        BuiltinItemRendererRegistry.INSTANCE.register(WWItems.SNOW_GLOBE, new SnowGlobeRenderer.Item());
        ModelLoadingPlugin.register(ctx -> ctx.addModels(LauncherItemRenderer.ICON_MODEL));

        LauncherEffects.init();
        ParticleFactoryRegistry.getInstance().register(WWParticles.GLOBE_SNOW, GlobeSnowParticle.Provider::new);
        ParticleFactoryRegistry.getInstance().register(WWParticles.STUN_STAR, StunStarParticle.Provider::new);

        BlockRenderLayerMap.INSTANCE.putBlocks(RenderType.cutout(), WWBlocks.COASTER_RAIL, WWBlocks.BOOSTER_RAIL, WWBlocks.LIFT_RAIL,
                WWBlocks.TRAP_RAIL, WWBlocks.DROP_RAIL, WWBlocks.DROP_RAIL_OPEN);
        ColorProviderRegistry.BLOCK.register((state, view, pos, tint) -> tint == 0 ? RailPaint.tint(state) : -1,
                WWBlocks.COASTER_RAIL, WWBlocks.BOOSTER_RAIL, WWBlocks.LIFT_RAIL, WWBlocks.TRAP_RAIL, WWBlocks.DROP_RAIL,
                WWBlocks.DROP_RAIL_OPEN);
        ColorProviderRegistry.ITEM.register((stack, tint) -> tint == 0 ? 0xFF8A6B47 : -1,
                WWItems.COASTER_RAIL, WWItems.BOOSTER_RAIL, WWItems.LIFT_RAIL, WWItems.TRAP_RAIL, WWItems.DROP_RAIL);
        ClientTrains.init();
        ShowcaseDirector.init();
    }
}
