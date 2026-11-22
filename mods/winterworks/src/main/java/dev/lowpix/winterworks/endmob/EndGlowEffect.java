package dev.lowpix.winterworks.endmob;

import dev.lowpix.winterworks.registry.EndEffects;
import java.util.List;
import net.minecraft.core.particles.ColorParticleOption;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.entity.LivingEntity;

/**
 * End Glow (docs/END_UPDATE.md section 6), from eating an End Bulb: you are drawn at full brightness with faint violet
 * motes round you (this effect's particles). Secretly, Enderflies are drawn to you (Enderfly's targeting). Other players
 * don't get your effects synced, only their particles, so the client recognises the glow by {@link #MOTES}.
 */
public class EndGlowEffect extends MobEffect {
    public static final int COLOR = 0xB57BFF;
    /** The motes: violet, half transparent. Its exact colour is how other clients tell you glow. */
    public static final ColorParticleOption MOTES = ColorParticleOption.create(ParticleTypes.ENTITY_EFFECT, 0x80000000 | COLOR);

    public EndGlowEffect() {
        super(MobEffectCategory.BENEFICIAL, COLOR, MOTES);
    }

    /** Whether `e` glows: its own effect (server, or the local player), or the glow's motes in its synced particles. */
    public static boolean glows(LivingEntity e, List<ParticleOptions> syncedParticles) {
        if (e.hasEffect(EndEffects.END_GLOW)) {
            return true;
        }
        for (ParticleOptions p : syncedParticles) {
            if (p instanceof ColorParticleOption c && c.getType() == ParticleTypes.ENTITY_EFFECT && Math.abs(c.getAlpha() - MOTES.getAlpha()) < 0.01f
                    && Math.abs(c.getRed() - MOTES.getRed()) < 0.01f && Math.abs(c.getGreen() - MOTES.getGreen()) < 0.01f
                    && Math.abs(c.getBlue() - MOTES.getBlue()) < 0.01f) {
                return true;
            }
        }
        return false;
    }
}
