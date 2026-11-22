package dev.lowpix.winterworks.client.golem;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.lowpix.LowpixGeometry;
import dev.lowpix.winterworks.registry.WWEntities;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;

/** Client side of the golem feature: the Pot Golem renderer (docs/AMBER_UPDATE.md section 9). */
public final class GolemClient {
    public static final ModelLayerLocation POT_GOLEM = new ModelLayerLocation(Winterworks.id("pot_golem"), "main");

    private GolemClient() {}

    public static void init() {
        layer(POT_GOLEM, "pot_golem");
        EntityRendererRegistry.register(WWEntities.POT_GOLEM, PotGolemRenderer::new);
    }

    /** Registers a lowpix model layer; a missing export draws nothing instead of crashing (as WWLayers does). */
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
