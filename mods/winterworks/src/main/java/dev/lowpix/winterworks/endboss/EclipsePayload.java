package dev.lowpix.winterworks.endboss;

import dev.lowpix.winterworks.Winterworks;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** Server -> client: the End's eclipse (its fraction and the ticks it has left), sent on change, join and dimension change. */
public record EclipsePayload(float level, int remaining) implements CustomPacketPayload {
    public static final Type<EclipsePayload> TYPE = new Type<>(Winterworks.id("eclipse"));
    public static final StreamCodec<RegistryFriendlyByteBuf, EclipsePayload> CODEC = StreamCodec.composite(
            ByteBufCodecs.FLOAT, EclipsePayload::level,
            ByteBufCodecs.VAR_INT, EclipsePayload::remaining,
            EclipsePayload::new);

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}
