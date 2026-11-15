package dev.lowpix.winterworks;

import dev.lowpix.winterworks.express.Couplings;
import dev.lowpix.winterworks.icebreaker.HeavyShearsItem;
import dev.lowpix.winterworks.icebreaker.RamHandler;
import dev.lowpix.winterworks.net.CouplingPayload;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWComponents;
import dev.lowpix.winterworks.registry.WWEffects;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.registry.WWParticles;
import dev.lowpix.winterworks.registry.WWSounds;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.registry.FabricBrewingRecipeRegistryBuilder;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.alchemy.Potions;
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
        WWSounds.init();
        WWComponents.init();
        WWEffects.init();
        WWParticles.init();
        WWBlocks.init();
        WWEntities.init();
        WWItems.init();
        HeavyShearsItem.init();
        RamHandler.init();
        Couplings.init();
        PayloadTypeRegistry.playS2C().register(CouplingPayload.TYPE, CouplingPayload.CODEC);
        FabricBrewingRecipeRegistryBuilder.BUILD.register(b -> {
            b.addMix(Potions.AWKWARD, WWItems.ICEBREAKER_HORN, WWEffects.RAMMING_POTION);
            b.addMix(WWEffects.RAMMING_POTION, Items.REDSTONE, WWEffects.LONG_RAMMING_POTION);
            b.addMix(WWEffects.RAMMING_POTION, Items.GLOWSTONE_DUST, WWEffects.STRONG_RAMMING_POTION);
        });
        LOG.info("Winterworks ready: Snowball Launcher, Icebreaker, Winter Express, Snow Globe");
    }
}
