package dev.lowpix.winterworks.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.lowpix.winterworks.express.CoasterLoop;
import dev.lowpix.winterworks.net.CouplingPayload;
import java.util.HashMap;
import java.util.Map;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderContext;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.LevelRenderer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;

/** Client side of couplings: remembers which carts are chained and draws the chain between them. */
public final class ClientTrains {
    private static final Map<Integer, Integer> LINKS = new HashMap<>();   // front id -> back id
    private static final ResourceLocation CHAIN = ResourceLocation.withDefaultNamespace("textures/block/chain.png");

    private ClientTrains() {}

    public static void init() {
        ClientPlayNetworking.registerGlobalReceiver(CouplingPayload.TYPE, (payload, ctx) -> {
            if (payload.linked()) {
                LINKS.put(payload.front(), payload.back());
            } else {
                LINKS.remove(payload.front(), payload.back());
            }
        });
        WorldRenderEvents.AFTER_ENTITIES.register(ClientTrains::render);
    }

    private static void render(WorldRenderContext ctx) {
        ClientLevel level = ctx.world();
        if (LINKS.isEmpty() || level == null || ctx.consumers() == null) {
            return;
        }
        float partial = ctx.tickCounter().getGameTimeDeltaPartialTick(false);
        Vec3 cam = ctx.camera().getPosition();
        PoseStack pose = ctx.matrixStack();
        MultiBufferSource buffers = ctx.consumers();
        VertexConsumer vc = buffers.getBuffer(RenderType.entityCutoutNoCull(CHAIN));
        LINKS.entrySet().removeIf(e -> level.getEntity(e.getKey()) == null && level.getEntity(e.getValue()) == null);
        for (Map.Entry<Integer, Integer> e : LINKS.entrySet()) {
            Entity f = level.getEntity(e.getKey()), b = level.getEntity(e.getValue());
            if (f == null || b == null) {
                continue;
            }
            Vec3 pf = f.getPosition(partial).add(CoasterLoop.upOf(f, partial).scale(0.42));
            Vec3 pb = b.getPosition(partial).add(CoasterLoop.upOf(b, partial).scale(0.42));
            Vec3 d = pb.subtract(pf);
            double len = d.length();
            if (len < 0.1) {
                continue;
            }
            Vec3 n = d.scale(1 / len);
            Vec3 a = pf.add(n.scale(0.5)), c = pb.subtract(n.scale(0.5));   // from coupler to coupler
            int light = LevelRenderer.getLightColor(level, BlockPos.containing(a.add(c).scale(0.5)));
            pose.pushPose();
            pose.translate(-cam.x, -cam.y, -cam.z);
            drawChain(pose.last(), vc, a, c, light);
            pose.popPose();
        }
    }

    /** Two crossed strips with the vanilla chain texture, sagging a little in the middle. */
    private static void drawChain(PoseStack.Pose pose, VertexConsumer vc, Vec3 a, Vec3 c, int light) {
        int segs = 6;
        double len = a.distanceTo(c);
        double sag = Math.max(0.0, 0.25 - len * 0.08);
        Vec3 dir = c.subtract(a).normalize();
        Vec3 side = dir.cross(new Vec3(0, 1, 0));
        if (side.lengthSqr() < 1e-4) {
            side = new Vec3(1, 0, 0);
        }
        side = side.normalize().scale(1.5 / 16.0);
        Vec3 up = new Vec3(0, 1.5 / 16.0, 0);
        for (int s = 0; s < segs; s++) {
            double t0 = s / (double) segs, t1 = (s + 1) / (double) segs;
            Vec3 p0 = a.lerp(c, t0).subtract(0, sag * 4 * t0 * (1 - t0), 0);
            Vec3 p1 = a.lerp(c, t1).subtract(0, sag * 4 * t1 * (1 - t1), 0);
            float v0 = (float) (t0 * len), v1 = (float) (t1 * len);
            quad(pose, vc, p0, p1, side, 0f, 3f / 16f, v0, v1, light);
            quad(pose, vc, p0, p1, up, 3f / 16f, 6f / 16f, v0, v1, light);
        }
    }

    private static void quad(PoseStack.Pose pose, VertexConsumer vc, Vec3 p0, Vec3 p1, Vec3 w, float u0, float u1, float v0, float v1, int light) {
        Vec3 n = p1.subtract(p0).cross(w).normalize();
        vert(pose, vc, p0.subtract(w), u0, v0, light, n);
        vert(pose, vc, p0.add(w), u1, v0, light, n);
        vert(pose, vc, p1.add(w), u1, v1, light, n);
        vert(pose, vc, p1.subtract(w), u0, v1, light, n);
    }

    private static void vert(PoseStack.Pose pose, VertexConsumer vc, Vec3 p, float u, float v, int light, Vec3 n) {
        vc.addVertex(pose, (float) p.x, (float) p.y, (float) p.z).setColor(255, 255, 255, 255).setUv(u, v % 1.0f == 0 && v > 0 ? 1f : v % 1.0f)
                .setOverlay(OverlayTexture.NO_OVERLAY).setLight(light).setNormal(pose, (float) n.x, (float) n.y, (float) n.z);
    }
}
