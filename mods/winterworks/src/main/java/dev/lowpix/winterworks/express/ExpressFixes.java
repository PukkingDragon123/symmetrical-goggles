package dev.lowpix.winterworks.express;

import dev.lowpix.winterworks.registry.WWItems;
import net.fabricmc.fabric.api.itemgroup.v1.ItemGroupEvents;
import net.minecraft.core.registries.BuiltInRegistries;

/**
 * Winter Express 0.4 (docs/FIXES_0_4.md "The Winter Express", "Rails"): the Coaster Loop's network sync and the new
 * rails in the creative tab. Vanilla minecarts coupling into trains, furnace-powered trains, floating coaster rails,
 * the redstone-block booster and the switch's routing live in Couplings, FurnacePower, the rail blocks and the
 * minecart mixins.
 */
public final class ExpressFixes {
    private ExpressFixes() {}

    public static void init() {
        CoasterLoop.init();
        ItemGroupEvents.modifyEntriesEvent(BuiltInRegistries.CREATIVE_MODE_TAB.getResourceKey(WWItems.TAB).orElseThrow())
                .register(entries -> entries.addAfter(WWItems.DROP_RAIL, WWItems.SWITCH_RAIL, WWItems.COASTER_LOOP));
    }
}
