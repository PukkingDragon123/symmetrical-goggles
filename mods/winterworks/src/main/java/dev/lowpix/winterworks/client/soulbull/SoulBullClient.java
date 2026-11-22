package dev.lowpix.winterworks.client.soulbull;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.lowpix.LowpixGeometry;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWItems;
import net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.ChatFormatting;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderers;
import net.minecraft.network.chat.Component;

/** Client side of the Soul Bull (docs/FIXES_0_4.md): its renderer, the skull's, the 3D skull item and the soul bar. */
public final class SoulBullClient {
    public static final ModelLayerLocation BULL_LAYER = new ModelLayerLocation(Winterworks.id("soul_bull"), "main");
    public static final ModelLayerLocation SKULL_LAYER = new ModelLayerLocation(Winterworks.id("soul_bull_skull"), "main");

    private SoulBullClient() {}

    public static void init() {
        layer(BULL_LAYER, "soul_bull");
        layer(SKULL_LAYER, "soul_bull_skull");
        EntityRendererRegistry.register(WWEntities.SOUL_BULL, SoulBullRenderer::new);
        BlockEntityRenderers.register(WWBlocks.SOUL_BULL_SKULL_BE, SoulBullSkullRenderer::new);
        BuiltinItemRendererRegistry.INSTANCE.register(WWItems.SOUL_BULL_SKULL, new SoulBullSkullRenderer.Item());
        ItemTooltipCallback.EVENT.register((stack, context, type, lines) -> {
            if (stack.is(WWItems.SOUL_BULL_SKULL)) {
                lines.add(Component.translatable("block.winterworks.soul_bull_skull.tip").withStyle(ChatFormatting.GRAY));
            }
        });
        SoulBullShots.init();
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
