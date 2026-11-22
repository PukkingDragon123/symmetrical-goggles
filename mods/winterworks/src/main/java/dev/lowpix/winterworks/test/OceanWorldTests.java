package dev.lowpix.winterworks.test;

import dev.lowpix.winterworks.registry.OceanBlocks;
import dev.lowpix.winterworks.registry.OceanEntities;
import dev.lowpix.winterworks.registry.OceanItems;
import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/** GameTests for Tides & Treasures: the world (docs/OCEAN_UPDATE.md). */
public class OceanWorldTests implements FabricGameTest {
    @GameTest(template = EMPTY_STRUCTURE)
    public void registered(GameTestHelper h) {
        h.assertTrue(OceanBlocks.ASH_SAND != null, "registered");
        h.succeed();
    }
}
