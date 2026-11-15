// Runtime for models exported by lowpix (python -m lowpix mc export). Copied into your mod; safe to edit.
package dev.lowpix.winterworks.client.lowpix;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import net.minecraft.client.animation.AnimationChannel;
import net.minecraft.client.animation.AnimationDefinition;
import net.minecraft.client.animation.Keyframe;
import org.joml.Vector3f;

/**
 * Loads the clips baked by lowpix ({@code assets/<modid>/lowpix/<model>.anim.json}) into vanilla
 * {@link AnimationDefinition}s, the same keyframe system the Warden, Sniffer and Camel use.
 * Rotation keys are degrees, position keys are model pixels (Y down), scale keys are multipliers.
 */
public final class LowpixAnimations {
    private static final Map<String, Map<String, AnimationDefinition>> CACHE = new ConcurrentHashMap<>();

    private LowpixAnimations() {}

    public static Map<String, AnimationDefinition> load(String modid, String model) {
        return CACHE.computeIfAbsent(modid + ":" + model, k -> read(modid, model));
    }

    private static Map<String, AnimationDefinition> read(String modid, String model) {
        String path = "/assets/" + modid + "/lowpix/" + model + ".anim.json";
        Map<String, AnimationDefinition> out = new HashMap<>();
        try (InputStream in = LowpixAnimations.class.getResourceAsStream(path)) {
            if (in == null) {
                return out;
            }
            JsonObject root = JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8)).getAsJsonObject();
            JsonObject clips = root.getAsJsonObject("clips");
            for (Map.Entry<String, JsonElement> clip : clips.entrySet()) {
                JsonObject c = clip.getValue().getAsJsonObject();
                AnimationDefinition.Builder b = AnimationDefinition.Builder.withLength(c.get("length").getAsFloat());
                if (c.get("loop").getAsBoolean()) {
                    b.looping();
                }
                AnimationChannel.Interpolation interp = "linear".equals(c.has("interpolation") ? c.get("interpolation").getAsString() : "")
                        ? AnimationChannel.Interpolations.LINEAR : AnimationChannel.Interpolations.CATMULLROM;
                for (Map.Entry<String, JsonElement> bone : c.getAsJsonObject("bones").entrySet()) {
                    JsonObject chans = bone.getValue().getAsJsonObject();
                    add(b, bone.getKey(), chans, "rotation", AnimationChannel.Targets.ROTATION, interp);
                    add(b, bone.getKey(), chans, "position", AnimationChannel.Targets.POSITION, interp);
                    add(b, bone.getKey(), chans, "scale", AnimationChannel.Targets.SCALE, interp);
                }
                out.put(clip.getKey(), b.build());
            }
        } catch (Exception e) {
            throw new IllegalStateException("bad lowpix animation file " + path, e);
        }
        return out;
    }

    private static void add(AnimationDefinition.Builder b, String bone, JsonObject chans, String key,
                            AnimationChannel.Target target, AnimationChannel.Interpolation interp) {
        if (!chans.has(key)) {
            return;
        }
        JsonArray keys = chans.getAsJsonArray(key);
        List<Keyframe> frames = new ArrayList<>(keys.size());
        for (JsonElement e : keys) {
            JsonArray k = e.getAsJsonArray();
            float t = k.get(0).getAsFloat();
            float x = k.get(1).getAsFloat(), y = k.get(2).getAsFloat(), z = k.get(3).getAsFloat();
            Vector3f v = switch (key) {
                case "rotation" -> new Vector3f(x * (float) (Math.PI / 180), y * (float) (Math.PI / 180), z * (float) (Math.PI / 180));
                case "scale" -> new Vector3f(x - 1f, y - 1f, z - 1f);   // the SCALE target adds to 1
                default -> new Vector3f(x, y, z);
            };
            frames.add(new Keyframe(t, v, interp));
        }
        b.addAnimation(bone, new AnimationChannel(target, frames.toArray(new Keyframe[0])));
    }
}
