package dev.lowpix.winterworks.client.endgear;

import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.end.Petrify;
import dev.lowpix.winterworks.registry.EndEffects;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.LivingEntity;

/**
 * The obsidian shell round a petrified entity (end.Petrify): a box just outside its bounding box, tiled with
 * {@code entity/obsidian_shell} (one tile per block; crying obsidian until the art lands), see-through enough to make
 * out who's inside. It flickers in its last second before it shatters. A petrified player sees the crust over the
 * edges of their screen.
 */
public final class PetrifyShell {
    public static final ResourceLocation SHELL = Winterworks.id("textures/entity/obsidian_shell.png");
    private static final ResourceLocation STAND_IN = ResourceLocation.withDefaultNamespace("textures/block/crying_obsidian.png");
    private static Boolean hasArt;

    private PetrifyShell() {}

    static ResourceLocation texture() {
        if (hasArt == null) {
            hasArt = Minecraft.getInstance().getResourceManager().getResource(SHELL).isPresent();
        }
        return hasArt ? SHELL : STAND_IN;
    }

    static void reload() {
        hasArt = null;
    }

    /** Called after every living entity is drawn, with the pose at its feet. */
    public static void render(LivingEntity e, float partial, PoseStack pose, MultiBufferSource buffers, int light) {
        if (!Petrify.isFrozen(e)) {
            return;
        }
        MobEffectInstance fx = e.getEffect(EndEffects.PETRIFIED);
        float left = fx == null ? 100f : fx.getDuration() - partial;
        float alpha = e.getEffect(EndEffects.PETRIFIED).getAmplifier() == 0 ? 0.86f : 0.78f;
        if (left < 20f) {   // about to shatter: it flickers
            alpha *= 0.75f + 0.25f * Mth.abs(Mth.sin(left * 0.9f));
        }
        float w = e.getBbWidth() * 0.5f + 0.07f, h = e.getBbHeight() + 0.09f;
        VertexConsumer vc = buffers.getBuffer(RenderType.entityTranslucent(texture()));
        int a = (int) (alpha * 255f);
        box(pose.last(), vc, -w, -0.02f, -w, w, h, w, light, a);
    }

    /** A tiled box: each face is split into cells of at most one block, each showing (a part of) one tile. */
    private static void box(PoseStack.Pose p, VertexConsumer vc, float x0, float y0, float z0, float x1, float y1, float z1, int light, int a) {
        // +Y, -Y
        face(p, vc, light, a, 0, 1, 0, x0, y1, z1, 1, 0, 0, 0, 0, -1, x1 - x0, z1 - z0);
        face(p, vc, light, a, 0, -1, 0, x0, y0, z0, 1, 0, 0, 0, 0, 1, x1 - x0, z1 - z0);
        // -Z, +Z
        face(p, vc, light, a, 0, 0, -1, x1, y1, z0, -1, 0, 0, 0, -1, 0, x1 - x0, y1 - y0);
        face(p, vc, light, a, 0, 0, 1, x0, y1, z1, 1, 0, 0, 0, -1, 0, x1 - x0, y1 - y0);
        // -X, +X
        face(p, vc, light, a, -1, 0, 0, x0, y1, z0, 0, 0, 1, 0, -1, 0, z1 - z0, y1 - y0);
        face(p, vc, light, a, 1, 0, 0, x1, y1, z1, 0, 0, -1, 0, -1, 0, z1 - z0, y1 - y0);
    }

    /** A face from corner o along u (length lu) and v (length lv), normal n, wound counter-clockwise seen from outside. */
    private static void face(PoseStack.Pose p, VertexConsumer vc, int light, int a, float nx, float ny, float nz,
                             float ox, float oy, float oz, float ux, float uy, float uz, float vx, float vy, float vz, float lu, float lv) {
        for (float su = 0; su < lu - 1e-4f; su += 1f) {
            float eu = Math.min(lu, su + 1f);
            for (float sv = 0; sv < lv - 1e-4f; sv += 1f) {
                float ev = Math.min(lv, sv + 1f);
                float tu0 = 0f, tu1 = eu - su, tv0 = 0f, tv1 = ev - sv;
                vertex(p, vc, ox + ux * su + vx * sv, oy + uy * su + vy * sv, oz + uz * su + vz * sv, tu0, tv0, light, a, nx, ny, nz);
                vertex(p, vc, ox + ux * su + vx * ev, oy + uy * su + vy * ev, oz + uz * su + vz * ev, tu0, tv1, light, a, nx, ny, nz);
                vertex(p, vc, ox + ux * eu + vx * ev, oy + uy * eu + vy * ev, oz + uz * eu + vz * ev, tu1, tv1, light, a, nx, ny, nz);
                vertex(p, vc, ox + ux * eu + vx * sv, oy + uy * eu + vy * sv, oz + uz * eu + vz * sv, tu1, tv0, light, a, nx, ny, nz);
            }
        }
    }

    private static void vertex(PoseStack.Pose p, VertexConsumer vc, float x, float y, float z, float u, float v, int light, int a,
                               float nx, float ny, float nz) {
        vc.addVertex(p, x, y, z).setColor(255, 255, 255, a).setUv(u, v).setOverlay(OverlayTexture.NO_OVERLAY).setLight(light)
                .setNormal(p, nx, ny, nz);
    }

    /** A petrified player sees the obsidian crust closing in round the edges of the screen. */
    public static void hud(GuiGraphics g, DeltaTracker delta) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || !Petrify.isFrozen(mc.player) || !mc.options.getCameraType().isFirstPerson()) {
            return;
        }
        int w = g.guiWidth(), h = g.guiHeight();
        int edge = Math.max(24, Math.min(w, h) / 7);
        ResourceLocation tex = texture();
        RenderSystem.enableBlend();
        RenderSystem.setShaderColor(1f, 1f, 1f, 0.82f);
        int tile = 48;
        g.blit(tex, 0, 0, 0, 0, w, edge, tile, tile);
        g.blit(tex, 0, h - edge, 0, 0, w, edge, tile, tile);
        g.blit(tex, 0, edge, 0, 0, edge, h - 2 * edge, tile, tile);
        g.blit(tex, w - edge, edge, 0, 0, edge, h - 2 * edge, tile, tile);
        RenderSystem.setShaderColor(1f, 1f, 1f, 0.22f);
        g.blit(tex, edge, edge, 0, 0, w - 2 * edge, h - 2 * edge, tile * 3, tile * 3);
        RenderSystem.setShaderColor(1f, 1f, 1f, 1f);
        RenderSystem.disableBlend();
    }
}
