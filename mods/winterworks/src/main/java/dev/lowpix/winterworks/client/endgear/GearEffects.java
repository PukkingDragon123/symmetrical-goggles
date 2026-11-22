package dev.lowpix.winterworks.client.endgear;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.lowpix.winterworks.client.end.MeteorGlow;
import dev.lowpix.winterworks.endgear.EndGearPayloads;
import dev.lowpix.winterworks.endgear.EndGlider;
import dev.lowpix.winterworks.registry.EndItems;
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
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;
import org.joml.Vector3f;

/**
 * Client-side effects of the gear: the Monolith Wand's beam (a crackling ray, violet from the eye turning to meteor fire, with
 * a white core, spitting meteor sparks, a flash at the eye and a hot flash and burst of sparks where it strikes), and the End
 * Glider's shimmer for everyone it carries (luminous motes shed by the wings, sparks at the wing-root sigils that flare
 * while boosting, wingbeat and boost sounds).
 */
public final class GearEffects {
    private static final List<Beam> BEAMS = new ArrayList<>();
    private static final int BEAM_TICKS = 14;
    private static final DustParticleOptions GREY = new DustParticleOptions(new Vector3f(0.45f, 0.42f, 0.5f), 1.0f);
    private static final DustParticleOptions WING_MOTE = new DustParticleOptions(new Vector3f(0.78f, 0.5f, 1.0f), 0.7f);

    private record Beam(Vec3 from, Vec3 to, boolean resisted, long born) {}

    private GearEffects() {}

    // ------------------------------------------------------------------------------------------------ wand beam

    static void onBeam(EndGearPayloads.WandBeam b) {
        Minecraft mc = Minecraft.getInstance();
        ClientLevel level = mc.level;
        if (level == null) {
            return;
        }
        // your own shot in first person starts from the wand's head in your hand, not from the middle of the view
        Vec3 from = b.from();
        var cam = mc.gameRenderer.getMainCamera();
        if (mc.player != null && !mc.player.isSpectator() && mc.options.getCameraType().isFirstPerson() && from.distanceTo(mc.player.getEyePosition()) < 2.0
                && (mc.player.getMainHandItem().is(EndItems.MONOLITH_WAND) || mc.player.getOffhandItem().is(EndItems.MONOLITH_WAND))) {
            boolean main = mc.player.getMainHandItem().is(EndItems.MONOLITH_WAND);
            boolean leftHand = (mc.player.getMainArm() == net.minecraft.world.entity.HumanoidArm.LEFT) == main;
            Vec3 right = new Vec3(cam.getLeftVector()).scale(leftHand ? 1 : -1);
            from = cam.getPosition().add(new Vec3(cam.getLookVector())).add(right.scale(0.8)).add(new Vec3(cam.getUpVector()).scale(-0.35));
        }
        b = new EndGearPayloads.WandBeam(from, b.to(), b.resisted());
        BEAMS.add(new Beam(b.from(), b.to(), b.resisted(), level.getGameTime()));
        Vec3 d = b.to().subtract(b.from());
        double len = d.length();
        Vec3 dir = d.scale(1 / Math.max(len, 1e-6));
        RandomSource r = level.random;
        // along the beam: violet motes, portal wisps, and meteor sparks spitting off it
        for (double s = 0.4; s < len; s += 0.3) {
            Vec3 p = b.from().add(dir.scale(s));
            if (b.resisted() && r.nextInt(3) == 0) {
                level.addParticle(GREY, true, p.x, p.y, p.z, 0, 0, 0);
            }
            if (!b.resisted() && r.nextInt(6) == 0) {
                level.addParticle(ParticleTypes.END_ROD, true, p.x, p.y, p.z, r.nextGaussian() * 0.01, r.nextGaussian() * 0.01, r.nextGaussian() * 0.01);
            }
            if (r.nextInt(4) == 0) {
                level.addParticle(ParticleTypes.REVERSE_PORTAL, true, p.x, p.y, p.z, (r.nextDouble() - 0.5) * 0.05, 0.02, (r.nextDouble() - 0.5) * 0.05);
            }
            if (!b.resisted() && r.nextInt(2) == 0) {
                level.addParticle(EndParticles.METEOR_SPARK, true, p.x, p.y, p.z, r.nextGaussian() * 0.08, 0.04 + r.nextDouble() * 0.1,
                        r.nextGaussian() * 0.08);
            }
        }
        // the eye fires: a puff of sparks at the wand
        for (int i = 0; i < 10; i++) {
            level.addParticle(EndParticles.METEOR_SPARK, true, b.from().x, b.from().y, b.from().z, dir.x * 0.2 + r.nextGaussian() * 0.08,
                    dir.y * 0.2 + r.nextGaussian() * 0.08 + 0.05, dir.z * 0.2 + r.nextGaussian() * 0.08);
        }
        Vec3 to = b.to();
        if (b.resisted()) {
            for (int i = 0; i < 14; i++) {
                level.addParticle(ParticleTypes.SMOKE, true, to.x, to.y, to.z, (r.nextDouble() - 0.5) * 0.3, r.nextDouble() * 0.25,
                        (r.nextDouble() - 0.5) * 0.3);
            }
            return;
        }
        // the hot impact: obsidian chips, a burst of meteor sparks, molten splashes and a lick of flame
        for (int i = 0; i < 14; i++) {
            level.addParticle(EndParticles.OBSIDIAN_CRACK, true, to.x, to.y, to.z, (r.nextDouble() - 0.5) * 0.3, r.nextDouble() * 0.25,
                    (r.nextDouble() - 0.5) * 0.3);
        }
        for (int i = 0; i < 36; i++) {
            Vec3 v = new Vec3(r.nextGaussian(), r.nextGaussian() + 0.8, r.nextGaussian()).normalize().scale(0.18 + r.nextDouble() * 0.3)
                    .subtract(dir.scale(0.15));
            level.addParticle(EndParticles.METEOR_SPARK, true, to.x, to.y, to.z, v.x, v.y, v.z);
        }
        for (int i = 0; i < 8; i++) {
            level.addParticle(ParticleTypes.FLAME, true, to.x + r.nextGaussian() * 0.3, to.y + r.nextGaussian() * 0.3, to.z + r.nextGaussian() * 0.3,
                    r.nextGaussian() * 0.03, 0.04, r.nextGaussian() * 0.03);
        }
        for (int i = 0; i < 4; i++) {
            level.addParticle(ParticleTypes.LAVA, true, to.x, to.y, to.z, 0, 0, 0);
        }
        level.addParticle(ParticleTypes.FLASH, true, to.x, to.y, to.z, 0, 0, 0);
    }

    /** Draws the live beams (WorldRenderEvents.AFTER_ENTITIES): glow, molten body and white core, flashes at both ends. */
    static void renderBeams(WorldRenderContext ctx) {
        ClientLevel level = Minecraft.getInstance().level;
        if (BEAMS.isEmpty() || level == null || ctx.consumers() == null) {
            return;
        }
        float now = level.getGameTime() + ctx.tickCounter().getGameTimeDeltaPartialTick(false);
        Vec3 cam = ctx.camera().getPosition();
        Vec3 right = new Vec3(ctx.camera().getLeftVector()).scale(-1), up = new Vec3(ctx.camera().getUpVector());
        PoseStack pose = ctx.matrixStack();
        MultiBufferSource buffers = ctx.consumers();
        VertexConsumer vc = buffers.getBuffer(MeteorGlow.ADDITIVE);
        for (Iterator<Beam> it = BEAMS.iterator(); it.hasNext(); ) {
            Beam b = it.next();
            float age = now - b.born();
            if (age > BEAM_TICKS || age < -1) {
                it.remove();
                continue;
            }
            float k = 1f - Math.max(0f, age) / BEAM_TICKS;
            pose.pushPose();
            pose.translate(-cam.x, -cam.y, -cam.z);
            Matrix4f m = pose.last().pose();
            Vec3 d = b.to().subtract(b.from());
            Vec3 side = d.cross(new Vec3(0, 1, 0));
            side = side.lengthSqr() < 1e-6 ? new Vec3(1, 0, 0) : side.normalize();
            Vec3 lift = side.cross(d).normalize();
            int n = 14;
            Vec3[] pts = new Vec3[n];
            float[] wGlow = new float[n], wBody = new float[n], wCore = new float[n], aGlow = new float[n], aBody = new float[n], aCore = new float[n];
            int[] cGlow = new int[n], cBody = new int[n], cCore = new int[n];
            for (int i = 0; i < n; i++) {
                float t = i / (n - 1f);
                // it crackles: a small wobble, pinned at both ends
                float wob = (float) Math.sin(t * Math.PI) * 0.12f * k;
                pts[i] = b.from().add(d.scale(t)).add(side.scale(Mth.sin(now * 2.3f + t * 17f) * wob)).add(lift.scale(Mth.cos(now * 1.9f + t * 13f) * wob));
                float swell = Math.min(1f, 0.25f + t * 2.5f) * (0.85f + 0.15f * (float) Math.sin(t * Math.PI));   // thin at the eye
                wGlow[i] = (0.35f + 0.55f * k) * swell;
                wBody[i] = (0.1f + 0.24f * k) * swell;
                wCore[i] = (0.03f + 0.08f * k) * swell;
                if (b.resisted()) {
                    cGlow[i] = 0x8C8098;
                    cBody[i] = 0xA49AB0;
                    cCore[i] = 0xDDD8E4;
                } else {
                    cGlow[i] = MeteorGlow.mix(0xB040FF, 0xE04A5A, t * t);          // violet from the eye, rose at the target
                    cBody[i] = MeteorGlow.mix(0xD070FF, 0xFF7D2A, t);              // into meteor fire
                    cCore[i] = MeteorGlow.mix(0xFBF0FF, 0xFFF4C2, t);
                }
                aGlow[i] = 0.5f * k;
                aBody[i] = 0.9f * k;
                aCore[i] = k;
            }
            MeteorGlow.ribbon(vc, m, cam, pts, wGlow, cGlow, aGlow);
            MeteorGlow.ribbon(vc, m, cam, pts, wBody, cBody, aBody);
            MeteorGlow.ribbon(vc, m, cam, pts, wCore, cCore, aCore);
            // a flash at the eye, and a hot flash where it strikes (swelling, then gone)
            MeteorGlow.disc(vc, m, b.from(), right, up, 0.2f + 0.2f * k, 0xF0C8FF, 0.9f * k, 0x9A3CF0, 0f);
            if (age < 9) {   // drawn a little toward the shooter so the target's body doesn't hide it
                float t = Math.max(0f, age) / 9f, f = 1f - t;
                Vec3 at = b.to().subtract(d.normalize().scale(0.9));
                float r = b.resisted() ? 0.6f + 0.6f * t : 1.1f + 2.2f * (1f - f * f);
                MeteorGlow.glow(vc, m, at, right, up, r, 0.35f, b.resisted() ? 0xC8C0D0 : 0xFFF4C2, f * f, b.resisted() ? 0x605870 : 0xFF7D2A);
                if (!b.resisted()) {
                    MeteorGlow.glow(vc, m, at, right, up, r * 2.4f, 0.15f, 0xFF9040, 0.5f * f * f, 0xA8237F);
                }
            }
            pose.popPose();
        }
    }

    // ------------------------------------------------------------------------------------------------ glider

    /** Every client tick: shimmer, sigil sparks and wingbeats for everyone carried by an End Glider. */
    static void tickGliders(Minecraft mc) {
        ClientLevel level = mc.level;
        if (level == null || mc.isPaused()) {
            return;
        }
        for (AbstractClientPlayer p : level.players()) {
            if (!EndGlider.inUse(p)) {
                continue;
            }
            boolean flight = EndGlider.freeFlight(p), boost = EndGlider.boosting(p);
            boolean self = p == mc.player, firstPerson = self && mc.options.getCameraType().isFirstPerson();
            RandomSource r = p.getRandom();
            Vec3 look = p.getViewVector(1f);
            Vec3 forward = flight ? look : new Vec3(look.x, 0, look.z);
            forward = forward.lengthSqr() < 1e-6 ? new Vec3(0, 0, 1) : forward.normalize();
            Vec3 right = forward.cross(new Vec3(0, 1, 0));
            right = right.lengthSqr() < 1e-6 ? new Vec3(1, 0, 0) : right.normalize();
            Vec3 up = right.cross(forward).normalize();
            // where the bar is: out past the head of a body lying along the flight, over the head of an upright glider,
            // or where the first-person view draws it
            Vec3 bar = firstPerson ? p.getEyePosition().add(look.scale(1.15)).add(up.scale(0.35))
                    : flight ? p.position().add(look.scale(2.0)).add(up.scale(0.1))
                    : p.position().add(0, p.getBbHeight() + 0.25, 0).add(forward.scale(0.1));
            Vec3 vel = p.getDeltaMovement();
            for (int side = -1; side <= 1; side += 2) {
                // luminous motes shed along the wings
                if (r.nextInt(boost ? 1 : 2) == 0) {
                    Vec3 at = bar.add(up.scale(0.55 + r.nextDouble() * 0.2)).add(right.scale(side * (0.25 + r.nextDouble() * 0.85)))
                            .subtract(forward.scale(r.nextDouble() * 0.3));
                    Vec3 v = vel.scale(0.9).subtract(forward.scale(0.02)).add(0, -0.01, 0);
                    level.addParticle(r.nextInt(5) == 0 ? ParticleTypes.END_ROD : WING_MOTE, at.x, at.y, at.z, v.x, v.y, v.z);
                }
                // the sigils at the wing roots flare while boosting
                if (boost || r.nextInt(8) == 0) {
                    Vec3 at = bar.add(up.scale(0.5)).add(right.scale(side * 0.38));
                    Vec3 v = vel.subtract(forward.scale(boost ? 0.1 : 0.02));
                    level.addParticle(boost ? ParticleTypes.REVERSE_PORTAL : ParticleTypes.END_ROD, at.x, at.y, at.z, v.x, v.y, v.z);
                }
            }
            float vol = self ? 0.55f : 0.8f;
            int t = p.tickCount;
            if (boost && t % 6 == 0) {
                level.playLocalSound(p.getX(), p.getY(), p.getZ(), EndSounds.GLIDER_JET, SoundSource.PLAYERS, vol,
                        1.1f + Mth.randomBetween(r, -0.08f, 0.08f), false);
            } else if (!boost && t % (flight ? 14 : 20) == 0) {
                level.playLocalSound(p.getX(), p.getY(), p.getZ(), EndSounds.GLIDER_FLAP, SoundSource.PLAYERS, vol,
                        1.0f + Mth.randomBetween(r, -0.08f, 0.08f), false);
            }
        }
    }
}
