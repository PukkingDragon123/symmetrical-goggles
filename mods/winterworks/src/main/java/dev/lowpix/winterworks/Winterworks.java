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
        dev.lowpix.winterworks.registry.WWArmor.init();
        dev.lowpix.winterworks.world.WWWorldgen.init();
        dev.lowpix.winterworks.cold.ColdSystem.init();
        dev.lowpix.winterworks.boss.BossFeature.init();
        dev.lowpix.winterworks.bear.BearFeature.init();
        dev.lowpix.winterworks.dagger.DaggerFeature.init();
        dev.lowpix.winterworks.world.Archaeology.init();
        dev.lowpix.winterworks.amber.AmberFeature.init();
        dev.lowpix.winterworks.golem.GolemFeature.init();
        dev.lowpix.winterworks.registry.WWMenus.init();
        dev.lowpix.winterworks.hex.HexFeature.init();
        dev.lowpix.winterworks.curse.CurseFeature.init();
        dev.lowpix.winterworks.nether.NetherFeature.init();
        // ---- The Living End (docs/END_UPDATE.md)
        dev.lowpix.winterworks.registry.EndSounds.init();
        dev.lowpix.winterworks.registry.EndParticles.init();
        dev.lowpix.winterworks.registry.EndEffects.init();
        dev.lowpix.winterworks.registry.EndBlocks.init();
        dev.lowpix.winterworks.registry.EndEntities.init();
        dev.lowpix.winterworks.registry.EndItems.init();
        dev.lowpix.winterworks.end.EndWorldFeature.init();
        dev.lowpix.winterworks.endmob.EndMobFeature.init();
        dev.lowpix.winterworks.endgear.EndGearFeature.init();
        dev.lowpix.winterworks.endboss.EndBossFeature.init();
        PayloadTypeRegistry.playS2C().register(CouplingPayload.TYPE, CouplingPayload.CODEC);
        // ---- 0.4 fixes: rails (docs/FIXES_0_4.md)
        dev.lowpix.winterworks.express.ExpressFixes.init();
        FabricBrewingRecipeRegistryBuilder.BUILD.register(b -> {
            b.addMix(Potions.AWKWARD, WWItems.ICEBREAKER_HORN, WWEffects.RAMMING_POTION);
            b.addMix(WWEffects.RAMMING_POTION, Items.REDSTONE, WWEffects.LONG_RAMMING_POTION);
            b.addMix(WWEffects.RAMMING_POTION, Items.GLOWSTONE_DUST, WWEffects.STRONG_RAMMING_POTION);
            b.addMix(WWEffects.BLOOD_POTION, Items.TORCHFLOWER, WWEffects.IMMUNITY_POTION);
            b.addMix(WWEffects.IMMUNITY_POTION, Items.REDSTONE, WWEffects.LONG_IMMUNITY_POTION);
        });
        LOG.info("Winterworks ready: Snowball Launcher, Icebreaker, Winter Express, Snow Globe, Cold Zone");
    }
}
