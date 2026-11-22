package dev.lowpix.winterworks.hex;

import dev.lowpix.winterworks.Winterworks;
import net.minecraft.core.BlockPos;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** A mob's soul drifting from where it died (x, y, z) into a Soul Tank: drawn by client.hex.SoulDrifts. */
public record SoulDriftPayload(float x, float y, float z, BlockPos tank) implements CustomPacketPayload {
    public static final Type<SoulDriftPayload> TYPE = new Type<>(Winterworks.id("soul_drift"));
    public static final StreamCodec<RegistryFriendlyByteBuf, SoulDriftPayload> CODEC = StreamCodec.composite(
            ByteBufCodecs.FLOAT, SoulDriftPayload::x,
            ByteBufCodecs.FLOAT, SoulDriftPayload::y,
            ByteBufCodecs.FLOAT, SoulDriftPayload::z,
            BlockPos.STREAM_CODEC, SoulDriftPayload::tank,
            SoulDriftPayload::new);

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}
