package dev.lowpix.winterworks.curse;

import dev.lowpix.winterworks.registry.WWEnchantments;
import java.util.HashMap;
import java.util.Map;
import net.minecraft.core.Holder;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.enchantment.Enchantment;
import org.jetbrains.annotations.Nullable;

/** Every curse and sin of Hexes & Havoc (docs/HEXES_UPDATE.md 3-5), keyed to its data-driven enchantment. */
public enum Curse {
    NARCISSUS(WWEnchantments.NARCISSUS, Kind.LESSER),
    ICARUS(WWEnchantments.ICARUS, Kind.LESSER),
    MIDAS(WWEnchantments.MIDAS, Kind.LESSER),
    ORPHEUS(WWEnchantments.ORPHEUS, Kind.LESSER),
    SISYPHUS(WWEnchantments.SISYPHUS, Kind.LESSER),
    TANTALUS(WWEnchantments.TANTALUS, Kind.LESSER),
    MOTH(WWEnchantments.MOTH, Kind.LESSER),
    CAIN(WWEnchantments.CAIN, Kind.HIDDEN),
    JUDAS(WWEnchantments.JUDAS, Kind.HIDDEN),
    LOTS_WIFE(WWEnchantments.LOTS_WIFE, Kind.HIDDEN),
    LEECH(WWEnchantments.LEECH, Kind.HIDDEN),
    WRATH(WWEnchantments.WRATH, Kind.SIN),
    GREED(WWEnchantments.GREED, Kind.SIN),
    LUST(WWEnchantments.LUST, Kind.SIN),
    GLUTTONY(WWEnchantments.GLUTTONY, Kind.SIN),
    SLOTH(WWEnchantments.SLOTH, Kind.SIN),
    ENVY(WWEnchantments.ENVY, Kind.SIN),
    PRIDE(WWEnchantments.PRIDE, Kind.SIN);

    public enum Kind { LESSER, HIDDEN, SIN }

    public static final Curse[] ALL = values();
    private static final Map<ResourceKey<Enchantment>, Curse> BY_KEY = new HashMap<>();

    static {
        for (Curse c : ALL) {
            BY_KEY.put(c.key, c);
        }
    }

    public final ResourceKey<Enchantment> key;
    public final Kind kind;

    Curse(ResourceKey<Enchantment> key, Kind kind) {
        this.key = key;
        this.kind = kind;
    }

    /** The id path, e.g. "lots_wife" (lang keys are curse.winterworks.<id>.*). */
    public String id() {
        return key.location().getPath();
    }

    public boolean sin() {
        return kind == Kind.SIN;
    }

    public boolean hidden() {
        return kind == Kind.HIDDEN;
    }

    @Nullable
    public static Curse of(ResourceKey<Enchantment> key) {
        return BY_KEY.get(key);
    }

    @Nullable
    public static Curse of(Holder<Enchantment> holder) {
        return holder instanceof Holder.Reference<Enchantment> ref ? BY_KEY.get(ref.key()) : null;
    }
}
