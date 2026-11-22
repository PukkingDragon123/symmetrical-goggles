package dev.lowpix.winterworks.client.hex;

import dev.lowpix.winterworks.client.render.WWModel;
import net.minecraft.client.Minecraft;
import net.minecraft.client.animation.AnimationDefinition;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.world.entity.Entity;

/** A lowpix model for the hex blocks and items, plus what the renderers need: clip lengths and "is it there at all". */
public class HexModel extends WWModel<Entity> {
    private final boolean missing;

    public HexModel(ModelLayerLocation layer, String name) {
        super(Minecraft.getInstance().getEntityModels().bakeLayer(layer), name);
        this.missing = root.getAllParts().count() <= 1;
    }

    /** True while the lowpix export isn't in the mod yet: the renderer draws a vanilla stand-in instead. */
    public boolean missing() {
        return missing;
    }

    /** Clip length in seconds, or 0 if the clip doesn't exist. */
    public float length(String clip) {
        AnimationDefinition def = clips.get(clip);
        return def == null ? 0f : def.lengthInSeconds();
    }

    /** Plays a looping clip at time t (seconds); missing clips are no-ops. */
    public void loop(String clip, float t) {
        float len = length(clip);
        if (len > 0) {
            clip(clip, t % len);
        }
    }

    /** Poses a one-shot clip at a fraction (0..1) of its length; missing clips are no-ops. */
    public void at(String clip, float fraction) {
        float len = length(clip);
        if (len > 0) {
            clip(clip, Math.max(0f, Math.min(1f, fraction)) * len);
        }
    }
}
