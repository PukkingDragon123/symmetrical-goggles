package dev.lowpix.winterworks.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.lowpix.LowpixEntityModel;
import dev.lowpix.winterworks.client.lowpix.LowpixGeometry;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Predicate;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.Entity;

/**
 * A lowpix-exported model with its texture layers: base, optional glow (emissive) and tint (dyeable) layers.
 * {@link #renderAll} draws all passes; subclasses / callers pose it first.
 */
public class WWModel<T extends Entity> extends LowpixEntityModel<T> {
    public final String name;
    public final ResourceLocation texture, glowTexture, tintTexture;
    public final boolean hasGlow, hasTint;
    private final Map<String, ModelPart> named = new LinkedHashMap<>();
    private final Set<String> tintParts;

    public WWModel(ModelPart root, String name) {
        super(root, Winterworks.MOD_ID, name);
        this.name = name;
        this.texture = Winterworks.id("textures/entity/" + name + ".png");
        this.glowTexture = Winterworks.id("textures/entity/" + name + "_glow.png");
        this.tintTexture = Winterworks.id("textures/entity/" + name + "_tint.png");
        Set<String> tint = Set.of();
        boolean glow = false;
        try {
            glow = !LowpixGeometry.flagged(Winterworks.MOD_ID, name, "glow").isEmpty() && exists(glowTexture);
            tint = LowpixGeometry.flagged(Winterworks.MOD_ID, name, "tint");
            for (var e : LowpixGeometry.read(Winterworks.MOD_ID, name).getAsJsonArray("parts")) {
                String n = e.getAsJsonObject().get("name").getAsString();
                maybePart(n).ifPresent(p -> named.put(n, p));
            }
        } catch (RuntimeException e) {
            Winterworks.LOG.error("model {} is missing: {}", name, e.getMessage());
        }
        this.hasGlow = glow;
        this.tintParts = tint;
        this.hasTint = !tintParts.isEmpty() && exists(tintTexture);
    }

    private static boolean exists(ResourceLocation loc) {
        return Minecraft.getInstance().getResourceManager().getResource(loc).isPresent();
    }

    @Override
    public void setupAnim(T entity, float limbSwing, float limbSwingAmount, float ageInTicks, float netHeadYaw, float headPitch) {
        resetPose();
    }

    public Optional<ModelPart> get(String name) {
        return Optional.ofNullable(named.get(name));
    }

    public void show(String name, boolean visible) {
        ModelPart p = named.get(name);
        if (p != null) {
            p.visible = visible;
        }
    }

    public void reset() {
        resetPose();
        named.values().forEach(p -> p.skipDraw = false);
    }

    public void clip(String clip, float seconds) {
        poseAt(clip, seconds);
    }

    /** Only draw parts whose name passes `keep` (children of hidden parts still draw if they pass). */
    public void mask(Predicate<String> keep) {
        named.forEach((n, p) -> p.skipDraw = !keep.test(n));
    }

    public void unmask() {
        named.values().forEach(p -> p.skipDraw = false);
    }

    public boolean isTint(String part) {
        return tintParts.contains(part);
    }

    /** Base + tint (two colours: parts named seat* use `seatRgb`, other tint parts `trimRgb`) + glow. */
    public void renderAll(PoseStack pose, MultiBufferSource buffers, int light, int overlay, int trimRgb, int seatRgb, RenderType base) {
        renderToBuffer(pose, buffers.getBuffer(base), light, overlay, 0xFFFFFFFF);
        if (hasTint) {
            RenderType tint = RenderType.entityCutoutNoCull(tintTexture);
            mask(n -> isTint(n) && n.startsWith("seat"));
            renderToBuffer(pose, buffers.getBuffer(tint), light, overlay, 0xFF000000 | seatRgb);
            mask(n -> isTint(n) && !n.startsWith("seat"));
            renderToBuffer(pose, buffers.getBuffer(tint), light, overlay, 0xFF000000 | trimRgb);
            unmask();
        }
        if (hasGlow) {
            renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(glowTexture)), 0xF000F0, OverlayTexture.NO_OVERLAY, 0xFFFFFFFF);
        }
    }
}
