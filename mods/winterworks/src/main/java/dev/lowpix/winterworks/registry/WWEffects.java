package dev.lowpix.winterworks.registry;

import dev.lowpix.winterworks.Winterworks;
import net.minecraft.core.Holder;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.item.alchemy.Potion;

public final class WWEffects {
    /** Sprint for 3 seconds to charge up, then ram: see icebreaker.RamHandler. */
    public static final Holder<MobEffect> RAMMING = Registry.registerForHolder(BuiltInRegistries.MOB_EFFECT,
            Winterworks.id("ramming"), new WWEffect(MobEffectCategory.BENEFICIAL, 0x9FB4BE)
                    .addAttributeModifier(Attributes.KNOCKBACK_RESISTANCE, Winterworks.id("effect.ramming"), 0.25,
                            AttributeModifier.Operation.ADD_VALUE));
    /** Hit by a launcher snowball: briefly frozen in place (dizzy stars above the head). */
    public static final Holder<MobEffect> STUNNED = Registry.registerForHolder(BuiltInRegistries.MOB_EFFECT,
            Winterworks.id("stunned"), new WWEffect(MobEffectCategory.HARMFUL, 0xDDEEFF)
                    .addAttributeModifier(Attributes.MOVEMENT_SPEED, Winterworks.id("effect.stunned"), -0.85,
                            AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL)
                    .addAttributeModifier(Attributes.ATTACK_SPEED, Winterworks.id("effect.stunned_attack"), -0.75,
                            AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL));

    /** Deep cold: freezes fast and bites (cold.FrostbiteEffect). Fur armour and freeze-immune mobs are immune. */
    public static final Holder<MobEffect> FROSTBITE = Registry.registerForHolder(BuiltInRegistries.MOB_EFFECT,
            Winterworks.id("frostbite"), new dev.lowpix.winterworks.cold.FrostbiteEffect());

    /** While active, no other effect can be gained (amber.ImmunityEffect; enforced in LivingEntityMixin). */
    public static final Holder<MobEffect> IMMUNITY = Registry.registerForHolder(BuiltInRegistries.MOB_EFFECT,
            Winterworks.id("immunity"), new WWEffect(MobEffectCategory.BENEFICIAL, 0xE8B84A));
    /** Potion of Blood: from mosquitoes; no effect of its own. */
    public static final Holder<Potion> BLOOD_POTION = Registry.registerForHolder(BuiltInRegistries.POTION,
            Winterworks.id("blood"), new Potion("blood"));
    public static final Holder<Potion> IMMUNITY_POTION = Registry.registerForHolder(BuiltInRegistries.POTION,
            Winterworks.id("immunity"), new Potion("immunity", new net.minecraft.world.effect.MobEffectInstance(IMMUNITY, 600)));
    public static final Holder<Potion> LONG_IMMUNITY_POTION = Registry.registerForHolder(BuiltInRegistries.POTION,
            Winterworks.id("long_immunity"), new Potion("immunity", new net.minecraft.world.effect.MobEffectInstance(IMMUNITY, 1200)));

    /** Hexing Table aftermath: no natural regeneration, heal with potions only (hex.HexedEffect). */
    public static final Holder<MobEffect> HEXED = Registry.registerForHolder(BuiltInRegistries.MOB_EFFECT,
            Winterworks.id("hexed"), new dev.lowpix.winterworks.hex.HexedEffect());
    /** Cursed Elixir on a Piglin: immune to zombification, a golden shimmer. */
    public static final Holder<MobEffect> GOLDEN = Registry.registerForHolder(BuiltInRegistries.MOB_EFFECT,
            Winterworks.id("golden"), new WWEffect(MobEffectCategory.BENEFICIAL, 0xF5C431));

    public static final Holder<Potion> RAMMING_POTION = Registry.registerForHolder(BuiltInRegistries.POTION,
            Winterworks.id("ramming"), new Potion("ramming", new net.minecraft.world.effect.MobEffectInstance(RAMMING, 3600)));
    public static final Holder<Potion> LONG_RAMMING_POTION = Registry.registerForHolder(BuiltInRegistries.POTION,
            Winterworks.id("long_ramming"), new Potion("ramming", new net.minecraft.world.effect.MobEffectInstance(RAMMING, 9600)));
    public static final Holder<Potion> STRONG_RAMMING_POTION = Registry.registerForHolder(BuiltInRegistries.POTION,
            Winterworks.id("strong_ramming"), new Potion("ramming", new net.minecraft.world.effect.MobEffectInstance(RAMMING, 1800, 1)));

    // ---- 0.4 fixes: shared potions (owned by the hexes/curses/potions agent; docs/FIXES_0_4.md "Potions")
    public static final Holder<MobEffect> BURNING = Registry.registerForHolder(BuiltInRegistries.MOB_EFFECT,
            Winterworks.id("burning"), new dev.lowpix.winterworks.potion.BurningEffect());
    public static final Holder<Potion> BURNING_POTION = Registry.registerForHolder(BuiltInRegistries.POTION,
            Winterworks.id("burning"), new Potion("burning", new net.minecraft.world.effect.MobEffectInstance(BURNING, 3600)));
    public static final Holder<Potion> LONG_BURNING_POTION = Registry.registerForHolder(BuiltInRegistries.POTION,
            Winterworks.id("long_burning"), new Potion("burning", new net.minecraft.world.effect.MobEffectInstance(BURNING, 9600)));
    public static final Holder<Potion> STRONG_BURNING_POTION = Registry.registerForHolder(BuiltInRegistries.POTION,
            Winterworks.id("strong_burning"), new Potion("burning", new net.minecraft.world.effect.MobEffectInstance(BURNING, 1800, 1)));
    /** Potion of Decay: the Wither effect. */
    public static final Holder<Potion> DECAY_POTION = Registry.registerForHolder(BuiltInRegistries.POTION,
            Winterworks.id("decay"), new Potion("decay", new net.minecraft.world.effect.MobEffectInstance(
                    net.minecraft.world.effect.MobEffects.WITHER, 800)));
    public static final Holder<Potion> LONG_DECAY_POTION = Registry.registerForHolder(BuiltInRegistries.POTION,
            Winterworks.id("long_decay"), new Potion("decay", new net.minecraft.world.effect.MobEffectInstance(
                    net.minecraft.world.effect.MobEffects.WITHER, 1800)));
    public static final Holder<Potion> STRONG_DECAY_POTION = Registry.registerForHolder(BuiltInRegistries.POTION,
            Winterworks.id("strong_decay"), new Potion("decay", new net.minecraft.world.effect.MobEffectInstance(
                    net.minecraft.world.effect.MobEffects.WITHER, 400, 1)));

    /** How cold you are (cold.ColdSystem): amplifier 0 Chilly, 1 Cold, 2 Freezing, 3 Frozen. Set by the cold meter. */
    public static final Holder<MobEffect> COLD = Registry.registerForHolder(BuiltInRegistries.MOB_EFFECT,
            Winterworks.id("cold"), new WWEffect(MobEffectCategory.HARMFUL, 0x9FD8FF));

    private WWEffects() {}

    public static void init() {}

    static final class WWEffect extends MobEffect {
        WWEffect(MobEffectCategory category, int color) {
            super(category, color);
        }
    }
}
