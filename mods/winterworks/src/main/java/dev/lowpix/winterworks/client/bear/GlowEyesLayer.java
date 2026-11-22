package dev.lowpix.winterworks.client.bear;

import net.minecraft.client.model.EntityModel;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.EyesLayer;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.Entity;

/** An emissive pass of the whole model with a mostly transparent texture (glowing eyes), like the spider's. */
public class GlowEyesLayer<T extends Entity, M extends EntityModel<T>> extends EyesLayer<T, M> {
    private final RenderType type;

    public GlowEyesLayer(RenderLayerParent<T, M> parent, ResourceLocation texture) {
        super(parent);
        this.type = RenderType.eyes(texture);
    }

    @Override
    public RenderType renderType() {
        return type;
    }
}
