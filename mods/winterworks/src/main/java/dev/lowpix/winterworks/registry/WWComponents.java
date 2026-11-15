package dev.lowpix.winterworks.registry;

import com.mojang.serialization.Codec;
import dev.lowpix.winterworks.Winterworks;
import net.minecraft.core.Registry;
import net.minecraft.core.component.DataComponentType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.codec.ByteBufCodecs;

/** Item stack data: the Snowball Launcher keeps its heat and mode on the stack (synced to the client HUD). */
public final class WWComponents {
    public static final DataComponentType<Integer> HEAT = Registry.register(BuiltInRegistries.DATA_COMPONENT_TYPE,
            Winterworks.id("heat"), DataComponentType.<Integer>builder().persistent(Codec.INT)
                    .networkSynchronized(ByteBufCodecs.VAR_INT).build());
    public static final DataComponentType<Boolean> OVERHEATED = Registry.register(BuiltInRegistries.DATA_COMPONENT_TYPE,
            Winterworks.id("overheated"), DataComponentType.<Boolean>builder().persistent(Codec.BOOL)
                    .networkSynchronized(ByteBufCodecs.BOOL).build());
    public static final DataComponentType<Integer> MODE = Registry.register(BuiltInRegistries.DATA_COMPONENT_TYPE,
            Winterworks.id("mode"), DataComponentType.<Integer>builder().persistent(Codec.INT)
                    .networkSynchronized(ByteBufCodecs.VAR_INT).build());

    private WWComponents() {}

    public static void init() {}
}
