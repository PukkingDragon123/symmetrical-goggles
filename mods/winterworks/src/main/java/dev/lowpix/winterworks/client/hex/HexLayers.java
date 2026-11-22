package dev.lowpix.winterworks.client.hex;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.lowpix.LowpixGeometry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;

/** Model layers of the hex feature, built from the lowpix exports (assets/winterworks/lowpix/<name>.geo.json). */
public final class HexLayers {
    public static final ModelLayerLocation ELIXIR_JAR = layer("elixir_jar");
    public static final ModelLayerLocation SOUL_TANK = layer("soul_tank");
    public static final ModelLayerLocation HEXING_TABLE = layer("hexing_table");
    public static final ModelLayerLocation HEX_CORE = layer("hex_core");

    private HexLayers() {}

    private static ModelLayerLocation layer(String name) {
        return new ModelLayerLocation(Winterworks.id(name), "main");
    }

    static void init() {
        reg(ELIXIR_JAR, "elixir_jar");
        reg(SOUL_TANK, "soul_tank");
        reg(HEXING_TABLE, "hexing_table");
        reg(HEX_CORE, "hex_core");
    }

    private static void reg(ModelLayerLocation layer, String name) {
        EntityModelLayerRegistry.registerModelLayer(layer, () -> {
            try {
                return LowpixGeometry.layer(Winterworks.MOD_ID, name);
            } catch (RuntimeException e) {   // a missing export must not crash the game: the renderer draws a stand-in
                Winterworks.LOG.warn("model {} is missing: {}", name, e.getMessage());
                return LayerDefinition.create(new MeshDefinition(), 16, 16);
            }
        });
    }
}
