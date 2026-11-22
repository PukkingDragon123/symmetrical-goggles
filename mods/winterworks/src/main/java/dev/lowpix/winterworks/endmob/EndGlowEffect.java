package dev.lowpix.winterworks.endmob;

import dev.lowpix.winterworks.registry.EndEffects;
import java.util.List;
import net.minecraft.core.particles.ColorParticleOption;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.entity.LivingEntity;
import org.joml.Vector3f;

/**
 * End Glow (docs/END_UPDATE.md section 6), from eating an End Bulb: you shine like a held torch (real light, 14, from
 * {@link GlowLightBlock} at your head), you are drawn at full brightness, and violet motes and sparks drift round you. Secretly, Enderflies are drawn to you (Enderfly's targeting). Other players
 * don't get your effects synced, only their particles, so the client recognises the glow by {@link #MOTES}.
 */
public class EndGlowEffect extends MobEffect {
    public static final int COLOR = 0xB57BFF;
    /** The motes: violet, half transparent. Its exact colour is how other clients tell you glow. */
    public static final ColorParticleOption MOTES = ColorParticleOption.create(ParticleTypes.ENTITY_EFFECT, 0x80000000 | COLOR);

    /** The sparks: a soft violet dust, a few a second, so the glow reads purple round you. */
    public static final DustParticleOptions SPARK = new DustParticleOptions(new Vector3f(0.71f, 0.48f, 1.0f), 0.9f);

    public EndGlowEffect() {
        super(MobEffectCategory.BENEFICIAL, COLOR, MOTES);
    }

    @Override
    public boolean shouldApplyEffectTickThisTick(int duration, int amplifier) {
        return duration % 2 == 0;
    }

    @Override
    public boolean applyEffectTick(LivingEntity e, int amplifier) {
        if (e.level() instanceof ServerLevel level && !e.isSpectator()) {
            GlowLightBlock.follow(level, e);
            if (e.getRandom().nextInt(3) == 0) {
                level.sendParticles(SPARK, e.getX(), e.getY() + e.getBbHeight() * 0.6, e.getZ(), 1,
                        e.getBbWidth() * 0.5, e.getBbHeight() * 0.35, e.getBbWidth() * 0.5, 0.0);
            }
        }
        return true;
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
