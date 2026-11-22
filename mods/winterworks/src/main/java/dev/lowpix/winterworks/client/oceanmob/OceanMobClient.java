package dev.lowpix.winterworks.client.oceanmob;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.lowpix.LowpixGeometry;
import dev.lowpix.winterworks.registry.OceanEntities;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.world.entity.EntityType;

/**
 * Client side of the Tides & Treasures creatures (docs/OCEAN_UPDATE.md sections 3, 4, 12): the anglerfish, lionfish and
 * nautilus renderers, the overhauled turtles' renderer (every vanilla turtle), and the dev-only screenshot harness.
 */
public final class OceanMobClient {
    public static final ModelLayerLocation ANGLERFISH = layer("anglerfish");
    public static final ModelLayerLocation LIONFISH = layer("lionfish");
    public static final ModelLayerLocation NAUTILUS = layer("nautilus");
    public static final ModelLayerLocation SEA_TURTLE = layer("sea_turtle");
    public static final ModelLayerLocation SEA_TURTLE_BABY = layer("sea_turtle_baby");

    private OceanMobClient() {}

    public static void init() {
        EntityRendererRegistry.register(OceanEntities.ANGLERFISH, AnglerfishRenderer::new);
        EntityRendererRegistry.register(OceanEntities.LIONFISH, LionfishRenderer::new);
        EntityRendererRegistry.register(OceanEntities.NAUTILUS, NautilusRenderer::new);
        EntityRendererRegistry.register(EntityType.TURTLE, SeaTurtleRenderer::new);
        OceanMobShots.init();
    }

    private static ModelLayerLocation layer(String name) {
        ModelLayerLocation loc = new ModelLayerLocation(Winterworks.id(name), "main");
        EntityModelLayerRegistry.registerModelLayer(loc, () -> {
            try {
                return LowpixGeometry.layer(Winterworks.MOD_ID, name);
            } catch (RuntimeException e) {   // a missing export must not crash the game: draw nothing instead
                Winterworks.LOG.error("model {} is missing: {}", name, e.getMessage());
                return LayerDefinition.create(new MeshDefinition(), 16, 16);
            }
        });
        return loc;
    }
}
