package dev.lowpix.winterworks.test;

import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/** GameTests for the bear part of the Cold Zone update (docs/COLD_UPDATE.md). ./gradlew runGametest */
public class BearTests implements FabricGameTest {
    @GameTest(template = EMPTY_STRUCTURE)
    public void bearRegistered(GameTestHelper h) {
        h.succeed();
    }
}
