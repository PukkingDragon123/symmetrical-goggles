package dev.lowpix.winterworks.client.golem;

import com.mojang.blaze3d.platform.NativeImage;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.lowpix.winterworks.Winterworks;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import net.fabricmc.fabric.api.resource.ResourceManagerHelper;
import net.fabricmc.fabric.api.resource.SimpleSynchronousResourceReloadListener;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.geom.ModelLayers;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.packs.PackType;
import net.minecraft.server.packs.resources.ResourceManager;
import net.minecraft.util.FastColor;
import dev.lowpix.winterworks.golem.PotGolemEntity;
import net.minecraft.Util;
import net.minecraft.util.Mth;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.entity.DecoratedPotPattern;
import net.minecraft.world.level.block.entity.DecoratedPotPatterns;
import net.minecraft.world.level.block.entity.PotDecorations;
import org.jetbrains.annotations.Nullable;

/**
 * The glowing sherd pattern on a Pot Golem's head (docs/FIXES_0_4.md): a full-bright mask of each side's pattern,
 * drawn over the pot in the head ability's colour while the ability is active. Ability pots as items (the same
 * ability sherd on all four faces, golem.PotGolemEntity#abilityPotForm) glow the same way in the inventory, in the hand
 * and on the ground: mixin.client.PotItemGlowMixin calls {@link #renderItem} after vanilla's decorated pot item renderer.
 *
 * <p>No pattern art ships with the mod: the masks are made at runtime from the game's own textures. A pattern pixel is
 * part of the motif where the pattern texture is darker than the plain pot side ({@code decorated_pot_side}) at the same
 * spot; motif pixels glow fully and their neighbours softly (a little halo). Masks are cached per pattern and dropped
 * when resources reload (so a resource pack's patterns glow too).
 */
public final class PotGlow {
    private static final ResourceLocation SIDE = ResourceLocation.withDefaultNamespace("textures/entity/decorated_pot/decorated_pot_side.png");
    /** How much darker than the plain side a pixel must be to count as the motif (sum of RGB). */
    private static final int DARKER = 24;
    private static final int HALO = 70;
    /** A pattern with no motif (or whose texture can't be read) maps to EMPTY: nothing to draw. */
    private static final ResourceLocation EMPTY = Winterworks.id("empty");
    private static final Map<ResourceLocation, ResourceLocation> MASKS = new HashMap<>();
    private static final Map<ResourceLocation, DynamicTexture> TEXTURES = new HashMap<>();
    private static boolean listening;
    /** Set while a Pot Golem draws its head pot: the golem draws that glow itself (only while its ability is active). */
    static boolean drawingGolemHead;
    @Nullable
    private static PotGlow items;

    private final ModelPart front, back, left, right;

    PotGlow(EntityRendererProvider.Context ctx) {
        this(ctx.bakeLayer(ModelLayers.DECORATED_POT_SIDES));
    }

    private PotGlow(ModelPart sides) {
        front = sides.getChild("front");
        back = sides.getChild("back");
        left = sides.getChild("left");
        right = sides.getChild("right");
    }

    /** Client init: masks are remade after a resource reload. */
    static void init() {
        if (!listening) {
            listening = true;
            ResourceManagerHelper.get(PackType.CLIENT_RESOURCES).registerReloadListener(new SimpleSynchronousResourceReloadListener() {
                @Override
                public ResourceLocation getFabricId() {
                    return Winterworks.id("pot_golem_glow");
                }

                @Override
                public void onResourceManagerReload(ResourceManager manager) {
                    clear();
                }
            });
        }
    }

    /**
     * An ability pot item: its motifs glow in its ability's colour, breathing slowly. `pose` is where vanilla's
     * BlockEntityWithoutLevelRenderer has just drawn the pot (its block corner). Mixed pots, and the pot a golem wears, are
     * left alone.
     */
    public static void renderItem(ItemStack stack, PoseStack pose, MultiBufferSource buffers) {
        if (drawingGolemHead) {
            return;
        }
        PotGolemEntity.HeadForm form = PotGolemEntity.abilityPotForm(stack);
        if (form.glow == 0) {
            return;
        }
        if (items == null) {
            items = new PotGlow(Minecraft.getInstance().getEntityModels().bakeLayer(ModelLayers.DECORATED_POT_SIDES));
        }
        float breath = 0.8f + 0.15f * Mth.sin((Util.getMillis() % 100000L) / 650f);
        items.render(pose, buffers, PotGolemEntity.decorations(stack), form.glow, breath);
    }

    /**
     * Draws the glowing motifs of `pot`'s four sides. `pose` must be at the pot block's corner, as vanilla's
     * DecoratedPotRenderer draws the item (facing north). `rgb` is the glow colour, `strength` 0..1.
     */
    void render(PoseStack pose, MultiBufferSource buffers, PotDecorations pot, int rgb, float strength) {
        if (strength <= 0.01f) {
            return;
        }
        int r = (int) (FastColor.ARGB32.red(rgb) * strength), g = (int) (FastColor.ARGB32.green(rgb) * strength),
                b = (int) (FastColor.ARGB32.blue(rgb) * strength);
        int color = FastColor.ARGB32.color(255, r, g, b);
        pose.pushPose();
        pose.translate(0.5f, 0f, 0.5f);   // a hair outside the pot's own faces, so the glow never z-fights them
        pose.scale(1.012f, 1.0f, 1.012f);
        pose.translate(-0.5f, 0f, -0.5f);
        side(front, pot.front(), pose, buffers, color);
        side(back, pot.back(), pose, buffers, color);
        side(left, pot.left(), pose, buffers, color);
        side(right, pot.right(), pose, buffers, color);
        pose.popPose();
    }

    private static void side(ModelPart part, Optional<Item> sherd, PoseStack pose, MultiBufferSource buffers, int color) {
        ResourceLocation mask = sherd.map(PotGlow::mask).orElse(EMPTY);
        if (mask == EMPTY) {
            return;
        }
        VertexConsumer vc = buffers.getBuffer(RenderType.eyes(mask));
        part.render(pose, vc, 0xF000F0, OverlayTexture.NO_OVERLAY, color);
    }

    /** The glow mask texture for this sherd's pattern, made on first use. */
    static ResourceLocation mask(Item sherd) {
        ResourceKey<DecoratedPotPattern> key = DecoratedPotPatterns.getPatternFromItem(sherd);
        DecoratedPotPattern pattern = key == null ? null : BuiltInRegistries.DECORATED_POT_PATTERN.get(key);
        if (pattern == null) {
            return EMPTY;
        }
        return MASKS.computeIfAbsent(pattern.assetId(), PotGlow::make);
    }

    private static ResourceLocation make(ResourceLocation assetId) {
        ResourceManager rm = Minecraft.getInstance().getResourceManager();
        ResourceLocation tex = assetId.withPath(p -> "textures/entity/decorated_pot/" + p + ".png");
        try (NativeImage pat = read(rm, tex); NativeImage side = read(rm, SIDE)) {
            if (pat == null) {
                return EMPTY;
            }
            NativeImage out = maskOf(pat, side);
            if (out == null) {
                return EMPTY;
            }
            DynamicTexture dyn = new DynamicTexture(out);
            ResourceLocation id = Winterworks.id("dynamic/pot_glow/" + assetId.getNamespace() + "/" + assetId.getPath());
            Minecraft.getInstance().getTextureManager().register(id, dyn);
            TEXTURES.put(id, dyn);
            return id;
        } catch (IOException | RuntimeException e) {
            Winterworks.LOG.warn("no glow for pot pattern {}: {}", assetId, e.toString());
            return EMPTY;
        }
    }

    @Nullable
    private static NativeImage read(ResourceManager rm, ResourceLocation id) throws IOException {
        Optional<net.minecraft.server.packs.resources.Resource> res = rm.getResource(id);
        if (res.isEmpty()) {
            return null;
        }
        try (InputStream in = res.get().open()) {
            return NativeImage.read(in);
        }
    }

    /** The motif of `pattern` (darker than the plain `side`) as premultiplied white, haloed; null if it has none. */
    @Nullable
    static NativeImage maskOf(NativeImage pattern, @Nullable NativeImage side) {
        int w = pattern.getWidth(), h = pattern.getHeight();
        boolean[] motif = new boolean[w * h];
        int found = 0;
        long avg = 0;
        int opaque = 0;
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int c = pattern.getPixelRGBA(x, y);   // ABGR
                if (FastColor.ABGR32.alpha(c) > 0) {
                    avg += lum(c);
                    opaque++;
                }
            }
        }
        int mean = opaque == 0 ? 0 : (int) (avg / opaque);
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int c = pattern.getPixelRGBA(x, y);
                if (FastColor.ABGR32.alpha(c) == 0) {
                    continue;
                }
                int ref;
                if (side != null && side.getWidth() > 0 && side.getHeight() > 0) {
                    int s = side.getPixelRGBA(x * side.getWidth() / w, y * side.getHeight() / h);
                    ref = FastColor.ABGR32.alpha(s) == 0 ? mean : lum(s);
                } else {
                    ref = mean;
                }
                if (lum(c) < ref - DARKER) {
                    motif[y * w + x] = true;
                    found++;
                }
            }
        }
        if (found == 0) {
            return null;
        }
        NativeImage out = new NativeImage(w, h, true);
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int v = 0;
                if (motif[y * w + x]) {
                    v = 255;
                } else if (near(motif, w, h, x, y)) {
                    v = HALO;
                }
                // additive blending ignores alpha: premultiply, so a halo pixel glows dimmer
                out.setPixelRGBA(x, y, v == 0 ? 0 : FastColor.ABGR32.color(255, v, v, v));
            }
        }
        return out;
    }

    private static boolean near(boolean[] m, int w, int h, int x, int y) {
        return (x > 0 && m[y * w + x - 1]) || (x < w - 1 && m[y * w + x + 1]) || (y > 0 && m[(y - 1) * w + x])
                || (y < h - 1 && m[(y + 1) * w + x]);
    }

    private static int lum(int abgr) {
        return FastColor.ABGR32.red(abgr) + FastColor.ABGR32.green(abgr) + FastColor.ABGR32.blue(abgr);
    }

    private static void clear() {
        TEXTURES.forEach((id, tex) -> Minecraft.getInstance().getTextureManager().release(id));
        TEXTURES.clear();
        MASKS.clear();
    }
}
