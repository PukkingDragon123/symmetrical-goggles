package dev.lowpix.winterworks.mixin.harvester.client;

import com.google.common.collect.BiMap;
import net.minecraft.client.renderer.texture.atlas.SpriteSourceType;
import net.minecraft.client.renderer.texture.atlas.SpriteSources;
import net.minecraft.resources.ResourceLocation;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/**
 * Registers client.harvester.GlowMaskSource as an atlas sprite source type (`winterworks:glow_mask`): vanilla only
 * registers its own types, under the minecraft namespace.
 */
@Mixin(SpriteSources.class)
public interface SpriteSourcesAccessor {
    @Accessor("TYPES")
    static BiMap<ResourceLocation, SpriteSourceType> ww$types() {
        throw new AssertionError();
    }
}
