package dev.lowpix.winterworks.client.oceanmob;

import dev.lowpix.winterworks.client.render.WWModel;
import net.minecraft.client.animation.AnimationDefinition;
import net.minecraft.client.animation.KeyframeAnimations;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.Entity;
import org.joml.Vector3f;

/**
 * A Tides & Treasures creature model (a lowpix export with its texture and glow layer, see {@link WWModel}) with clip
 * blending: loops are mixed by weight (idle into swim as the creature speeds up) and one-shot clips stop when they end.
 */
public class OceanModel<T extends Entity> extends WWModel<T> {
    private final Vector3f cache = new Vector3f();

    public OceanModel(ModelPart root, String name) {
        super(root, name);
    }

    /** Adds a clip at `seconds` (loops wrap), weighted 0..1. */
    public void blend(String clip, float seconds, float weight) {
        AnimationDefinition d = clips.get(clip);
        if (d == null || weight <= 0.002f) {
            return;
        }
        KeyframeAnimations.animate(this, d, (long) (Math.max(0f, seconds) * 1000f), Math.min(1f, weight), cache);
    }

    /** Plays a one-shot clip from its state (started by an entity event) and stops the state once the clip is over. */
    public boolean oneShot(AnimationState state, String clip, float ageInTicks) {
        AnimationDefinition d = clips.get(clip);
        state.updateTime(ageInTicks, 1f);
        if (d == null || !state.isStarted()) {
            return false;
        }
        if (state.getAccumulatedTime() > d.lengthInSeconds() * 1000f) {
            state.stop();
            return false;
        }
        KeyframeAnimations.animate(this, d, state.getAccumulatedTime(), 1f, cache);
        return true;
    }

    /** 0..1 progress of a running one-shot (0 if stopped). */
    public float progress(AnimationState state, String clip) {
        AnimationDefinition d = clips.get(clip);
        if (d == null || !state.isStarted()) {
            return 0f;
        }
        return Math.min(1f, state.getAccumulatedTime() / (d.lengthInSeconds() * 1000f));
    }

    public float lengthOf(String clip) {
        AnimationDefinition d = clips.get(clip);
        return d == null ? 1f : d.lengthInSeconds();
    }

    /** Multiplies a part's scale (after the clips). */
    public void scalePart(String part, float x, float y, float z) {
        get(part).ifPresent(p -> {
            p.xScale *= x;
            p.yScale *= y;
            p.zScale *= z;
        });
    }
}
