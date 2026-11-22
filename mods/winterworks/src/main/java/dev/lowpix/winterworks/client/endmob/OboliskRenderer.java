package dev.lowpix.winterworks.client.endmob;

import dev.lowpix.winterworks.endmob.Obolisk;
import java.util.function.Predicate;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.util.FastColor;
import net.minecraft.util.Mth;

/**
 * The Obolisk (lowpix model `obolisk`): `disguised` (a rock: legs folded, eye shut), `rise`, `idle`, `walk`, `slam` and
 * `settle`, driven by its phase. Its eye and crying-obsidian veins glow; disguised, the veins only smoulder and the shut
 * eye stays dark.
 */
public class OboliskRenderer extends EndMobRenderer<Obolisk> {
    public OboliskRenderer(EntityRendererProvider.Context ctx) {
        super(ctx, new Model(ctx.bakeLayer(EndMobClient.OBOLISK)), 1.1f);
    }

    @Override
    protected Predicate<String> darkGlow(Obolisk e) {
        boolean shut = e.phase() == Obolisk.Phase.DISGUISED;
        return n -> shut && n.equals("eye");
    }

    @Override
    protected int glowColor(Obolisk e, float partial) {
        if (e.phase() != Obolisk.Phase.DISGUISED) {
            return 0xFFFFFFFF;
        }
        int k = (int) (90 + 40 * Mth.sin((e.tickCount + partial) * 0.05f));   // a slow smoulder
        return FastColor.ARGB32.color(255, k, k, k);
    }

    @Override
    protected float getFlipDegrees(Obolisk e) {
        return 0f;   // a monolith doesn't topple over sideways when it dies
    }

    static class Model extends EndMobModel<Obolisk> {
        Model(ModelPart root) {
            super(root, "obolisk");
        }

        @Override
        public void setupAnim(Obolisk e, float limbSwing, float limbAmount, float age, float headYaw, float headPitch) {
            reset();
            switch (e.phase()) {
                case DISGUISED -> play(e.disguisedState, "disguised", age, 1f);
                case RISING -> play(e.riseState, "rise", age, 1f);
                case SETTLING -> play(e.settleState, "settle", age, 1f);
                case SLAMMING -> play(e.slamState, "slam", age, 1f);
                case AWAKE -> {
                    walk("walk", limbSwing, limbAmount, 1.5f, 2.5f);
                    play(e.idleState, "idle", age, 1f);
                    float yaw = Mth.clamp(headYaw, -20f, 20f) * Mth.DEG_TO_RAD;
                    get("eye").ifPresent(p -> p.x += yaw * 2f);   // the eye follows you a little
                }
            }
        }
    }
}
