package dev.lowpix.winterworks.net;

import dev.lowpix.winterworks.Winterworks;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** Server -> client: carts `front` and `back` were coupled (linked = true) or uncoupled. Entity network ids. */
public record CouplingPayload(int front, int back, boolean linked) implements CustomPacketPayload {
    public static final Type<CouplingPayload> TYPE = new Type<>(Winterworks.id("coupling"));
    public static final StreamCodec<RegistryFriendlyByteBuf, CouplingPayload> CODEC = StreamCodec.composite(
            ByteBufCodecs.VAR_INT, CouplingPayload::front,
            ByteBufCodecs.VAR_INT, CouplingPayload::back,
            ByteBufCodecs.BOOL, CouplingPayload::linked,
            CouplingPayload::new);

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}
