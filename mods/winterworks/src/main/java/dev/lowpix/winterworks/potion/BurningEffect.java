package dev.lowpix.winterworks.potion;

import dev.lowpix.winterworks.registry.WWEffects;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.entity.LivingEntity;

/**
 * Potion of Burning (docs/FIXES_0_4.md "Torchflowers..."): whoever has it keeps burning for the whole duration, and
 * water, rain and powder snow don't put them out (mixin.BurningClearFireMixin keeps the fire from being cleared). Fire
 * Resistance still keeps the flames from hurting, fire-immune mobs don't burn. Level II burns hotter: a second burn
 * each second. In water it hisses and steams.
 */
public class BurningEffect extends MobEffect {
    public BurningEffect() {
        super(MobEffectCategory.HARMFUL, 0xF2702A);
    }

    /** Is this entity held burning by the effect (so nothing may put its fire out)? */
    public static boolean keepsBurning(LivingEntity e) {
        return !e.level().isClientSide && !e.fireImmune() && e.hasEffect(WWEffects.BURNING);
    }

    @Override
    public boolean shouldApplyEffectTickThisTick(int duration, int amplifier) {
        return true;
    }

    @Override
    public boolean applyEffectTick(LivingEntity e, int amplifier) {
        if (e.level().isClientSide || e.fireImmune()) {
            return true;
        }
        int fire = e.getRemainingFireTicks();
        if (fire < 20) {   // a rolling second of fire: vanilla's burn once a second, for as long as the effect lasts
            e.setRemainingFireTicks(fire + 20);
        }
        if (amplifier > 0 && e.tickCount % 20 == 10 && !e.isInLava()) {
            e.hurt(e.damageSources().onFire(), amplifier);
        }
        if (e.level() instanceof ServerLevel level && e.isInWaterRainOrBubble() && e.tickCount % 5 == 0) {
            double y = e.getY() + e.getBbHeight() * 0.6;
            level.sendParticles(ParticleTypes.BUBBLE_COLUMN_UP, e.getX(), y, e.getZ(), 3, e.getBbWidth() * 0.3, 0.2,
                    e.getBbWidth() * 0.3, 0.05);
            level.sendParticles(ParticleTypes.WHITE_SMOKE, e.getX(), e.getY() + e.getBbHeight(), e.getZ(), 1, 0.15, 0.05, 0.15, 0.01);
        }
        return true;
    }
}
