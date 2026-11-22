package dev.lowpix.winterworks.client.harvester;

import com.mojang.blaze3d.platform.NativeImage;
import com.mojang.serialization.Codec;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.mixin.harvester.client.SpriteSourcesAccessor;
import java.io.InputStream;
import java.util.List;
import java.util.Optional;
import net.minecraft.client.renderer.texture.SpriteContents;
import net.minecraft.client.renderer.texture.atlas.SpriteSource;
import net.minecraft.client.renderer.texture.atlas.SpriteSourceType;
import net.minecraft.client.resources.metadata.animation.FrameSize;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.packs.resources.Resource;
import net.minecraft.server.packs.resources.ResourceManager;
import net.minecraft.server.packs.resources.ResourceMetadata;

/**
 * An atlas sprite source (`winterworks:glow_mask`, used in assets/minecraft/atlases/blocks.json) that makes glow masks
 * from the game's own textures at load time (docs/FIXES_0_4.md "Torchflowers and pitcher plants glow": no vanilla
 * texture is shipped). For each listed texture it adds `winterworks:block/glow/<name>`: the texture's luminous pixels
 * (those whose hue is in [hue_min, hue_max] degrees, wrapping round 360, with enough saturation and brightness),
 * slightly brightened, everything else transparent. Resource packs that change the textures change the glow with them.
 * client.harvester.GlowPlantModel draws the masks full-bright over the plants.
 */
public record GlowMaskSource(List<ResourceLocation> textures, float hueMin, float hueMax, float minSaturation, float minValue,
                             float boost) implements SpriteSource {
    public static final MapCodec<GlowMaskSource> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
            Codec.list(ResourceLocation.CODEC).fieldOf("textures").forGetter(GlowMaskSource::textures),
            Codec.FLOAT.fieldOf("hue_min").forGetter(GlowMaskSource::hueMin),
            Codec.FLOAT.fieldOf("hue_max").forGetter(GlowMaskSource::hueMax),
            Codec.FLOAT.optionalFieldOf("min_saturation", 0.3f).forGetter(GlowMaskSource::minSaturation),
            Codec.FLOAT.optionalFieldOf("min_value", 0.4f).forGetter(GlowMaskSource::minValue),
            Codec.FLOAT.optionalFieldOf("boost", 1.12f).forGetter(GlowMaskSource::boost)
    ).apply(i, GlowMaskSource::new));
    public static final SpriteSourceType TYPE = new SpriteSourceType(CODEC);

    /** Registers the source type (before the first resource load: the client initializer). */
    public static void register() {
        SpriteSourcesAccessor.ww$types().putIfAbsent(Winterworks.id("glow_mask"), TYPE);
    }

    /** The glow mask's sprite name for a texture: minecraft:block/torchflower -> winterworks:block/glow/torchflower. */
    public static ResourceLocation glowId(ResourceLocation texture) {
        String path = texture.getPath();
        return Winterworks.id("block/glow/" + path.substring(path.lastIndexOf('/') + 1));
    }

    @Override
    public void run(ResourceManager resources, Output out) {
        for (ResourceLocation tex : textures) {
            Optional<Resource> res = resources.getResource(TEXTURE_ID_CONVERTER.idToFile(tex));
            if (res.isEmpty()) {
                Winterworks.LOG.warn("glow mask: no texture {}", tex);
                continue;
            }
            ResourceLocation id = glowId(tex);
            Resource r = res.get();
            out.add(id, (SpriteSource.SpriteSupplier) loader -> mask(id, r));
        }
    }

    private SpriteContents mask(ResourceLocation id, Resource res) {
        try (InputStream in = res.open(); NativeImage src = NativeImage.read(in)) {
            int w = src.getWidth(), h = Math.min(src.getHeight(), src.getWidth());   // the first frame of an animation
            NativeImage dst = new NativeImage(w, h, true);
            float[] hsv = new float[3];
            for (int y = 0; y < h; y++) {
                for (int x = 0; x < w; x++) {
                    int abgr = src.getPixelRGBA(x, y);   // (NativeImage stores ABGR)
                    int a = abgr >>> 24, r = abgr & 0xFF, g = (abgr >> 8) & 0xFF, b = (abgr >> 16) & 0xFF;
                    hsv(r, g, b, hsv);
                    if (a < 128 || !luminous(hsv[0], hsv[1], hsv[2])) {
                        dst.setPixelRGBA(x, y, 0);
                        continue;
                    }
                    int nr = Math.min(255, Math.round(r * boost)), ng = Math.min(255, Math.round(g * boost)),
                            nb = Math.min(255, Math.round(b * boost));
                    dst.setPixelRGBA(x, y, 0xFF000000 | (nb << 16) | (ng << 8) | nr);
                }
            }
            return new SpriteContents(id, new FrameSize(w, h), dst, ResourceMetadata.EMPTY);
        } catch (Exception e) {
            Winterworks.LOG.error("glow mask {} failed", id, e);
            return null;
        }
    }

    /** Hue in degrees, saturation and value in 0..1. */
    static void hsv(int r, int g, int b, float[] out) {
        int max = Math.max(r, Math.max(g, b)), min = Math.min(r, Math.min(g, b));
        float d = max - min, h;
        if (d == 0) {
            h = 0;
        } else if (max == r) {
            h = 60f * (((g - b) / d) % 6f);
        } else if (max == g) {
            h = 60f * ((b - r) / d + 2f);
        } else {
            h = 60f * ((r - g) / d + 4f);
        }
        out[0] = h < 0 ? h + 360f : h;
        out[1] = max == 0 ? 0 : d / max;
        out[2] = max / 255f;
    }

    private boolean luminous(float hue, float sat, float val) {
        boolean inHue = hueMin <= hueMax ? hue >= hueMin && hue <= hueMax : hue >= hueMin || hue <= hueMax;
        return inHue && sat >= minSaturation && val >= minValue;
    }

    @Override
    public SpriteSourceType type() {
        return TYPE;
    }
}
