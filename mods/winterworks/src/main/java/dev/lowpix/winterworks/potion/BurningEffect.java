package dev.lowpix.winterworks.potion;

import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;

/**
 * Potion of Burning (docs/FIXES_0_4.md "Torchflowers..."): whoever has it burns for the duration and water doesn't put
 * them out. Stub: the hexes/curses/potions agent owns the behaviour.
 */
public class BurningEffect extends MobEffect {
    public BurningEffect() {
        super(MobEffectCategory.HARMFUL, 0xF2702A);
    }
}
