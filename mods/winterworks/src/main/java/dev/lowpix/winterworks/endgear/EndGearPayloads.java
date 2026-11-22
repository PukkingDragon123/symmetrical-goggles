package dev.lowpix.winterworks.endgear;

import dev.lowpix.winterworks.Winterworks;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.world.phys.Vec3;

/** The gear's network messages. */
public final class EndGearPayloads {
    private EndGearPayloads() {}

    static final StreamCodec<RegistryFriendlyByteBuf, Vec3> VEC3 = StreamCodec.composite(
            ByteBufCodecs.DOUBLE, Vec3::x, ByteBufCodecs.DOUBLE, Vec3::y, ByteBufCodecs.DOUBLE, Vec3::z, Vec3::new);

    /** Server -> client: a Monolith Wand fired from `from` to `to` (drawn as a fading beam with a particle line). */
    public record WandBeam(Vec3 from, Vec3 to, boolean resisted) implements CustomPacketPayload {
        public static final Type<WandBeam> TYPE = new Type<>(Winterworks.id("wand_beam"));
        public static final StreamCodec<RegistryFriendlyByteBuf, WandBeam> CODEC = StreamCodec.composite(
                VEC3, WandBeam::from, VEC3, WandBeam::to, ByteBufCodecs.BOOL, WandBeam::resisted, WandBeam::new);

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return TYPE;
        }
    }

    /** Client -> server: the rider pressed the dragon breath key (key.winterworks.dragon_breath). */
    public record DragonBreath() implements CustomPacketPayload {
        public static final Type<DragonBreath> TYPE = new Type<>(Winterworks.id("dragon_breath"));
        public static final StreamCodec<RegistryFriendlyByteBuf, DragonBreath> CODEC = StreamCodec.unit(new DragonBreath());

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return TYPE;
        }
    }
}
