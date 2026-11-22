package dev.lowpix.winterworks.amber;

import java.util.UUID;
import net.minecraft.world.entity.animal.sniffer.Sniffer;
import org.jetbrains.annotations.Nullable;

/** Added to every Sniffer by mixin.SnifferMixin: pitcher-pod taming and excavation (docs/AMBER_UPDATE.md section 8). */
public interface TamedSniffer {
    @Nullable
    UUID ww$owner();

    void ww$setOwner(@Nullable UUID owner);

    default boolean ww$isTamed() {
        return ww$owner() != null;
    }

    SnifferTaming.Job ww$job();

    /** Vanilla's private state (idling, sniffing, searching, digging, ...). */
    Sniffer.State ww$state();

    /** Cancels vanilla's seed drop for the dig that just started (an excavation drops the block's loot instead). */
    void ww$noSeedDrop();
}
