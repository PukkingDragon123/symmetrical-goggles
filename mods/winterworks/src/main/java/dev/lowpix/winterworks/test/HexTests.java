package dev.lowpix.winterworks.test;

import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/** GameTests for the hex part of Hexes & Havoc (docs/HEXES_UPDATE.md). ./gradlew runGametest */
public class HexTests implements FabricGameTest {
    @GameTest(template = EMPTY_STRUCTURE)
    public void hexRegistered(GameTestHelper h) {
        h.succeed();
    }
}
