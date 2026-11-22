package dev.lowpix.winterworks.net;

import dev.lowpix.winterworks.Winterworks;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/**
 * Server -> client: the player's Fang Dagger fatigue (0..1) and whether they are exhausted (no frenzy until the
 * daggers have fully recharged). The client uses it to choose frenzy or vanilla attacks, to gate pounces and for
 * the frost shimmer on the daggers in first person.
 */
public record DaggerStatePayload(float fatigue, boolean exhausted) implements CustomPacketPayload {
    public static final Type<DaggerStatePayload> TYPE = new Type<>(Winterworks.id("dagger_state"));
    public static final StreamCodec<RegistryFriendlyByteBuf, DaggerStatePayload> CODEC = StreamCodec.composite(
            ByteBufCodecs.FLOAT, DaggerStatePayload::fatigue,
            ByteBufCodecs.BOOL, DaggerStatePayload::exhausted,
            DaggerStatePayload::new);

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}
