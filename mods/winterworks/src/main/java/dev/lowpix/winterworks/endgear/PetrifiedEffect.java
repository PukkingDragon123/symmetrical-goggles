package dev.lowpix.winterworks.endgear;

import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;

/**
 * Petrified (end.Petrify): encased in obsidian. Every tick, on both sides (the local player moves itself), the entity
 * is held in place: no horizontal motion, no rising, no elytra flight. The rest (no AI, no input, no turning, no pushing,
 * no damage for the invulnerable shell) lives in mixin.endgear and EndGearFeature.
 */
public class PetrifiedEffect extends MobEffect {
    public PetrifiedEffect() {
        super(MobEffectCategory.HARMFUL, 0x1A1026);
    }

    @Override
    public boolean shouldApplyEffectTickThisTick(int duration, int amplifier) {
        return true;
    }

    @Override
    public boolean applyEffectTick(LivingEntity e, int amplifier) {
        Vec3 v = e.getDeltaMovement();
        e.setDeltaMovement(0, Math.min(0, v.y), 0);
        e.setSprinting(false);
        if (e instanceof Player p && p.isFallFlying()) {
            p.stopFallFlying();
        }
        return true;
    }
}
