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
 * glints with drifting blue souls and a slow, dizzying swirl instead of vanilla's purple shimmer. These are vanilla's
 * five glint render types with the soul textures (misc/soul_glint_item.png, misc/soul_glint_entity.png; additive like
 * vanilla's) and their own texturing. While a cursed stack is drawn (mixin.client.hex.SoulGlintItemMixin and the armour
 * layers) the vanilla glint types resolve to these (mixin.client.hex.SoulGlintTypeMixin); they have fixed buffers
 * (mixin.client.hex.SoulGlintBuffersMixin) and are drawn when vanilla draws its glints.
 */
public final class SoulGlint extends RenderType {
    static final ResourceLocation ITEM_TEXTURE = Winterworks.id("textures/misc/soul_glint_item.png");
    static final ResourceLocation ENTITY_TEXTURE = Winterworks.id("textures/misc/soul_glint_entity.png");

    // three times vanilla's scales: each item shows more of the sheet, so a few souls drift over it at once
    private static final TexturingStateShard ITEM_TEXTURING = new TexturingStateShard("winterworks_soul_glint_texturing",
            () -> setupTexturing(24.0f), RenderSystem::resetTextureMatrix);
    private static final TexturingStateShard ENTITY_TEXTURING = new TexturingStateShard("winterworks_soul_entity_glint_texturing",
            () -> setupTexturing(0.48f), RenderSystem::resetTextureMatrix);

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
     * Souls drift slowly upward while the whole glint sways and turns, slow and dizzy (vanilla's slides diagonally).
     * The glint speed option still applies.
     */
    private static void setupTexturing(float scale) {
        double t = Util.getMillis() / 1000.0 * Minecraft.getInstance().options.glintSpeed().get();
        float driftU = (float) ((t * 0.016) % 1.0);
        float driftV = (float) ((t * 0.06) % 1.0);
        float swirl = (float) (0.17 + Math.sin(t * 0.33) * 0.22 + Math.sin(t * 0.13 + 1.0) * 0.12);
        Matrix4f m = new Matrix4f().translation(-driftU, driftV, 0f);
        m.rotateZ(swirl).scale(scale);
        RenderSystem.setTextureMatrix(m);
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
