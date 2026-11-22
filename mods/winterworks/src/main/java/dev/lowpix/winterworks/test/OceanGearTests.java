package dev.lowpix.winterworks.test;

import dev.lowpix.winterworks.registry.OceanBlocks;
import dev.lowpix.winterworks.registry.OceanEntities;
import dev.lowpix.winterworks.registry.OceanItems;
import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/** GameTests for Tides & Treasures: the gear (docs/OCEAN_UPDATE.md). */
public class OceanGearTests implements FabricGameTest {
    @GameTest(template = EMPTY_STRUCTURE)
    public void registered(GameTestHelper h) {
        h.assertTrue(OceanItems.TURTLE_SHELL_CHESTPLATE != null, "registered");
        h.succeed();
    }
}
