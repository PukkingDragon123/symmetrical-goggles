// Runtime for models exported by lowpix (python -m lowpix mc export). Copied into your mod; safe to edit.
package dev.lowpix.winterworks.client.lowpix;

import java.util.Map;
import java.util.Optional;
import net.minecraft.client.animation.AnimationDefinition;
import net.minecraft.client.model.HierarchicalModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.Entity;

/**
 * A HierarchicalModel for a lowpix export: finds parts by name and plays the exported clips.
 * Subclass it, call {@code resetPose()} first in setupAnim, then {@code play(...)} / {@code walk(...)}
 * and any procedural touches (head look, belly wobble).
 */
public abstract class LowpixEntityModel<T extends Entity> extends HierarchicalModel<T> {
    protected final ModelPart root;
    protected final Map<String, AnimationDefinition> clips;

    protected LowpixEntityModel(ModelPart root, String modid, String model) {
        super(RenderType::entityCutoutNoCull);
        this.root = root;
        this.clips = LowpixAnimations.load(modid, model);
    }

    @Override
    public ModelPart root() {
        return root;
    }

    public void resetPose() {
        root.getAllParts().forEach(ModelPart::resetPose);
    }

    public ModelPart part(String name) {
        Optional<ModelPart> p = getAnyDescendantWithName(name);
        return p.orElseThrow(() -> new IllegalArgumentException("no model part " + name));
    }

    public Optional<ModelPart> maybePart(String name) {
        return getAnyDescendantWithName(name);
    }

    public boolean hasClip(String clip) {
        return clips.containsKey(clip);
    }

    /** Plays a clip driven by an AnimationState (started/stopped on the entity). */
    public void play(AnimationState state, String clip, float ageInTicks, float speed) {
        AnimationDefinition def = clips.get(clip);
        if (def != null) {
            animate(state, def, ageInTicks, speed);
        }
    }

    /** Plays a looping clip in step with walking, faded in by how fast the entity moves. */
    public void walk(String clip, float limbSwing, float limbSwingAmount, float maxSpeed, float scale) {
        AnimationDefinition def = clips.get(clip);
        if (def != null) {
            animateWalk(def, limbSwing, limbSwingAmount, maxSpeed, scale);
        }
    }

    /** Applies a clip at a fixed time (seconds), e.g. for item or block renderers without an entity. */
    public void poseAt(String clip, float seconds) {
        AnimationDefinition def = clips.get(clip);
        if (def != null) {
            AnimationState s = new AnimationState();
            s.start(0);
            animate(s, def, seconds * 20f, 1f);
        }
    }
}
