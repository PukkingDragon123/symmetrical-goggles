package dev.lowpix.winterworks.client.hex;

import dev.lowpix.winterworks.hex.SoulDriftPayload;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;

/**
 * Souls drifting from a dead mob into a Soul Tank: each one rises, arcs over and sinks into the tank along a curve,
 * leaving a trail of soul particles, and the tank drinks it in with a sound and a puff.
 */
final class SoulDrifts {
    private static final List<Drift> DRIFTS = new ArrayList<>();

    private SoulDrifts() {}

    private static final class Drift {
        final Vec3 from, to, control;
        final int length;
        final float phase;
        int age;

        Drift(Vec3 from, Vec3 to, float phase) {
            this.from = from;
            this.to = to;
            double dist = from.distanceTo(to);
            this.control = from.add(to).scale(0.5).add(0, 1.2 + dist * 0.25, 0);
            this.length = (int) Mth.clamp(18 + dist * 4, 20, 56);
            this.phase = phase;
        }

        Vec3 at(float t) {
            double u = 1 - t;
            return from.scale(u * u).add(control.scale(2 * u * t)).add(to.scale(t * t));
        }
    }

    static void add(SoulDriftPayload p) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null || DRIFTS.size() > 64) {
            return;
        }
        DRIFTS.add(new Drift(new Vec3(p.x(), p.y(), p.z()), Vec3.atCenterOf(p.tank()).add(0, 0.2, 0), mc.level.random.nextFloat() * 6.28f));
    }

    static void tick(Minecraft mc) {
        ClientLevel level = mc.level;
        if (level == null) {
            DRIFTS.clear();
            return;
        }
        if (mc.isPaused()) {
            return;
        }
        for (Iterator<Drift> it = DRIFTS.iterator(); it.hasNext(); ) {
            Drift d = it.next();
            d.age++;
            float t = Math.min(1f, d.age / (float) d.length);
            float eased = t * t * (3 - 2 * t);
            Vec3 p = d.at(eased);
            double wob = 0.12 * Math.sin(d.age * 0.5 + d.phase) * (1 - t);
            level.addParticle(ParticleTypes.SOUL, p.x + wob, p.y, p.z - wob, 0, 0.005, 0);
            if (d.age % 3 == 0) {
                level.addParticle(ParticleTypes.SOUL_FIRE_FLAME, p.x, p.y - 0.05, p.z, 0, 0, 0);
            }
            if (t >= 1f) {
                for (int i = 0; i < 6; i++) {
                    level.addParticle(ParticleTypes.SOUL, d.to.x + (level.random.nextDouble() - 0.5) * 0.5, d.to.y,
                            d.to.z + (level.random.nextDouble() - 0.5) * 0.5, 0, 0.02, 0);
                }
                level.playLocalSound(d.to.x, d.to.y, d.to.z, WWSounds.SOUL_TANK_ABSORB, SoundSource.BLOCKS, 0.8f,
                        0.9f + level.random.nextFloat() * 0.25f, false);
                it.remove();
            }
        }
    }
}
