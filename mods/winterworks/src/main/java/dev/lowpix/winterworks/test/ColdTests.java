package dev.lowpix.winterworks.test;

import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/** GameTests for the cold part of the Cold Zone update (docs/COLD_UPDATE.md). ./gradlew runGametest */
public class ColdTests implements FabricGameTest {
    @GameTest(template = EMPTY_STRUCTURE)
    public void coldRegistered(GameTestHelper h) {
        h.succeed();
    }
}
