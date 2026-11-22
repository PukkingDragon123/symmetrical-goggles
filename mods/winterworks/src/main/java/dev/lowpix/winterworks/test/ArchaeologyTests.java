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
import dev.lowpix.winterworks.registry.WWItems;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.storage.loot.LootParams;
import net.minecraft.world.level.storage.loot.LootTable;
import net.minecraft.world.level.storage.loot.parameters.LootContextParamSets;
import net.minecraft.world.level.storage.loot.parameters.LootContextParams;
import net.minecraft.world.phys.Vec3;

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
        // suspicious gravel / sand holding cave loot, or (one in four) amber gravel / sand holding amber
        h.assertTrue(h.getBlockState(stone).is(Blocks.SUSPICIOUS_GRAVEL) || h.getBlockState(stone).is(WWBlocks.AMBER_GRAVEL), "gravel deposit");
        h.assertTrue(h.getBlockState(sand).is(Blocks.SUSPICIOUS_SAND) || h.getBlockState(sand).is(WWBlocks.AMBER_SAND), "sand deposit");
        for (BlockPos p : new BlockPos[]{stone, sand}) {
            BrushableBlockEntity be = (BrushableBlockEntity) level.getBlockEntity(h.absolutePos(p));
            CompoundTag tag = be.saveWithoutMetadata(level.registryAccess());
            String loot = tag.getString("LootTable");
            h.assertTrue(loot.startsWith("winterworks:archaeology/cave_") || loot.equals(Archaeology.AMBER_DEPOSIT.location().toString()),
                    "deposit loot, got " + tag);
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

    // ------------------------------------------------------------------------------------------------ 0.4 fixes: richer archaeology

    @GameTest(template = EMPTY_STRUCTURE)
    public void depositsAreThreeTimesAsCommonAndSomeAreAmber(GameTestHelper h) {
        h.assertTrue(CaveDepositsFeature.TRIES == 54, "three times the 0.3 rate of 18 tries a chunk, got " + CaveDepositsFeature.TRIES);
        var level = h.getLevel();
        BlockPos at = new BlockPos(3, 1, 3), sandAt = new BlockPos(5, 1, 3);
        int amberGravel = 0, amberSand = 0, n = 400;
        for (int i = 0; i < n; i++) {
            h.setBlock(at, Blocks.STONE);
            h.setBlock(sandAt, Blocks.SAND);
            CaveDepositsFeature.deposit(level, h.absolutePos(at), level.random);
            CaveDepositsFeature.deposit(level, h.absolutePos(sandAt), level.random);
            if (h.getBlockState(at).is(WWBlocks.AMBER_GRAVEL)) {
                amberGravel++;
                CompoundTag tag = level.getBlockEntity(h.absolutePos(at)).saveWithoutMetadata(level.registryAccess());
                h.assertTrue(tag.getString("LootTable").equals(Archaeology.AMBER_DEPOSIT.location().toString()), "amber gravel holds amber");
            }
            if (h.getBlockState(sandAt).is(WWBlocks.AMBER_SAND)) {
                amberSand++;
            }
        }
        h.assertTrue(amberGravel > n / 8 && amberGravel < n / 2, "about one deposit in four is amber gravel: " + amberGravel + "/" + n);
        h.assertTrue(amberSand > n / 8 && amberSand < n / 2, "sandy floors give amber sand: " + amberSand + "/" + n);
        h.succeed();
    }

    /** The share of rolls of `table` (an archaeology or gift table) that give a sherd, and that give amber. */
    private static double[] rates(GameTestHelper h, net.minecraft.resources.ResourceKey<LootTable> table, int pool, int n) {
        ServerLevel level = h.getLevel();
        LootTable t = level.getServer().reloadableRegistries().getLootTable(table);
        var digger = h.spawn(net.minecraft.world.entity.EntityType.SNIFFER, new BlockPos(3, 1, 3));   // who brushes / digs / opens
        int sherds = 0, amber = 0, pots = 0, rolls = 0;
        for (int i = 0; i < n; i++) {
            LootParams params = new LootParams.Builder(level).withParameter(LootContextParams.ORIGIN, h.absoluteVec(Vec3.ZERO))
                    .withParameter(LootContextParams.THIS_ENTITY, digger).create(pool == 0 ? LootContextParamSets.ARCHAEOLOGY : pool == 1 ? LootContextParamSets.GIFT : LootContextParamSets.CHEST);
            for (ItemStack st : t.getRandomItems(params)) {
                rolls++;
                if (st.is(net.minecraft.tags.ItemTags.DECORATED_POT_SHERDS)) {
                    sherds++;
                } else if (st.is(Items.DECORATED_POT)) {
                    pots++;
                } else if (st.is(WWItems.AMBER_SHARD) || st.is(WWItems.AMBER_BLOCK)) {
                    amber++;
                }
            }
        }
        digger.discard();
        h.assertTrue(pots == 0, table.location() + " has no decorated pots");
        return new double[]{(double) sherds / n, (double) amber / n, rolls};
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 200)
    public void sherdsAreAFifthAsCommonAndAmberIsEverywhere(GameTestHelper h) {
        // the 0.3 chance of a sherd per roll in each table (weights from the 0.3 data)
        Object[][] tables = {
                {Archaeology.CAVE_AMBER, 0, 3.0 / 17, 0.55},
                {Archaeology.CAVE_BONES, 0, 3.0 / 18, 0.25},
                {Archaeology.DEAD_CAVE, 0, 7.0 / 23, 0.55},
                {Archaeology.DIG_SITE, 0, 7.0 / 25, 0.5},
                {dev.lowpix.winterworks.amber.AmberFeature.SNIFFER_FINDS, 1, 6.0 / 28, 0.3}};
        int n = 6000;
        for (Object[] row : tables) {
            @SuppressWarnings("unchecked")
            var key = (net.minecraft.resources.ResourceKey<LootTable>) row[0];
            double[] r = rates(h, key, (int) row[1], n);
            double ratio = r[0] / (double) row[2];
            h.assertTrue(ratio > 0.12 && ratio < 0.3, key.location() + ": sherds should be about a fifth as likely as in 0.3, ratio " + ratio);
            h.assertTrue(r[1] > (double) row[3], key.location() + ": amber should be common, got " + r[1]);
        }
        // the Dig Site's chests: the sherd pool too
        double[] chest = rates(h, Archaeology.DIG_SITE_CHEST, 2, 1500);
        h.assertTrue(chest[0] < 0.25, "dig site chests hold far fewer sherds, " + chest[0] + " a chest");
        h.succeed();
    }
}
