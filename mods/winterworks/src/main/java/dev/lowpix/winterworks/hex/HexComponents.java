package dev.lowpix.winterworks.hex;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.lowpix.winterworks.Winterworks;
import java.util.List;
import net.minecraft.core.Registry;
import net.minecraft.core.component.DataComponentType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.resources.ResourceLocation;
import io.netty.buffer.ByteBuf;

/** Item stack data of the hex feature: a Hexed Book's hex, and the souls a Soul Tank item still holds. */
public final class HexComponents {
    public static final int LESSER = 0, SIN = 1, HIDDEN = 2;

    /**
     * What a Hexed Book went through: its hex tier ({@link #LESSER} or {@link #SIN}) and the hidden curses on it
     * (ids of enchantments in STORED_ENCHANTMENTS that stay unnamed until the player discovers them).
     */
    public record HexInfo(int tier, List<ResourceLocation> hidden) {
        public static final HexInfo NONE = new HexInfo(LESSER, List.of());
        public static final Codec<HexInfo> CODEC = RecordCodecBuilder.create(i -> i.group(
                Codec.INT.fieldOf("tier").forGetter(HexInfo::tier),
                ResourceLocation.CODEC.listOf().optionalFieldOf("hidden", List.of()).forGetter(HexInfo::hidden)
        ).apply(i, HexInfo::new));
        public static final StreamCodec<ByteBuf, HexInfo> STREAM_CODEC = StreamCodec.composite(
                ByteBufCodecs.VAR_INT, HexInfo::tier,
                ResourceLocation.STREAM_CODEC.apply(ByteBufCodecs.list()), HexInfo::hidden,
                HexInfo::new);

        public HexInfo {
            hidden = List.copyOf(hidden);
        }

        /** The book's texture: item/hexed_book_lesser, _sin or _hidden (a hidden curse wins). */
        public int look() {
            return hidden.isEmpty() ? (tier == SIN ? SIN : LESSER) : HIDDEN;
        }
    }

    public static final DataComponentType<HexInfo> HEX = Registry.register(BuiltInRegistries.DATA_COMPONENT_TYPE,
            Winterworks.id("hex"), DataComponentType.<HexInfo>builder().persistent(HexInfo.CODEC)
                    .networkSynchronized(HexInfo.STREAM_CODEC).build());

    /** Souls kept in a broken Soul Tank (copied by its loot table, put back when it is placed). */
    public static final DataComponentType<Integer> SOULS = Registry.register(BuiltInRegistries.DATA_COMPONENT_TYPE,
            Winterworks.id("souls"), DataComponentType.<Integer>builder().persistent(Codec.intRange(0, SoulTankBlockEntity.CAPACITY))
                    .networkSynchronized(ByteBufCodecs.VAR_INT).build());

    private HexComponents() {}

    static void init() {}
}
