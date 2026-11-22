package dev.lowpix.winterworks.test;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.endmob.ChorusCocoonBlock;
import dev.lowpix.winterworks.endmob.EndBloomBlock;
import dev.lowpix.winterworks.endmob.EndMobFeature;
import dev.lowpix.winterworks.endmob.Endling;
import dev.lowpix.winterworks.endmob.Enderfly;
import dev.lowpix.winterworks.endmob.GlowLightBlock;
import dev.lowpix.winterworks.endmob.Gucker;
import dev.lowpix.winterworks.endmob.GuckerSpit;
import dev.lowpix.winterworks.endmob.Obolisk;
import dev.lowpix.winterworks.registry.EndBlocks;
import dev.lowpix.winterworks.registry.EndEffects;
import dev.lowpix.winterworks.registry.EndEntities;
import dev.lowpix.winterworks.registry.EndItems;
import dev.lowpix.winterworks.registry.EndParticles;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.AreaEffectCloud;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.animal.Cow;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.monster.Endermite;
import net.minecraft.world.entity.monster.Husk;
import net.minecraft.world.entity.projectile.Arrow;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.alchemy.PotionBrewing;
import net.minecraft.world.item.alchemy.PotionContents;
import net.minecraft.world.item.alchemy.Potions;
import net.minecraft.world.item.enchantment.Enchantments;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.loot.LootParams;
import net.minecraft.world.level.storage.loot.LootTable;
import net.minecraft.world.level.storage.loot.parameters.LootContextParamSets;
import net.minecraft.world.level.storage.loot.parameters.LootContextParams;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * GameTests for the Living End's creatures (docs/END_UPDATE.md sections 2, 4, 6-9). ./gradlew runGametest
 * Each group runs in its own batch (Obolisks and mock players reach across the test grid otherwise) and removes its mobs
 * and players at the end.
 */
public class EndMobTests implements FabricGameTest {
    private static void floor(GameTestHelper h, BlockState s) {
        for (int x = 0; x < 9; x++) {
            for (int z = 0; z < 9; z++) {
                h.setBlock(new BlockPos(x, 0, z), s);
            }
        }
    }

    private static ServerPlayer survivor(GameTestHelper h, double x, double z, ItemStack inHand) {
        @SuppressWarnings("removal")
        ServerPlayer p = h.makeMockServerPlayerInLevel();
        p.setGameMode(GameType.SURVIVAL);
        Vec3 at = h.absoluteVec(new Vec3(x, 1, z));
        p.moveTo(at.x, at.y, at.z, 0f, 0f);
        p.setItemInHand(InteractionHand.MAIN_HAND, inHand);
        return p;
    }

    private static void cleanup(GameTestHelper h, ServerPlayer... players) {
        for (Entity e : h.getLevel().getEntities((Entity) null, h.getBounds().inflate(6), e -> !(e instanceof ServerPlayer))) {
            e.discard();
        }
        for (ServerPlayer p : players) {
            h.getLevel().getServer().getPlayerList().remove(p);
        }
    }

    private static int items(GameTestHelper h, Item item, BlockPos at, double r) {
        int n = 0;
        for (ItemEntity it : h.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(h.absolutePos(at)).inflate(r),
                it -> it.isAlive() && it.getItem().is(item))) {
            n += it.getItem().getCount();
        }
        return n;
    }

    private static ItemStack enchanted(GameTestHelper h, Item item, ResourceKey<net.minecraft.world.item.enchantment.Enchantment> ench, int lvl) {
        ItemStack s = new ItemStack(item);
        s.enchant(h.getLevel().registryAccess().registryOrThrow(Registries.ENCHANTMENT).getHolderOrThrow(ench), lvl);
        return s;
    }

    // ------------------------------------------------------------------------------------------ the Chorus Cocoon

    @GameTest(template = EMPTY_STRUCTURE, batch = "endmob_blocks", timeoutTicks = 60)
    public void brokenCocoonReleasesAnAngryEndermite(GameTestHelper h) {
        floor(h, Blocks.END_STONE.defaultBlockState());
        BlockPos at = new BlockPos(4, 2, 4);
        h.setBlock(at.above(), Blocks.END_STONE);
        h.setBlock(at, EndBlocks.CHORUS_COCOON.defaultBlockState().setValue(ChorusCocoonBlock.AGE, 1));
        ServerPlayer p = survivor(h, 4.5, 2.5, ItemStack.EMPTY);
        p.gameMode.destroyBlock(h.absolutePos(at));
        h.assertBlockNotPresent(EndBlocks.CHORUS_COCOON, at);
        List<Endermite> mites = h.getLevel().getEntitiesOfClass(Endermite.class, new AABB(h.absolutePos(at)).inflate(2));
        h.assertTrue(mites.size() == 1, "one Endermite should jump out, found " + mites.size());
        h.assertTrue(mites.get(0).getTarget() == p, "the Endermite should be angry at whoever broke the cocoon");
        h.assertTrue(h.getEntities(EndEntities.ENDERFLY, at, 3).isEmpty(), "an unripe cocoon holds no Enderfly");
        h.succeedWhen(() -> {
            int fruit = items(h, Items.CHORUS_FRUIT, at, 2);
            h.assertTrue(fruit >= 1 && fruit <= 2, "1-2 chorus fruit should drop, got " + fruit);
            cleanup(h, p);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = "endmob_blocks", timeoutTicks = 60)
    public void matureCocoonsHatchEnderflies(GameTestHelper h) {
        floor(h, Blocks.END_STONE.defaultBlockState());
        ServerLevel level = h.getLevel();
        // one grows up on random ticks and hatches by itself
        BlockPos grow = new BlockPos(2, 2, 4);
        h.setBlock(grow.above(), EndBlocks.CHORUS_STEM);
        h.setBlock(grow, EndBlocks.CHORUS_COCOON.defaultBlockState());
        BlockPos abs = h.absolutePos(grow);
        int maxAge = 0;
        for (int i = 0; i < 400 && level.getBlockState(abs).is(EndBlocks.CHORUS_COCOON); i++) {
            BlockState s = level.getBlockState(abs);
            maxAge = Math.max(maxAge, s.getValue(ChorusCocoonBlock.AGE));
            s.randomTick(level, abs, level.random);
        }
        h.assertTrue(maxAge == ChorusCocoonBlock.MATURE, "the cocoon should grow to age 3, got to " + maxAge);
        h.assertBlockNotPresent(EndBlocks.CHORUS_COCOON, grow);
        h.assertTrue(h.getEntities(EndEntities.ENDERFLY, grow, 2).size() == 1, "a mature cocoon should hatch one Enderfly");
        // one is broken when mature: an Enderfly too, and no Endermite
        BlockPos ripe = new BlockPos(6, 2, 4);
        h.setBlock(ripe.above(), Blocks.END_STONE);
        h.setBlock(ripe, EndBlocks.CHORUS_COCOON.defaultBlockState().setValue(ChorusCocoonBlock.AGE, 3));
        ServerPlayer p = survivor(h, 6.5, 2.5, ItemStack.EMPTY);
        p.gameMode.destroyBlock(h.absolutePos(ripe));
        h.assertTrue(h.getEntities(EndEntities.ENDERFLY, ripe, 2).size() == 1, "breaking a mature cocoon should let its Enderfly out");
        h.assertTrue(h.getEntities(EntityType.ENDERMITE, ripe, 3).isEmpty(), "a mature cocoon holds an Enderfly, not an Endermite");
        cleanup(h, p);
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = "endmob_blocks", timeoutTicks = 60)
    public void silkTouchTakesTheCocoonWhole(GameTestHelper h) {
        floor(h, Blocks.END_STONE.defaultBlockState());
        BlockPos at = new BlockPos(4, 2, 4);
        h.setBlock(at.above(), Blocks.END_STONE);
        h.setBlock(at, EndBlocks.CHORUS_COCOON.defaultBlockState().setValue(ChorusCocoonBlock.AGE, 2));
        ServerPlayer p = survivor(h, 4.5, 2.5, enchanted(h, Items.DIAMOND_AXE, Enchantments.SILK_TOUCH, 1));
        p.gameMode.destroyBlock(h.absolutePos(at));
        h.assertTrue(h.getEntities(EntityType.ENDERMITE, at, 3).isEmpty(), "with silk touch, the cocoon (and whatever's in it) stays shut");
        h.succeedWhen(() -> {
            h.assertTrue(items(h, EndBlocks.CHORUS_COCOON.asItem(), at, 2) == 1, "silk touch should drop the cocoon itself");
            h.assertTrue(items(h, Items.CHORUS_FRUIT, at, 2) == 0, "no chorus fruit with silk touch");
            cleanup(h, p);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = "endmob_blocks")
    public void cocoonsHangOnlyFromChorusAndEndStone(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        BlockState cocoon = EndBlocks.CHORUS_COCOON.defaultBlockState();
        BlockPos at = h.absolutePos(new BlockPos(4, 2, 4));
        for (var ok : new net.minecraft.world.level.block.Block[]{EndBlocks.CHORUS_STEM, Blocks.CHORUS_PLANT, Blocks.END_STONE}) {
            level.setBlockAndUpdate(at.above(), ok.defaultBlockState());
            h.assertTrue(cocoon.canSurvive(level, at), "a cocoon should hang under " + ok);
        }
        level.setBlockAndUpdate(at.above(), Blocks.STONE.defaultBlockState());
        h.assertFalse(cocoon.canSurvive(level, at), "a cocoon shouldn't hang under stone");
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------ the End Bloom

    @GameTest(template = EMPTY_STRUCTURE, batch = "endmob_blocks", timeoutTicks = 60)
    public void shearingGivesABulbOnlyWhenOpen(GameTestHelper h) {
        floor(h, EndBlocks.END_GRASS_BLOCK.defaultBlockState());
        ServerLevel level = h.getLevel();
        BlockPos at = new BlockPos(4, 1, 4);
        BlockPos abs = h.absolutePos(at);
        ServerPlayer p = survivor(h, 4.5, 2.5, new ItemStack(Items.SHEARS));
        BlockHitResult hit = new BlockHitResult(Vec3.atCenterOf(abs), Direction.UP, abs, false);
        BlockState closed = EndBlocks.END_BLOOM.defaultBlockState().setValue(EndBloomBlock.OPEN, false).setValue(EndBloomBlock.BULB, true);
        h.assertTrue(closed.canSurvive(level, abs), "a bloom should grow on End grass");
        level.setBlockAndUpdate(abs, closed);
        level.getBlockState(abs).useItemOn(p.getMainHandItem(), level, p, InteractionHand.MAIN_HAND, hit);
        h.assertTrue(items(h, EndItems.END_BULB, at, 2) == 0, "a closed bloom gives no bulb");
        h.assertTrue(level.getBlockState(abs).getValue(EndBloomBlock.BULB), "a closed bloom keeps its bulb");
        level.setBlockAndUpdate(abs, closed.setValue(EndBloomBlock.OPEN, true));
        level.getBlockState(abs).useItemOn(p.getMainHandItem(), level, p, InteractionHand.MAIN_HAND, hit);
        h.assertFalse(level.getBlockState(abs).getValue(EndBloomBlock.BULB), "shearing an open bloom takes its bulb");
        level.getBlockState(abs).useItemOn(p.getMainHandItem(), level, p, InteractionHand.MAIN_HAND, hit);
        // no eclipse on: random ticks close it and grow the bulb back
        for (int i = 0; i < 200 && !level.getBlockState(abs).getValue(EndBloomBlock.BULB); i++) {
            level.getBlockState(abs).randomTick(level, abs, level.random);
        }
        BlockState after = level.getBlockState(abs);
        h.assertFalse(after.getValue(EndBloomBlock.OPEN), "with no eclipse, the bloom should close");
        h.assertTrue(after.getValue(EndBloomBlock.BULB), "with no eclipse, the bulb should grow back");
        h.succeedWhen(() -> {
            h.assertTrue(items(h, EndItems.END_BULB, at, 2) == 1, "exactly one End Bulb, got " + items(h, EndItems.END_BULB, at, 2));
            cleanup(h, p);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = "endmob_blocks")
    public void bloomsGrowOnEndGroundOnly(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        BlockPos at = h.absolutePos(new BlockPos(4, 2, 4));
        BlockState bloom = EndBlocks.END_BLOOM.defaultBlockState();
        for (var ok : new net.minecraft.world.level.block.Block[]{EndBlocks.END_GRASS_BLOCK, Blocks.END_STONE, EndBlocks.END_MOSS_BLOCK}) {
            level.setBlockAndUpdate(at.below(), ok.defaultBlockState());
            h.assertTrue(bloom.canSurvive(level, at), "a bloom should grow on " + ok);
        }
        level.setBlockAndUpdate(at.below(), Blocks.GRASS_BLOCK.defaultBlockState());
        h.assertFalse(bloom.canSurvive(level, at), "a bloom shouldn't grow on overworld grass");
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------ the Obolisk

    @GameTest(template = EMPTY_STRUCTURE, batch = "endmob_obolisk_damage", timeoutTicks = 60)
    public void onlyPickaxesHurtObolisks(GameTestHelper h) {
        floor(h, Blocks.STONE.defaultBlockState());
        Obolisk o = Obolisk.spawnAwake(h.getLevel(), h.absolutePos(new BlockPos(4, 1, 4)), null);
        o.setNoAi(true);
        ServerPlayer p = survivor(h, 4.5, 1.0, new ItemStack(Items.DIAMOND_SWORD));
        float max = o.getMaxHealth();
        o.hurt(p.damageSources().playerAttack(p), 10f);
        float sword = max - o.getHealth();
        o.setHealth(max);
        o.invulnerableTime = 0;
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.DIAMOND_PICKAXE));
        o.hurt(p.damageSources().playerAttack(p), 10f);
        float pickaxe = max - o.getHealth();
        o.setHealth(max);
        o.invulnerableTime = 0;
        Arrow arrow = new Arrow(EntityType.ARROW, h.getLevel());
        arrow.setOwner(p);
        o.hurt(p.damageSources().arrow(arrow, p), 10f);   // the bow-holding pickaxe player still only gets 15%
        float shot = max - o.getHealth();
        h.assertTrue(pickaxe > 4f, "a pickaxe hit should do real damage, did " + pickaxe);
        h.assertTrue(sword > 0f && sword < pickaxe * 0.2f, "a sword should do about 15% (" + sword + " vs " + pickaxe + ")");
        h.assertTrue(shot > 0f && shot < pickaxe * 0.2f, "an arrow should do about 15% (" + shot + " vs " + pickaxe + ")");
        cleanup(h, p);
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = "endmob_obolisk_hit", timeoutTicks = 120)
    public void disguisedOboliskRisesWhenHit(GameTestHelper h) {
        floor(h, Blocks.STONE.defaultBlockState());
        Obolisk o = Obolisk.spawnDisguised(h.getLevel(), h.absolutePos(new BlockPos(4, 1, 4)));
        h.assertTrue(o.isDisguised(), "spawnDisguised should give a rock");
        h.runAfterDelay(10, () -> {
            h.assertTrue(o.isDisguised() && o.getDeltaMovement().horizontalDistanceSqr() < 1e-6, "a disguised Obolisk stays put");
            Husk z = h.spawn(EntityType.HUSK, new BlockPos(1, 1, 1));
            z.setNoAi(true);
            o.hurt(h.getLevel().damageSources().mobAttack(z), 2f);
            h.assertTrue(o.phase() == Obolisk.Phase.RISING, "a hit should make it rise, it is " + o.phase());
        });
        h.runAfterDelay(10 + Obolisk.RISE_TICKS + 5, () -> {
            h.assertTrue(o.phase() == Obolisk.Phase.AWAKE || o.phase() == Obolisk.Phase.SLAMMING,
                    "after rising it should be awake (or already slamming), it is " + o.phase());
            h.assertTrue(o.getTarget() instanceof Husk, "it should go after whoever hit it");
            cleanup(h);
            h.succeed();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = "endmob_obolisk_near", timeoutTicks = 80)
    public void disguisedOboliskRisesForANearbySurvivor(GameTestHelper h) {
        floor(h, Blocks.STONE.defaultBlockState());
        Obolisk o = Obolisk.spawnDisguised(h.getLevel(), h.absolutePos(new BlockPos(4, 1, 4)));
        ServerPlayer[] p = new ServerPlayer[1];
        h.runAfterDelay(10, () -> {
            h.assertTrue(o.isDisguised(), "nobody near: still a rock");
            p[0] = survivor(h, 4.5, 0.5, ItemStack.EMPTY);   // 4 blocks away
        });
        h.runAfterDelay(25, () -> {
            h.assertTrue(o.phase() == Obolisk.Phase.RISING, "a survival player within 6 blocks should wake it, it is " + o.phase());
            cleanup(h, p[0]);
            h.succeed();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = "endmob_obolisk_slam", timeoutTicks = 80)
    public void oboliskSlamBreaksBlocks(GameTestHelper h) {
        floor(h, Blocks.STONE.defaultBlockState());
        ServerLevel level = h.getLevel();
        level.getGameRules().getRule(GameRules.RULE_MOBGRIEFING).set(true, level.getServer());
        Obolisk o = Obolisk.spawnAwake(level, h.absolutePos(new BlockPos(4, 1, 1)), null);
        o.setNoAi(true);
        o.setYRot(0f);
        o.yBodyRot = 0f;
        o.setYHeadRot(0f);
        BlockPos impact = BlockPos.containing(o.impactPoint()).subtract(h.absolutePos(BlockPos.ZERO));
        BlockPos glass = impact.above(), stone = impact.south(), far = impact.south(3), obsidian = impact.east(), chest = impact.west();
        h.setBlock(glass, Blocks.GLASS);
        h.setBlock(stone, Blocks.COBBLESTONE);
        h.setBlock(far, Blocks.COBBLESTONE);
        h.setBlock(obsidian, Blocks.OBSIDIAN);
        h.setBlock(chest, Blocks.CHEST);
        Husk victim = h.spawn(EntityType.HUSK, impact.south().east());
        victim.setNoAi(true);
        o.startSlam();
        h.assertTrue(o.phase() == Obolisk.Phase.SLAMMING, "it should be slamming");
        h.runAfterDelay(Obolisk.SLAM_IMPACT + 2, () -> {
            h.assertBlockNotPresent(Blocks.GLASS, glass);
            h.assertBlockNotPresent(Blocks.COBBLESTONE, stone);
            h.assertBlockPresent(Blocks.COBBLESTONE, far);
            h.assertBlockPresent(Blocks.OBSIDIAN, obsidian);
            h.assertBlockPresent(Blocks.CHEST, chest);
            h.assertTrue(victim.getHealth() <= victim.getMaxHealth() - 10f || victim.isDeadOrDying(),
                    "the slam should hit hard, the husk has " + victim.getHealth());
            cleanup(h);
            h.succeed();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = "endmob_obolisk_slam")
    public void slamHonoursMobGriefing(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        BlockPos at = h.absolutePos(new BlockPos(4, 2, 4));
        level.setBlockAndUpdate(at, Blocks.COBBLESTONE.defaultBlockState());
        h.assertTrue(Obolisk.canBreak(level.getBlockState(at), level, at), "cobblestone is slam-breakable");
        level.setBlockAndUpdate(at, Blocks.ENDER_CHEST.defaultBlockState());
        h.assertTrue(level.getBlockState(at).is(EndMobFeature.OBOLISK_UNBREAKABLE), "ender chests are in obolisk_unbreakable");
        h.assertFalse(Obolisk.canBreak(level.getBlockState(at), level, at), "an ender chest isn't");
        level.setBlockAndUpdate(at, Blocks.BEDROCK.defaultBlockState());
        h.assertFalse(Obolisk.canBreak(level.getBlockState(at), level, at), "bedrock isn't");
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------ the Endling

    @GameTest(template = EMPTY_STRUCTURE, batch = "endmob_endling", timeoutTicks = 60)
    public void endlingsAreTamedWithChorusFruit(GameTestHelper h) {
        floor(h, EndBlocks.END_GRASS_BLOCK.defaultBlockState());
        Endling e = h.spawn(EndEntities.ENDLING, new BlockPos(4, 1, 4));
        e.setNoAi(true);
        ServerPlayer p = survivor(h, 4.5, 3.0, new ItemStack(Items.CHORUS_FRUIT, 64));
        int fed = 0;
        while (!e.isTame() && fed < 60) {
            e.interact(p, InteractionHand.MAIN_HAND);
            fed++;
        }
        h.assertTrue(e.isTame() && e.isOwnedBy(p), "chorus fruit should tame it (1 in 3) within 60 tries");
        h.assertTrue(p.getMainHandItem().getCount() == 64 - fed, "each try eats a chorus fruit");
        // sneak + use: sit and stand
        p.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
        p.setShiftKeyDown(true);
        e.interact(p, InteractionHand.MAIN_HAND);
        h.assertTrue(e.isOrderedToSit(), "sneak + use should sit it");
        e.interact(p, InteractionHand.MAIN_HAND);
        h.assertFalse(e.isOrderedToSit(), "and again should stand it up");
        p.setShiftKeyDown(false);
        // a plant on its head, and shears to take it off
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.POPPY));
        e.interact(p, InteractionHand.MAIN_HAND);
        h.assertTrue(e.getHeadPlant().is(Items.POPPY), "a poppy (#winterworks:endling_head_plants) should go on its head");
        Endling copy = EndEntities.ENDLING.create(h.getLevel());
        copy.load(e.saveWithoutId(new net.minecraft.nbt.CompoundTag()));
        h.assertTrue(copy.getHeadPlant().is(Items.POPPY), "the head plant should be saved");
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.SHEARS));
        e.interact(p, InteractionHand.MAIN_HAND);
        h.assertTrue(e.getHeadPlant().isEmpty(), "shears should take the plant off");
        h.succeedWhen(() -> {
            h.assertTrue(items(h, Items.POPPY, new BlockPos(4, 1, 4), 3) == 1, "the sheared poppy should drop");
            cleanup(h, p);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = "endmob_endling", timeoutTicks = 100)
    public void tamedEndlingSavesItsOwnerFromTheVoid(GameTestHelper h) {
        floor(h, EndBlocks.END_GRASS_BLOCK.defaultBlockState());
        ServerLevel level = h.getLevel();
        ServerPlayer p = survivor(h, 1.5, 1.5, ItemStack.EMPTY);
        Endling e = h.spawn(EndEntities.ENDLING, new BlockPos(6, 1, 6));
        e.setNoAi(true);
        e.tame(p);
        Vec3 home = e.position();
        Vec3 drop = h.absoluteVec(new Vec3(1.5, 0, 1.5));
        p.teleportTo(level, drop.x, level.getMinBuildHeight() - EndMobFeature.VOID_DEPTH - 3, drop.z, 0f, 0f);
        h.succeedWhen(() -> {
            h.assertTrue(p.position().distanceTo(home) < 1.0, "the player should be brought to the Endling, is at " + p.position());
            h.assertTrue(p.hasEffect(MobEffects.SLOW_FALLING), "with Slow Falling");
            h.assertTrue(e.isRemoved(), "the Endling should vanish (it gave itself up)");
            cleanup(h, p);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = "endmob_endling", timeoutTicks = 40)
    public void wildEndlingsDontRescueAnyone(GameTestHelper h) {
        floor(h, EndBlocks.END_GRASS_BLOCK.defaultBlockState());
        ServerLevel level = h.getLevel();
        ServerPlayer p = survivor(h, 1.5, 1.5, ItemStack.EMPTY);
        Endling wild = h.spawn(EndEntities.ENDLING, new BlockPos(6, 1, 6));
        wild.setNoAi(true);
        Vec3 drop = h.absoluteVec(new Vec3(1.5, 0, 1.5));
        double y = level.getMinBuildHeight() - EndMobFeature.VOID_DEPTH - 3;
        p.teleportTo(level, drop.x, y, drop.z, 0f, 0f);
        h.runAfterDelay(10, () -> {
            h.assertTrue(p.getY() < level.getMinBuildHeight() - EndMobFeature.VOID_DEPTH, "a wild Endling shouldn't save you");
            h.assertFalse(wild.isRemoved(), "and it stays");
            cleanup(h, p);
            h.succeed();
        });
    }

    // ------------------------------------------------------------------------------------------ the Gucker

    @GameTest(template = EMPTY_STRUCTURE, batch = "endmob_gucker", timeoutTicks = 100)
    public void guckerSpitLeavesABlindingCloud(GameTestHelper h) {
        floor(h, Blocks.END_STONE.defaultBlockState());
        Cow hit = h.spawn(EntityType.COW, new BlockPos(4, 1, 4));
        Cow near = h.spawn(EntityType.COW, new BlockPos(6, 1, 4));
        hit.setNoAi(true);
        near.setNoAi(true);
        GuckerSpit spit = new GuckerSpit(EndEntities.GUCKER_SPIT, h.getLevel());
        Vec3 from = h.absoluteVec(new Vec3(4.5, 4.5, 4.5));
        spit.setPos(from.x, from.y, from.z);
        spit.setDeltaMovement(0, -0.6, 0);
        h.getLevel().addFreshEntity(spit);
        h.succeedWhen(() -> {
            h.assertTrue(hit.hasEffect(MobEffects.BLINDNESS), "the cow it hit should be blinded");
            h.assertTrue(hit.getEffect(MobEffects.BLINDNESS).getDuration() <= GuckerSpit.BLINDNESS_TICKS, "for 4 s");
            List<AreaEffectCloud> clouds = h.getLevel().getEntitiesOfClass(AreaEffectCloud.class, h.getBounds().inflate(2),
                    c -> c.getParticle().getType() == EndParticles.BLINDING_DUST);
            h.assertTrue(!clouds.isEmpty(), "the spit should leave a cloud of blinding dust");
            h.assertTrue(near.hasEffect(MobEffects.BLINDNESS), "the cloud should blind the cow next to it too");
            cleanup(h);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = "endmob_gucker", timeoutTicks = 80)
    public void burrowedGuckerBurstsOutAtPrey(GameTestHelper h) {
        floor(h, Blocks.END_STONE.defaultBlockState());
        Gucker g = h.spawn(EndEntities.GUCKER, new BlockPos(4, 1, 4));
        h.runAfterDelay(5, () -> {
            h.assertTrue(g.burrow(), "it should dig into End stone");
            h.assertTrue(g.isBurrowed() && g.getBbHeight() < 0.5f, "burrowed, only its back is out");
        });
        h.runAfterDelay(15, () -> {
            Endling prey = h.spawn(EndEntities.ENDLING, new BlockPos(7, 1, 7));
            prey.setNoAi(true);
        });
        h.runAfterDelay(30, () -> {
            h.assertFalse(g.isBurrowed(), "an Endling within 7 blocks should make it burst out");
            h.assertTrue(g.getTarget() instanceof Endling, "and go for the Endling");
            cleanup(h);
            h.succeed();
        });
    }

    // ------------------------------------------------------------------------------------------ the Enderfly

    @GameTest(template = EMPTY_STRUCTURE, batch = "endmob_misc", timeoutTicks = 40)
    public void enderfliesDropWingsAQuarterOfTheTime(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        Enderfly fly = h.spawn(EndEntities.ENDERFLY, new BlockPos(4, 2, 4));
        fly.setNoAi(true);
        ServerPlayer p = survivor(h, 4.5, 1.5, new ItemStack(Items.DIAMOND_SWORD));
        LootTable table = level.getServer().reloadableRegistries().getLootTable(
                ResourceKey.create(Registries.LOOT_TABLE, Winterworks.id("entities/enderfly")));
        int plain = wings(level, table, fly, p), looting;
        p.setItemInHand(InteractionHand.MAIN_HAND, enchanted(h, Items.DIAMOND_SWORD, Enchantments.LOOTING, 3));
        looting = wings(level, table, fly, p);
        // 2000 rolls: 25% is 500 +- 60 or so; Looting III 40% is 800
        h.assertTrue(plain > 400 && plain < 600, "about 25% of Enderflies should drop a wing, got " + plain + " / 2000");
        h.assertTrue(looting > 700 && looting < 900, "Looting III should make it about 40%, got " + looting + " / 2000");
        cleanup(h, p);
        h.succeed();
    }

    private static int wings(ServerLevel level, LootTable table, Enderfly fly, ServerPlayer killer) {
        int n = 0;
        for (int i = 0; i < 2000; i++) {
            LootParams params = new LootParams.Builder(level).withParameter(LootContextParams.THIS_ENTITY, fly)
                    .withParameter(LootContextParams.ORIGIN, fly.position())
                    .withParameter(LootContextParams.DAMAGE_SOURCE, level.damageSources().playerAttack(killer))
                    .withOptionalParameter(LootContextParams.ATTACKING_ENTITY, killer)
                    .withOptionalParameter(LootContextParams.LAST_DAMAGE_PLAYER, killer).create(LootContextParamSets.ENTITY);
            for (ItemStack s : table.getRandomItems(params)) {
                if (s.is(EndItems.ENDERFLY_WING)) {
                    n += s.getCount();
                }
            }
        }
        return n;
    }

    // ------------------------------------------------------------------------------------------ Recall

    @GameTest(template = EMPTY_STRUCTURE, batch = "endmob_misc", timeoutTicks = 40)
    public void recallTakesYouToYourSpawnPoint(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        BlockPos spawn = h.absolutePos(new BlockPos(1, 1, 1));
        ServerPlayer p = survivor(h, 6.5, 6.5, ItemStack.EMPTY);
        p.setRespawnPosition(Level.OVERWORLD, spawn, 0f, true, false);
        ItemStack potion = PotionContents.createItemStack(Items.POTION, EndEffects.RECALL_POTION);
        potion.finishUsingItem(level, p);
        h.assertTrue(p.position().distanceTo(Vec3.atBottomCenterOf(spawn)) < 0.5, "Recall should go to the spawn point, got " + p.position());
        // from another dimension, too
        ServerLevel nether = level.getServer().getLevel(Level.NETHER);
        p.teleportTo(nether, 0.5, 100, 0.5, 0f, 0f);
        h.assertTrue(p.serverLevel() == nether, "the player should be in the Nether now");
        PotionContents.createItemStack(Items.POTION, EndEffects.RECALL_POTION).finishUsingItem(nether, p);
        h.assertTrue(p.serverLevel() == level && p.position().distanceTo(Vec3.atBottomCenterOf(spawn)) < 0.5,
                "Recall should bring you back across dimensions");
        // no spawn point: the world spawn
        p.setRespawnPosition(Level.OVERWORLD, null, 0f, false, false);
        PotionContents.createItemStack(Items.POTION, EndEffects.RECALL_POTION).finishUsingItem(level, p);
        BlockPos world = level.getSharedSpawnPos();
        double dx = p.getX() - (world.getX() + 0.5), dz = p.getZ() - (world.getZ() + 0.5);
        h.assertTrue(dx * dx + dz * dz < 24 * 24, "with no spawn point, Recall should go to the world spawn, got " + p.position());
        cleanup(h, p);
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = "endmob_misc")
    public void awkwardPotionAndAWingBrewRecall(GameTestHelper h) {
        PotionBrewing brewing = h.getLevel().potionBrewing();
        ItemStack awkward = PotionContents.createItemStack(Items.POTION, Potions.AWKWARD);
        ItemStack wing = new ItemStack(EndItems.ENDERFLY_WING);
        h.assertTrue(brewing.isIngredient(wing), "an Enderfly Wing should be a brewing ingredient");
        h.assertTrue(brewing.hasMix(awkward, wing), "awkward potion + wing should brew");
        ItemStack out = brewing.mix(wing, awkward);
        PotionContents pc = out.get(DataComponents.POTION_CONTENTS);
        h.assertTrue(pc != null && pc.is(EndEffects.RECALL_POTION), "it should brew a Potion of Recall, got " + out);
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = "endmob_misc", timeoutTicks = 100)
    public void endGlowShinesLikeATorch(GameTestHelper h) {
        Cow cow = h.spawnWithNoFreeWill(EntityType.COW, 2.5f, 1, 2.5f);
        cow.addEffect(new MobEffectInstance(EndEffects.END_GLOW, 600));
        h.runAfterDelay(12, () -> {   // once it has settled on the ground: the light is at its head
            BlockPos head = BlockPos.containing(cow.getX(), cow.getEyeY(), cow.getZ());
            BlockState s = h.getLevel().getBlockState(head);
            h.assertTrue(s.is(EndBlocks.GLOW_LIGHT), "End Glow should light the block at its head " + head + " (cow at "
                    + cow.position() + "), got " + s);
            h.assertTrue(s.getLightEmission() == 14, "as bright as a torch, got " + s.getLightEmission());
            h.assertTrue(s.canBeReplaced() && s.getCollisionShape(h.getLevel(), head).isEmpty(), "invisible and in nobody's way");
            cow.removeEffect(EndEffects.END_GLOW);
        });
        h.runAfterDelay(12 + GlowLightBlock.CHECK * 2 + 2, () -> {
            for (BlockPos p : BlockPos.betweenClosed(h.absolutePos(new BlockPos(0, 0, 0)), h.absolutePos(new BlockPos(5, 5, 5)))) {
                h.assertFalse(h.getLevel().getBlockState(p).is(EndBlocks.GLOW_LIGHT), "the light goes out with the glow at " + p);
            }
            cleanup(h);
            h.succeed();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = "endmob_misc")
    public void endBulbsGiveEndGlow(GameTestHelper h) {
        ServerPlayer p = survivor(h, 4.5, 4.5, ItemStack.EMPTY);
        p.getFoodData().setFoodLevel(20);
        new ItemStack(EndItems.END_BULB).finishUsingItem(h.getLevel(), p);
        h.assertTrue(p.hasEffect(EndEffects.END_GLOW), "an End Bulb should make you glow");
        h.assertTrue(p.getEffect(EndEffects.END_GLOW).getDuration() > 9000, "for 8 minutes");
        h.assertTrue(Enderfly.glows(p), "and Enderflies notice");
        cleanup(h, p);
        h.succeed();
    }
}
