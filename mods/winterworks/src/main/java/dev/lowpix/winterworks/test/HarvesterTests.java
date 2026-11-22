package dev.lowpix.winterworks.test;

import dev.lowpix.winterworks.amber.AmberBlock;
import dev.lowpix.winterworks.amber.AmberwoodLogBlock;
import dev.lowpix.winterworks.amber.MosquitoEntity;
import dev.lowpix.winterworks.amber.SnifferTaming;
import dev.lowpix.winterworks.amber.SnifferWatering;
import dev.lowpix.winterworks.amber.TamedSniffer;
import dev.lowpix.winterworks.amber.WateringSniffer;
import dev.lowpix.winterworks.harvester.GlowPlants;
import dev.lowpix.winterworks.harvester.HarvesterEggBlock;
import dev.lowpix.winterworks.harvester.HarvesterEntity;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWItems;
import java.util.UUID;
import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.animal.Pig;
import net.minecraft.world.entity.animal.Sheep;
import net.minecraft.world.entity.animal.horse.AbstractHorse;
import net.minecraft.world.entity.animal.sniffer.Sniffer;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CropBlock;
import net.minecraft.world.level.block.FarmBlock;
import net.minecraft.world.level.block.PitcherCropBlock;
import net.minecraft.world.level.block.SweetBerryBushBlock;
import net.minecraft.world.level.block.TorchflowerCropBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * GameTests for the Harvester and the Amber Age plant fixes (docs/FIXES_0_4.md "The Harvester", "Torchflowers, pitcher
 * plants, mosquitoes and sniffers"). ./gradlew runGametest
 */
public class HarvesterTests implements FabricGameTest {
    /** An empty 20x10x20 field (data/winterworks/gametest/structure/harvester_field.snbt, tools/data_harvester.py). */
    private static final String FIELD = "winterworks:harvester_field";

    private static void floor(GameTestHelper h, int size, Block block) {
        for (int x = 0; x < size; x++) {
            for (int z = 0; z < size; z++) {
                h.setBlock(new BlockPos(x, 0, z), block);
            }
        }
    }

    private static ServerPlayer player(GameTestHelper h, Vec3 at) {
        @SuppressWarnings("removal")
        ServerPlayer p = h.makeMockServerPlayerInLevel();   // creative: what it hands over is not used up
        Vec3 a = h.absoluteVec(at);
        p.moveTo(a.x, a.y, a.z, 0f, 0f);
        return p;
    }

    private static HarvesterEntity harvester(GameTestHelper h, Vec3 at, float yaw) {
        HarvesterEntity e = h.spawn(WWEntities.HARVESTER, at);
        e.setYRot(yaw);
        e.setYBodyRot(yaw);
        e.setYHeadRot(yaw);
        return e;
    }

    private static int items(GameTestHelper h, net.minecraft.world.item.Item item, BlockPos near, double r) {
        int n = 0;
        for (ItemEntity e : h.getEntities(EntityType.ITEM, near, r)) {
            if (e.getItem().is(item)) {
                n += e.getItem().getCount();
            }
        }
        return n;
    }

    /** Every dropped `item` inside this test's area (counted once). */
    private static int itemsInTest(GameTestHelper h, net.minecraft.world.item.Item item) {
        int n = 0;
        for (ItemEntity e : h.getEntities(EntityType.ITEM)) {
            if (e.getItem().is(item)) {
                n += e.getItem().getCount();
            }
        }
        return n;
    }

    // --------------------------------------------------------------------------------------- the egg

    @GameTest(template = EMPTY_STRUCTURE)
    public void eggHatchesOnlyUnderwater(GameTestHelper h) {
        floor(h, 8, Blocks.STONE);
        BlockPos dry = new BlockPos(2, 1, 2), wet = new BlockPos(5, 1, 4);
        h.setBlock(dry, WWBlocks.HARVESTER_EGG);
        h.setBlock(wet, WWBlocks.HARVESTER_EGG.defaultBlockState().setValue(HarvesterEggBlock.WATERLOGGED, true));
        for (Direction d : Direction.Plane.HORIZONTAL) {   // a glass basin round the water over the egg
            h.setBlock(wet.above().relative(d), Blocks.GLASS);
        }
        h.setBlock(wet.above(), Blocks.WATER);
        ServerLevel level = h.getLevel();
        h.assertTrue(HarvesterEggBlock.submerged(level, h.absolutePos(wet), h.getBlockState(wet)), "the wet egg should be submerged");
        h.assertFalse(HarvesterEggBlock.submerged(level, h.absolutePos(dry), h.getBlockState(dry)), "the dry egg should not be");
        for (int i = 0; i < 4; i++) {   // well over 20 minutes of development
            HarvesterEggBlock.develop(level, h.absolutePos(dry), HarvesterEggBlock.STAGE_TICKS);
            if (h.getBlockState(wet).is(WWBlocks.HARVESTER_EGG)) {
                HarvesterEggBlock.develop(level, h.absolutePos(wet), HarvesterEggBlock.STAGE_TICKS);
            }
        }
        h.assertBlockProperty(dry, HarvesterEggBlock.HATCH, 0);
        h.assertBlockPresent(Blocks.WATER, wet);   // hatched, leaving its water behind
        var babies = h.getEntities(WWEntities.HARVESTER, wet, 2.0);
        h.assertTrue(babies.size() == 1 && babies.get(0).isBaby(), "the wet egg should hatch one baby Harvester");
        babies.forEach(HarvesterEntity::discard);
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void eggCracksInThreeStages(GameTestHelper h) {
        floor(h, 8, Blocks.STONE);
        BlockPos egg = new BlockPos(3, 1, 3);
        h.setBlock(egg, WWBlocks.HARVESTER_EGG.defaultBlockState().setValue(HarvesterEggBlock.WATERLOGGED, true));
        ServerLevel level = h.getLevel();
        HarvesterEggBlock.develop(level, h.absolutePos(egg), HarvesterEggBlock.STAGE_TICKS - 100);
        h.assertBlockProperty(egg, HarvesterEggBlock.HATCH, 0);
        HarvesterEggBlock.develop(level, h.absolutePos(egg), 100);
        h.assertBlockProperty(egg, HarvesterEggBlock.HATCH, 1);
        HarvesterEggBlock.develop(level, h.absolutePos(egg), HarvesterEggBlock.STAGE_TICKS);
        h.assertBlockProperty(egg, HarvesterEggBlock.HATCH, 2);
        h.assertTrue(HarvesterEggBlock.HATCH_TICKS >= 20 * 60 * 20, "about 20 minutes in all");
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void hatchedNearAPlayerIsTame(GameTestHelper h) {
        floor(h, 8, Blocks.STONE);
        BlockPos egg = new BlockPos(3, 1, 3);
        h.setBlock(egg, WWBlocks.HARVESTER_EGG.defaultBlockState().setValue(HarvesterEggBlock.HATCH, 2)
                .setValue(HarvesterEggBlock.WATERLOGGED, true));
        ServerPlayer p = player(h, new Vec3(5.5, 1, 5.5));
        HarvesterEntity baby = HarvesterEggBlock.hatch(h.getLevel(), h.absolutePos(egg), h.getBlockState(egg));
        h.assertTrue(baby != null && baby.isBaby(), "the egg should hatch a baby");
        h.assertTrue(baby.isTamed() && p.getUUID().equals(baby.getOwnerUUID()), "a Harvester hatched near a player is tame to them");
        h.assertTrue(baby.getOrder() == HarvesterEntity.Order.FOLLOW, "and follows them");
        baby.discard();
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void pitcherPlantsTameAHarvester(GameTestHelper h) {
        floor(h, 8, Blocks.STONE);
        HarvesterEntity e = harvester(h, new Vec3(4, 1, 4), 0f);
        ServerPlayer p = player(h, new Vec3(1, 1, 1));
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.WHEAT));
        e.interact(p, InteractionHand.MAIN_HAND);
        h.assertFalse(e.isTamed(), "wheat doesn't tame it");
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.PITCHER_PLANT));
        for (int i = 0; i < 60 && !e.isTamed(); i++) {
            e.interact(p, InteractionHand.MAIN_HAND);
        }
        h.assertTrue(e.isTamed() && p.getUUID().equals(e.getOwnerUUID()), "pitcher plants should tame it (1 in 3)");
        e.discard();
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void ordersCycleAndChestHoldsFifteen(GameTestHelper h) {
        floor(h, 8, Blocks.STONE);
        HarvesterEntity e = harvester(h, new Vec3(4, 1, 4), 0f);
        ServerPlayer p = player(h, new Vec3(1, 1, 1));
        e.tameWithName(p);
        e.setOrder(HarvesterEntity.Order.FOLLOW);
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.CHEST));
        e.interact(p, InteractionHand.MAIN_HAND);
        h.assertTrue(e.hasChest(), "a chest goes on its back");
        h.assertTrue(e.getInventorySize() - 1 == 15, "a donkey-style chest: 15 slots");
        p.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
        p.setShiftKeyDown(true);
        e.interact(p, InteractionHand.MAIN_HAND);
        h.assertTrue(e.getOrder() == HarvesterEntity.Order.SIT && e.isSitting(), "sneak + use: sit");
        e.interact(p, InteractionHand.MAIN_HAND);
        h.assertTrue(e.getOrder() == HarvesterEntity.Order.HARVEST, "then harvest here");
        p.setShiftKeyDown(false);
        e.discard();
        h.succeed();
    }

    // --------------------------------------------------------------------------------------- harvesting and herding

    @GameTest(template = FIELD, timeoutTicks = 1600)
    public void harvestsMatureCropsIntoItsChestAndReplants(GameTestHelper h) {
        floor(h, 20, Blocks.DIRT);
        BlockState farm = Blocks.FARMLAND.defaultBlockState().setValue(FarmBlock.MOISTURE, 7);
        for (int x = 9; x <= 13; x++) {
            for (int z = 7; z <= 13; z++) {
                h.setBlock(new BlockPos(x, 0, z), farm);
            }
        }
        BlockPos[] wheat = {new BlockPos(10, 1, 9), new BlockPos(10, 1, 10), new BlockPos(10, 1, 11)};
        for (BlockPos p : wheat) {
            h.setBlock(p, ((CropBlock) Blocks.WHEAT).getStateForAge(7));
        }
        BlockPos carrots = new BlockPos(12, 1, 10), young = new BlockPos(12, 1, 12), torch = new BlockPos(12, 1, 8);
        BlockPos berries = new BlockPos(5, 1, 14), pitcher = new BlockPos(9, 1, 13);
        h.setBlock(carrots, ((CropBlock) Blocks.CARROTS).getStateForAge(7));
        h.setBlock(young, ((CropBlock) Blocks.WHEAT).getStateForAge(2));
        h.setBlock(torch, Blocks.TORCHFLOWER);
        h.setBlock(berries, Blocks.SWEET_BERRY_BUSH.defaultBlockState().setValue(SweetBerryBushBlock.AGE, 3));
        h.setBlock(pitcher, Blocks.PITCHER_CROP.defaultBlockState().setValue(PitcherCropBlock.AGE, 4));
        h.setBlock(pitcher.above(), Blocks.PITCHER_CROP.defaultBlockState().setValue(PitcherCropBlock.AGE, 4)
                .setValue(PitcherCropBlock.HALF, DoubleBlockHalf.UPPER));
        HarvesterEntity e = harvester(h, new Vec3(4.5, 1, 10.5), -90f);
        e.setTamed(true);
        e.setOwnerUUID(UUID.randomUUID());   // an owner who is not around
        e.getSlot(AbstractHorse.CHEST_SLOT_OFFSET).set(new ItemStack(Items.CHEST));
        e.leaveAt(e.blockPosition());
        h.succeedWhen(() -> {
            for (BlockPos p : wheat) {
                h.assertBlockProperty(p, CropBlock.AGE, 0);
            }
            h.assertBlockProperty(carrots, CropBlock.AGE, 0);
            h.assertBlockProperty(young, CropBlock.AGE, 2);   // not ripe: left alone
            h.assertBlockPresent(Blocks.TORCHFLOWER_CROP, torch);
            h.assertBlockProperty(berries, SweetBerryBushBlock.AGE, 1);
            h.assertBlockProperty(pitcher, PitcherCropBlock.AGE, 0);
            h.assertTrue(e.countInChest(Items.WHEAT) >= 3, "the wheat should be in its chest, it has " + e.countInChest(Items.WHEAT));
            h.assertTrue(e.countInChest(Items.CARROT) >= 1, "and the carrots");
            h.assertTrue(e.countInChest(Items.TORCHFLOWER) == 1, "and the torchflower");
            h.assertTrue(e.countInChest(Items.PITCHER_PLANT) == 1, "and the pitcher plant");
            h.assertTrue(e.countInChest(Items.SWEET_BERRIES) >= 2, "and the berries");
            e.discard();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void harvestWithoutAChestDrops(GameTestHelper h) {
        floor(h, 8, Blocks.FARMLAND);
        HarvesterEntity e = harvester(h, new Vec3(1.5, 1, 3.5), -90f);
        e.setTamed(true);
        BlockPos head = BlockPos.containing(e.headPoint()).atY(h.absolutePos(BlockPos.ZERO).getY() + 1);
        BlockPos rel = head.subtract(h.absolutePos(BlockPos.ZERO));   // (relativePos isn't absolutePos's inverse in 1.21.1)
        h.setBlock(rel, ((CropBlock) Blocks.POTATOES).getStateForAge(7));
        int n = e.chompAhead();
        h.assertTrue(n == 1, "the crop under its head should be cropped, cropped " + n);
        h.assertBlockProperty(rel, CropBlock.AGE, 0);
        h.assertTrue(items(h, Items.POTATO, rel, 4.0) >= 1, "with no chest the harvest drops");
        e.discard();
        h.succeed();
    }

    @GameTest(template = FIELD, timeoutTicks = 200)
    public void herdingShovesAnAnimal(GameTestHelper h) {
        floor(h, 20, Blocks.GRASS_BLOCK);
        HarvesterEntity e = harvester(h, new Vec3(3.5, 1, 10.5), -90f);   // facing +x
        ServerPlayer p = player(h, new Vec3(3.5, 1, 10.5));
        p.setYRot(-90f);   // a ridden mount turns the way its rider looks
        e.tameWithName(p);
        e.equipSaddle(new ItemStack(Items.SADDLE), null);
        p.startRiding(e, true);
        h.assertTrue(e.getControllingPassenger() == p, "the rider steers it");
        Sheep sheep = h.spawn(EntityType.SHEEP, new Vec3(6.6, 1, 10.5));
        double start = sheep.getX();
        h.onEachTick(() -> {   // the rider walks it forward (on a server the client moves a ridden mount)
            if (e.isAlive() && e.getX() < h.absoluteVec(new Vec3(13, 0, 0)).x) {
                e.setPos(e.getX() + 0.15, e.getY(), e.getZ());
            }
        });
        h.succeedWhen(() -> {
            h.assertTrue(sheep.getX() > start + 2.0, "the sheep should be shoved ahead, it moved " + (sheep.getX() - start));
            h.assertTrue(sheep.getX() > e.getX() + 1.0, "in front of the Harvester");
            p.stopRiding();
            e.discard();
            sheep.discard();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void harvesterDropsLeather(GameTestHelper h) {
        floor(h, 8, Blocks.STONE);
        HarvesterEntity e = harvester(h, new Vec3(4, 1, 4), 0f);
        e.kill();
        h.succeedWhen(() -> {
            int n = items(h, Items.LEATHER, new BlockPos(4, 1, 4), 4.0);
            h.assertTrue(n >= 1 && n <= 4, "1-3 leather (looting aside), got " + n);
        });
    }

    // --------------------------------------------------------------------------------------- torchflowers, pitchers, mosquitoes

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 60)
    public void torchflowerIgnitesAMosquito(GameTestHelper h) {
        floor(h, 8, Blocks.GRASS_BLOCK);
        h.setBlock(new BlockPos(3, 1, 3), Blocks.TORCHFLOWER);
        MosquitoEntity m = h.spawn(WWEntities.MOSQUITO, new Vec3(4.5, 1.6, 3.5));
        m.calmDown(400);
        h.succeedWhen(() -> {
            h.assertTrue(m.isOnFire(), "a mosquito within a block of a torchflower should catch fire");
            m.discard();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 60)
    public void pottedTorchflowerAndCropBurnMosquitoesToo(GameTestHelper h) {
        floor(h, 8, Blocks.FARMLAND);
        h.setBlock(new BlockPos(1, 1, 1), Blocks.POTTED_TORCHFLOWER);
        h.setBlock(new BlockPos(6, 1, 6), Blocks.TORCHFLOWER_CROP);
        MosquitoEntity a = h.spawn(WWEntities.MOSQUITO, new Vec3(1.5, 2.3, 1.5));
        MosquitoEntity b = h.spawn(WWEntities.MOSQUITO, new Vec3(6.5, 2.3, 6.5));
        a.calmDown(400);
        b.calmDown(400);
        h.succeedWhen(() -> {
            h.assertTrue(a.isOnFire() && b.isOnFire(), "potted torchflowers and torchflower crops burn them too");
            a.discard();
            b.discard();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 500)
    public void mosquitoSipsResinEvenWhileHunting(GameTestHelper h) {
        floor(h, 8, Blocks.STONE);
        BlockPos log = new BlockPos(5, 1, 5);
        for (int y = 1; y <= 3; y++) {
            h.setBlock(log.atY(y), WWBlocks.AMBERWOOD_LOG.defaultBlockState().setValue(AmberwoodLogBlock.RESIN, y == 2));
        }
        Pig pig = h.spawn(EntityType.PIG, new Vec3(1.5, 1, 1.5));
        pig.setNoAi(true);
        MosquitoEntity m = h.spawn(WWEntities.MOSQUITO, new Vec3(2.5, 2, 1.5));
        m.setTarget(pig);   // hungry and already after the pig: before the fix it never went for the resin
        int[] amberAt = {-1};
        h.onEachTick(() -> {
            if (amberAt[0] < 0 && m.isAmber()) {
                amberAt[0] = m.tickCount;
            }
        });
        h.succeedWhen(() -> {
            h.assertTrue(m.isAmber(), "the mosquito should sip the resin and become amber-full, it is " + m.state());
            h.assertTrue(m.isAlive() && m.tickCount - amberAt[0] >= 6, "and fly on afterwards (the tick after a sip used to crash)");
            h.assertFalse(h.getBlockState(log.above()).getValue(AmberwoodLogBlock.RESIN), "the log's resin should be gone");
            m.discard();
            pig.discard();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void pickingGrownPlantsGivesSeedsAndPodsBack(GameTestHelper h) {
        floor(h, 8, Blocks.FARMLAND);
        BlockPos torch = new BlockPos(2, 1, 2), pitcher = new BlockPos(5, 1, 2), wild = new BlockPos(2, 1, 5);
        h.setBlock(torch, Blocks.TORCHFLOWER);
        h.setBlock(pitcher, Blocks.PITCHER_CROP.defaultBlockState().setValue(PitcherCropBlock.AGE, 4));
        h.setBlock(pitcher.above(), Blocks.PITCHER_CROP.defaultBlockState().setValue(PitcherCropBlock.AGE, 4)
                .setValue(PitcherCropBlock.HALF, DoubleBlockHalf.UPPER));
        h.setBlock(wild.below(), Blocks.GRASS_BLOCK);
        h.setBlock(wild, Blocks.PITCHER_PLANT);
        h.setBlock(wild.above(), Blocks.PITCHER_PLANT.defaultBlockState().setValue(PitcherCropBlock.HALF, DoubleBlockHalf.UPPER));
        ServerPlayer p = player(h, new Vec3(4, 1, 4));
        p.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
        ServerLevel level = h.getLevel();
        for (BlockPos at : new BlockPos[]{torch, pitcher.above(), wild}) {   // the pitcher crop by its top half
            BlockPos abs = h.absolutePos(at);
            p.gameMode.useItemOn(p, level, ItemStack.EMPTY, InteractionHand.MAIN_HAND,
                    new BlockHitResult(Vec3.atCenterOf(abs), Direction.UP, abs, false));
        }
        h.assertBlockProperty(torch, TorchflowerCropBlock.AGE, 0);
        h.assertBlockPresent(Blocks.TORCHFLOWER_CROP, torch);
        h.assertBlockPresent(Blocks.PITCHER_CROP, pitcher);
        h.assertBlockProperty(pitcher, PitcherCropBlock.AGE, 0);
        h.assertBlockPresent(Blocks.AIR, pitcher.above());
        h.assertBlockPresent(Blocks.PITCHER_CROP, wild);   // a wild one too: its grass became farmland
        h.assertBlockPresent(Blocks.FARMLAND, wild.below());
        h.succeedWhen(() -> {
            int seeds = itemsInTest(h, Items.TORCHFLOWER_SEEDS), pods = itemsInTest(h, Items.PITCHER_POD);
            h.assertTrue(seeds >= 1 && seeds <= 3, "1-3 torchflower seeds, got " + seeds);
            h.assertTrue(pods >= 2 && pods <= 6, "1-3 pitcher pods each, got " + pods);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void torchflowersAndPitcherPlantsGlow(GameTestHelper h) {
        int prev = -1;
        for (int age = 0; age <= 1; age++) {
            int l = Blocks.TORCHFLOWER_CROP.defaultBlockState().setValue(TorchflowerCropBlock.AGE, age).getLightEmission();
            h.assertTrue(l > prev && l > 0, "each torchflower crop stage gives more light");
            prev = l;
        }
        h.assertTrue(Blocks.TORCHFLOWER.defaultBlockState().getLightEmission() == 15, "a grown torchflower: light 15");
        h.assertTrue(Blocks.POTTED_TORCHFLOWER.defaultBlockState().getLightEmission() == 15, "potted too");
        prev = -1;
        for (int age = 0; age <= 4; age++) {
            int l = Blocks.PITCHER_CROP.defaultBlockState().setValue(PitcherCropBlock.AGE, age).getLightEmission();
            h.assertTrue(l > prev && l > 0, "each pitcher crop stage gives more light");
            prev = l;
        }
        h.assertTrue(prev == GlowPlants.PITCHER_FULL && Blocks.PITCHER_PLANT.defaultBlockState().getLightEmission() == 12,
                "a pitcher plant: light 12");
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void pitcherPlantsAreBeeFlowers(GameTestHelper h) {
        h.assertTrue(Blocks.PITCHER_CROP.defaultBlockState().is(BlockTags.FLOWERS), "pitcher crops count as flowers for bees");
        h.assertTrue(Blocks.PITCHER_PLANT.defaultBlockState().is(BlockTags.FLOWERS), "pitcher plants too");
        h.assertTrue(Blocks.PITCHER_CROP.defaultBlockState().is(BlockTags.BEE_GROWABLES), "and bees pollinate the crop");
        h.succeed();
    }

    // --------------------------------------------------------------------------------------- sniffers, amber

    @GameTest(template = FIELD, timeoutTicks = 1600)
    public void tamedSnifferWatersFarmland(GameTestHelper h) {
        floor(h, 20, Blocks.DIRT);
        h.setBlock(new BlockPos(3, 0, 10), Blocks.WATER);
        h.setBlock(new BlockPos(3, 0, 11), Blocks.WATER);
        for (int x = 12; x <= 16; x++) {
            for (int z = 8; z <= 12; z++) {
                h.setBlock(new BlockPos(x, 0, z), Blocks.FARMLAND);   // dry: the water is 9+ blocks away
                h.setBlock(new BlockPos(x, 1, z), ((CropBlock) Blocks.WHEAT).getStateForAge(0));
            }
        }
        Sniffer s = h.spawn(EntityType.SNIFFER, new Vec3(7.5, 1, 10.5));
        SnifferTaming.tame(s, (TamedSniffer) s, UUID.randomUUID());   // an owner who is not around
        ((TamedSniffer) s).ww$job().cooldown = 100000;   // no digging
        ((WateringSniffer) s).ww$watering().cooldown = 1;
        // any watered plot will do: the sniffer is heavy and may trample a block or two of farmland on its way in
        h.succeedWhen(() -> {
            int watered = 0;
            for (int x = 12; x <= 16; x++) {
                for (int z = 8; z <= 12; z++) {
                    BlockState soil = h.getBlockState(new BlockPos(x, 0, z)), crop = h.getBlockState(new BlockPos(x, 1, z));
                    if (soil.is(Blocks.FARMLAND) && soil.getValue(FarmBlock.MOISTURE) == FarmBlock.MAX_MOISTURE
                            && crop.getBlock() instanceof CropBlock && crop.getValue(CropBlock.AGE) >= 1) {
                        watered++;
                    }
                }
            }
            SnifferWatering.Job job = ((WateringSniffer) s).ww$watering();
            h.assertTrue(watered >= 4, "the sneeze should water the field and give the crops a growth tick: " + watered + " plots (phase "
                    + job.phase + ", cooldown " + job.cooldown + ", state " + ((TamedSniffer) s).ww$state() + ", at "
                    + h.relativeVec(s.position()) + ", on ground " + s.onGround() + ")");
            s.discard();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void amberWithAnEggDropsTheEgg(GameTestHelper h) {
        floor(h, 8, Blocks.STONE);
        BlockPos at = new BlockPos(3, 1, 3);
        h.setBlock(at, WWBlocks.AMBER_BLOCK.defaultBlockState().setValue(AmberBlock.INCLUSION, AmberBlock.Inclusion.EGG));
        h.getLevel().destroyBlock(h.absolutePos(at), true);
        h.succeedWhen(() -> h.assertTrue(items(h, WWItems.HARVESTER_EGG, at, 3.0) == 1, "the egg should drop when the amber shatters"));
    }
}
