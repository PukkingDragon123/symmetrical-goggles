package dev.lowpix.winterworks.hex;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.registry.WWEnchantments;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.attachment.v1.AttachmentRegistry;
import net.fabricmc.fabric.api.attachment.v1.AttachmentSyncPredicate;
import net.fabricmc.fabric.api.attachment.v1.AttachmentType;
import net.minecraft.core.Holder;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.enchantment.Enchantment;

/**
 * Which hidden curses a player has discovered (docs/HEXES_UPDATE.md section 5): until then their names show as
 * obfuscated text in tooltips (client.hex.HexTooltips). A per-player data attachment, saved, kept on death and synced
 * to that player.
 *
 * <p>The curse code (curse.Curses) calls {@link #discover(ServerPlayer, ResourceKey)} when a hidden curse triggers on a
 * player; it also tells the player, so this stays quiet.
 */
public final class HexDiscovery {
    public static final AttachmentType<List<ResourceLocation>> DISCOVERED = AttachmentRegistry.<List<ResourceLocation>>builder()
            .persistent(ResourceLocation.CODEC.listOf())
            .copyOnDeath()
            .initializer(List::of)
            .syncWith(ResourceLocation.STREAM_CODEC.apply(ByteBufCodecs.list()), AttachmentSyncPredicate.targetOnly())
            .buildAndRegister(Winterworks.id("hex_discovered"));

    private HexDiscovery() {}

    static void init() {}

    /** Marks the curse discovered for this player (synced to their client). Returns true the first time. */
    public static boolean discover(ServerPlayer player, ResourceKey<Enchantment> key) {
        if (isDiscovered(player, key)) {
            return false;
        }
        List<ResourceLocation> now = new ArrayList<>(player.getAttachedOrElse(DISCOVERED, List.of()));
        now.add(key.location());
        player.setAttached(DISCOVERED, List.copyOf(now));
        return true;
    }

    public static boolean isDiscovered(Player player, ResourceKey<Enchantment> key) {
        return player != null && player.getAttachedOrElse(DISCOVERED, List.of()).contains(key.location());
    }

    /** True if the player may read this enchantment's name: anything but an undiscovered hidden curse. */
    public static boolean canRead(Player player, Holder<Enchantment> h) {
        return h.unwrapKey().map(k -> !isHidden(k) || isDiscovered(player, k)).orElse(true);
    }

    public static boolean isHidden(ResourceKey<Enchantment> key) {
        return WWEnchantments.HIDDEN.contains(key);
    }
}
