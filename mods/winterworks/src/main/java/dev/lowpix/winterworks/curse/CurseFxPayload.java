package dev.lowpix.winterworks.curse;

import dev.lowpix.winterworks.Winterworks;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/**
 * Server -> client: a curse acting on you (client.curse.CurseClient). `kind` is one of the constants; `ticks` how long
 * (-1: until released); (x, y, z) a push for PULL.
 */
public record CurseFxPayload(int kind, int ticks, float x, float y, float z) implements CustomPacketPayload {
    /** Give the camera back (and stop any curse overlay). */
    public static final int RELEASE = 0;
    /** Narcissus: camera locked on your reflection until released. */
    public static final int TRANSFIX = 1;
    /** Lot's Wife: turned to stone for `ticks`. */
    public static final int STONE = 2;
    /** Sloth: nodding off for `ticks` (eyelids close and open). */
    public static final int NOD = 3;
    /** Moth: a push towards the light (added to your motion). */
    public static final int PULL = 4;

    public static final Type<CurseFxPayload> TYPE = new Type<>(Winterworks.id("curse_fx"));
    public static final StreamCodec<RegistryFriendlyByteBuf, CurseFxPayload> CODEC = StreamCodec.composite(
            ByteBufCodecs.VAR_INT, CurseFxPayload::kind,
            ByteBufCodecs.VAR_INT, CurseFxPayload::ticks,
            ByteBufCodecs.FLOAT, CurseFxPayload::x,
            ByteBufCodecs.FLOAT, CurseFxPayload::y,
            ByteBufCodecs.FLOAT, CurseFxPayload::z,
            CurseFxPayload::new);

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}
