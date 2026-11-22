package dev.lowpix.winterworks.client.endboss;

import dev.lowpix.winterworks.end.Eclipse;
import dev.lowpix.winterworks.endboss.EclipsePayload;
import dev.lowpix.winterworks.endboss.EclipseState;
import dev.lowpix.winterworks.registry.EndParticles;
import dev.lowpix.winterworks.registry.EndSounds;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.Minecraft;
import net.minecraft.client.resources.sounds.AbstractTickableSoundInstance;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.client.resources.sounds.SoundInstance;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.Level;

/**
 * The client side of the eclipse: keeps the mirrored state ticking between packets, plays its sounds (a chime as it
 * begins, a soft loop while it lasts, a falling chime as it fades) and lets motes drift round the player in the End.
 */
public final class EclipseClient {
    private static boolean wasActive, endPlayed;
    private static Loop loop;

    private EclipseClient() {}

    static void init() {
        ClientPlayNetworking.registerGlobalReceiver(EclipsePayload.TYPE, (payload, ctx) -> {
            EclipseState.CLIENT.set(payload.level(), payload.remaining());
            if (payload.remaining() > EclipseState.FADE) {
                endPlayed = false;
            }
        });
        ClientPlayConnectionEvents.DISCONNECT.register((handler, mc) -> {
            EclipseState.CLIENT.set(0f, 0);
            wasActive = false;
        });
        ClientTickEvents.END_CLIENT_TICK.register(EclipseClient::tick);
    }

    private static void tick(Minecraft mc) {
        if (mc.level == null || mc.isPaused()) {
            return;
        }
        EclipseState s = EclipseState.CLIENT;
        s.clientStep();
        boolean inEnd = mc.level.dimension() == Level.END;
        boolean active = inEnd && s.active();
        if (active && !wasActive && s.level() < 0.5f) {
            mc.getSoundManager().play(SimpleSoundInstance.forAmbientAddition(EndSounds.ECLIPSE_BEGIN));
        }
        if (active && s.remaining() <= EclipseState.FADE && !endPlayed) {
            endPlayed = true;
            mc.getSoundManager().play(SimpleSoundInstance.forAmbientAddition(EndSounds.ECLIPSE_END));
        }
        wasActive = active;
        if (active && (loop == null || loop.isStopped() || !mc.getSoundManager().isActive(loop))) {
            loop = new Loop();
            mc.getSoundManager().play(loop);
        }
        float f = inEnd ? Eclipse.fraction(mc.level) : 0f;
        if (f > 0f && mc.player != null) {
            RandomSource r = mc.level.random;
            int n = r.nextFloat() < f * 1.6f ? 1 + (r.nextFloat() < f * 0.6f ? 1 : 0) : 0;
            for (int i = 0; i < n; i++) {
                double x = mc.player.getX() + (r.nextDouble() - 0.5) * 36, y = mc.player.getY() - 3 + r.nextDouble() * 14,
                        z = mc.player.getZ() + (r.nextDouble() - 0.5) * 36;
                mc.level.addParticle(EndParticles.ECLIPSE_MOTE, x, y, z, (r.nextDouble() - 0.5) * 0.02, 0.008 + r.nextDouble() * 0.01,
                        (r.nextDouble() - 0.5) * 0.02);
            }
        }
    }

    /** The eclipse's soft drone: follows the fraction, ends with it. */
    static final class Loop extends AbstractTickableSoundInstance {
        Loop() {
            super(EndSounds.ECLIPSE_LOOP, SoundSource.AMBIENT, SoundInstance.createUnseededRandom());
            looping = true;
            delay = 0;
            relative = true;
            volume = 0.01f;
            attenuation = Attenuation.NONE;
        }

        @Override
        public void tick() {
            Minecraft mc = Minecraft.getInstance();
            float f = mc.level == null || mc.level.dimension() != Level.END ? 0f : Eclipse.fraction(mc.level);
            if (f <= 0f && !EclipseState.CLIENT.active()) {
                stop();
                return;
            }
            volume = Math.max(0.01f, f * 0.7f);
        }
    }
}
