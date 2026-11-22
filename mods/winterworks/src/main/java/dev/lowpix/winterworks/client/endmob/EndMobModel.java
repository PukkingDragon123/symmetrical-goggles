package dev.lowpix.winterworks.client.endmob;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.lowpix.LowpixEntityModel;
import dev.lowpix.winterworks.client.lowpix.LowpixGeometry;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Predicate;
import net.minecraft.client.Minecraft;
import net.minecraft.client.animation.AnimationDefinition;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.FastColor;
import net.minecraft.world.entity.Entity;

/**
 * An End mob's model: the lowpix export (`assets/winterworks/lowpix/<name>.geo.json`, textures/entity/<name>.png and
 * the `_glow` layer) when the mod has it, else its {@link StandIn} (flat-coloured boxes on vanilla's white texture, its
 * own clips). Either way parts are found by the contract's bone names and clips play by the contract's clip names, so
 * the renderers don't care which one they have.
 */
public abstract class EndMobModel<T extends Entity> extends LowpixEntityModel<T> {
    static final ResourceLocation WHITE = ResourceLocation.withDefaultNamespace("textures/misc/white.png");

    public final String name;
    public final boolean exported;
    public final ResourceLocation texture, glowTexture;
    public final boolean hasGlow;
    private final Map<String, ModelPart> parts = new LinkedHashMap<>();
    private final Map<String, String> parents = new HashMap<>();
    private final Map<String, Integer> colors;
    private final Map<String, Integer> glows;

    public EndMobModel(ModelPart root, String name) {
        super(root, Winterworks.MOD_ID, name);
        this.name = name;
        this.exported = isExported(name);
        StandIn s = exported ? null : StandIns.forModel(name);
        if (exported) {
            texture = Winterworks.id("textures/entity/" + name + ".png");
            glowTexture = Winterworks.id("textures/entity/" + name + "_glow.png");
            JsonObject geo = LowpixGeometry.read(Winterworks.MOD_ID, name);
            for (JsonElement e : geo.getAsJsonArray("parts")) {
                JsonObject p = e.getAsJsonObject();
                String n = p.get("name").getAsString();
                parents.put(n, p.get("parent").isJsonNull() ? null : p.get("parent").getAsString());
                maybePart(n).ifPresent(part -> parts.put(n, part));
            }
            colors = Map.of();
            glows = Map.of();
            hasGlow = !LowpixGeometry.flagged(Winterworks.MOD_ID, name, "glow").isEmpty()
                    && Minecraft.getInstance().getResourceManager().getResource(glowTexture).isPresent();
        } else {
            texture = WHITE;
            glowTexture = WHITE;
            parents.putAll(s.parents);
            for (String n : s.parents.keySet()) {
                maybePart(n).ifPresent(part -> parts.put(n, part));
            }
            colors = s.colors;
            glows = s.glows;
            hasGlow = !glows.isEmpty();
            for (Map.Entry<String, AnimationDefinition> c : s.clips.entrySet()) {
                clips.putIfAbsent(c.getKey(), c.getValue());
            }
        }
    }

    /** Whether the lowpix export of `name` is in the mod (else the stand-in is used). */
    public static boolean isExported(String name) {
        return LowpixGeometry.class.getResource("/assets/" + Winterworks.MOD_ID + "/lowpix/" + name + ".geo.json") != null;
    }

    /** The model layer: the export, else the stand-in. */
    static LayerDefinition layer(String name) {
        if (isExported(name)) {
            try {
                return LowpixGeometry.layer(Winterworks.MOD_ID, name);
            } catch (RuntimeException e) {
                Winterworks.LOG.error("model {} is broken, using its stand-in: {}", name, e.getMessage());
            }
        }
        return StandIns.forModel(name).layer();
    }

    static ModelPart bake(ModelLayerLocation layer) {
        return Minecraft.getInstance().getEntityModels().bakeLayer(layer);
    }

    public Optional<ModelPart> get(String bone) {
        return Optional.ofNullable(parts.get(bone));
    }

    public boolean has(String bone) {
        return parts.containsKey(bone);
    }

    public void reset() {
        resetPose();
        parts.values().forEach(p -> p.skipDraw = false);
    }

    /** Clip length in seconds, 0 if missing. */
    public float length(String clip) {
        AnimationDefinition d = clips.get(clip);
        return d == null ? 0f : d.lengthInSeconds();
    }

    /** Poses a one-shot clip at a fraction (0..1) of its length; missing clips are no-ops. */
    public void at(String clip, float fraction) {
        float len = length(clip);
        if (len > 0) {
            poseAt(clip, Math.max(0f, Math.min(1f, fraction)) * len);
        }
    }

    /** root .. `bone`, for translateAndRotate'ing something onto the bone with its animated pose (empty if missing). */
    public List<ModelPart> chain(String bone) {
        List<ModelPart> out = new ArrayList<>();
        for (String n = bone; n != null; n = parents.get(n)) {
            ModelPart p = parts.get(n);
            if (p == null) {
                return List.of();
            }
            out.add(0, p);
            if (!parents.containsKey(n)) {
                break;
            }
        }
        out.add(0, root);
        return out;
    }

    public void applyChain(List<ModelPart> chain, PoseStack pose) {
        for (ModelPart p : chain) {
            p.translateAndRotate(pose);
        }
    }

    private void mask(Predicate<String> keep) {
        parts.forEach((n, p) -> p.skipDraw = !keep.test(n));
    }

    private void unmask() {
        parts.values().forEach(p -> p.skipDraw = false);
    }

    /** The base pass: the export as is; the stand-in one flat colour at a time (all on the white texture). */
    @Override
    public void renderToBuffer(PoseStack pose, VertexConsumer buffer, int light, int overlay, int color) {
        if (exported) {
            super.renderToBuffer(pose, buffer, light, overlay, color);
            return;
        }
        Map<Integer, List<String>> byColor = new LinkedHashMap<>();
        colors.forEach((n, c) -> byColor.computeIfAbsent(c, x -> new ArrayList<>()).add(n));
        for (Map.Entry<Integer, List<String>> e : byColor.entrySet()) {
            List<String> names = e.getValue();
            mask(names::contains);
            root.render(pose, buffer, light, overlay, multiply(color, e.getKey()));
        }
        unmask();
    }

    /** The emissive pass: the export's _glow layer, or the stand-in's glowing parts. `skip` hides glow parts by name. */
    public void renderGlow(PoseStack pose, MultiBufferSource buffers, int color, Predicate<String> skip) {
        if (!hasGlow) {
            return;
        }
        if (exported) {
            root.render(pose, buffers.getBuffer(RenderType.eyes(glowTexture)), 0xF000F0, OverlayTexture.NO_OVERLAY, color);
            return;
        }
        VertexConsumer buf = buffers.getBuffer(RenderType.eyes(WHITE));
        for (Map.Entry<String, Integer> g : glows.entrySet()) {
            if (skip.test(g.getKey())) {
                continue;
            }
            mask(g.getKey()::equals);
            root.render(pose, buf, 0xF000F0, OverlayTexture.NO_OVERLAY, multiply(color, g.getValue()));
        }
        unmask();
    }

    private static int multiply(int argb, int rgb) {
        int a = FastColor.ARGB32.alpha(argb);
        int r = FastColor.ARGB32.red(argb) * FastColor.ARGB32.red(rgb) / 255;
        int g = FastColor.ARGB32.green(argb) * FastColor.ARGB32.green(rgb) / 255;
        int b = FastColor.ARGB32.blue(argb) * FastColor.ARGB32.blue(rgb) / 255;
        return FastColor.ARGB32.color(a, r, g, b);
    }
}
