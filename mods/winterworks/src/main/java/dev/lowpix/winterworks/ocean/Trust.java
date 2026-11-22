package dev.lowpix.winterworks.ocean;

import java.util.UUID;
import net.minecraft.world.entity.player.Player;

/**
 * One trust list per player (docs/OCEAN_UPDATE.md section 6): `/winterworks trust|untrust <player>`. Used by the Eye of
 * the Ocean and the Nautilus Horn. Stub: owned by the gear agent; only the owner is trusted until implemented.
 */
public final class Trust {
    private Trust() {}

    public static boolean isTrusted(UUID owner, Player player) {
        return owner != null && owner.equals(player.getUUID());
    }
}
