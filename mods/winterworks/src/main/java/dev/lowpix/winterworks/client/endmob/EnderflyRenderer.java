package dev.lowpix.winterworks.client.endmob;

import dev.lowpix.winterworks.endmob.Enderfly;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.util.Mth;

/**
 * The Enderfly (lowpix model `enderfly`): `fly` while it moves, `hover` while it hangs in the air, `dive` while diving,
 * `teleport` when it blinks. Its eyes and wing eye-spots glow.
 */
public class EnderflyRenderer extends EndMobRenderer<Enderfly> {
    public EnderflyRenderer(EntityRendererProvider.Context ctx) {
        super(ctx, new Model(ctx.bakeLayer(EndMobClient.ENDERFLY)), 0.3f);
    }

    static class Model extends EndMobModel<Enderfly> {
        Model(ModelPart root) {
            super(root, "enderfly");
        }

        @Override
        public void setupAnim(Enderfly e, float limbSwing, float limbAmount, float age, float headYaw, float headPitch) {
            reset();
            play(e.flyState, "fly", age, 1f);
            play(e.hoverState, "hover", age, 1f);
            play(e.diveState, "dive", age, 1f);
            play(e.teleportState, "teleport", age, 1f);
            float yaw = Mth.clamp(headYaw, -40f, 40f) * Mth.DEG_TO_RAD, pitch = headPitch * Mth.DEG_TO_RAD;
            get("head").ifPresent(p -> {
                p.yRot += yaw * 0.6f;
                p.xRot += pitch * 0.5f;
            });
        }
    }
}
