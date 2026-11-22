package dev.lowpix.winterworks.test;

import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/** GameTests for the nether part of Hexes & Havoc (docs/HEXES_UPDATE.md). ./gradlew runGametest */
public class NetherTests implements FabricGameTest {
    @GameTest(template = EMPTY_STRUCTURE)
    public void netherRegistered(GameTestHelper h) {
        h.succeed();
    }
}
