package dev.lowpix.winterworks.cold;

import dev.lowpix.winterworks.registry.WWArmor;
import dev.lowpix.winterworks.registry.WWEffects;
import net.minecraft.core.Holder;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ArmorItem;
import net.minecraft.world.item.ItemStack;

/** Cold exposure, warmth, fur armour effects (docs/COLD_UPDATE.md sections 1-2). */
public final class ColdSystem {
    private static final EquipmentSlot[] ARMOR = {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET};

    private ColdSystem() {}

    public static void init() {}

    /** How many Polar Bear Fur armour pieces the entity wears (0-4). */
    public static int furPieces(LivingEntity e) {
        int n = 0;
        for (EquipmentSlot slot : ARMOR) {
            ItemStack s = e.getItemBySlot(slot);
            if (s.getItem() instanceof ArmorItem a && a.getMaterial().is(WWArmor.FUR)) {
                n++;
            }
        }
        return n;
    }

    /** Fur armour shrugs off Slowness, Frostbite and Stunned. */
    public static boolean resists(LivingEntity e, Holder<MobEffect> effect) {
        boolean chill = effect.is(MobEffects.MOVEMENT_SLOWDOWN) || effect.is(WWEffects.FROSTBITE) || effect.is(WWEffects.STUNNED);
        return chill && furPieces(e) > 0;
    }
}
