package dev.lowpix.winterworks.client.endmob;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.end.Eclipse;
import dev.lowpix.winterworks.endmob.EndBloomBlock;
import dev.lowpix.winterworks.endmob.Endling;
import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.core.BlockPos;
import net.minecraft.util.Mth;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.state.BlockState;

/**
 * The Endling (lowpix model `endling`): `idle`, `walk` / `run` with its legs, `sit`, `hop` (happy), `teleport` and
 * `sacrifice`; its eyes glow. Whatever grows on its head is drawn at the `head_plant` locator as that plant's block model
 * (or its item model, for a plant that isn't a block). A sacrificing Endling burns bright.
 */
public class EndlingRenderer extends EndMobRenderer<Endling> {
    public EndlingRenderer(EntityRendererProvider.Context ctx) {
        super(ctx, new Model(ctx.bakeLayer(EndMobClient.ENDLING)), 0.3f);
        addLayer(new HeadPlant(this));
    }

    @Override
    protected int getBlockLightLevel(Endling e, BlockPos pos) {
        return e.isSacrificing() ? 15 : super.getBlockLightLevel(e, pos);
    }

    static class Model extends EndMobModel<Endling> {
        Model(ModelPart root) {
            super(root, "endling");
        }

        @Override
        public void setupAnim(Endling e, float limbSwing, float limbAmount, float age, float headYaw, float headPitch) {
            reset();
            if (e.isSacrificing()) {
                play(e.sacrificeState, "sacrifice", age, 1f);
                return;
            }
            if (e.isInSittingPose()) {
                play(e.sitState, "sit", age, 1f);
            } else if (limbAmount > 0.65f && hasClip("run")) {
                walk("run", limbSwing, limbAmount, 1.5f, 2.0f);
            } else {
                walk("walk", limbSwing, limbAmount, 1.5f, 2.5f);
            }
            play(e.idleState, "idle", age, 1f);
            play(e.hopState, "hop", age, 1f);
            play(e.teleportState, "teleport", age, 1f);
            float yaw = Mth.clamp(headYaw, -50f, 50f) * Mth.DEG_TO_RAD, pitch = headPitch * Mth.DEG_TO_RAD;
            get("head").ifPresent(p -> {
                p.yRot += yaw * 0.8f;
                p.xRot += pitch * 0.6f;
                p.zRot += Mth.sin(age * 0.05f) * 0.04f;   // a curious little head tilt
            });
        }
    }

    /** The plant on its head, at the head_plant locator, as the plant's block (or item) model. */
    static class HeadPlant extends RenderLayer<Endling, EndMobModel<Endling>> {
        HeadPlant(EndlingRenderer parent) {
            super(parent);
        }

        @Override
        public void render(PoseStack pose, MultiBufferSource buffers, int light, Endling e, float limbSwing, float limbAmount,
                           float partial, float age, float headYaw, float headPitch) {
            ItemStack plant = e.getHeadPlant();
            EndMobModel<Endling> m = getParentModel();
            List<ModelPart> chain = m.chain("head_plant");
            if (plant.isEmpty() || e.isInvisible() || chain.isEmpty()) {
                return;
            }
            pose.pushPose();
            m.applyChain(chain, pose);
            pose.mulPose(Axis.ZP.rotationDegrees(180f));   // model space is upside down: back to world up
            Minecraft mc = Minecraft.getInstance();
            if (plant.getItem() instanceof BlockItem bi) {
                BlockState s = bi.getBlock().defaultBlockState();
                if (s.hasProperty(EndBloomBlock.OPEN)) {
                    s = s.setValue(EndBloomBlock.OPEN, Eclipse.isActive(e.level()));
                }
                float k = 0.55f;
                pose.scale(k, k, k);
                pose.translate(-0.5f, -0.06f, -0.5f);
                mc.getBlockRenderer().renderSingleBlock(s, pose, buffers, light, OverlayTexture.NO_OVERLAY);
            } else {
                pose.translate(0f, 0.25f, 0f);
                pose.scale(0.5f, 0.5f, 0.5f);
                mc.getItemRenderer().renderStatic(plant, ItemDisplayContext.FIXED, light, OverlayTexture.NO_OVERLAY, pose, buffers,
                        e.level(), e.getId());
            }
            pose.popPose();
        }
    }
}
