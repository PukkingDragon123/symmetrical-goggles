package dev.lowpix.winterworks.client.endmob;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.endmob.Gucker;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.util.Mth;

/**
 * The Gucker (lowpix model `gucker`): `idle`, `walk` / `run`, `burrowed` (sunk into the ground so only its back shows),
 * `emerge` (rising out of it), `bite`, `inflate` (with its `throat` sac swelling) and `spit` (the sac emptying). Eyes
 * and a faint light in the vents glow.
 */
public class GuckerRenderer extends EndMobRenderer<Gucker> {
    /**
     * How deep a burrowed Gucker sits in the ground (blocks): its body is 0.9 tall, its back shows. The exported model's
     * `burrowed` and `emerge` clips already sink it, so only the stand-in needs this.
     */
    static final float SINK = EndMobModel.isExported("gucker") ? 0f : 0.55f;

    public GuckerRenderer(EntityRendererProvider.Context ctx) {
        super(ctx, new Model(ctx.bakeLayer(EndMobClient.GUCKER)), 0.8f);
    }

    static float since(Gucker e, float partial) {
        return e.tickCount + partial - e.phaseStartTick;
    }

    @Override
    protected void setupRotations(Gucker e, PoseStack pose, float bob, float yaw, float partial, float scale) {
        super.setupRotations(e, pose, bob, yaw, partial, scale);
        float sink = switch (e.phase()) {
            case BURROWED -> SINK;
            case EMERGING -> SINK * (1f - Mth.clamp(since(e, partial) / (Gucker.EMERGE_TICKS * 0.8f), 0f, 1f));
            default -> 0f;
        };
        if (sink > 0f) {
            pose.translate(0f, -sink, 0f);
        }
    }

    @Override
    public void render(Gucker e, float yaw, float partial, PoseStack pose, MultiBufferSource buffers, int light) {
        shadowRadius = e.isBurrowed() ? 0.5f : 0.8f;
        super.render(e, yaw, partial, pose, buffers, light);
    }

    static class Model extends EndMobModel<Gucker> {
        Model(ModelPart root) {
            super(root, "gucker");
        }

        @Override
        public void setupAnim(Gucker e, float limbSwing, float limbAmount, float age, float headYaw, float headPitch) {
            reset();
            Gucker.Phase phase = e.phase();
            float t = age - e.phaseStartTick;
            if (phase == Gucker.Phase.BURROWED) {
                play(e.burrowedState, "burrowed", age, 1f);
                return;
            }
            if (limbAmount > 0.6f && hasClip("run")) {
                walk("run", limbSwing, limbAmount, 1.5f, 1.6f);
            } else {
                walk("walk", limbSwing, limbAmount, 1.5f, 2.0f);
            }
            play(e.idleState, "idle", age, 1f);
            play(e.emergeState, "emerge", age, 1f);
            play(e.biteState, "bite", age, 1f);
            play(e.inflateState, "inflate", age, 1f);
            play(e.spitState, "spit", age, 1f);
            // the throat sac: swells while inflating, empties as it spits
            float swell = switch (phase) {
                case INFLATING -> Mth.clamp(t / Gucker.INFLATE_TICKS, 0f, 1f);
                case SPITTING -> 1f - Mth.clamp(t / 5f, 0f, 1f);
                default -> 0f;
            };
            if (swell > 0f) {
                float wobble = phase == Gucker.Phase.INFLATING ? Mth.sin(age * 1.3f) * 0.05f * swell : 0f;
                get("throat").ifPresent(p -> {
                    p.xScale *= 1f + swell * 1.1f + wobble;   // a balloon: out to the sides as much as down
                    p.yScale *= 1f + swell * 1.3f + wobble;
                    p.zScale *= 1f + swell * 1.0f + wobble;
                });
            }
            if (phase == Gucker.Phase.NORMAL) {
                float yaw = Mth.clamp(headYaw, -40f, 40f) * Mth.DEG_TO_RAD, pitch = headPitch * Mth.DEG_TO_RAD;
                get("head").ifPresent(p -> {
                    p.yRot += yaw * 0.7f;
                    p.xRot += pitch * 0.5f;
                });
            }
        }
    }
}
