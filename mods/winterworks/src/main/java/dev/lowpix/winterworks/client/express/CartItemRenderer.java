package dev.lowpix.winterworks.client.express;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.client.WWLayers;
import dev.lowpix.winterworks.client.render.WWCartRenderer;
import dev.lowpix.winterworks.client.render.WWModel;
import dev.lowpix.winterworks.express.CartKind;
import dev.lowpix.winterworks.express.WWCart;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import org.joml.Vector3f;

/**
 * A Winter Express cart item drawn as the cart's own 3D model (inventory icon, in hand, on the ground, in frames):
 * fitted into the item's one-block cube, long side along x, with the default trim and seat colours. The item model
 * (builtin/entity) turns it three-quarters in the GUI like a block.
 */
public class CartItemRenderer implements BuiltinItemRendererRegistry.DynamicItemRenderer {
    private final CartKind kind;
    private WWModel<WWCart> model;
    /** Model bounds in render space (blocks, after the usual 1.5 lift and flip): centre and the longest side. */
    private Vector3f centre;
    private float size = 1f;

    public CartItemRenderer(CartKind kind) {
        this.kind = kind;
    }

    private WWModel<WWCart> model() {
        if (model == null) {
            model = new WWModel<>(Minecraft.getInstance().getEntityModels().bakeLayer(WWLayers.cart(kind)), kind.id);
            model.reset();
            float[] lo = {Float.MAX_VALUE, Float.MAX_VALUE, Float.MAX_VALUE}, hi = {-Float.MAX_VALUE, -Float.MAX_VALUE, -Float.MAX_VALUE};
            PoseStack ps = new PoseStack();
            ps.translate(0f, 1.5f, 0f);
            ps.scale(-1f, -1f, 1f);
            model.root().visit(ps, (p, path, i, cube) -> {
                for (int c = 0; c < 8; c++) {
                    Vector3f v = new Vector3f((c & 1) == 0 ? cube.minX : cube.maxX, (c & 2) == 0 ? cube.minY : cube.maxY,
                            (c & 4) == 0 ? cube.minZ : cube.maxZ).div(16f);
                    p.pose().transformPosition(v);
                    lo[0] = Math.min(lo[0], v.x);
                    lo[1] = Math.min(lo[1], v.y);
                    lo[2] = Math.min(lo[2], v.z);
                    hi[0] = Math.max(hi[0], v.x);
                    hi[1] = Math.max(hi[1], v.y);
                    hi[2] = Math.max(hi[2], v.z);
                }
            });
            if (lo[0] <= hi[0]) {
                centre = new Vector3f((lo[0] + hi[0]) / 2f, (lo[1] + hi[1]) / 2f, (lo[2] + hi[2]) / 2f);
                size = Math.max(hi[0] - lo[0], Math.max(hi[1] - lo[1], hi[2] - lo[2]));
            } else {
                centre = new Vector3f(0f, 0.5f, 0f);
            }
        }
        return model;
    }

    @Override
    public void render(ItemStack stack, ItemDisplayContext mode, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
        WWModel<WWCart> m = model();
        m.reset();
        pose.pushPose();
        pose.translate(0.5f, 0.5f, 0.5f);
        float s = 0.98f / Math.max(0.5f, size);
        pose.scale(s, s, s);
        pose.mulPose(Axis.YP.rotationDegrees(90f));   // the cart's length (its z) along the item's x
        pose.translate(-centre.x, -centre.y, -centre.z);
        pose.translate(0f, 1.5f, 0f);
        pose.scale(-1f, -1f, 1f);
        m.renderAll(pose, buffers, light, overlay, WWCartRenderer.defaultTrim(kind), 0xC8B89A, RenderType.entityCutoutNoCull(m.texture));
        pose.popPose();
    }
}
