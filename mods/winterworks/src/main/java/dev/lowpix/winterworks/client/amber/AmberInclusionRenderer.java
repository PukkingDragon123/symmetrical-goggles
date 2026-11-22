package dev.lowpix.winterworks.client.amber;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.amber.AmberBlock;
import dev.lowpix.winterworks.amber.AmberInclusionBlockEntity;
import dev.lowpix.winterworks.client.render.WWModel;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderer;
import net.minecraft.client.renderer.blockentity.BlockEntityRendererProvider;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.block.state.BlockState;
import org.joml.Vector3f;

/**
 * Draws what is trapped in natural amber, in full 3D, inside the translucent block (docs/HEXES_UPDATE.md section 10):
 * a mosquito (lowpix `mosquito`, frozen mid-flight) or a seed (lowpix `amber_seed`). Each is scaled to fit the block
 * and turns very slowly. A missing model or texture draws nothing / the missing texture; it never crashes.
 */
public class AmberInclusionRenderer implements BlockEntityRenderer<AmberInclusionBlockEntity> {
    private final Inclusion mosquito, seed, egg;

    public AmberInclusionRenderer(BlockEntityRendererProvider.Context ctx) {
        mosquito = new Inclusion(new WWModel<>(ctx.bakeLayer(AmberClient.MOSQUITO), "mosquito"), "fly", 0.04f, 0.6f);
        seed = new Inclusion(new WWModel<>(ctx.bakeLayer(AmberClient.AMBER_SEED), "amber_seed"), null, 0f, 0.8f);   // no clips: frozen
        egg = new Inclusion(new WWModel<>(ctx.bakeLayer(AmberClient.AMBER_EGG), "amber_egg"), null, 0f, 0.6f);   // a Harvester Egg
    }

    @Override
    public void render(AmberInclusionBlockEntity be, float partial, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
        BlockState state = be.getLevel() != null ? be.getLevel().getBlockState(be.getBlockPos()) : be.getBlockState();
        if (!state.is(be.getBlockState().getBlock()) || !state.hasProperty(AmberBlock.INCLUSION)) {
            return;
        }
        Inclusion inc = switch (state.getValue(AmberBlock.INCLUSION)) {
            case MOSQUITO -> mosquito;
            case SEED -> seed;
            case EGG -> egg;
            default -> null;
        };
        if (inc == null || inc.empty()) {
            return;
        }
        float t = (be.getLevel() != null ? be.getLevel().getGameTime() : 0) + partial;
        float yaw = be.baseYaw() + Mth.sin(t * 0.012f + be.baseYaw()) * 14f;   // slowly turning a little, back and forth
        pose.pushPose();
        pose.translate(0.5f, 0.5f, 0.5f);
        pose.mulPose(Axis.YP.rotationDegrees(yaw));
        pose.mulPose(Axis.XP.rotationDegrees(be.baseTilt()));
        inc.render(pose, buffers, light, overlay);
        pose.popPose();
    }

    /** A lowpix model posed once, with its bounds measured so it can be centred and scaled into the block. */
    static final class Inclusion {
        private final WWModel<Entity> model;
        private final String clip;
        private final float clipTime;
        private float cx, cy, cz, scale;
        private boolean empty = true;

        Inclusion(WWModel<Entity> model, String clip, float clipTime, float fit) {
            this.model = model;
            this.clip = clip;
            this.clipTime = clipTime;
            pose();
            float[] lo = {Float.MAX_VALUE, Float.MAX_VALUE, Float.MAX_VALUE}, hi = {-Float.MAX_VALUE, -Float.MAX_VALUE, -Float.MAX_VALUE};
            Vector3f v = new Vector3f();
            model.root().visit(new PoseStack(), (p, path, i, c) -> {
                for (int k = 0; k < 8; k++) {
                    p.pose().transformPosition((k & 1) == 0 ? c.minX / 16f : c.maxX / 16f, (k & 2) == 0 ? c.minY / 16f : c.maxY / 16f,
                            (k & 4) == 0 ? c.minZ / 16f : c.maxZ / 16f, v);
                    lo[0] = Math.min(lo[0], v.x);
                    lo[1] = Math.min(lo[1], v.y);
                    lo[2] = Math.min(lo[2], v.z);
                    hi[0] = Math.max(hi[0], v.x);
                    hi[1] = Math.max(hi[1], v.y);
                    hi[2] = Math.max(hi[2], v.z);
                }
            });
            if (hi[0] >= lo[0]) {
                empty = false;
                cx = (lo[0] + hi[0]) / 2f;
                cy = (lo[1] + hi[1]) / 2f;
                cz = (lo[2] + hi[2]) / 2f;
                // it turns: fit the horizontal diagonal as well as the height
                float size = Math.max((float) Math.hypot(hi[0] - lo[0], hi[2] - lo[2]), hi[1] - lo[1]);
                scale = size > 1e-4f ? fit / size : 1f;
            }
        }

        private void pose() {
            model.reset();
            if (clip != null) {
                model.clip(clip, clipTime);   // frozen mid-flight
            }
        }

        boolean empty() {
            return empty;
        }

        void render(PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
            pose();
            pose.scale(scale, scale, scale);
            pose.scale(-1f, -1f, 1f);   // entity model space: Y down, facing -Z
            pose.translate(-cx, -cy, -cz);
            model.renderToBuffer(pose, buffers.getBuffer(RenderType.entityCutoutNoCull(model.texture)), light, overlay, 0xFFFFFFFF);
        }
    }
}
