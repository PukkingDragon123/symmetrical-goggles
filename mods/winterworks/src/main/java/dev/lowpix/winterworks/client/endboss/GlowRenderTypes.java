package dev.lowpix.winterworks.client.endboss;

import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.blaze3d.vertex.VertexFormat;
import java.util.function.Function;
import net.minecraft.Util;
import net.minecraft.client.renderer.RenderStateShard;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.resources.ResourceLocation;

/**
 * A glowing, textured, additive render type that keeps the texture's alpha (SRC_ALPHA, ONE, like vanilla's sun): for
 * the light beam's strip, whose soft edges are in its alpha. Unlit, no culling, no depth writes.
 */
final class GlowRenderTypes {
    private static final Function<ResourceLocation, RenderType> ADDITIVE_ALPHA = Util.memoize(tex -> RenderType.create(
            "winterworks_additive_glow", DefaultVertexFormat.NEW_ENTITY, VertexFormat.Mode.QUADS, 1536, false, true,
            RenderType.CompositeState.builder()
                    .setShaderState(RenderStateShard.RENDERTYPE_EYES_SHADER)
                    .setTextureState(new RenderStateShard.TextureStateShard(tex, false, false))
                    .setTransparencyState(RenderStateShard.LIGHTNING_TRANSPARENCY)
                    .setCullState(RenderStateShard.NO_CULL)
                    .setWriteMaskState(RenderStateShard.COLOR_WRITE)
                    .createCompositeState(false)));

    private GlowRenderTypes() {}

    static RenderType additiveAlpha(ResourceLocation texture) {
        return ADDITIVE_ALPHA.apply(texture);
    }
}
