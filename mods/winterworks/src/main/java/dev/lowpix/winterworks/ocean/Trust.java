package dev.lowpix.winterworks.ocean;

import dev.lowpix.winterworks.oceangear.TrustData;
import java.util.UUID;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.entity.player.Player;

/**
 * One trust list per player (docs/OCEAN_UPDATE.md section 6): `/winterworks trust|untrust <player>` (any player, their
 * own list; saved with the world in oceangear.TrustData). Used by the Eye of the Ocean and the Nautilus Horn.
 * Owned by the gear agent; other areas call only {@link #isTrusted}.
 */
public final class Trust {
    private Trust() {}

    /**
     * Is `player` the owner or on the owner's trust list? Server side; on a client connected to another server (no
     * lists there) only the owner is.
     */
    public static boolean isTrusted(UUID owner, Player player) {
        if (owner == null || player == null) {
            return false;
        }
        if (owner.equals(player.getUUID())) {
            return true;
        }
        MinecraftServer server = player.getServer();
        return server != null && TrustData.get(server).trusts(owner, player.getUUID());
    }
}
