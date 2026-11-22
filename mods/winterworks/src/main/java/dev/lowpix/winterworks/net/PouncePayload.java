package dev.lowpix.winterworks.net;

import dev.lowpix.winterworks.Winterworks;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/**
 * Client -> server: the player just pounced with two Fang Daggers (sneak + jump on the ground), facing `yaw`.
 * The client already leapt (player movement is client-side); the server validates the pounce and tracks its hits.
 */
public record PouncePayload(float yaw) implements CustomPacketPayload {
    public static final Type<PouncePayload> TYPE = new Type<>(Winterworks.id("dagger_pounce"));
    public static final StreamCodec<RegistryFriendlyByteBuf, PouncePayload> CODEC = StreamCodec.composite(
            ByteBufCodecs.FLOAT, PouncePayload::yaw,
            PouncePayload::new);

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}
