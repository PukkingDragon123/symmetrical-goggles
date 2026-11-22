package dev.lowpix.winterworks.test;

import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.world.Archaeology;
import dev.lowpix.winterworks.world.CaveDepositsFeature;
import dev.lowpix.winterworks.world.DigSite;
import dev.lowpix.winterworks.world.WWWorldgen;
import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.world.level.biome.MultiNoiseBiomeSourceParameterLists;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.BarrelBlockEntity;
import net.minecraft.world.level.block.entity.BrushableBlockEntity;
import net.minecraft.world.level.block.entity.ChestBlockEntity;

/** GameTests for archaeology worldgen (docs/AMBER_UPDATE.md sections 1-3). */
public class ArchaeologyTests implements FabricGameTest {

    @GameTest(template = EMPTY_STRUCTURE)
    public void deadCavesAndDigSitesAreRegistered(GameTestHelper h) {
        var access = h.getLevel().registryAccess();
        boolean found = access.registryOrThrow(Registries.MULTI_NOISE_BIOME_SOURCE_PARAMETER_LIST)
                .getHolderOrThrow(MultiNoiseBiomeSourceParameterLists.OVERWORLD).value().parameters().values().stream()
                .anyMatch(pair -> pair.getSecond().is(WWWorldgen.DEAD_CAVES));
        h.assertTrue(found, "the overworld's biome list should include winterworks:dead_caves");
        h.assertTrue(access.registryOrThrow(Registries.STRUCTURE).containsKey(WWWorldgen.DIG_SITE), "dig site registered");
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void caveFloorsBecomeSuspicious(GameTestHelper h) {
        BlockPos stone = new BlockPos(2, 1, 2), sand = new BlockPos(4, 1, 2);
        h.setBlock(stone, Blocks.STONE);
        h.setBlock(sand, Blocks.SAND);
        var level = h.getLevel();
        h.assertTrue(CaveDepositsFeature.deposit(level, h.absolutePos(stone), level.random), "stone floor takes a deposit");
        h.assertTrue(CaveDepositsFeature.deposit(level, h.absolutePos(sand), level.random), "sand floor takes a deposit");
        h.assertBlockPresent(Blocks.SUSPICIOUS_GRAVEL, stone);
        h.assertBlockPresent(Blocks.SUSPICIOUS_SAND, sand);
        for (BlockPos p : new BlockPos[]{stone, sand}) {
            BrushableBlockEntity be = (BrushableBlockEntity) level.getBlockEntity(h.absolutePos(p));
            CompoundTag tag = be.saveWithoutMetadata(level.registryAccess());
            h.assertTrue(tag.getString("LootTable").startsWith("winterworks:archaeology/cave_"), "deposit loot, got " + tag);
        }
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 100)
    public void digSiteHasLootAndDeposits(GameTestHelper h) {
        var level = h.getLevel();
        BlockPos c = h.absolutePos(new BlockPos(4, 10, 4));
        // solid ground to dig into
        for (BlockPos p : BlockPos.betweenClosed(c.offset(-12, -6, -12), c.offset(12, 9, 12))) {
            level.setBlock(p, Blocks.STONE.defaultBlockState(), 2);
        }
        DigSite.build(level, c, level.random);
        int chests = 0, deposits = 0, amber = 0;
        for (BlockPos p : BlockPos.betweenClosed(c.offset(-12, -6, -12), c.offset(12, 9, 12))) {
            var be = level.getBlockEntity(p);
            if (be instanceof ChestBlockEntity || be instanceof BarrelBlockEntity) {
                String loot = be.saveWithoutMetadata(level.registryAccess()).getString("LootTable");
                h.assertTrue(loot.equals(Archaeology.DIG_SITE_CHEST.location().toString()), "dig site chest loot, got " + loot);
                chests++;
            } else if (be instanceof BrushableBlockEntity) {
                deposits++;
            }
            if (level.getBlockState(p).is(WWBlocks.AMBER_BLOCK)) {
                amber++;
            }
        }
        h.assertTrue(chests >= 3, "at least 3 chests/barrels, got " + chests);
        h.assertTrue(deposits >= 8, "lots of suspicious blocks, got " + deposits);
        h.assertTrue(amber >= 4, "amber in the walls, got " + amber);
        h.assertTrue(level.getBlockState(c.offset(0, -4, 0)).is(Blocks.BONE_BLOCK), "a fossil spine in the pit");
        h.succeed();
    }
}
