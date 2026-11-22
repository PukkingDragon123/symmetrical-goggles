package dev.lowpix.winterworks.client.bear;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.lowpix.LowpixGeometry;
import dev.lowpix.winterworks.registry.WWEntities;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.PolarBearRenderer;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.animal.PolarBear;

/** Client side of the bear feature: polar bear, zombie polar bear and frost zombie renderers (docs/COLD_UPDATE.md 3-4). */
public final class BearClient {
    public static final ModelLayerLocation POLAR_BEAR = new ModelLayerLocation(Winterworks.id("polar_bear"), "main");
    public static final ModelLayerLocation POLAR_BEAR_CUB = new ModelLayerLocation(Winterworks.id("polar_bear_cub"), "main");

    private BearClient() {}

    public static void init() {
        layer(POLAR_BEAR, "polar_bear");
        layer(POLAR_BEAR_CUB, "polar_bear_cub");
        // every vanilla polar bear gets the remade model (the vanilla look stays if the model is missing)
        EntityRendererRegistry.register(EntityType.POLAR_BEAR, ctx -> {
            EntityRenderer<PolarBear> r = hasModel("polar_bear") ? new RemadePolarBearRenderer(ctx) : new PolarBearRenderer(ctx);
            return r;
        });
        EntityRendererRegistry.register(WWEntities.ZOMBIE_POLAR_BEAR, ZombiePolarBearRenderer::new);
        EntityRendererRegistry.register(WWEntities.FROST_ZOMBIE, FrostZombieRenderer::new);
    }

    /** Is the lowpix export assets/winterworks/lowpix/<name>.geo.json there? */
    public static boolean hasModel(String name) {
        return BearClient.class.getResource("/assets/" + Winterworks.MOD_ID + "/lowpix/" + name + ".geo.json") != null;
    }

    /** Does a resource (a texture) exist in the loaded resource packs? */
    public static boolean exists(ResourceLocation loc) {
        return Minecraft.getInstance().getResourceManager().getResource(loc).isPresent();
    }

    /** A model layer built from a lowpix export; a missing export draws nothing instead of crashing (as WWLayers does). */
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
