package dev.lowpix.winterworks.client.endgear;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.lowpix.winterworks.endgear.EndGearPayloads;
import dev.lowpix.winterworks.endgear.EndGlider;
import dev.lowpix.winterworks.registry.EndParticles;
import dev.lowpix.winterworks.registry.EndSounds;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderContext;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;
import org.joml.Vector3f;

/**
 * Client-side effects of the gear: the Monolith Wand's beam (a fading violet ray with a particle line), and the End
 * Glider's jets and wingbeats for everyone gliding with one (particles at the jets, flap and jet sounds; a torrent of
 * flame while boosting).
 */
public final class GearEffects {
    private static final List<Beam> BEAMS = new ArrayList<>();
    private static final int BEAM_TICKS = 10;
    private static final DustParticleOptions VIOLET = new DustParticleOptions(new Vector3f(0.62f, 0.3f, 1.0f), 1.1f);
    private static final DustParticleOptions GREY = new DustParticleOptions(new Vector3f(0.45f, 0.42f, 0.5f), 1.0f);

    private record Beam(Vec3 from, Vec3 to, boolean resisted, long born) {}

    private GearEffects() {}

    // ------------------------------------------------------------------------------------------------ wand beam

    static void onBeam(EndGearPayloads.WandBeam b) {
        Minecraft mc = Minecraft.getInstance();
        ClientLevel level = mc.level;
        if (level == null) {
            return;
        }
        BEAMS.add(new Beam(b.from(), b.to(), b.resisted(), level.getGameTime()));
        Vec3 d = b.to().subtract(b.from());
        double len = d.length();
        RandomSource r = level.random;
        for (double s = 0.4; s < len; s += 0.3) {
            Vec3 p = b.from().add(d.scale(s / len));
            level.addParticle(b.resisted() ? GREY : VIOLET, p.x, p.y, p.z, 0, 0, 0);
            if (r.nextInt(4) == 0) {
                level.addParticle(ParticleTypes.REVERSE_PORTAL, p.x, p.y, p.z, (r.nextDouble() - 0.5) * 0.05, 0.02, (r.nextDouble() - 0.5) * 0.05);
            }
        }
        for (int i = 0; i < 14; i++) {
            level.addParticle(b.resisted() ? ParticleTypes.SMOKE : EndParticles.OBSIDIAN_CRACK, b.to().x, b.to().y, b.to().z,
                    (r.nextDouble() - 0.5) * 0.3, r.nextDouble() * 0.25, (r.nextDouble() - 0.5) * 0.3);
        }
    }

    /** Draws the live beams (WorldRenderEvents.AFTER_ENTITIES). */
    static void renderBeams(WorldRenderContext ctx) {
        ClientLevel level = Minecraft.getInstance().level;
        if (BEAMS.isEmpty() || level == null || ctx.consumers() == null) {
            return;
        }
        float now = level.getGameTime() + ctx.tickCounter().getGameTimeDeltaPartialTick(false);
        Vec3 cam = ctx.camera().getPosition();
        PoseStack pose = ctx.matrixStack();
        MultiBufferSource buffers = ctx.consumers();
        VertexConsumer vc = buffers.getBuffer(RenderType.lightning());
        for (Iterator<Beam> it = BEAMS.iterator(); it.hasNext(); ) {
            Beam b = it.next();
            float age = now - b.born();
            if (age > BEAM_TICKS || age < -1) {
                it.remove();
                continue;
            }
            float k = 1f - Math.max(0f, age) / BEAM_TICKS;
            float width = 0.03f + 0.09f * k;
            int r = b.resisted() ? 150 : 170, g = b.resisted() ? 140 : 80, bl = b.resisted() ? 160 : 255;
            pose.pushPose();
            pose.translate(-cam.x, -cam.y, -cam.z);
            Matrix4f m = pose.last().pose();
            Vec3 axis = b.to().subtract(b.from()).normalize();
            Vec3 view = b.from().add(b.to()).scale(0.5).subtract(cam).normalize();
            Vec3 side = axis.cross(view);
            if (side.lengthSqr() < 1e-6) {
                side = axis.cross(new Vec3(0, 1, 0));
            }
            side = side.normalize();
            quad(vc, m, b.from(), b.to(), side.scale(width), r, g, bl, (int) (200 * k));
            quad(vc, m, b.from(), b.to(), side.scale(width * 0.35), 255, 230, 255, (int) (255 * k));
            pose.popPose();
        }
    }

    private static void quad(VertexConsumer vc, Matrix4f m, Vec3 a, Vec3 b, Vec3 s, int r, int g, int bl, int al) {
        vc.addVertex(m, (float) (a.x - s.x), (float) (a.y - s.y), (float) (a.z - s.z)).setColor(r, g, bl, al);
        vc.addVertex(m, (float) (b.x - s.x), (float) (b.y - s.y), (float) (b.z - s.z)).setColor(r, g, bl, al);
        vc.addVertex(m, (float) (b.x + s.x), (float) (b.y + s.y), (float) (b.z + s.z)).setColor(r, g, bl, al);
        vc.addVertex(m, (float) (a.x + s.x), (float) (a.y + s.y), (float) (a.z + s.z)).setColor(r, g, bl, al);
    }

    // ------------------------------------------------------------------------------------------------ glider

    private static int t(AbstractClientPlayer p) {
        return p.tickCount;
    }

    /** Every client tick: jets and wingbeats for everyone gliding with an End Glider. */
    static void tickGliders(Minecraft mc) {
        ClientLevel level = mc.level;
        if (level == null || mc.isPaused()) {
            return;
        }
        for (AbstractClientPlayer p : level.players()) {
            if (!EndGlider.active(p)) {
                continue;
            }
            boolean boost = EndGlider.boosting(p);
            boolean self = p == mc.player;
            RandomSource r = p.getRandom();
            Vec3 look = p.getViewVector(1f);
            Vec3 right = look.cross(new Vec3(0, 1, 0));
            right = right.lengthSqr() < 1e-6 ? new Vec3(1, 0, 0) : right.normalize();
            Vec3 up = right.cross(look).normalize();
            // the glider is held out past the head (the flying body lies along the look, feet at the position); its jets
            // sit above the bar, a little apart
            Vec3 at = self && mc.options.getCameraType().isFirstPerson()
                    ? p.getEyePosition().add(look.scale(1.15)).add(up.scale(0.55))   // where the first-person view draws it
                    : p.position().add(look.scale(2.0)).add(up.scale(0.6));
            Vec3 vel = p.getDeltaMovement();
            for (int side = -1; side <= 1; side += 2) {
                Vec3 jet = at.add(right.scale(side * 0.42)).subtract(look.scale(0.25));
                // the exhaust keeps the glider's speed, so it streams just behind the jets instead of whipping past
                if (boost || (t(p) & 1) == 0) {
                    Vec3 v = vel.subtract(look.scale(boost ? 0.12 : 0.05))
                            .add((r.nextDouble() - 0.5) * 0.02, (r.nextDouble() - 0.5) * 0.02, (r.nextDouble() - 0.5) * 0.02);
                    level.addParticle(ParticleTypes.SMALL_FLAME, jet.x, jet.y, jet.z, v.x, v.y, v.z);
                    if (boost && r.nextInt(3) == 0) {
                        level.addParticle(ParticleTypes.FLAME, jet.x, jet.y, jet.z, v.x, v.y, v.z);
                    }
                }
                if (r.nextInt(boost ? 2 : 6) == 0) {
                    Vec3 v = vel.scale(0.95);
                    level.addParticle(ParticleTypes.REVERSE_PORTAL, jet.x, jet.y, jet.z, v.x, v.y, v.z);
                }
            }
            float vol = self ? 0.55f : 0.8f;
            int t = p.tickCount;
            if (t % (boost ? 5 : 16) == 0) {
                level.playLocalSound(p.getX(), p.getY(), p.getZ(), boost ? EndSounds.GLIDER_JET : EndSounds.GLIDER_FLAP, SoundSource.PLAYERS,
                        vol, (boost ? 1.1f : 1.0f) + Mth.randomBetween(r, -0.08f, 0.08f), false);
            } else if (!boost && t % 16 == 8) {
                level.playLocalSound(p.getX(), p.getY(), p.getZ(), EndSounds.GLIDER_JET, SoundSource.PLAYERS, vol * 0.5f,
                        0.8f + Mth.randomBetween(r, -0.05f, 0.05f), false);
            }
        }
    }
}
