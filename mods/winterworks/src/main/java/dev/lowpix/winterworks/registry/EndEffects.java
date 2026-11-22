package dev.lowpix.winterworks.registry;

import dev.lowpix.winterworks.Winterworks;
import net.minecraft.core.Holder;
import net.minecraft.core.Registry;
import net.minecraft.core.component.DataComponentType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.item.alchemy.Potion;

/** The Living End's effects, potion and item components (docs/END_UPDATE.md). */
public final class EndEffects {
    /** From End Bulbs: you glow softly (and, secretly, Enderflies come for you). endmob.EndGlowEffect */
    public static final Holder<MobEffect> END_GLOW = Registry.registerForHolder(BuiltInRegistries.MOB_EFFECT,
            Winterworks.id("end_glow"), new dev.lowpix.winterworks.endmob.EndGlowEffect());
    /** Encased in obsidian (end.Petrify). Amplifier 0: invulnerable (the wand); 1: vulnerable (the Monolith). endgear.PetrifiedEffect */
    public static final Holder<MobEffect> PETRIFIED = Registry.registerForHolder(BuiltInRegistries.MOB_EFFECT,
            Winterworks.id("petrified"), new dev.lowpix.winterworks.endgear.PetrifiedEffect());
    /** Instant: teleports you to your spawn point. endmob.RecallEffect */
    public static final Holder<MobEffect> RECALL = Registry.registerForHolder(BuiltInRegistries.MOB_EFFECT,
            Winterworks.id("recall"), new dev.lowpix.winterworks.endmob.RecallEffect());
    public static final Holder<Potion> RECALL_POTION = Registry.registerForHolder(BuiltInRegistries.POTION,
            Winterworks.id("recall"), new Potion("recall", new MobEffectInstance(RECALL, 1)));

    /** How many times a thrown Dragon Egg came back from the void (0-2; the third time it hatches). */
    public static final DataComponentType<Integer> EGG_CRACKS = Registry.register(BuiltInRegistries.DATA_COMPONENT_TYPE,
            Winterworks.id("egg_cracks"), DataComponentType.<Integer>builder()
                    .persistent(com.mojang.serialization.Codec.intRange(0, 3)).networkSynchronized(ByteBufCodecs.VAR_INT).build());

    private EndEffects() {}

    public static void init() {}
}
