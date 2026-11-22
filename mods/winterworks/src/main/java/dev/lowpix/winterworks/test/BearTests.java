package dev.lowpix.winterworks.test;

import dev.lowpix.winterworks.bear.BearFeature;
import dev.lowpix.winterworks.bear.BearLeapGoal;
import dev.lowpix.winterworks.bear.BearLike;
import dev.lowpix.winterworks.bear.FrostZombie;
import dev.lowpix.winterworks.bear.RemadePolarBear;
import dev.lowpix.winterworks.bear.ZombiePolarBear;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWItems;
import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.EntityTypeTags;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.animal.Pig;
import net.minecraft.world.entity.animal.PolarBear;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.monster.Stray;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.enchantment.Enchantments;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.storage.loot.LootTable;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * GameTests for the bear part of the Cold Zone update (docs/COLD_UPDATE.md sections 3-4). ./gradlew runGametest
 * They run in their own batch, and every hostile mob (and any mock player moved next to one) is removed at the end,
 * so no bear goes hunting in another test's area.
 */
public class BearTests implements FabricGameTest {
    private static final String BATCH = "winterworks_bears";

    private static void floor(GameTestHelper h) {
        for (int x = 0; x < 8; x++) {
            for (int z = 0; z < 8; z++) {
                h.setBlock(new BlockPos(x, 0, z), Blocks.STONE);
            }
        }
    }

    private static PolarBear bear(GameTestHelper h, BlockPos at) {
        PolarBear bear = h.spawn(EntityType.POLAR_BEAR, at);
        bear.setAge(0);
        return bear;
    }

    private static RemadePolarBear remade(PolarBear bear) {
        return (RemadePolarBear) bear;
    }

    /** A mock player in survival (mock players are creative otherwise; they stay at world spawn unless moved). */
    private static ServerPlayer survivor(GameTestHelper h, ItemStack inHand) {
        ServerPlayer player = h.makeMockServerPlayerInLevel();
        player.setGameMode(GameType.SURVIVAL);
        player.setItemInHand(InteractionHand.MAIN_HAND, inHand);
        return player;
    }

    private static void removePlayer(GameTestHelper h, ServerPlayer player) {
        h.getLevel().getServer().getPlayerList().remove(player);
    }

    private static int itemCount(GameTestHelper h, Item item, BlockPos around, double radius) {
        AABB box = new AABB(h.absolutePos(around)).inflate(radius);
        int n = 0;
        for (ItemEntity it : h.getLevel().getEntitiesOfClass(ItemEntity.class, box, it -> it.isAlive() && it.getItem().is(item))) {
            n += it.getItem().getCount();
        }
        return n;
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH)
    public void remadeBearStats(GameTestHelper h) {
        floor(h);
        PolarBear bear = bear(h, new BlockPos(3, 1, 3));
        h.assertTrue(bear.getMaxHealth() == 40f, "max health should be 40, is " + bear.getMaxHealth());
        h.assertTrue(bear.getAttributeValue(Attributes.ATTACK_DAMAGE) == 8.0, "attack should be 8");
        h.assertTrue(Math.abs(bear.getAttributeBaseValue(Attributes.MOVEMENT_SPEED) - 0.28) < 1e-6, "speed should be 0.28");
        h.assertTrue(bear instanceof BearLike && bear.getControllingPassenger() == null, "every polar bear is remade");
        bear.discard();
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH)
    public void feedingFiveSalmonCalmsIt(GameTestHelper h) {
        floor(h);
        BlockPos at = new BlockPos(3, 1, 3);
        PolarBear bear = bear(h, at);
        remade(bear).ww$setCarriesSalmon(true);
        ServerPlayer player = survivor(h, new ItemStack(Items.SALMON, 8));
        for (int i = 0; i < 4; i++) {
            bear.mobInteract(player, InteractionHand.MAIN_HAND);
        }
        h.assertFalse(remade(bear).ww$isCalm(), "4 salmon should not calm it yet");
        h.assertTrue(remade(bear).ww$salmonEaten() == 4, "it should count 4 salmon, counts " + remade(bear).ww$salmonEaten());
        bear.mobInteract(player, InteractionHand.MAIN_HAND);
        h.assertTrue(remade(bear).ww$isCalm(), "5 salmon within 60 s should calm it");
        h.assertTrue(remade(bear).ww$calmTicks() >= RemadePolarBear.CALM_TICKS, "calm for 6000 ticks");
        h.assertFalse(((BearLike) bear).ww$mayFight(), "a calm bear doesn't fight");
        h.assertTrue(player.getMainHandItem().getCount() == 3, "5 salmon should be eaten, left " + player.getMainHandItem().getCount());
        h.assertFalse(remade(bear).ww$carriesSalmon(), "the carried salmon is given away");
        h.succeedWhen(() -> h.assertTrue(itemCount(h, Items.SALMON, at, 4) == 1, "the gift salmon should be on the ground"));
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 200)
    public void droppedSalmonIsEaten(GameTestHelper h) {
        floor(h);
        PolarBear bear = bear(h, new BlockPos(1, 1, 3));
        ItemEntity fish = h.spawnItem(Items.COOKED_SALMON, 5.5f, 1.5f, 3.5f);
        h.succeedWhen(() -> {
            h.assertTrue(!fish.isAlive() || fish.getItem().isEmpty(), "the bear should eat the dropped salmon");
            h.assertTrue(remade(bear).ww$salmonEaten() == 1, "one salmon towards calming, counts " + remade(bear).ww$salmonEaten());
            bear.discard();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH)
    public void shearingACalmBearGivesFur(GameTestHelper h) {
        floor(h);
        BlockPos at = new BlockPos(3, 1, 3);
        PolarBear bear = bear(h, at);
        remade(bear).ww$calm(RemadePolarBear.CALM_TICKS, null);
        ServerPlayer player = survivor(h, new ItemStack(Items.SHEARS));
        bear.mobInteract(player, InteractionHand.MAIN_HAND);
        h.assertTrue(remade(bear).ww$isShorn(), "the calm bear should be shorn");
        h.assertTrue(remade(bear).ww$shornTicks() == RemadePolarBear.SHORN_TICKS, "shorn for 6000 ticks");
        h.assertTrue(player.getMainHandItem().getDamageValue() == 1, "the shears take damage");
        h.succeedWhen(() -> {
            int fur = itemCount(h, WWItems.POLAR_BEAR_FUR, at, 4);
            h.assertTrue(fur >= 2 && fur <= 3, "shearing gives 2-3 fur, got " + fur);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH)
    public void shearingAnAngryBearAngersIt(GameTestHelper h) {
        floor(h);
        BlockPos at = new BlockPos(3, 1, 3);
        PolarBear bear = bear(h, at);
        ServerPlayer player = survivor(h, new ItemStack(Items.SHEARS));
        bear.mobInteract(player, InteractionHand.MAIN_HAND);
        h.assertFalse(remade(bear).ww$isShorn(), "an angry bear can't be shorn");
        h.assertTrue(bear.getTarget() == player, "it goes for the shearer");
        h.runAfterDelay(5, () -> {
            h.assertTrue(itemCount(h, WWItems.POLAR_BEAR_FUR, at, 4) == 0, "no fur from an angry bear");
            bear.discard();
            h.succeed();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 200)
    public void uncalmedAdultHuntsANearbyPlayer(GameTestHelper h) {
        floor(h);
        PolarBear bear = bear(h, new BlockPos(1, 1, 3));
        ServerPlayer player = survivor(h, ItemStack.EMPTY);
        Vec3 p = h.absoluteVec(new Vec3(6.5, 1, 3.5));
        player.teleportTo(h.getLevel(), p.x, p.y, p.z, 90f, 0f);
        h.succeedWhen(() -> {
            h.assertTrue(bear.getTarget() == player, "an adult polar bear should hunt a survival player 5 blocks away");
            bear.discard();
            removePlayer(h, player);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 120)
    public void aPlayerHoldingSalmonIsSpared(GameTestHelper h) {
        floor(h);
        PolarBear bear = bear(h, new BlockPos(1, 1, 3));
        ServerPlayer player = survivor(h, new ItemStack(Items.SALMON));
        Vec3 p = h.absoluteVec(new Vec3(6.5, 1, 3.5));
        player.teleportTo(h.getLevel(), p.x, p.y, p.z, 90f, 0f);
        h.runAfterDelay(80, () -> {
            h.assertTrue(bear.getTarget() != player, "holding salmon, the player should not be hunted");
            bear.discard();
            removePlayer(h, player);
            h.succeed();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH)
    public void deathDropsFur(GameTestHelper h) {
        floor(h);
        BlockPos at = new BlockPos(3, 1, 3);
        PolarBear bear = bear(h, at);
        ItemStack sword = new ItemStack(Items.IRON_SWORD);
        sword.enchant(h.getLevel().registryAccess().registryOrThrow(Registries.ENCHANTMENT).getHolderOrThrow(Enchantments.LOOTING), 3);
        ServerPlayer player = survivor(h, sword);
        bear.hurt(h.getLevel().damageSources().playerAttack(player), 1000f);
        h.assertTrue(bear.isDeadOrDying(), "the bear should be dead");
        // 0-2 fur, +1 per looting level: Looting III makes 3-5
        h.succeedWhen(() -> {
            int fur = itemCount(h, WWItems.POLAR_BEAR_FUR, at, 4);
            h.assertTrue(fur >= 3 && fur <= 5, "a polar bear killed with Looting III drops 3-5 fur, got " + fur);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH)
    public void frostZombieHitFreezes(GameTestHelper h) {
        floor(h);
        FrostZombie zombie = h.spawn(WWEntities.FROST_ZOMBIE, new BlockPos(2, 1, 3));
        Pig pig = h.spawn(EntityType.PIG, new BlockPos(3, 1, 3));
        h.assertTrue(zombie.doHurtTarget(pig), "the hit should land");
        h.assertTrue(pig.getTicksFrozen() >= FrostZombie.FREEZE_TICKS, "the hit should add 160 frozen ticks, has " + pig.getTicksFrozen());
        h.assertTrue(pig.hasEffect(MobEffects.MOVEMENT_SLOWDOWN), "the hit should slow it");
        h.assertFalse(zombie.canFreeze(), "frost zombies can't freeze");
        h.assertTrue(zombie.getType().is(EntityTypeTags.UNDEAD), "frost zombies are undead");
        zombie.discard();
        pig.discard();
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH)
    public void zombiePolarBearIsUndead(GameTestHelper h) {
        floor(h);
        ZombiePolarBear zb = h.spawn(WWEntities.ZOMBIE_POLAR_BEAR, new BlockPos(3, 1, 3));
        h.assertTrue(zb.getType().is(EntityTypeTags.UNDEAD) && zb.isInvertedHealAndHarm(), "zombie polar bears are undead");
        h.assertTrue(zb.getMaxHealth() == 45f && zb.ww$mayFight() && zb.ww$isZombie(), "45 hp, always hostile");
        h.assertFalse(zb.canFreeze(), "zombie polar bears can't freeze");
        zb.discard();
        // their loot tables load (a missing or broken table silently becomes the empty one)
        var tables = h.getLevel().getServer().reloadableRegistries();
        for (EntityType<?> type : new EntityType<?>[]{WWEntities.ZOMBIE_POLAR_BEAR, WWEntities.FROST_ZOMBIE}) {
            h.assertTrue(tables.getLootTable(type.getDefaultLootTable()) != LootTable.EMPTY, "no loot table for " + type);
        }
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH)
    public void aJockeySpawnsWhenForced(GameTestHelper h) {
        floor(h);
        BlockPos at = new BlockPos(3, 1, 3);
        Vec3 p = h.absoluteVec(Vec3.atBottomCenterOf(at));
        Stray stray = EntityType.STRAY.create(h.getLevel());
        stray.moveTo(p.x, p.y, p.z, 0f, 0f);
        BearFeature.forceJockeys = true;
        try {
            stray.finalizeSpawn(h.getLevel(), h.getLevel().getCurrentDifficultyAt(h.absolutePos(at)), MobSpawnType.NATURAL, null);
        } finally {
            BearFeature.forceJockeys = false;
        }
        h.getLevel().addFreshEntityWithPassengers(stray);
        Entity vehicle = stray.getVehicle();
        h.assertTrue(vehicle instanceof PolarBear, "the stray should ride a polar bear, rides " + vehicle);
        PolarBear bear = (PolarBear) vehicle;
        h.assertTrue(bear.isAlive() && !bear.isBaby() && remade(bear).ww$isJockeyMount(), "an adult jockey mount");
        h.assertTrue(bear.getControllingPassenger() == null && ((BearLike) bear).ww$mayFight(), "the bear still walks and fights");
        stray.discard();
        bear.discard();
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH)
    public void shornSurvivesSaveAndLoad(GameTestHelper h) {
        floor(h);
        PolarBear bear = bear(h, new BlockPos(3, 1, 3));
        remade(bear).ww$calm(RemadePolarBear.CALM_TICKS, null);
        h.assertTrue(remade(bear).ww$shearFur(null, net.minecraft.sounds.SoundSource.NEUTRAL), "shearing a calm bear");
        remade(bear).ww$setCarriesSalmon(true);
        CompoundTag tag = new CompoundTag();
        bear.saveWithoutId(tag);
        PolarBear copy = EntityType.POLAR_BEAR.create(h.getLevel());
        copy.load(tag);
        h.assertTrue(remade(copy).ww$isShorn() && ((BearLike) copy).ww$isShorn(), "shorn should survive save/load");
        h.assertTrue(remade(copy).ww$shornTicks() == remade(bear).ww$shornTicks(), "the regrow timer should survive save/load");
        h.assertTrue(remade(copy).ww$isCalm() && remade(copy).ww$carriesSalmon(), "calm and the carried salmon should survive too");
        h.assertTrue(copy.getMaxHealth() == 40f, "stats survive");
        bear.discard();
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 400)
    public void bearsCatchFish(GameTestHelper h) {
        floor(h);
        // a stone bank (y=1) with a walled pond in it (x 4-6, z 1-6)
        for (int x = 0; x < 8; x++) {
            for (int z = 0; z < 8; z++) {
                boolean pond = x >= 4 && x <= 6 && z >= 1 && z <= 6;
                h.setBlock(new BlockPos(x, 1, z), pond ? Blocks.WATER : Blocks.STONE);
            }
        }
        PolarBear bear = bear(h, new BlockPos(1, 2, 3));
        remade(bear).ww$calm(RemadePolarBear.CALM_TICKS, null);   // calm: no hunting in the next test's area
        remade(bear).ww$takeSitRequest();
        remade(bear).ww$goFishing();
        h.succeedWhen(() -> {
            ItemStack fish = ((BearLike) bear).ww$carried();
            h.assertTrue(fish.is(Items.COD) || fish.is(Items.SALMON), "the bear should go fishing and carry its catch, carries " + fish);
            bear.discard();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH)
    public void leapSlamHurtsAndThrowsBack(GameTestHelper h) {
        floor(h);
        PolarBear bear = bear(h, new BlockPos(3, 1, 3));
        Pig pig = h.spawn(EntityType.PIG, new Vec3(5.0, 1, 3.5));
        Pig far = h.spawn(EntityType.PIG, new Vec3(7.5, 1, 7.5));
        int hit = BearLeapGoal.slam(bear);
        h.assertTrue(hit == 1, "the slam should hit the near pig only, hit " + hit);
        h.assertTrue(pig.getHealth() <= pig.getMaxHealth() - BearLeapGoal.SLAM_DAMAGE + 0.01f, "slam damage");
        h.assertTrue(pig.getDeltaMovement().x > 0.1, "thrown away from the bear, vx=" + pig.getDeltaMovement().x);
        h.assertTrue(far.getHealth() == far.getMaxHealth(), "out of reach");
        bear.discard();
        pig.discard();
        far.discard();
        h.succeed();
    }
}
