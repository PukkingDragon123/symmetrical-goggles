package dev.lowpix.winterworks.test;

import dev.lowpix.winterworks.curse.Curses;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.soulbull.SoulBull;
import dev.lowpix.winterworks.soulbull.SoulBullSkullBlock;
import dev.lowpix.winterworks.soulbull.SoulBullSkullBlockEntity;
import dev.lowpix.winterworks.soulbull.SoulSources;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.animal.Pig;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.monster.WitherSkeleton;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.biome.MobSpawnSettings;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CampfireBlock;
import net.minecraft.world.level.storage.loot.LootParams;
import net.minecraft.world.level.storage.loot.LootTable;
import net.minecraft.world.level.storage.loot.parameters.LootContextParamSets;
import net.minecraft.world.level.storage.loot.parameters.LootContextParams;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * GameTests for the Soul Bull (docs/FIXES_0_4.md "The Soul Bull"). ./gradlew runGametest. The bulls are spawned with
 * no AI where they must stay put (draining, the ram and the pin don't need it); every test removes its mobs and mock
 * players at the end.
 */
public class SoulBullTests implements FabricGameTest {
    private static final String BATCH = "winterworks_soul_bull";

    private static void floor(GameTestHelper h, Block block) {
        for (int x = 0; x < 9; x++) {
            for (int z = 0; z < 9; z++) {
                h.setBlock(new BlockPos(x, 0, z), block);
            }
        }
    }

    private static SoulBull bull(GameTestHelper h, double x, double z, boolean tamed, ServerPlayer owner) {
        SoulBull b = h.spawn(WWEntities.SOUL_BULL, new Vec3(x, 1, z));
        b.setNoAi(true);
        b.setYRot(0f);
        b.setYBodyRot(0f);
        b.setYHeadRot(0f);
        if (tamed) {
            b.tame(owner);
        }
        return b;
    }

    private static ServerPlayer player(GameTestHelper h, double x, double z, ItemStack inHand) {
        ServerPlayer p = h.makeMockServerPlayerInLevel();   // creative: what it hands over is not used up
        p.moveTo(h.absoluteVec(new Vec3(x, 1, z)));
        p.setItemInHand(InteractionHand.MAIN_HAND, inHand);
        return p;
    }

    private static void cleanup(GameTestHelper h, ServerPlayer... players) {
        for (ServerPlayer p : players) {
            p.stopRiding();
            h.getLevel().getServer().getPlayerList().remove(p);
        }
        for (Entity e : h.getLevel().getEntities((Entity) null, h.getBounds().inflate(2), e -> !(e instanceof ServerPlayer))) {
            e.discard();
        }
    }

    private static int itemCount(GameTestHelper h, Item item) {
        AABB box = h.getBounds().inflate(2);
        int n = 0;
        for (ItemEntity it : h.getLevel().getEntitiesOfClass(ItemEntity.class, box, it -> it.isAlive() && it.getItem().is(item))) {
            n += it.getItem().getCount();
        }
        return n;
    }

    // ------------------------------------------------------------------------------------------ soul energy

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 120)
    public void waterHurtsIt(GameTestHelper h) {
        floor(h, Blocks.STONE);
        for (int x = 3; x <= 5; x++) {
            for (int z = 3; z <= 5; z++) {
                h.setBlock(new BlockPos(x, 1, z), Blocks.WATER);
            }
        }
        SoulBull b = bull(h, 4.5, 4.5, false, null);
        float full = b.getHealth();
        h.assertTrue(b.isSensitiveToWater(), "water and rain should hurt it, like a blaze");
        h.succeedWhen(() -> {
            h.assertTrue(b.getHealth() < full - 1f, "standing in water should drain its soul energy (" + b.getHealth() + ")");
            cleanup(h);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 400)
    public void itDrainsSoulFireTorchesAndLanterns(GameTestHelper h) {
        floor(h, Blocks.SOUL_SOIL);
        BlockPos fire = new BlockPos(1, 1, 4), torch = new BlockPos(4, 1, 1), lantern = new BlockPos(7, 1, 4);
        h.setBlock(fire, Blocks.SOUL_FIRE);
        h.setBlock(torch, Blocks.SOUL_TORCH);
        h.setBlock(lantern, Blocks.SOUL_LANTERN);
        SoulBull b = bull(h, 4.5, 4.5, false, null);
        b.setHealth(2f);
        h.startSequence()
                .thenWaitUntil(() -> h.assertTrue(b.isDraining(), "a weak bull should start draining a nearby soul source"))
                .thenExecute(() -> h.assertTrue(b.drainSource().isPresent(), "it should know what it is draining (for the souls flowing in)"))
                .thenWaitUntil(() -> {
                    h.assertBlockNotPresent(Blocks.SOUL_FIRE, fire);
                    h.assertBlockNotPresent(Blocks.SOUL_TORCH, torch);
                    h.assertBlockNotPresent(Blocks.SOUL_LANTERN, lantern);
                })
                .thenWaitUntil(() -> h.assertFalse(b.isDraining(), "the last drain should finish"))
                .thenExecute(() -> {
                    float expect = 2f + SoulSources.FIRE + SoulSources.TORCH + SoulSources.LANTERN;
                    h.assertTrue(b.getHealth() >= expect - 0.01f, "soul fire, a torch and a lantern should refill it to " + expect
                            + " (" + b.getHealth() + ")");
                    cleanup(h);
                })
                .thenSucceed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 200)
    public void itPutsOutSoulCampfires(GameTestHelper h) {
        floor(h, Blocks.STONE);
        BlockPos camp = new BlockPos(4, 1, 1);
        h.setBlock(camp, Blocks.SOUL_CAMPFIRE.defaultBlockState().setValue(CampfireBlock.LIT, true));
        SoulBull b = bull(h, 4.5, 4.5, false, null);
        b.setHealth(5f);
        h.succeedWhen(() -> {
            h.assertFalse(h.getBlockState(camp).getValue(CampfireBlock.LIT), "the drained soul campfire should go out");
            h.assertTrue(h.getBlockState(camp).is(Blocks.SOUL_CAMPFIRE), "the campfire itself stays");
            h.assertTrue(b.getHealth() >= 5f + SoulSources.CAMPFIRE - 0.01f, "a soul campfire is a big refill (" + b.getHealth() + ")");
            cleanup(h);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 60)
    public void soulSourcesUsedOnItRefillIt(GameTestHelper h) {
        floor(h, Blocks.STONE);
        ServerPlayer p = player(h, 4.5, 7.5, new ItemStack(Items.SOUL_LANTERN));
        SoulBull b = bull(h, 4.5, 4.5, true, p);
        b.setHealth(10f);
        h.assertTrue(p.interactOn(b, InteractionHand.MAIN_HAND).consumesAction(), "a soul lantern should be taken");
        h.assertTrue(Math.abs(b.getHealth() - (10f + SoulSources.LANTERN)) < 0.01f, "a soul lantern is a big refill (" + b.getHealth() + ")");
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.SOUL_CAMPFIRE));
        p.interactOn(b, InteractionHand.MAIN_HAND);
        h.assertTrue(b.getHealth() >= b.getMaxHealth() - 0.01f, "a soul campfire should fill it up");
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.SOUL_TORCH));
        h.assertFalse(p.interactOn(b, InteractionHand.MAIN_HAND).consumesAction(), "a full bull refuses more");
        cleanup(h, p);
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------ taming

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 60)
    public void wildBullIsTamedByFeedingWhenWeak(GameTestHelper h) {
        floor(h, Blocks.STONE);
        ServerPlayer p = player(h, 4.5, 7.5, new ItemStack(Items.SOUL_TORCH));
        SoulBull b = bull(h, 4.5, 4.5, false, null);
        h.assertFalse(b.mobInteract(p, InteractionHand.MAIN_HAND).consumesAction(), "a strong wild bull won't eat");
        h.assertFalse(b.isTamed(), "feeding a strong wild bull shouldn't tame it");
        int tries = 0;
        while (!b.isTamed() && tries < 60) {
            b.setHealth(b.getMaxHealth() * 0.4f);   // below half
            InteractionResult r = b.mobInteract(p, InteractionHand.MAIN_HAND);
            h.assertTrue(r.consumesAction(), "a weak wild bull should eat a soul torch");
            tries++;
        }
        h.assertTrue(b.isTamed(), "1 in 3 soul torches should tame it (60 tries)");
        h.assertTrue(tries < 60 && p.getUUID().equals(b.getOwnerUUID()), "it should be tamed to the feeder");
        h.assertTrue(b.getTarget() == null, "a tamed bull stops fighting");
        cleanup(h, p);
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 200)
    public void skullRitualRevivesATamedBull(GameTestHelper h) {
        floor(h, Blocks.SOUL_SAND);
        BlockPos skull = new BlockPos(4, 1, 4);
        h.setBlock(skull, WWBlocks.SOUL_BULL_SKULL);
        ServerPlayer p = player(h, 4.5, 7.5, new ItemStack(WWItems.WITHER_BONE, 64));
        h.useBlock(skull, p);
        SoulBullSkullBlockEntity be0 = (SoulBullSkullBlockEntity) h.getBlockEntity(skull);
        h.assertTrue(be0.bones() == 0, "a cold skull takes no bones");
        BlockPos[] sides = {skull.north(), skull.south(), skull.east(), skull.west()};
        for (int i = 0; i < 3; i++) {
            h.setBlock(sides[i], Blocks.SOUL_FIRE);
        }
        h.assertFalse(h.getBlockState(skull).getValue(SoulBullSkullBlock.LIT), "three fires aren't enough");
        h.setBlock(sides[3], Blocks.SOUL_FIRE);
        h.assertTrue(h.getBlockState(skull).getValue(SoulBullSkullBlock.LIT), "soul fire on all four sides should light its eyes");
        h.setBlock(sides[3], Blocks.AIR);
        h.assertFalse(h.getBlockState(skull).getValue(SoulBullSkullBlock.LIT), "a fire going out puts its eyes out");
        h.setBlock(sides[3], Blocks.SOUL_FIRE);
        h.assertTrue(h.getBlockState(skull).getValue(SoulBullSkullBlock.LIT), "relit");
        h.useBlock(skull, p);
        SoulBullSkullBlockEntity be = (SoulBullSkullBlockEntity) h.getBlockEntity(skull);
        int need = be.needed();
        h.assertTrue(need >= SoulBullSkullBlockEntity.MIN_BONES && need <= SoulBullSkullBlockEntity.MAX_BONES,
                "the skull should roll 10-15 bones (" + need + ")");
        h.assertTrue(be.bones() == 1, "one bone on the heap");
        for (int i = 1; i < need - 1; i++) {
            h.useBlock(skull, p);
        }
        h.assertTrue(be.bones() == need - 1, "all but one bone on the heap (" + be.bones() + "/" + need + ")");
        h.assertBlockPresent(WWBlocks.SOUL_BULL_SKULL, skull);
        h.assertTrue(h.getLevel().getEntitiesOfClass(SoulBull.class, h.getBounds().inflate(2)).isEmpty(), "not yet");
        h.useBlock(skull, p);
        h.assertBlockNotPresent(WWBlocks.SOUL_BULL_SKULL, skull);
        List<SoulBull> bulls = h.getLevel().getEntitiesOfClass(SoulBull.class, h.getBounds().inflate(2));
        h.assertTrue(bulls.size() == 1, "the last bone should rebuild one bull");
        SoulBull b = bulls.get(0);
        h.assertTrue(b.isTamed() && p.getUUID().equals(b.getOwnerUUID()), "the revived bull should be tamed to whoever gave the bones");
        h.assertTrue(b.isReviving(), "it should rise with the revive clip");
        h.assertTrue(itemCount(h, WWItems.WITHER_BONE) == 0, "the bones went into the bull, not onto the ground");
        h.startSequence()
                .thenWaitUntil(() -> h.assertFalse(b.isReviving(), "the revive should end"))
                .thenExecute(() -> {
                    h.assertTrue(b.isAlive() && b.getHealth() >= b.getMaxHealth() - 1f, "it should be alive and full of soul");
                    cleanup(h, p);
                })
                .thenSucceed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 60)
    public void brokenSkullDropsItsBones(GameTestHelper h) {
        floor(h, Blocks.SOUL_SAND);
        BlockPos skull = new BlockPos(4, 1, 4);
        h.setBlock(skull, WWBlocks.SOUL_BULL_SKULL);
        for (BlockPos s : new BlockPos[]{skull.north(), skull.south(), skull.east(), skull.west()}) {
            h.setBlock(s, Blocks.SOUL_FIRE);
        }
        ServerPlayer p = player(h, 4.5, 7.5, new ItemStack(WWItems.WITHER_BONE, 64));
        for (int i = 0; i < 3; i++) {
            h.useBlock(skull, p);
        }
        h.getLevel().destroyBlock(h.absolutePos(skull), true);
        h.assertTrue(itemCount(h, WWItems.WITHER_BONE) == 3, "breaking the skull scatters its bones");
        h.assertTrue(itemCount(h, WWItems.SOUL_BULL_SKULL) == 1, "and drops the skull");
        cleanup(h, p);
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------ milking

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 60)
    public void milkingCostsAQuarterAndIsRefusedWhenLow(GameTestHelper h) {
        floor(h, Blocks.STONE);
        ServerPlayer p = player(h, 4.5, 7.5, new ItemStack(WWItems.ELIXIR_BOTTLE, 4));
        SoulBull wild = bull(h, 2.5, 4.5, false, null);
        h.assertFalse(wild.mobInteract(p, InteractionHand.MAIN_HAND).consumesAction(), "a wild bull can't be milked");
        SoulBull b = bull(h, 6.5, 4.5, true, p);
        float max = b.getMaxHealth();
        h.assertTrue(b.mobInteract(p, InteractionHand.MAIN_HAND).consumesAction(), "a tamed bull gives a Soul Elixir");
        h.assertTrue(Math.abs(b.getHealth() - max * 0.75f) < 0.01f, "milking costs a quarter of its soul energy (" + b.getHealth() + ")");
        h.assertTrue(p.getInventory().contains(new ItemStack(WWItems.SOUL_ELIXIR)), "the player should get a Soul Elixir");
        p.getInventory().clearContent();
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(WWItems.ELIXIR_BOTTLE, 4));
        b.setHealth(max * 0.25f);
        b.mobInteract(p, InteractionHand.MAIN_HAND);
        h.assertTrue(Math.abs(b.getHealth() - max * 0.25f) < 0.01f, "at a quarter it refuses");
        h.assertFalse(p.getInventory().contains(new ItemStack(WWItems.SOUL_ELIXIR)), "no elixir when refused");
        cleanup(h, p);
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------ the ram and the pin

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 200)
    public void riddenRamCostsSoulAndPins(GameTestHelper h) {
        floor(h, Blocks.STONE);
        ServerPlayer p = player(h, 4.5, 1.5, ItemStack.EMPTY);
        SoulBull b = bull(h, 4.5, 2.5, true, p);
        b.equipSaddle(new ItemStack(Items.SADDLE), null);
        h.assertTrue(p.startRiding(b, true), "the owner should be able to ride a saddled bull");
        h.assertTrue(b.getControllingPassenger() == p, "the rider steers it");
        h.assertTrue(b.canJump(), "the jump key charges its ram");
        Pig pig = h.spawn(EntityType.PIG, new Vec3(4.5, 1, 4.3));
        pig.setNoAi(true);
        float before = b.getHealth();
        b.handleStartJump(100);   // a fully charged ram, as the rider lets go of the jump key
        h.assertTrue(b.isRamming(), "a full jump bar should start a ram");
        h.assertTrue(Math.abs(b.getHealth() - (before - b.ramCost(1f))) < 0.01f, "the ram costs soul energy (" + b.getHealth() + ")");
        h.assertTrue(b.ramCost(1f) >= b.getMaxHealth() * 0.2f, "a full ram costs a lot of soul energy");
        h.startSequence()
                .thenWaitUntil(() -> h.assertTrue(b.isPinning() && b.pinned() == pig, "the pig should be caught on its horns"))
                .thenExecute(() -> {
                    h.assertTrue(pig.getHealth() < pig.getMaxHealth(), "the ram hurts");
                    h.assertTrue(Curses.soulBurning(pig), "and sets its victim alight with soul fire");
                })
                .thenIdle(5)
                .thenExecute(() -> h.assertTrue(pig.position().distanceTo(b.hornHold()) < 0.3, "the victim is held on the horns"))
                .thenWaitUntil(() -> h.assertFalse(b.isPinning(), "the pin lasts 1.5 s"))
                .thenWaitUntil(() -> h.assertTrue(b.ramCooldown() == 0, "cooled down"))
                .thenExecute(() -> {
                    b.setHealth(5f);
                    b.handleStartJump(100);
                    h.assertFalse(b.isRamming(), "too little soul energy: no ram");
                    h.assertTrue(Math.abs(b.getHealth() - 5f) < 0.01f, "a refused ram costs nothing");
                    cleanup(h, p);
                })
                .thenSucceed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 120)
    public void wildRamPinsForFree(GameTestHelper h) {
        floor(h, Blocks.STONE);
        SoulBull b = bull(h, 4.5, 2.5, false, null);
        Pig pig = h.spawn(EntityType.PIG, new Vec3(4.5, 1, 4.3));
        pig.setNoAi(true);
        float before = b.getHealth();
        h.assertTrue(b.startRam(1f, new Vec3(0, 0, 1)), "a wild bull rams");
        h.assertTrue(b.getHealth() == before, "a wild bull's ram is free");
        h.startSequence()
                .thenWaitUntil(() -> h.assertTrue(b.isPinning() && b.pinned() == pig, "the pig should be pinned"))
                .thenExecute(() -> h.assertTrue(Curses.soulBurning(pig), "pinned victims burn with soul fire"))
                .thenWaitUntil(() -> h.assertFalse(b.isPinning(), "then it lets go"))
                .thenExecute(() -> cleanup(h))
                .thenSucceed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 120)
    public void wildChargeCrossesTheGapAndHoldsItsVictimInFront(GameTestHelper h) {
        floor(h, Blocks.STONE);
        SoulBull b = bull(h, 4.5, 0.5, false, null);
        b.setNoAi(false);
        Pig pig = h.spawn(EntityType.PIG, new Vec3(4.5, 1, 6.0));
        pig.setNoAi(true);
        h.assertTrue(b.startRam(1f, new Vec3(0, 0, 1)), "a wild bull rams");
        h.startSequence()
                .thenWaitUntil(() -> h.assertTrue(b.isPinning() && b.pinned() == pig, "the charge should reach the pig 5 blocks off"))
                .thenIdle(10)
                .thenExecute(() -> {
                    Vec3 rel = pig.position().subtract(b.position());
                    h.assertTrue(rel.z > 1.2 && Math.abs(rel.x) < 0.3, "the victim is held out in front of the horns (" + rel + ")");
                    h.assertTrue(Math.abs(b.getYRot()) < 1f, "the bull keeps facing its victim (" + b.getYRot() + ")");
                    cleanup(h);
                })
                .thenSucceed();
    }

    // ------------------------------------------------------------------------------------------ drops

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 40)
    public void itDropsItsSkullAndWitherBones(GameTestHelper h) {
        floor(h, Blocks.STONE);
        for (int i = 0; i < 3; i++) {
            SoulBull b = bull(h, 2.5 + i * 2, 4.5, false, null);
            b.kill();
        }
        int skulls = itemCount(h, WWItems.SOUL_BULL_SKULL), bones = itemCount(h, WWItems.WITHER_BONE);
        h.assertTrue(skulls == 3, "each bull should drop its skull (" + skulls + ")");
        h.assertTrue(bones >= 3 && bones <= 9, "each bull should drop 1-3 Wither Bones (" + bones + " from 3)");
        cleanup(h);
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 40)
    public void witherSkeletonsDropWitherBonesAQuarterOfTheTime(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        WitherSkeleton ws = h.spawn(EntityType.WITHER_SKELETON, new Vec3(4.5, 1, 4.5));
        ws.setNoAi(true);
        LootTable table = level.getServer().reloadableRegistries().getLootTable(EntityType.WITHER_SKELETON.getDefaultLootTable());
        LootParams params = new LootParams.Builder(level).withParameter(LootContextParams.THIS_ENTITY, ws)
                .withParameter(LootContextParams.ORIGIN, ws.position())
                .withParameter(LootContextParams.DAMAGE_SOURCE, level.damageSources().generic()).create(LootContextParamSets.ENTITY);
        int rolls = 2000, bones = 0;
        for (int i = 0; i < rolls; i++) {
            for (ItemStack s : table.getRandomItems(params, 9001L + i * 7919L)) {
                if (s.is(WWItems.WITHER_BONE)) {
                    bones += s.getCount();
                }
            }
        }
        h.assertTrue(bones > rolls * 0.2 && bones < rolls * 0.3, "about 1 in 4 Wither Skeletons should drop a Wither Bone (" + bones + "/" + rolls + ")");
        cleanup(h);
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------ spawning and the armoured variant

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 40)
    public void armouredVariantStats(GameTestHelper h) {
        floor(h, Blocks.STONE);
        SoulBull plain = bull(h, 2.5, 4.5, false, null);
        SoulBull armored = bull(h, 6.5, 4.5, false, null);
        armored.setArmored(true);
        armored.setHealth(armored.getMaxHealth());
        h.assertTrue(Math.abs(armored.getMaxHealth() - plain.getMaxHealth() * 1.5f) < 0.01f, "+50% health (" + armored.getMaxHealth() + ")");
        h.assertTrue(armored.getAttributeValue(Attributes.ARMOR) >= plain.getAttributeValue(Attributes.ARMOR) + 8, "more armour");
        CompoundTag tag = new CompoundTag();
        armored.saveWithoutId(tag);
        SoulBull copy = WWEntities.SOUL_BULL.create(h.getLevel());
        copy.load(tag);
        h.assertTrue(copy.isArmored() && Math.abs(copy.getMaxHealth() - armored.getMaxHealth()) < 0.01f, "the variant survives saving");
        // natural spawns: about 1 in 5 is armoured, and those carry a Wither Skeleton
        ServerLevel level = h.getLevel();
        int n = 300, armoredCount = 0;
        for (int i = 0; i < n; i++) {
            SoulBull b = WWEntities.SOUL_BULL.create(level);
            b.moveTo(h.absoluteVec(new Vec3(4.5, 1, 4.5)));
            b.finalizeSpawn(level, level.getCurrentDifficultyAt(b.blockPosition()), MobSpawnType.NATURAL, null);
            h.assertFalse(b.isBaby(), "no calves");
            if (b.isArmored()) {
                armoredCount++;
                h.assertTrue(b.getFirstPassenger() instanceof WitherSkeleton, "armoured bulls are Wither Skeleton jockeys");
                h.assertTrue(Math.abs(b.getHealth() - b.getMaxHealth()) < 0.01f, "spawned with full health");
            } else {
                h.assertTrue(b.getPassengers().isEmpty(), "plain bulls carry no rider");
            }
            for (Entity e : List.copyOf(b.getPassengers())) {
                e.discard();
            }
            b.discard();
        }
        h.assertTrue(armoredCount > n * 0.12 && armoredCount < n * 0.3, "about 1 in 5 should be armoured (" + armoredCount + "/" + n + ")");
        // Soul Sand Valleys, herds of 1-3
        Biome valley = level.registryAccess().registryOrThrow(Registries.BIOME).getOrThrow(Biomes.SOUL_SAND_VALLEY);
        boolean listed = false;
        for (MobSpawnSettings.SpawnerData d : valley.getMobSettings().getMobs(MobCategory.MONSTER).unwrap()) {
            if (d.type == WWEntities.SOUL_BULL) {
                listed = d.minCount == 1 && d.maxCount == 3;
            }
        }
        h.assertTrue(listed, "Soul Bulls should spawn in Soul Sand Valleys in herds of 1-3");
        cleanup(h);
        h.succeed();
    }
}
