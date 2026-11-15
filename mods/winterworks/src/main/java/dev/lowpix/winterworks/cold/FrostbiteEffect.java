package dev.lowpix.winterworks.cold;

import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;

/** Frostbite (docs/COLD_UPDATE.md section 1). */
public class FrostbiteEffect extends MobEffect {
    public FrostbiteEffect() {
        super(MobEffectCategory.HARMFUL, 0x9ED8F2);
    }
}
