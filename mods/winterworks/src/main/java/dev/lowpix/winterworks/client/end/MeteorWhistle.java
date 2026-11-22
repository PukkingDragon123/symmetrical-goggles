package dev.lowpix.winterworks.client.end;

import dev.lowpix.winterworks.end.FallingMeteorite;
import dev.lowpix.winterworks.registry.EndSounds;
import net.minecraft.client.resources.sounds.AbstractTickableSoundInstance;
import net.minecraft.client.resources.sounds.SoundInstance;
import net.minecraft.sounds.SoundSource;

/**
 * A falling meteorite's whistle: follows it down, rising in pitch and swelling as it falls, and stops when it lands.
 */
public class MeteorWhistle extends AbstractTickableSoundInstance {
    private final FallingMeteorite meteor;

    public MeteorWhistle(FallingMeteorite meteor) {
        super(EndSounds.METEOR_WHISTLE, SoundSource.WEATHER, SoundInstance.createUnseededRandom());
        this.meteor = meteor;
        this.looping = true;
        this.delay = 0;
        this.attenuation = SoundInstance.Attenuation.LINEAR;
        this.x = meteor.getX();
        this.y = meteor.getY();
        this.z = meteor.getZ();
        this.volume = 3f;
        this.pitch = 0.5f;
    }

    @Override
    public void tick() {
        if (meteor.isRemoved() || !meteor.flying()) {
            stop();
            return;
        }
        x = meteor.getX();
        y = meteor.getY();
        z = meteor.getZ();
        float t = Math.min(1f, meteor.tickCount / 70f);
        pitch = 0.5f + 1.3f * t * t;
        volume = 3f + 3f * t;
    }

    @Override
    public boolean canStartSilent() {
        return true;
    }
}
