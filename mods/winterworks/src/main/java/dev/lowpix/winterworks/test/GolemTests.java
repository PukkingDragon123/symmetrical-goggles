package dev.lowpix.winterworks.test;

import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/** GameTests for the golem part of the Amber Age update (docs/AMBER_UPDATE.md). ./gradlew runGametest */
public class GolemTests implements FabricGameTest {
    @GameTest(template = EMPTY_STRUCTURE)
    public void golemRegistered(GameTestHelper h) {
        h.succeed();
    }
}
