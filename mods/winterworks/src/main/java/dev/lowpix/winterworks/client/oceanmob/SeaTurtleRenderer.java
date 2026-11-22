package dev.lowpix.winterworks.client.oceanmob;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.oceanmob.SeaTurtle;
import java.util.Map;
import java.util.WeakHashMap;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.animal.Turtle;

/**
 * Every vanilla turtle, drawn with the lowpix `sea_turtle` (adults, 1.0) and `sea_turtle_baby` models (built at twice
 * hatchling size: drawn at 0.5, i.e. 0.5 / 0.3 over vanilla's 0.3 baby scale). In the water it glides: stroke rate follows
 * its speed (strokes, then a glide with the flippers out), the body pitches with climbs and dives and banks into turns,
 * and it lifts its head at the surface for air. On land it walks, idles, basks on the sand (`bask`), and digs while it
 * lays its eggs (`dig`). The motion is smoothed per turtle on the client.
 */
public class SeaTurtleRenderer extends MobRenderer<Turtle, SeaTurtleRenderer.Model> {
    public static final float BABY_SCALE = 0.5f / 0.3f;
    private final Model adult, baby;
    private final Map<Turtle, Swim> swims = new WeakHashMap<>();

    public SeaTurtleRenderer(EntityRendererProvider.Context ctx) {
        super(ctx, new Model(ctx.bakeLayer(OceanMobClient.SEA_TURTLE), "sea_turtle"), 0.7f);
        adult = model;
        baby = new Model(ctx.bakeLayer(OceanMobClient.SEA_TURTLE_BABY), "sea_turtle_baby");
    }

    @Override
    public ResourceLocation getTextureLocation(Turtle e) {
        return (e.isBaby() ? baby : adult).texture;
    }

    @Override
    public void render(Turtle e, float yaw, float partial, PoseStack pose, MultiBufferSource buffers, int light) {
        model = e.isBaby() ? baby : adult;
        shadowRadius = e.isBaby() ? 0.25f : 0.8f;
        Swim s = swims.computeIfAbsent(e, k -> new Swim());
        s.update(e, e.tickCount + partial);
        model.swim = s;
        super.render(e, yaw, partial, pose, buffers, light);
    }

    @Override
    protected void scale(Turtle e, PoseStack pose, float partial) {
        if (e.isBaby()) {
            pose.scale(BABY_SCALE, BABY_SCALE, BABY_SCALE);
        }
    }

    @Override
    protected void setupRotations(Turtle e, PoseStack pose, float bob, float yaw, float partial, float scale) {
        super.setupRotations(e, pose, bob, yaw, partial, scale);
        Swim s = swims.get(e);
        if (s == null || e.deathTime > 0) {
            return;
        }
        float pivot = (e.isBaby() ? 0.5f : 1f) * 4f / 16f;
        pose.translate(0f, pivot, 0f);
        pose.mulPose(Axis.ZP.rotationDegrees(s.roll));
        pose.mulPose(Axis.XP.rotationDegrees(-s.pitch));
        pose.translate(0f, -pivot, 0f);
    }

    /** One turtle's smoothed swimming state (client only). */
    static final class Swim {
        float lastAge = Float.NaN, stroke, pitch, roll, water, bask, prevYaw, surface;

        void update(Turtle e, float age) {
            float dt = Float.isNaN(lastAge) ? 0f : Mth.clamp(age - lastAge, 0f, 5f);
            lastAge = age;
            if (dt <= 0f) {
                prevYaw = e.yBodyRot;
                return;
            }
            double vx = e.getX() - e.xo, vy = e.getY() - e.yo, vz = e.getZ() - e.zo;
            double horiz = Math.sqrt(vx * vx + vz * vz), speed = Math.sqrt(horiz * horiz + vy * vy);
            boolean inWater = e.isInWater();
            float k = 1f - (float) Math.pow(0.88, dt);   // easing per tick
            water += ((inWater ? 1f : 0f) - water) * k;
            bask += ((((SeaTurtle) e).ww$isBasking() ? 1f : 0f) - bask) * k * 0.5f;
            surface += ((((SeaTurtle) e).ww$isSurfacing() && inWater ? 1f : 0f) - surface) * k * 0.5f;
            // strokes speed up with speed; slow, gliding strokes when coasting
            float rate = inWater ? Mth.clamp(0.3f + (float) speed * 9f, 0.3f, 1.5f) : 1f;
            stroke += dt / 20f * rate;
            // pitch with climbs and dives, bank into turns
            float wantPitch = inWater && speed > 0.01 ? Mth.clamp((float) -Math.toDegrees(Math.atan2(vy, Math.max(horiz, 0.02))), -35f, 35f) : 0f;
            if (inWater && surface > 0.5f) {
                wantPitch = Math.min(wantPitch, -8f);   // nose up, at the surface
            }
            float yawRate = Mth.wrapDegrees(e.yBodyRot - prevYaw) / dt;
            prevYaw = e.yBodyRot;
            float wantRoll = inWater ? Mth.clamp(-yawRate * 2.2f, -28f, 28f) : 0f;   // the inside flipper dips
            pitch += (wantPitch - pitch) * k * 0.6f;
            roll += (wantRoll - roll) * k * 0.5f;
        }
    }

    public static class Model extends OceanModel<Turtle> {
        Swim swim;

        Model(ModelPart root, String name) {
            super(root, name);
        }

        @Override
        public void setupAnim(Turtle e, float limbSwing, float limbAmount, float age, float headYaw, float headPitch) {
            reset();
            Swim s = swim;
            float t = age / 20f;
            float water = s == null ? (e.isInWater() ? 1f : 0f) : s.water;
            if (e.isLayingEgg()) {
                float len = lengthOf("dig");
                blend("dig", t % len, 1f);
                return;
            }
            // in the water: strokes and glides
            if (water > 0.01f) {
                blend("swim", s == null ? t : s.stroke, water);
            }
            // on land: walk, idle, bask
            float land = 1f - water;
            if (land > 0.01f) {
                float bask = s == null ? 0f : s.bask;
                float walking = Mth.clamp(limbAmount * 3f, 0f, 1f) * (1f - bask);
                blend("idle", t, land * (1f - walking) * (1f - bask));
                blend("bask", t, land * bask);
                if (walking > 0.01f) {
                    float len = lengthOf("walk");
                    blend("walk", (limbSwing * (e.isBaby() ? 0.35f : 0.2f)) % len, land * walking);
                }
                // looks about a little on land
                float yaw = Mth.clamp(headYaw, -35f, 35f) * Mth.DEG_TO_RAD * (1f - bask);
                get("neck").ifPresent(p -> p.yRot += yaw * 0.6f);
                get("head").ifPresent(p -> p.yRot += yaw * 0.4f);
            }
            if (s != null && s.surface > 0.01f) {   // head up for air
                float up = -0.45f * s.surface;
                get("neck").ifPresent(p -> p.xRot += up);
                get("head").ifPresent(p -> p.xRot += up * 0.5f);
            }
        }
    }
}
