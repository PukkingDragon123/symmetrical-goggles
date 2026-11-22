package dev.lowpix.winterworks.net;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.express.LoopMotion;
import net.minecraft.core.BlockPos;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/**
 * Server -> client: minecart `entity` started riding a Coaster Loop with this exact state (the client then runs the
 * same steps as the server), or (active = false) was thrown out of it early (its loop block was broken).
 */
public record LoopPayload(int entity, boolean active, BlockPos loop, boolean alongX, int sign, double speed, double theta,
                          int dir, int ticks) implements CustomPacketPayload {
    public static final Type<LoopPayload> TYPE = new Type<>(Winterworks.id("coaster_loop"));
    public static final StreamCodec<FriendlyByteBuf, LoopPayload> CODEC = StreamCodec.ofMember(LoopPayload::write, LoopPayload::read);

    public static LoopPayload start(int entity, LoopMotion m) {
        return new LoopPayload(entity, true, m.loop, m.alongX, m.sign, m.speed, m.theta, m.dir, m.ticks);
    }

    public static LoopPayload stop(int entity) {
        return new LoopPayload(entity, false, BlockPos.ZERO, false, 1, 0, 0, 1, 0);
    }

    public LoopMotion motion() {
        return LoopMotion.of(loop, alongX, sign, speed, theta, dir, ticks);
    }

    private void write(FriendlyByteBuf buf) {
        buf.writeVarInt(entity);
        buf.writeBoolean(active);
        buf.writeBlockPos(loop);
        buf.writeBoolean(alongX);
        buf.writeByte(sign);
        buf.writeDouble(speed);
        buf.writeDouble(theta);
        buf.writeByte(dir);
        buf.writeVarInt(ticks);
    }

    private static LoopPayload read(FriendlyByteBuf buf) {
        return new LoopPayload(buf.readVarInt(), buf.readBoolean(), buf.readBlockPos(), buf.readBoolean(), buf.readByte(),
                buf.readDouble(), buf.readDouble(), buf.readByte(), buf.readVarInt());
    }

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}
