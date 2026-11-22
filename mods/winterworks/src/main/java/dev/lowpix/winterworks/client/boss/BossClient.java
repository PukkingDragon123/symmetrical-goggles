package dev.lowpix.winterworks.client.boss;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.lowpix.LowpixGeometry;
import dev.lowpix.winterworks.net.CameraShakePayload;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWItems;
import net.fabricmc.fabric.api.blockrenderlayer.v1.BlockRenderLayerMap;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback;
import net.fabricmc.fabric.api.client.model.loading.v1.ModelLoadingPlugin;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.ChatFormatting;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderers;
import net.minecraft.network.chat.Component;

/** Client side of the boss feature: renderers, model layers, render layers, camera shake (docs/COLD_UPDATE.md 6-8). */
public final class BossClient {
    public static final ModelLayerLocation MAULER_LAYER = new ModelLayerLocation(Winterworks.id("frost_mauler"), "main");
    public static final ModelLayerLocation SKULL_LAYER = new ModelLayerLocation(Winterworks.id("frost_mauler_skull"), "main");

    private BossClient() {}

    public static void init() {
        layer(MAULER_LAYER, "frost_mauler");
        layer(SKULL_LAYER, "frost_mauler_skull");
        EntityRendererRegistry.register(WWEntities.FROST_MAULER, FrostMaulerRenderer::new);
        EntityRendererRegistry.register(WWEntities.FALLING_ICICLE, FallingIcicleRenderer::new);
        BlockEntityRenderers.register(WWBlocks.FROST_MAULER_SKULL_BE, FrostMaulerSkullRenderer::new);
        BuiltinItemRendererRegistry.INSTANCE.register(WWItems.FROST_MAULER_SKULL, new FrostMaulerSkullRenderer.Item());
        ModelLoadingPlugin.register(ctx -> ctx.addModels(FrostMaulerSkullRenderer.ICON_MODEL));
        BlockRenderLayerMap.INSTANCE.putBlock(WWBlocks.ANCIENT_ICE, RenderType.translucent());
        BlockRenderLayerMap.INSTANCE.putBlock(WWBlocks.ICICLE, RenderType.translucent());

        ClientPlayNetworking.registerGlobalReceiver(CameraShakePayload.TYPE, (payload, ctx) -> CameraShake.add(payload.strength(), payload.ticks()));
        ClientTickEvents.END_CLIENT_TICK.register(mc -> CameraShake.tick());
        ClientPlayConnectionEvents.DISCONNECT.register((handler, mc) -> CameraShake.clear());

        ItemTooltipCallback.EVENT.register((stack, context, type, lines) -> {
            if (stack.is(WWItems.ANCIENT_ICE)) {
                lines.add(Component.translatable("block.winterworks.ancient_ice.tip").withStyle(ChatFormatting.AQUA));
            } else if (stack.is(WWItems.FROST_MAULER_SKULL)) {
                lines.add(Component.translatable("block.winterworks.frost_mauler_skull.tip").withStyle(ChatFormatting.GRAY));
            }
        });
    }

    /** Like WWLayers: a missing lowpix export draws nothing instead of crashing the game. */
    private static void layer(ModelLayerLocation layer, String name) {
        EntityModelLayerRegistry.registerModelLayer(layer, () -> {
            try {
                return LowpixGeometry.layer(Winterworks.MOD_ID, name);
            } catch (RuntimeException e) {
                Winterworks.LOG.error("model {} is missing: {}", name, e.getMessage());
                return LayerDefinition.create(new MeshDefinition(), 16, 16);
            }
        });
    }
}
