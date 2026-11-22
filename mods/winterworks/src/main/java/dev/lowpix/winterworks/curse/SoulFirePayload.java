package dev.lowpix.winterworks.curse;

import dev.lowpix.winterworks.Winterworks;
import net.fabricmc.fabric.api.networking.v1.PlayerLookup;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.LivingEntity;

/**
 * Server -> client: an entity started (ticks > 0, for that long) or stopped (ticks = 0) burning with soul fire
 * (Curses.soulIgnite). Sent to everyone tracking it and to the entity itself when it is a player, and again to anyone
 * who starts tracking a soul-burning entity, so every client draws its flames blue (client.curse.SoulFireClient).
 */
public record SoulFirePayload(int entity, int ticks) implements CustomPacketPayload {
    public static final Type<SoulFirePayload> TYPE = new Type<>(Winterworks.id("soul_fire"));
    public static final StreamCodec<RegistryFriendlyByteBuf, SoulFirePayload> CODEC = StreamCodec.composite(
            ByteBufCodecs.VAR_INT, SoulFirePayload::entity,
            ByteBufCodecs.VAR_INT, SoulFirePayload::ticks,
            SoulFirePayload::new);

    /** Tests: how many soul-fire updates the server has sent out, and the last one. */
    static int sent;
    static SoulFirePayload last;

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }

    /** Tell everyone who can see it (and the entity itself) about its soul fire. */
    static void sync(LivingEntity e, int ticks) {
        if (e.level().isClientSide) {
            return;
        }
        SoulFirePayload payload = new SoulFirePayload(e.getId(), Math.max(0, ticks));
        last = payload;
        sent++;
        for (ServerPlayer p : PlayerLookup.tracking(e)) {
            ServerPlayNetworking.send(p, payload);
        }
        if (e instanceof ServerPlayer self) {
            ServerPlayNetworking.send(self, payload);
        }
    }

    static void send(ServerPlayer viewer, LivingEntity e, int ticks) {
        ServerPlayNetworking.send(viewer, new SoulFirePayload(e.getId(), Math.max(0, ticks)));
    }

    /** Tests: soul-fire updates sent so far. */
    public static int sentCount() {
        return sent;
    }

    /** Tests: the last soul-fire update sent (null if none). */
    public static SoulFirePayload lastSent() {
        return last;
    }
}
