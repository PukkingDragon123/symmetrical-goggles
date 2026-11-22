package dev.lowpix.winterworks.test;

import dev.lowpix.winterworks.registry.EndBlocks;
import dev.lowpix.winterworks.registry.EndEntities;
import dev.lowpix.winterworks.registry.EndItems;
import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/** GameTests for the Living End's bosses (docs/END_UPDATE.md). */
public class EndBossTests implements FabricGameTest {
    @GameTest(template = EMPTY_STRUCTURE)
    public void registered(GameTestHelper h) {
        h.assertTrue(EndEntities.MONOLITH != null, "registered");
        h.succeed();
    }
}
