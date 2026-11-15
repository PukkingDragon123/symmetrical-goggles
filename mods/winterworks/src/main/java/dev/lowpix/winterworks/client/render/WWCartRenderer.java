package dev.lowpix.winterworks.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.client.WWLayers;
import dev.lowpix.winterworks.express.CartKind;
import dev.lowpix.winterworks.express.LocomotiveCart;
import dev.lowpix.winterworks.express.WWCart;
import java.util.EnumMap;
import java.util.Map;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.item.DyeColor;
import net.minecraft.world.phys.Vec3;

/** Draws Winter Express carts on the track like vanilla minecarts, with their own models, faced the way they travel. */
public class WWCartRenderer extends EntityRenderer<WWCart> {
    private final Map<CartKind, WWModel<WWCart>> models = new EnumMap<>(CartKind.class);

    public WWCartRenderer(EntityRendererProvider.Context ctx) {
        super(ctx);
        this.shadowRadius = 0.6f;
        for (CartKind k : CartKind.values()) {
            models.put(k, new WWModel<>(ctx.bakeLayer(WWLayers.cart(k)), k.id));
        }
    }

    @Override
    public ResourceLocation getTextureLocation(WWCart cart) {
        return models.get(cart.kind).texture;
    }

    @Override
    public void render(WWCart cart, float yaw, float partial, PoseStack pose, MultiBufferSource buffers, int light) {
        super.render(cart, yaw, partial, pose, buffers, light);
        pose.pushPose();
        double x = Mth.lerp(partial, cart.xOld, cart.getX());
        double y = Mth.lerp(partial, cart.yOld, cart.getY());
        double z = Mth.lerp(partial, cart.zOld, cart.getZ());
        float pitch = Mth.lerp(partial, cart.xRotO, cart.getXRot());
        Vec3 track = null;
        Vec3 p = cart.getPos(x, y, z);
        if (p != null) {
            Vec3 a = cart.getPosOffs(x, y, z, 0.3f);
            Vec3 b = cart.getPosOffs(x, y, z, -0.3f);
            if (a == null) {
                a = p;
            }
            if (b == null) {
                b = p;
            }
            pose.translate(p.x - x, (a.y + b.y) / 2.0 - y, p.z - z);
            Vec3 d = b.subtract(a);
            if (d.length() != 0.0) {
                d = d.normalize();
                yaw = (float) (Math.atan2(d.z, d.x) * Mth.RAD_TO_DEG);
                pitch = (float) (Math.atan(d.y) * 73.0);
                track = new Vec3(d.x, 0, d.z).normalize();
            }
        }
        if (track == null) {
            track = new Vec3(Mth.cos(yaw * Mth.DEG_TO_RAD), 0, Mth.sin(yaw * Mth.DEG_TO_RAD));
        }
        // which way along the track the model's nose points
        Vec3 want = null;
        if (cart instanceof LocomotiveCart loco) {
            want = loco.heading();
        } else {
            Vec3 v = new Vec3(cart.getX() - cart.xOld, 0, cart.getZ() - cart.zOld);
            if (v.lengthSqr() > 1.0e-5) {
                want = v.normalize();
            }
        }
        if (want != null && Math.abs(want.dot(track)) > 0.2) {
            cart.renderFacing = want.dot(track) >= 0 ? 1f : -1f;
        }
        pose.mulPose(Axis.YP.rotationDegrees(180.0f - yaw));
        pose.mulPose(Axis.ZP.rotationDegrees(-pitch));
        float hurt = cart.getHurtTime() - partial;
        float dmg = Math.max(0f, cart.getDamage() - partial);
        if (hurt > 0f) {
            pose.mulPose(Axis.XP.rotationDegrees(Mth.sin(hurt) * hurt * dmg / 10.0f * cart.getHurtDir()));
        }
        pose.mulPose(Axis.YP.rotationDegrees(cart.renderFacing > 0 ? 90f : -90f));
        pose.translate(0.0, 1.5 + 0.02, 0.0);
        pose.scale(-1.0f, -1.0f, 1.0f);

        WWModel<WWCart> model = models.get(cart.kind);
        float age = cart.tickCount + partial;
        model.reset();
        float wheelRate = (float) Math.min(8.0, cart.clientSpeed * (cart.kind.locomotive ? 11.3 : 15.0));   // revolutions per second for the wheel size
        model.play(cart.runState, "run", age, Math.max(0.3f, wheelRate));
        model.play(cart.idleState, "idle", age, 1f);
        String action = cart.kind == CartKind.DRAGON_LOCOMOTIVE ? "roar" : "whistle";
        model.play(cart.actionState, action, age, 1f);
        int trim = cart.trimColor() < 0 ? defaultTrim(cart.kind) : DyeColor.byId(cart.trimColor()).getTextureDiffuseColor() & 0xFFFFFF;
        int seat = cart.seatColor() < 0 ? 0xC8B89A : DyeColor.byId(cart.seatColor()).getTextureDiffuseColor() & 0xFFFFFF;
        model.renderAll(pose, buffers, light, OverlayTexture.NO_OVERLAY, trim, seat, RenderType.entityCutoutNoCull(model.texture));
        pose.popPose();
    }

    private static int defaultTrim(CartKind k) {
        return switch (k) {
            case LOCOMOTIVE -> 0xB0302A;
            case DRAGON_LOCOMOTIVE -> 0xC89A30;
            case FOX_CART -> 0xE8E0D0;
            case ZOMBIE_CART -> 0x6A8A4A;
            case TRAILER_CART -> 0x3A6AA8;
        };
    }
}
