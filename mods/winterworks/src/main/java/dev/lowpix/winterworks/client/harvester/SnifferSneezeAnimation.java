package dev.lowpix.winterworks.client.harvester;

import net.minecraft.client.animation.AnimationChannel;
import net.minecraft.client.animation.AnimationDefinition;
import net.minecraft.client.animation.Keyframe;
import net.minecraft.client.animation.KeyframeAnimations;

/**
 * The sniffer's sneeze (docs/FIXES_0_4.md "Sniffers water crops"), for vanilla's sniffer model (parts body, head,
 * nose, left_ear, right_ear): a long breath in with the head thrown back and the nose flaring, the big sneeze at
 * 1.05 s (amber.SnifferWatering#ACHOO_AT ticks: the spray) snapping the head down and the ears out, then a shake.
 */
public final class SnifferSneezeAnimation {
    private SnifferSneezeAnimation() {}

    private static Keyframe rot(float t, float x, float y, float z) {
        return new Keyframe(t, KeyframeAnimations.degreeVec(x, y, z), AnimationChannel.Interpolations.CATMULLROM);
    }

    private static Keyframe scale(float t, float x, float y, float z) {
        return new Keyframe(t, KeyframeAnimations.scaleVec(x, y, z), AnimationChannel.Interpolations.CATMULLROM);
    }

    private static Keyframe pos(float t, float x, float y, float z) {
        return new Keyframe(t, KeyframeAnimations.posVec(x, y, z), AnimationChannel.Interpolations.CATMULLROM);
    }

    public static final AnimationDefinition SNEEZE = AnimationDefinition.Builder.withLength(2.0f)
            .addAnimation("head", new AnimationChannel(AnimationChannel.Targets.ROTATION,
                    rot(0.0f, 0, 0, 0), rot(0.35f, -12, 0, 0), rot(0.7f, -24, 0, 3), rot(0.95f, -30, 0, -3),
                    rot(1.05f, 22, 0, 0), rot(1.2f, 14, 0, 0), rot(1.35f, 6, 8, 0), rot(1.5f, 6, -8, 0),
                    rot(1.65f, 3, 5, 0), rot(2.0f, 0, 0, 0)))
            .addAnimation("head", new AnimationChannel(AnimationChannel.Targets.POSITION,
                    pos(0.0f, 0, 0, 0), pos(0.95f, 0, 1.0f, 1.0f), pos(1.05f, 0, -1.0f, -2.0f), pos(1.4f, 0, 0, -0.5f),
                    pos(2.0f, 0, 0, 0)))
            .addAnimation("nose", new AnimationChannel(AnimationChannel.Targets.SCALE,
                    scale(0.0f, 1, 1, 1), scale(0.5f, 1.15f, 1.5f, 1), scale(0.95f, 1.3f, 2.2f, 1.1f),
                    scale(1.05f, 0.9f, 0.4f, 1), scale(1.2f, 1.1f, 1.3f, 1), scale(1.45f, 1, 1, 1), scale(2.0f, 1, 1, 1)))
            .addAnimation("left_ear", new AnimationChannel(AnimationChannel.Targets.ROTATION,
                    rot(0.0f, 0, 0, 0), rot(0.95f, 0, 0, -12), rot(1.05f, 0, 0, 35), rot(1.3f, 0, 0, -10), rot(1.6f, 0, 0, 6),
                    rot(2.0f, 0, 0, 0)))
            .addAnimation("right_ear", new AnimationChannel(AnimationChannel.Targets.ROTATION,
                    rot(0.0f, 0, 0, 0), rot(0.95f, 0, 0, 12), rot(1.05f, 0, 0, -35), rot(1.3f, 0, 0, 10), rot(1.6f, 0, 0, -6),
                    rot(2.0f, 0, 0, 0)))
            .addAnimation("body", new AnimationChannel(AnimationChannel.Targets.ROTATION,
                    rot(0.0f, 0, 0, 0), rot(0.9f, -4, 0, 0), rot(1.05f, 5, 0, 0), rot(1.4f, -1, 0, 0), rot(2.0f, 0, 0, 0)))
            .addAnimation("body", new AnimationChannel(AnimationChannel.Targets.POSITION,
                    pos(0.0f, 0, 0, 0), pos(0.9f, 0, 0.5f, 0.6f), pos(1.05f, 0, -0.4f, -1.0f), pos(1.5f, 0, 0, 0), pos(2.0f, 0, 0, 0)))
            .build();
}
