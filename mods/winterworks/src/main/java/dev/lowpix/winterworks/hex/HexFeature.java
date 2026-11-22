package dev.lowpix.winterworks.hex;

import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;

/** Elixirs, the Elixir Jar, the Soul Tank, the Hexing Table, Hexed Books, Hexed (docs/HEXES_UPDATE.md sections 1-2). */
public final class HexFeature {
    private HexFeature() {}

    public static void init() {
        HexComponents.init();
        HexDiscovery.init();
        PayloadTypeRegistry.playS2C().register(SoulDriftPayload.TYPE, SoulDriftPayload.CODEC);
        ServerLivingEntityEvents.AFTER_DEATH.register((entity, source) -> SoulTankBlockEntity.onDeath(entity));
    }
}
