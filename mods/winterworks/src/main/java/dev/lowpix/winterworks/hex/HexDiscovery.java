package dev.lowpix.winterworks.hex;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.registry.WWEnchantments;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.attachment.v1.AttachmentRegistry;
import net.fabricmc.fabric.api.attachment.v1.AttachmentSyncPredicate;
import net.fabricmc.fabric.api.attachment.v1.AttachmentType;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.sounds.SoundSource;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.enchantment.Enchantment;

/**
 * Which hidden curses a player has discovered (docs/HEXES_UPDATE.md section 5): until then their names show as
 * obfuscated text. A per-player data attachment, saved, kept on death and synced to that player.
 *
 * <p>The curse code calls {@link #discover(ServerPlayer, ResourceKey)} when a hidden curse triggers on a player.
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

    /**
     * Marks the curse discovered for this player (synced to their client). Returns true the first time,
     * when the player is also told the curse's name.
     */
    public static boolean discover(ServerPlayer player, ResourceKey<Enchantment> key) {
        if (isDiscovered(player, key)) {
            return false;
        }
        List<ResourceLocation> now = new ArrayList<>(player.getAttachedOrElse(DISCOVERED, List.of()));
        now.add(key.location());
        player.setAttached(DISCOVERED, List.copyOf(now));
        if (isHidden(key)) {
            Component name = player.level().registryAccess().registry(Registries.ENCHANTMENT)
                    .flatMap(r -> r.getHolder(key)).map(h -> h.value().description())
                    .orElse(Component.literal(key.location().getPath()));
            player.displayClientMessage(Component.translatable("hex.winterworks.discovered", name.copy().withColor(0xB06CFF))
                    .withColor(0x8A7FA8), true);
            player.level().playSound(null, player.blockPosition(), WWSounds.HEXED_BOOK_WHISPER, SoundSource.PLAYERS, 0.8f, 0.6f);
        }
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
