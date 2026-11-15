package dev.lowpix.winterworks.client;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.lowpix.LowpixGeometry;
import dev.lowpix.winterworks.express.CartKind;
import java.util.EnumMap;
import java.util.Map;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.minecraft.client.model.geom.ModelLayerLocation;

/** Model layers, built from the lowpix exports (assets/winterworks/lowpix/<name>.geo.json). */
public final class WWLayers {
    public static final ModelLayerLocation ICEBREAKER = layer("icebreaker");
    public static final ModelLayerLocation ICEBREAKER_CUB = layer("icebreaker_cub");
    public static final ModelLayerLocation LAUNCHER = layer("snowball_launcher");
    public static final ModelLayerLocation SNOW_GLOBE = layer("snow_globe");
    private static final Map<CartKind, ModelLayerLocation> CARTS = new EnumMap<>(CartKind.class);

    static {
        for (CartKind k : CartKind.values()) {
            CARTS.put(k, new ModelLayerLocation(Winterworks.id(k.id), "main"));
        }
    }

    private WWLayers() {}

    private static ModelLayerLocation layer(String name) {
        return new ModelLayerLocation(Winterworks.id(name), "main");
    }

    public static ModelLayerLocation cart(CartKind k) {
        return CARTS.get(k);
    }

    public static void init() {
        reg(ICEBREAKER, "icebreaker");
        reg(ICEBREAKER_CUB, "icebreaker_cub");
        reg(LAUNCHER, "snowball_launcher");
        reg(SNOW_GLOBE, "snow_globe");
        for (CartKind k : CartKind.values()) {
            reg(CARTS.get(k), k.id);
        }
    }

    private static void reg(ModelLayerLocation layer, String name) {
        EntityModelLayerRegistry.registerModelLayer(layer, () -> {
            try {
                return LowpixGeometry.layer(Winterworks.MOD_ID, name);
            } catch (RuntimeException e) {   // a missing export must not crash the game: draw nothing instead
                Winterworks.LOG.error("model {} is missing: {}", name, e.getMessage());
                return net.minecraft.client.model.geom.builders.LayerDefinition.create(
                        new net.minecraft.client.model.geom.builders.MeshDefinition(), 16, 16);
            }
        });
    }
}
