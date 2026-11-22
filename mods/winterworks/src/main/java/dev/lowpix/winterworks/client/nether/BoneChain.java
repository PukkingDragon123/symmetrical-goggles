package dev.lowpix.winterworks.client.nether;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.lowpix.LowpixGeometry;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import net.minecraft.client.model.geom.ModelPart;

/**
 * root .. a named bone of a lowpix model (from the export's parent links), walked with translateAndRotate to put a
 * held item on it with the bones' current animated pose. Empty (a no-op) when the model or the bone is missing.
 */
final class BoneChain {
    private final List<ModelPart> chain = new ArrayList<>();

    BoneChain(ModelPart root, String model, String bone, Function<String, java.util.Optional<ModelPart>> parts) {
        try {
            Map<String, String> parents = new HashMap<>();
            for (JsonElement e : LowpixGeometry.read(Winterworks.MOD_ID, model).getAsJsonArray("parts")) {
                JsonObject p = e.getAsJsonObject();
                parents.put(p.get("name").getAsString(), p.get("parent").isJsonNull() ? null : p.get("parent").getAsString());
            }
            List<ModelPart> found = new ArrayList<>();
            for (String n = bone; n != null && parents.containsKey(n); n = parents.get(n)) {
                ModelPart part = parts.apply(n).orElse(null);
                if (part == null) {
                    return;
                }
                found.add(0, part);
            }
            if (!found.isEmpty()) {
                chain.add(root);
                chain.addAll(found);
            }
        } catch (RuntimeException e) {
            // the model is missing (logged by WWModel): no chain, nothing held is drawn
        }
    }

    boolean present() {
        return !chain.isEmpty();
    }

    void apply(PoseStack pose) {
        for (ModelPart p : chain) {
            p.translateAndRotate(pose);
        }
    }
}
