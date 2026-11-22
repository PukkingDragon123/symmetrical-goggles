package dev.lowpix.winterworks.cold;

import dev.lowpix.winterworks.registry.WWParticles;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.entity.LivingEntity;

/**
 * Frostbite (docs/COLD_UPDATE.md section 1): deep cold from ancient ice and frost attacks. Freezes fast (the vanilla
 * frost overlay and slowdown) and bites: freeze damage (1 + amplifier) every 30 ticks. Whatever can't freeze
 * (leather or fur armour, freeze-immune mobs) is immune (ColdSystem#resists).
 */
public class FrostbiteEffect extends MobEffect {
    public static final int MAX_FROZEN = 180;

    public FrostbiteEffect() {
        super(MobEffectCategory.HARMFUL, 0x9ED8F2);
    }

    @Override
    public boolean shouldApplyEffectTickThisTick(int duration, int amplifier) {
        return true;
    }

    @Override
    public boolean applyEffectTick(LivingEntity e, int amplifier) {
        if (!e.canFreeze()) {
            return true;
        }
        e.setTicksFrozen(Math.min(MAX_FROZEN, e.getTicksFrozen() + 8));
        if (e.level() instanceof ServerLevel level) {
            if (e.tickCount % 30 == 0) {
                e.hurt(e.damageSources().freeze(), 1 + amplifier);
            }
            if (e.tickCount % 6 == 0) {
                level.sendParticles(WWParticles.ICE_SHARD, e.getX(), e.getY() + e.getBbHeight() * 0.6, e.getZ(), 1,
                        e.getBbWidth() * 0.4, e.getBbHeight() * 0.3, e.getBbWidth() * 0.4, 0.02);
            }
        }
        return true;
    }
}
