package dev.lowpix.winterworks.hex;

import dev.lowpix.winterworks.registry.WWEnchantments;
import dev.lowpix.winterworks.registry.WWItems;
import it.unimi.dsi.fastutil.objects.Object2IntMap;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import net.minecraft.core.Holder;
import net.minecraft.core.HolderSet;
import net.minecraft.core.Registry;
import net.minecraft.core.component.DataComponents;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.tags.EnchantmentTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.EnchantmentHelper;
import net.minecraft.world.item.enchantment.Enchantments;
import net.minecraft.world.item.enchantment.ItemEnchantments;

/**
 * The hex rules (docs/HEXES_UPDATE.md section 2), shared by the Hexing Table's menu (server), its screen (client
 * preview) and the tests. Pure functions of a book, the enchantment registry and a random source.
 */
public final class Hexing {
    /** Hexed levels go up to VI (anvils keep them: mixin.AnvilMenuMixin). */
    public static final int MAX_LEVEL = 6;
    public static final int LESSER_ELIXIR = 1, LESSER_SOULS = 100, SIN_ELIXIR = 3, SIN_SOULS = 300;
    public static final int LESSER_MINUTES = 5, STRONG_LESSER_MINUTES = 10, SIN_MINUTES = 20;
    public static final float HIDDEN_CHANCE = 0.15f;

    /** Why a hex can't happen (0 = it can). Synced to the screen. */
    public static final int OK = 0, NO_BOOK = 1, NOT_A_BOOK = 2, NOTHING_TO_HEX = 3, NO_CURSE = 4, NO_TANK = 5,
            NO_ELIXIR = 6, NO_SOULS = 7;

    public enum Kind {
        LESSER, SIN;

        public int elixir() {
            return this == LESSER ? LESSER_ELIXIR : SIN_ELIXIR;
        }

        public int souls() {
            return this == LESSER ? LESSER_SOULS : SIN_SOULS;
        }
    }

    /** A sin source on a book and the sin it becomes (the sin may be missing from the registry). */
    public record SinPick(Holder<Enchantment> source, int level, ResourceKey<Enchantment> sinKey, Optional<Holder<Enchantment>> sin) {}

    /** The seven sin sources, in the contract's order (section 4): source -> sin. */
    public static final List<ResourceKey<Enchantment>> SIN_SOURCES = List.of(Enchantments.FIRE_ASPECT, Enchantments.FORTUNE,
            Enchantments.LOOTING, Enchantments.MENDING, Enchantments.EFFICIENCY, Enchantments.THORNS, Enchantments.PROTECTION);

    private Hexing() {}

    public static ResourceKey<Enchantment> sinOf(ResourceKey<Enchantment> source) {
        int i = SIN_SOURCES.indexOf(source);
        return i < 0 ? null : WWEnchantments.SINS.get(i);
    }

    /** The lesser curses a lesser hex picks from: the seven new ones plus Binding and Vanishing. */
    public static List<ResourceKey<Enchantment>> lesserCurseKeys() {
        List<ResourceKey<Enchantment>> out = new ArrayList<>(WWEnchantments.LESSER);
        out.add(Enchantments.BINDING_CURSE);
        out.add(Enchantments.VANISHING_CURSE);
        return out;
    }

    public static boolean isLesserCurse(Holder<Enchantment> h) {
        return h.unwrapKey().map(k -> lesserCurseKeys().contains(k)).orElse(false);
    }

    public static boolean isSin(Holder<Enchantment> h) {
        return h.unwrapKey().map(WWEnchantments.SINS::contains).orElse(false);
    }

    public static boolean isHidden(Holder<Enchantment> h) {
        return h.unwrapKey().map(WWEnchantments.HIDDEN::contains).orElse(false);
    }

    public static boolean isCurse(Holder<Enchantment> h) {
        return h.is(EnchantmentTags.CURSE) || isLesserCurse(h) || isHidden(h);
    }

    /** Only enchanted books go on the Hexing Table. */
    public static boolean isHexable(ItemStack stack) {
        return stack.is(Items.ENCHANTED_BOOK) && !stored(stack).isEmpty();
    }

    public static ItemEnchantments stored(ItemStack stack) {
        return stack.getOrDefault(DataComponents.STORED_ENCHANTMENTS, ItemEnchantments.EMPTY);
    }

    /** A lesser hex's new level: +1 up to VI; curses and enchantments whose maximum is I stay as they are. */
    public static int upgradeLevel(Holder<Enchantment> h, int level) {
        if (isCurse(h) || h.value().getMaxLevel() <= 1) {
            return level;
        }
        return Math.max(level, Math.min(MAX_LEVEL, level + 1));
    }

    /** Every enchantment +1 (the lesser hex), in the book's order. */
    public static ItemEnchantments upgraded(ItemEnchantments in) {
        ItemEnchantments.Mutable m = new ItemEnchantments.Mutable(ItemEnchantments.EMPTY);
        for (Object2IntMap.Entry<Holder<Enchantment>> e : in.entrySet()) {
            m.set(e.getKey(), upgradeLevel(e.getKey(), e.getIntValue()));
        }
        return m.toImmutable();
    }

    /** How many levels a lesser hex adds to this book (its power). */
    public static int levelsGained(ItemEnchantments in) {
        int n = 0;
        for (Object2IntMap.Entry<Holder<Enchantment>> e : in.entrySet()) {
            n += upgradeLevel(e.getKey(), e.getIntValue()) - e.getIntValue();
        }
        return n;
    }

    /** 5 minutes of `hexed`, 10 if anything reaches V-VI. */
    public static int lesserMinutes(ItemEnchantments in) {
        for (Object2IntMap.Entry<Holder<Enchantment>> e : upgraded(in).entrySet()) {
            if (!isCurse(e.getKey()) && e.getIntValue() >= 5) {
                return STRONG_LESSER_MINUTES;
            }
        }
        return LESSER_MINUTES;
    }

    /** The first sin source on the book (contract order), if any. */
    public static Optional<SinPick> sinSource(Registry<Enchantment> registry, ItemEnchantments in) {
        for (ResourceKey<Enchantment> source : SIN_SOURCES) {
            for (Object2IntMap.Entry<Holder<Enchantment>> e : in.entrySet()) {
                if (e.getKey().is(source)) {
                    ResourceKey<Enchantment> sinKey = sinOf(source);
                    Optional<Holder<Enchantment>> sin = registry.getHolder(sinKey).map(h -> (Holder<Enchantment>) h);
                    return Optional.of(new SinPick(e.getKey(), e.getIntValue(), sinKey, sin));
                }
            }
        }
        return Optional.empty();
    }

    /** A random lesser curse the book doesn't have yet. */
    public static Optional<Holder<Enchantment>> pickLesserCurse(Registry<Enchantment> registry, ItemEnchantments in, RandomSource random) {
        return pick(registry, lesserCurseKeys(), in, random);
    }

    /** A random hidden curse the book doesn't have yet. */
    public static Optional<Holder<Enchantment>> pickHiddenCurse(Registry<Enchantment> registry, ItemEnchantments in, RandomSource random) {
        return pick(registry, WWEnchantments.HIDDEN, in, random);
    }

    private static Optional<Holder<Enchantment>> pick(Registry<Enchantment> registry, List<ResourceKey<Enchantment>> keys,
                                                      ItemEnchantments in, RandomSource random) {
        List<Holder<Item>> targets = targets(in);
        List<Holder<Enchantment>> options = new ArrayList<>();
        for (ResourceKey<Enchantment> k : keys) {
            registry.getHolder(k).ifPresent(h -> {
                if (in.getLevel(h) <= 0 && fits(h, targets)) {
                    options.add(h);
                }
            });
        }
        return options.isEmpty() ? Optional.empty() : Optional.of(options.get(random.nextInt(options.size())));
    }

    /**
     * The items a book is for: those all of its (non-curse) enchantments can go on, or, for a book that mixes
     * enchantments no one item takes, any item one of them can go on.
     */
    public static List<Holder<Item>> targets(ItemEnchantments in) {
        List<Holder<Enchantment>> main = new ArrayList<>();
        for (Holder<Enchantment> h : in.keySet()) {
            if (!isCurse(h)) {
                main.add(h);
            }
        }
        if (main.isEmpty()) {
            main.addAll(in.keySet());
        }
        List<Holder<Item>> all = new ArrayList<>(), any = new ArrayList<>();
        for (Holder<Enchantment> h : main) {
            for (Holder<Item> item : h.value().getSupportedItems()) {
                if (!any.contains(item)) {
                    any.add(item);
                }
            }
        }
        for (Holder<Item> item : any) {
            if (main.stream().allMatch(h -> h.value().getSupportedItems().contains(item))) {
                all.add(item);
            }
        }
        return all.isEmpty() ? any : all;
    }

    /** A curse fits the book if it can go on something the book is for, so it carries over when the book is applied. */
    public static boolean fits(Holder<Enchantment> curse, List<Holder<Item>> targets) {
        HolderSet<Item> supported = curse.value().getSupportedItems();
        for (Holder<Item> item : targets) {
            if (supported.contains(item)) {
                return true;
            }
        }
        return false;
    }

    /** Why a lesser hex of this book can't happen, before the table's costs are checked. */
    public static int lesserBookProblem(Registry<Enchantment> registry, ItemStack book) {
        if (book.isEmpty()) {
            return NO_BOOK;
        }
        if (!isHexable(book)) {
            return NOT_A_BOOK;
        }
        if (levelsGained(stored(book)) <= 0) {
            return NOTHING_TO_HEX;
        }
        return pick(registry, lesserCurseKeys(), stored(book), RandomSource.create(0)).isPresent() ? OK : NO_CURSE;
    }

    /** Why a sin hex of this book can't happen, before the table's costs are checked. */
    public static int sinBookProblem(Registry<Enchantment> registry, ItemStack book) {
        if (book.isEmpty()) {
            return NO_BOOK;
        }
        if (!isHexable(book)) {
            return NOT_A_BOOK;
        }
        Optional<SinPick> pick = sinSource(registry, stored(book));
        if (pick.isEmpty()) {
            return NOTHING_TO_HEX;
        }
        return pick.get().sin().isPresent() ? OK : NO_CURSE;
    }

    /** The lesser hex: every enchantment +1 and the curse. */
    public static ItemEnchantments lesserEnchantments(ItemEnchantments in, Holder<Enchantment> curse) {
        ItemEnchantments.Mutable m = new ItemEnchantments.Mutable(upgraded(in));
        m.set(curse, 1);
        return m.toImmutable();
    }

    /** The sin hex: the source becomes its sin (at the source's level, within the sin's range). */
    public static ItemEnchantments sinEnchantments(ItemEnchantments in, SinPick pick) {
        Holder<Enchantment> sin = pick.sin().orElseThrow();
        ItemEnchantments.Mutable m = new ItemEnchantments.Mutable(ItemEnchantments.EMPTY);
        for (Object2IntMap.Entry<Holder<Enchantment>> e : in.entrySet()) {
            if (e.getKey().equals(pick.source())) {
                m.set(sin, Math.max(1, Math.min(pick.level(), sin.value().getMaxLevel())));
            } else {
                m.set(e.getKey(), e.getIntValue());
            }
        }
        return m.toImmutable();
    }

    /** Builds the Hexed Book: its enchantments (shown by its own tooltip), the hex tier and any hidden curse. */
    public static ItemStack hexedBook(ItemStack from, ItemEnchantments enchantments, Kind kind, Optional<Holder<Enchantment>> hidden) {
        ItemEnchantments.Mutable m = new ItemEnchantments.Mutable(enchantments);
        List<ResourceLocation> hiddenIds = new ArrayList<>();
        hidden.ifPresent(h -> {
            m.set(h, 1);
            h.unwrapKey().ifPresent(k -> hiddenIds.add(k.location()));
        });
        ItemStack out = new ItemStack(WWItems.HEXED_BOOK);
        out.set(DataComponents.STORED_ENCHANTMENTS, m.toImmutable().withTooltip(false));
        out.set(HexComponents.HEX, new HexComponents.HexInfo(kind == Kind.SIN ? HexComponents.SIN : HexComponents.LESSER, hiddenIds));
        if (from.has(DataComponents.CUSTOM_NAME)) {
            out.set(DataComponents.CUSTOM_NAME, from.get(DataComponents.CUSTOM_NAME));
        }
        out.set(DataComponents.REPAIR_COST, from.getOrDefault(DataComponents.REPAIR_COST, 0));
        return out;
    }

    /** All enchantments a stack carries, stored or applied. */
    public static ItemEnchantments all(ItemStack stack) {
        ItemEnchantments s = stored(stack);
        return s.isEmpty() ? EnchantmentHelper.getEnchantmentsForCrafting(stack) : s;
    }
}
