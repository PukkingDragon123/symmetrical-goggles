package dev.lowpix.winterworks.hex;

import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;

/** Hexed: no natural regeneration from food; heal with potions only (docs/HEXES_UPDATE.md section 2). */
public class HexedEffect extends MobEffect {
    public HexedEffect() {
        super(MobEffectCategory.HARMFUL, 0x3FD0E8);
    }
}
