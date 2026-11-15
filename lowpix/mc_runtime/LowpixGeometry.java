// Runtime for models exported by lowpix (python -m lowpix mc export). Copied into your mod; safe to edit.
package __PACKAGE__;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeDeformation;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;

/**
 * Builds a model's LayerDefinition from {@code assets/<modid>/lowpix/<model>.geo.json}, so a mod can register
 * exported models by name: {@code EntityModelLayerRegistry.registerModelLayer(layer, () -> LowpixGeometry.layer("mymod", "seal"))}.
 * Also answers which parts are glow / tint parts.
 */
public final class LowpixGeometry {
    private LowpixGeometry() {}

    public static JsonObject read(String modid, String model) {
        String path = "/assets/" + modid + "/lowpix/" + model + ".geo.json";
        try (InputStream in = LowpixGeometry.class.getResourceAsStream(path)) {
            if (in == null) {
                throw new IllegalStateException("missing lowpix model " + path);
            }
            return JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8)).getAsJsonObject();
        } catch (java.io.IOException e) {
            throw new IllegalStateException("bad lowpix model " + path, e);
        }
    }

    public static LayerDefinition layer(String modid, String model) {
        JsonObject root = read(modid, model);
        MeshDefinition mesh = new MeshDefinition();
        Map<String, PartDefinition> defs = new HashMap<>();
        for (JsonElement e : root.getAsJsonArray("parts")) {
            JsonObject p = e.getAsJsonObject();
            String name = p.get("name").getAsString();
            PartDefinition parent = p.get("parent").isJsonNull() ? mesh.getRoot() : defs.get(p.get("parent").getAsString());
            CubeListBuilder cubes = CubeListBuilder.create();
            if (p.has("box")) {
                JsonArray b = p.getAsJsonArray("box");
                JsonArray uv = p.getAsJsonArray("uv");
                cubes.texOffs(uv.get(0).getAsInt(), uv.get(1).getAsInt()).addBox(f(b, 0), f(b, 1), f(b, 2), f(b, 3), f(b, 4), f(b, 5),
                        CubeDeformation.NONE);
            }
            JsonArray o = p.getAsJsonArray("offset"), r = p.getAsJsonArray("rotation");
            defs.put(name, parent.addOrReplaceChild(name, cubes,
                    PartPose.offsetAndRotation(f(o, 0), f(o, 1), f(o, 2), f(r, 0), f(r, 1), f(r, 2))));
        }
        JsonArray size = root.getAsJsonArray("texture_size");
        return LayerDefinition.create(mesh, size.get(0).getAsInt(), size.get(1).getAsInt());
    }

    /** Names of parts flagged "glow" or "tint" in the export. */
    public static Set<String> flagged(String modid, String model, String flag) {
        Set<String> out = new HashSet<>();
        for (JsonElement e : read(modid, model).getAsJsonArray("parts")) {
            JsonObject p = e.getAsJsonObject();
            if (p.has(flag) && p.get(flag).getAsBoolean()) {
                out.add(p.get("name").getAsString());
            }
        }
        return out;
    }

    private static float f(JsonArray a, int i) {
        return a.get(i).getAsFloat();
    }
}
