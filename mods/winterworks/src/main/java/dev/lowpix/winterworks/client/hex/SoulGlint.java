package dev.lowpix.winterworks.client.hex;

import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.ByteBufferBuilder;
import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.blaze3d.vertex.VertexFormat;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.hex.CursedItems;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.IdentityHashMap;
import java.util.Map;
import java.util.SequencedMap;
import net.minecraft.Util;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.ItemStack;
import org.joml.Matrix4f;

/**
 * The soul glint (docs/FIXES_0_4.md "Cursed books and cursed gear"): every item carrying a curse (hex.CursedItems)
 * glints with three soul-fire teal souls rising through soft swirls instead of vanilla's purple shimmer. These are
 * vanilla's five glint render types with the soul textures (misc/soul_glint_item.png, misc/soul_glint_entity.png;
 * additive like vanilla's) and their own texturing. While a cursed stack is drawn (mixin.client.hex.SoulGlintItemMixin and the armour
 * layers) the vanilla glint types resolve to these (mixin.client.hex.SoulGlintTypeMixin); they have fixed buffers
 * (mixin.client.hex.SoulGlintBuffersMixin) and are drawn when vanilla draws its glints.
 */
public final class SoulGlint extends RenderType {
    static final ResourceLocation ITEM_TEXTURE = Winterworks.id("textures/misc/soul_glint_item.png");
    static final ResourceLocation ENTITY_TEXTURE = Winterworks.id("textures/misc/soul_glint_entity.png");

    // The glint texture holds three souls per tile. Items: one whole tile per 16 px sprite on the 1024-wide item atlas
    // (atlas uv * 64), so every cursed item carries all three souls (vanilla's 8 shows an eighth of its sheet).
    // Armour: 2 x the 64 x 32 armour uv, so a tile spans 32 x 16 armour px (soul_glint_entity.png is drawn for that).
    private static final TexturingStateShard ITEM_TEXTURING = new TexturingStateShard("winterworks_soul_glint_texturing",
            () -> setupTexturing(64.0f), RenderSystem::resetTextureMatrix);
    private static final TexturingStateShard ENTITY_TEXTURING = new TexturingStateShard("winterworks_soul_entity_glint_texturing",
            () -> setupTexturing(2.0f), RenderSystem::resetTextureMatrix);

    public static final RenderType ARMOR_ENTITY_GLINT = create("winterworks_soul_armor_entity_glint", DefaultVertexFormat.POSITION_TEX,
            VertexFormat.Mode.QUADS, 1536, CompositeState.builder()
                    .setShaderState(RENDERTYPE_ARMOR_ENTITY_GLINT_SHADER)
                    .setTextureState(new TextureStateShard(ENTITY_TEXTURE, true, false))
                    .setWriteMaskState(COLOR_WRITE)
                    .setCullState(NO_CULL)
                    .setDepthTestState(EQUAL_DEPTH_TEST)
                    .setTransparencyState(GLINT_TRANSPARENCY)
                    .setTexturingState(ENTITY_TEXTURING)
                    .setLayeringState(VIEW_OFFSET_Z_LAYERING)
                    .createCompositeState(false));
    public static final RenderType GLINT_TRANSLUCENT = create("winterworks_soul_glint_translucent", DefaultVertexFormat.POSITION_TEX,
            VertexFormat.Mode.QUADS, 1536, CompositeState.builder()
                    .setShaderState(RENDERTYPE_GLINT_TRANSLUCENT_SHADER)
                    .setTextureState(new TextureStateShard(ITEM_TEXTURE, true, false))
                    .setWriteMaskState(COLOR_WRITE)
                    .setCullState(NO_CULL)
                    .setDepthTestState(EQUAL_DEPTH_TEST)
                    .setTransparencyState(GLINT_TRANSPARENCY)
                    .setTexturingState(ITEM_TEXTURING)
                    .setOutputState(ITEM_ENTITY_TARGET)
                    .createCompositeState(false));
    public static final RenderType GLINT = create("winterworks_soul_glint", DefaultVertexFormat.POSITION_TEX,
            VertexFormat.Mode.QUADS, 1536, CompositeState.builder()
                    .setShaderState(RENDERTYPE_GLINT_SHADER)
                    .setTextureState(new TextureStateShard(ITEM_TEXTURE, true, false))
                    .setWriteMaskState(COLOR_WRITE)
                    .setCullState(NO_CULL)
                    .setDepthTestState(EQUAL_DEPTH_TEST)
                    .setTransparencyState(GLINT_TRANSPARENCY)
                    .setTexturingState(ITEM_TEXTURING)
                    .createCompositeState(false));
    public static final RenderType ENTITY_GLINT = create("winterworks_soul_entity_glint", DefaultVertexFormat.POSITION_TEX,
            VertexFormat.Mode.QUADS, 1536, CompositeState.builder()
                    .setShaderState(RENDERTYPE_ENTITY_GLINT_SHADER)
                    .setTextureState(new TextureStateShard(ENTITY_TEXTURE, true, false))
                    .setWriteMaskState(COLOR_WRITE)
                    .setCullState(NO_CULL)
                    .setDepthTestState(EQUAL_DEPTH_TEST)
                    .setTransparencyState(GLINT_TRANSPARENCY)
                    .setOutputState(ITEM_ENTITY_TARGET)
                    .setTexturingState(ENTITY_TEXTURING)
                    .createCompositeState(false));
    public static final RenderType ENTITY_GLINT_DIRECT = create("winterworks_soul_entity_glint_direct", DefaultVertexFormat.POSITION_TEX,
            VertexFormat.Mode.QUADS, 1536, CompositeState.builder()
                    .setShaderState(RENDERTYPE_ENTITY_GLINT_DIRECT_SHADER)
                    .setTextureState(new TextureStateShard(ENTITY_TEXTURE, true, false))
                    .setWriteMaskState(COLOR_WRITE)
                    .setCullState(NO_CULL)
                    .setDepthTestState(EQUAL_DEPTH_TEST)
                    .setTransparencyState(GLINT_TRANSPARENCY)
                    .setTexturingState(ENTITY_TEXTURING)
                    .createCompositeState(false));

    /** Vanilla glint type -> its soul twin (built with the flag down, so these are vanilla's own instances). */
    private static final Map<RenderType, RenderType> SOUL = new IdentityHashMap<>();
    private static final Deque<Boolean> DRAWING = new ArrayDeque<>();
    private static boolean cursed;

    static {
        SOUL.put(RenderType.armorEntityGlint(), ARMOR_ENTITY_GLINT);
        SOUL.put(RenderType.glint(), GLINT);
        SOUL.put(RenderType.glintTranslucent(), GLINT_TRANSLUCENT);
        SOUL.put(RenderType.entityGlint(), ENTITY_GLINT);
        SOUL.put(RenderType.entityGlintDirect(), ENTITY_GLINT_DIRECT);
    }

    private SoulGlint(String name, VertexFormat format, VertexFormat.Mode mode, int size, boolean crumbling, boolean sort,
                      Runnable setup, Runnable clear) {
        super(name, format, mode, size, crumbling, sort, setup, clear);
    }

    /**
     * The souls rise slowly through the item (a tile every 5 glint seconds, 10 s at the default glint speed) and sway
     * gently from side to side (vanilla's glint slides diagonally). Only translation: a turning texture matrix pivots
     * on the atlas corner, which would sweep each item's souls past at a speed set by where its sprite sits in the
     * atlas. The glint speed option still applies.
     */
    private static void setupTexturing(float scale) {
        double t = Util.getMillis() / 1000.0 * Minecraft.getInstance().options.glintSpeed().get();
        float sway = (float) (Math.sin(t * 0.9) * 0.05 + Math.sin(t * 0.37 + 1.0) * 0.03);
        float rise = (float) ((t * 0.2 + Math.sin(t * 1.3) * 0.02) % 1.0);
        RenderSystem.setTextureMatrix(new Matrix4f().translation(sway, rise, 0f).scale(scale));
    }

    // ------------------------------------------------------------------------------------------------ while drawing

    /** A stack starts being drawn (ItemRenderer.render, the armour layers): glint with souls if it carries a curse. */
    public static void push(ItemStack stack) {
        DRAWING.push(cursed);
        cursed = !stack.isEmpty() && stack.hasFoil() && CursedItems.cursed(stack);
    }

    public static void pop() {
        cursed = !DRAWING.isEmpty() && DRAWING.pop();
    }

    /** The glint type to use now for a vanilla one. */
    public static RenderType resolve(RenderType vanilla) {
        if (!cursed) {
            return vanilla;
        }
        RenderType soul = SOUL.get(vanilla);
        return soul == null ? vanilla : soul;
    }

    /** RenderBuffers: give each soul glint its own fixed buffer, like vanilla's glints. */
    public static void addFixedBuffers(SequencedMap<RenderType, ByteBufferBuilder> buffers) {
        for (RenderType soul : SOUL.values()) {
            buffers.putIfAbsent(soul, new ByteBufferBuilder(soul.bufferSize()));
        }
    }

    /** LevelRenderer ended a vanilla glint batch: end its soul twin with it. */
    public static void endWith(MultiBufferSource.BufferSource buffers, RenderType vanilla) {
        RenderType soul = SOUL.get(vanilla);
        if (soul != null) {
            buffers.endBatch(soul);
        }
    }
}
