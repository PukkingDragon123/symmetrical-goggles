package dev.lowpix.winterworks.client.hex;

import dev.lowpix.winterworks.hex.HexComponents;
import dev.lowpix.winterworks.hex.HexDiscovery;
import dev.lowpix.winterworks.hex.HexedBookItem;
import dev.lowpix.winterworks.hex.Hexing;
import dev.lowpix.winterworks.hex.SoulTankBlockEntity;
import dev.lowpix.winterworks.registry.WWEnchantments;
import dev.lowpix.winterworks.registry.WWItems;
import it.unimi.dsi.fastutil.objects.Object2IntMap;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.core.Holder;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.ComponentContents;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.ItemEnchantments;

/**
 * Tooltips: a Hexed Book lists its enchantments, its curses coloured by tier (lesser soul blue, sins crimson, hidden
 * violet), and hidden curses the player hasn't discovered as obfuscated text. On any other item an undiscovered hidden
 * curse is obfuscated too. A Soul Tank item shows the souls it kept.
 */
final class HexTooltips {
    private HexTooltips() {}

    static void append(ItemStack stack, List<Component> lines) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null) {
            return;
        }
        if (stack.is(WWItems.HEXED_BOOK)) {
            hexedBook(stack, lines, mc.player);
        } else {
            hideUndiscovered(lines, mc.level.registryAccess().registryOrThrow(Registries.ENCHANTMENT), mc.player);
        }
        if (stack.is(WWItems.SOUL_TANK) && stack.has(HexComponents.SOULS)) {
            lines.add(Math.min(1, lines.size()), Component.translatable("item.winterworks.soul_tank.souls",
                    stack.getOrDefault(HexComponents.SOULS, 0), SoulTankBlockEntity.CAPACITY).withColor(HexGui.SOUL));
        }
    }

    static Component obfuscated() {
        return Component.literal("Curse of the Unseen").withStyle(ChatFormatting.OBFUSCATED).withColor(0x5C4A78);
    }

    private static void hexedBook(ItemStack stack, List<Component> lines, Player player) {
        HexComponents.HexInfo info = HexedBookItem.info(stack);
        List<Component> add = new ArrayList<>();
        add.add(Component.translatable(info.tier() == HexComponents.SIN ? "item.winterworks.hexed_book.sin" : "item.winterworks.hexed_book.lesser")
                .withColor(info.tier() == HexComponents.SIN ? HexGui.CRIMSON : HexGui.SOUL));
        ItemEnchantments e = Hexing.stored(stack);
        List<Component> curses = new ArrayList<>();
        for (Object2IntMap.Entry<Holder<Enchantment>> entry : e.entrySet()) {
            Holder<Enchantment> h = entry.getKey();
            int level = entry.getIntValue();
            MutableComponent name = Enchantment.getFullname(h, level).copy();
            if (Hexing.isHidden(h) || isHiddenOnBook(info, h)) {
                curses.add(HexDiscovery.canRead(player, h) ? name.withColor(HexGui.HIDDEN) : obfuscated());
            } else if (Hexing.isSin(h)) {
                add.add(name.withColor(HexGui.CRIMSON));
            } else if (Hexing.isCurse(h)) {
                curses.add(name.withColor(HexGui.SOUL));
            } else {
                add.add(name.withColor(level > h.value().getMaxLevel() ? HexGui.SOUL_PALE : 0xAAAAAA));
            }
        }
        add.addAll(curses);
        if (!info.hidden().isEmpty() && info.hidden().stream().anyMatch(id -> !HexDiscovery.isDiscovered(player,
                ResourceKey.create(Registries.ENCHANTMENT, id)))) {
            add.add(Component.translatable("item.winterworks.hexed_book.whispers").withStyle(ChatFormatting.ITALIC).withColor(0x6A5A88));
        }
        lines.addAll(Math.min(1, lines.size()), add);
    }

    private static boolean isHiddenOnBook(HexComponents.HexInfo info, Holder<Enchantment> h) {
        return h.unwrapKey().map(k -> info.hidden().contains(k.location())).orElse(false);
    }

    /** Replaces the tooltip lines of hidden curses this player hasn't discovered with obfuscated text. */
    private static void hideUndiscovered(List<Component> lines, Registry<Enchantment> registry, Player player) {
        List<ComponentContents> secret = new ArrayList<>();
        for (ResourceKey<Enchantment> k : WWEnchantments.HIDDEN) {
            if (!HexDiscovery.isDiscovered(player, k)) {
                registry.getHolder(k).ifPresent(h -> secret.add(h.value().description().getContents()));
            }
        }
        if (secret.isEmpty()) {
            return;
        }
        for (int i = 0; i < lines.size(); i++) {
            if (secret.contains(lines.get(i).getContents())) {
                lines.set(i, obfuscated());
            }
        }
    }
}
