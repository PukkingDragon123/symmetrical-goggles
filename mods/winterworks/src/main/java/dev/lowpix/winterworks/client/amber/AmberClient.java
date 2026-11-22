package dev.lowpix.winterworks.client.amber;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.amber.AmberFeature;
import dev.lowpix.winterworks.client.lowpix.LowpixGeometry;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEntities;
import net.fabricmc.fabric.api.blockrenderlayer.v1.BlockRenderLayerMap;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderers;

/**
 * Client side of the amber feature (docs/AMBER_UPDATE.md, docs/FIXES_0_4.md): the mosquito, amber inclusions in 3D,
 * the Amberwood boats and the block render layers. Amberwood signs and hanging signs use vanilla's sign renderers
 * (their textures come from the WoodType, amber.Amberwood).
 */
public final class AmberClient {
    public static final ModelLayerLocation MOSQUITO = layer("mosquito");
    /** The seed trapped in amber (lowpix `amber_seed`, from the art). */
    public static final ModelLayerLocation AMBER_SEED = layer("amber_seed");

    private AmberClient() {}

    public static void init() {
        reg(MOSQUITO, "mosquito");
        reg(AMBER_SEED, "amber_seed");
        EntityRendererRegistry.register(WWEntities.MOSQUITO, MosquitoRenderer::new);
        BlockEntityRenderers.register(AmberFeature.AMBER_INCLUSION_BE, AmberInclusionRenderer::new);
        BlockRenderLayerMap.INSTANCE.putBlock(WWBlocks.AMBER_BLOCK, RenderType.translucent());   // see-through amber
        BlockRenderLayerMap.INSTANCE.putBlocks(RenderType.cutout(), WWBlocks.AMBERWOOD_BLOOM, WWBlocks.BLOOD_STAIN,
                WWBlocks.AMBERWOOD_DOOR, WWBlocks.AMBERWOOD_TRAPDOOR);
        // ---- 0.4 fixes: amber
        EntityRendererRegistry.register(WWEntities.AMBERWOOD_BOAT, ctx -> new AmberwoodBoatRenderer(ctx, false));
        EntityRendererRegistry.register(WWEntities.AMBERWOOD_CHEST_BOAT, ctx -> new AmberwoodBoatRenderer(ctx, true));
        AmberShots.init();
    }

    private static ModelLayerLocation layer(String name) {
        return new ModelLayerLocation(Winterworks.id(name), "main");
    }

    /** Same fallback as client.WWLayers: a missing lowpix export draws nothing instead of crashing. */
    private static void reg(ModelLayerLocation layer, String name) {
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
