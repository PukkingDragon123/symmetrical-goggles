package dev.lowpix.winterworks.net;

import dev.lowpix.winterworks.Winterworks;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/**
 * Server -> client: shake the camera. `strength` is the peak tilt in degrees (about 1 for a roar, 3-4 for the tomb
 * bursting), `ticks` how long it takes to die away. Shakes add up (client.boss.CameraShake).
 */
public record CameraShakePayload(float strength, int ticks) implements CustomPacketPayload {
    public static final Type<CameraShakePayload> TYPE = new Type<>(Winterworks.id("camera_shake"));
    public static final StreamCodec<RegistryFriendlyByteBuf, CameraShakePayload> CODEC = StreamCodec.composite(
            ByteBufCodecs.FLOAT, CameraShakePayload::strength,
            ByteBufCodecs.VAR_INT, CameraShakePayload::ticks,
            CameraShakePayload::new);

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}
