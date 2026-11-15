package dev.lowpix.winterworks;

import net.fabricmc.api.ModInitializer;
import net.minecraft.resources.ResourceLocation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class Winterworks implements ModInitializer {
    public static final String MOD_ID = "winterworks";
    public static final Logger LOG = LoggerFactory.getLogger("Winterworks");

    public static ResourceLocation id(String path) {
        return ResourceLocation.fromNamespaceAndPath(MOD_ID, path);
    }

    @Override
    public void onInitialize() {
        LOG.info("Winterworks starting");
    }
}
