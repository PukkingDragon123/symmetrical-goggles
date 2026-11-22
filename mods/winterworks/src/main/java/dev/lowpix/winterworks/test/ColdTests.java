package dev.lowpix.winterworks.test;

import dev.lowpix.winterworks.cold.ColdSystem;
import dev.lowpix.winterworks.icebreaker.IcebreakerEntity;
import dev.lowpix.winterworks.icebreaker.RamHandler;
import dev.lowpix.winterworks.registry.WWEffects;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.world.WWWorldgen;
import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.commands.FillBiomeCommand;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.animal.Cod;
import net.minecraft.world.entity.animal.PolarBear;
import net.minecraft.world.entity.animal.Salmon;
import net.minecraft.world.entity.monster.Zombie;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.biome.MultiNoiseBiomeSourceParameterLists;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CampfireBlock;
import net.minecraft.world.phys.Vec3;

/** GameTests for the cold, Frostbite, fur armour gameplay and the Ice Caves (docs/COLD_UPDATE.md 1, 2, 5). */
public class ColdTests implements FabricGameTest {

    private static void floor(GameTestHelper h) {
        for (int x = 0; x < 8; x++) {
            for (int z = 0; z < 8; z++) {
                h.setBlock(new BlockPos(x, 0, z), Blocks.STONE);
            }
        }
    }

    /** Turn the test area into Ice Caves and put a survival player in the middle of it. */
    private static ServerPlayer playerInIceCaves(GameTestHelper h) {
        floor(h);
        var level = h.getLevel();
        var biome = level.registryAccess().registryOrThrow(Registries.BIOME).getHolderOrThrow(WWWorldgen.ICE_CAVES);
        FillBiomeCommand.fill(level, h.absolutePos(new BlockPos(-4, -2, -4)), h.absolutePos(new BlockPos(12, 8, 12)), biome);
        ServerPlayer p = h.makeMockServerPlayerInLevel();
        p.setGameMode(GameType.SURVIVAL);
        BlockPos at = h.absolutePos(new BlockPos(4, 1, 4));
        p.teleportTo(at.getX() + 0.5, at.getY(), at.getZ() + 0.5);
        p.setTicksFrozen(0);
        return p;
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void iceCavesAreInTheOverworld(GameTestHelper h) {
        var lists = h.getLevel().registryAccess().registryOrThrow(Registries.MULTI_NOISE_BIOME_SOURCE_PARAMETER_LIST);
        boolean found = lists.getHolderOrThrow(MultiNoiseBiomeSourceParameterLists.OVERWORLD).value().parameters().values()
                .stream().anyMatch(pair -> pair.getSecond().is(WWWorldgen.ICE_CAVES));
        h.assertTrue(found, "the overworld's biome list should include winterworks:ice_caves");
        h.assertTrue(h.getLevel().registryAccess().registryOrThrow(Registries.STRUCTURE).containsKey(WWWorldgen.FROZEN_TOMB),
                "the frozen tomb structure should be registered");
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 400)
    public void iceCavesFreezeYou(GameTestHelper h) {
        ServerPlayer p = playerInIceCaves(h);
        h.runAfterDelay(80, () -> h.assertTrue(ColdSystem.exposure(p) > 0 && ColdSystem.coldMeter(p) > 30,
                "the Ice Caves should be cold, exposure=" + ColdSystem.exposure(p) + " meter=" + ColdSystem.coldMeter(p)));
        h.runAfterDelay(260, () -> {
            h.assertTrue(ColdSystem.coldLevel(p) >= 1, "Chilly within 13 s, meter=" + ColdSystem.coldMeter(p));
            h.assertTrue(p.hasEffect(dev.lowpix.winterworks.registry.WWEffects.COLD), "the Cold effect shows the level");
            h.assertTrue(p.getTicksFrozen() >= 10, "the frost creeps in, frozen ticks=" + p.getTicksFrozen());
            h.succeed();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 100)
    public void coldHasFourLevels(GameTestHelper h) {
        h.assertTrue(ColdSystem.levelOf(0) == 0 && ColdSystem.levelOf(99) == 0 && ColdSystem.levelOf(100) == 1
                && ColdSystem.levelOf(250) == 2 && ColdSystem.levelOf(399) == 3 && ColdSystem.levelOf(400) == 4, "levels");
        ServerPlayer p = playerInIceCaves(h);
        ColdSystem.setColdMeter(p, 400);
        h.runAfterDelay(25, () -> {
            h.assertTrue(ColdSystem.coldLevel(p) == 4, "Frozen");
            var cold = p.getEffect(dev.lowpix.winterworks.registry.WWEffects.COLD);
            h.assertTrue(cold != null && cold.getAmplifier() == 3, "Cold IV when Frozen");
            h.assertTrue(p.hasEffect(net.minecraft.world.effect.MobEffects.MOVEMENT_SLOWDOWN)
                    && p.hasEffect(net.minecraft.world.effect.MobEffects.WEAKNESS), "Frozen slows and weakens");
            h.assertTrue(p.isFullyFrozen(), "fully frozen from Freezing on");
            h.succeed();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 100)
    public void touchingIceChills(GameTestHelper h) {
        ServerPlayer p = h.makeMockServerPlayerInLevel();
        p.moveTo(h.absoluteVec(new net.minecraft.world.phys.Vec3(4.5, 2, 4.5)));
        h.setBlock(new BlockPos(4, 1, 4), Blocks.BLUE_ICE);
        h.setBlock(new BlockPos(5, 2, 4), Blocks.PACKED_ICE);
        h.runAfterDelay(5, () -> {
            h.assertTrue(ColdSystem.coldAt(h.getLevel(), p) >= ColdSystem.ON_ICE + ColdSystem.TOUCHING_ICE - 0.01f,
                    "standing on and touching ice is cold: " + ColdSystem.coldAt(h.getLevel(), p));
            h.succeed();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 200)
    public void aCampfireKeepsYouWarm(GameTestHelper h) {
        ServerPlayer p = playerInIceCaves(h);
        h.setBlock(new BlockPos(6, 1, 4), Blocks.CAMPFIRE.defaultBlockState().setValue(CampfireBlock.LIT, true));
        h.runAfterDelay(80, () -> {
            h.assertTrue(p.getTicksFrozen() <= 2, "a lit campfire should keep the player warm, frozen ticks=" + p.getTicksFrozen());
            h.succeed();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 200)
    public void leatherKeepsTheColdOut(GameTestHelper h) {
        ServerPlayer p = playerInIceCaves(h);
        p.setItemSlot(EquipmentSlot.HEAD, new ItemStack(Items.LEATHER_HELMET));
        p.setItemSlot(EquipmentSlot.CHEST, new ItemStack(Items.LEATHER_CHESTPLATE));
        p.setItemSlot(EquipmentSlot.LEGS, new ItemStack(Items.LEATHER_LEGGINGS));
        p.setItemSlot(EquipmentSlot.FEET, new ItemStack(Items.LEATHER_BOOTS));
        h.runAfterDelay(80, () -> {
            h.assertTrue(ColdSystem.coldMeter(p) == 0 && p.getTicksFrozen() <= 2,
                    "a full leather set keeps the cold out, meter=" + ColdSystem.coldMeter(p));
            h.succeed();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 200)
    public void onePieceOnlySlowsTheCold(GameTestHelper h) {
        ServerPlayer p = playerInIceCaves(h);
        p.setItemSlot(EquipmentSlot.FEET, new ItemStack(Items.LEATHER_BOOTS));
        h.runAfterDelay(80, () -> {
            float m = ColdSystem.coldMeter(p);
            h.assertTrue(m > 15 && m < 0.5f * 80, "one leather piece cuts the cold by a quarter, meter=" + m);
            h.succeed();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 200)
    public void furTurnsTheColdIntoStrength(GameTestHelper h) {
        ServerPlayer p = playerInIceCaves(h);
        p.setItemSlot(EquipmentSlot.HEAD, new ItemStack(WWItems.FUR_HOOD));
        p.setItemSlot(EquipmentSlot.CHEST, new ItemStack(WWItems.FUR_COAT));
        p.setItemSlot(EquipmentSlot.LEGS, new ItemStack(WWItems.FUR_LEGGINGS));
        p.setItemSlot(EquipmentSlot.FEET, new ItemStack(WWItems.FUR_BOOTS));
        h.assertTrue(ColdSystem.furPieces(p) == 4, "four fur pieces");
        h.assertFalse(p.addEffect(new MobEffectInstance(MobEffects.MOVEMENT_SLOWDOWN, 200)), "fur should block Slowness");
        h.assertFalse(p.addEffect(new MobEffectInstance(WWEffects.FROSTBITE, 200)), "fur should block Frostbite");
        h.runAfterDelay(50, () -> {
            MobEffectInstance s = p.getEffect(MobEffects.DAMAGE_BOOST);
            h.assertTrue(s != null && s.getAmplifier() == 2, "the full fur set in the cold should give Strength III, got " + s);
            h.assertTrue(p.getTicksFrozen() <= 2, "fur should stop freezing, frozen ticks=" + p.getTicksFrozen());
            h.succeed();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void strengthAndOverheatScaleWithPieces(GameTestHelper h) {
        h.assertTrue(ColdSystem.strengthAmplifier(1) == 0 && ColdSystem.strengthAmplifier(2) == 0
                && ColdSystem.strengthAmplifier(3) == 1 && ColdSystem.strengthAmplifier(4) == 2, "strength by pieces");
        h.assertTrue(ColdSystem.overheatInterval(1) == 60 && ColdSystem.overheatInterval(4) == 15, "overheat by pieces");
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 120)
    public void frostbiteFreezesFastAndBites(GameTestHelper h) {
        floor(h);
        var z = h.spawn(EntityType.PIG, new BlockPos(4, 1, 4));   // a pig: zombies burn in daylight, and fire thaws
        z.setNoAi(true);
        float hp = z.getHealth();
        z.addEffect(new MobEffectInstance(WWEffects.FROSTBITE, 100));
        h.runAfterDelay(40, () -> {
            h.assertTrue(z.getTicksFrozen() >= 140, "Frostbite should freeze fast, frozen ticks=" + z.getTicksFrozen());
            h.assertTrue(z.getHealth() < hp, "Frostbite should bite");
            h.succeed();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void furMobsShrugOffFrostbite(GameTestHelper h) {
        floor(h);
        Zombie z = h.spawn(EntityType.ZOMBIE, new BlockPos(4, 1, 4));
        z.setItemSlot(EquipmentSlot.CHEST, new ItemStack(WWItems.FUR_COAT));
        h.assertFalse(z.addEffect(new MobEffectInstance(WWEffects.FROSTBITE, 100)), "a fur coat blocks Frostbite");
        Zombie bare = h.spawn(EntityType.ZOMBIE, new BlockPos(2, 1, 2));
        h.assertTrue(bare.addEffect(new MobEffectInstance(WWEffects.FROSTBITE, 100)), "a bare zombie gets Frostbite");
        h.succeed();
    }

    // ---- 0.4 fixes: Cold Zone (docs/FIXES_0_4.md): the Icebreaker and the Potion of Ramming at top speed

    /** A 32x20x32 empty structure (data/winterworks/gametest/structure/boss_arena.snbt): room for a pool. */
    private static final String ARENA = "winterworks:boss_arena";

    private static IcebreakerEntity adult(GameTestHelper h, Vec3 at) {
        IcebreakerEntity seal = h.spawn(WWEntities.ICEBREAKER, at);
        seal.setAge(0);
        seal.setHungry(false);
        return seal;
    }

    /** Stone from y 0 to 3 over x 0..19, z 0..12, with a 3-deep pool in x 9..17, z 2..10 (water at y 1..3). */
    private static void shoreAndPool(GameTestHelper h) {
        for (int x = 0; x < 20; x++) {
            for (int z = 0; z < 13; z++) {
                boolean pool = x >= 9 && x <= 17 && z >= 2 && z <= 10;
                h.setBlock(new BlockPos(x, 0, z), Blocks.STONE);
                for (int y = 1; y <= 3; y++) {
                    h.setBlock(new BlockPos(x, y, z), pool ? Blocks.WATER : Blocks.STONE);
                }
            }
        }
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 400, batch = "icebreaker")
    public void icebreakerSizeAndItFightsPolarBears(GameTestHelper h) {
        floor(h);
        IcebreakerEntity seal = adult(h, new Vec3(1.5, 1, 4.5));
        IcebreakerEntity cub = h.spawn(WWEntities.ICEBREAKER, new Vec3(1.5, 1, 1.5));
        cub.setAge(-24000);
        h.assertTrue(Math.abs(seal.getBbWidth() - 1.875f) < 0.01f && Math.abs(seal.getBbHeight() - 1.575f) < 0.01f
                && Math.abs(seal.getEyeHeight() - 1.35f) < 0.01f, "an adult is 1.875 x 1.575, eyes at 1.35: " + seal.getBbWidth()
                + " x " + seal.getBbHeight() + ", " + seal.getEyeHeight());
        h.assertTrue(Math.abs(cub.getBbWidth() - 1.875f / 2) < 0.01f, "a cub is half: " + cub.getBbWidth());
        PolarBear bear = h.spawn(EntityType.POLAR_BEAR, new Vec3(6.5, 1, 4.5));
        bear.setNoAi(true);
        float hp = bear.getHealth();
        h.succeedWhen(() -> {
            h.assertTrue(seal.getTarget() == bear, "the Icebreaker should go for the polar bear");
            h.assertTrue(bear.getHealth() < hp, "and hurt it, health " + bear.getHealth());
        });
    }

    @GameTest(template = ARENA, timeoutTicks = 200, batch = "icebreaker")
    public void icebreakerChargesPlayersWhoComeNearItsCubs(GameTestHelper h) {
        for (int x = 0; x < 30; x++) {
            for (int z = 0; z < 8; z++) {
                h.setBlock(new BlockPos(x, 0, z), Blocks.STONE);
            }
        }
        IcebreakerEntity seal = adult(h, new Vec3(3.5, 1, 3.5));
        IcebreakerEntity cub = h.spawn(WWEntities.ICEBREAKER, new Vec3(7.5, 1, 3.5));
        cub.setAge(-24000);
        cub.setNoAi(true);
        @SuppressWarnings("removal")
        ServerPlayer player = h.makeMockServerPlayerInLevel();
        player.setGameMode(GameType.SURVIVAL);
        Vec3 far = h.absoluteVec(new Vec3(20.5, 1, 3.5));   // 13 blocks from the cub
        player.moveTo(far.x, far.y, far.z, 90f, 0f);
        h.startSequence()
                .thenExecuteAfter(60, () -> {
                    h.assertTrue(seal.getTarget() == null, "13 blocks from the cub the player is left alone");
                    Vec3 near = h.absoluteVec(new Vec3(16.5, 1, 3.5));   // 9 blocks from the cub
                    player.moveTo(near.x, near.y, near.z, 90f, 0f);
                })
                .thenWaitUntil(() -> h.assertTrue(seal.getTarget() == player, "within 10 blocks of a cub it goes for the player, "
                        + "target " + seal.getTarget()))
                .thenExecute(() -> {
                    h.getLevel().getServer().getPlayerList().remove(player);
                    seal.discard();
                    cub.discard();
                })
                .thenSucceed();
    }

    @GameTest(template = ARENA, timeoutTicks = 700, batch = "icebreaker")
    public void icebreakerHeadsForTheWater(GameTestHelper h) {
        shoreAndPool(h);
        IcebreakerEntity seal = adult(h, new Vec3(3.5, 4, 6.5));
        h.succeedWhen(() -> h.assertTrue(seal.isInWater(), "on land, the Icebreaker should soon head for the water"));
    }

    @GameTest(template = ARENA, timeoutTicks = 600, batch = "icebreaker")
    public void hungryIcebreakerHuntsSalmon(GameTestHelper h) {
        shoreAndPool(h);
        IcebreakerEntity seal = adult(h, new Vec3(10.5, 1.5, 3.5));
        seal.setHungry(true);
        Salmon salmon = h.spawn(EntityType.SALMON, new Vec3(16.5, 2, 9.5));
        Cod cod = h.spawn(EntityType.COD, new Vec3(16.5, 2, 3.5));
        h.succeedWhen(() -> {
            h.assertFalse(salmon.isAlive() && cod.isAlive(), "the hungry Icebreaker should catch a fish");
            h.assertFalse(seal.isHungry(), "and eat it");
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 200, batch = "icebreaker")
    public void sleepingIcebreakerWakesWhenApproachedOrHurt(GameTestHelper h) {
        floor(h);
        IcebreakerEntity seal = adult(h, new Vec3(2.5, 1, 2.5));
        ServerPlayer[] walker = new ServerPlayer[1];
        h.startSequence()
                .thenExecuteAfter(5, seal::fallAsleep)
                .thenExecuteAfter(30, () -> h.assertTrue(seal.isAsleep(), "it should sleep on, nothing near"))
                .thenExecute(() -> {
                    @SuppressWarnings("removal")
                    ServerPlayer p = h.makeMockServerPlayerInLevel();
                    p.setGameMode(GameType.SURVIVAL);
                    Vec3 at = h.absoluteVec(new Vec3(5.5, 1, 2.5));
                    p.moveTo(at.x, at.y, at.z, 90f, 0f);
                    walker[0] = p;
                })
                .thenWaitUntil(() -> h.assertFalse(seal.isAsleep(), "a player walking up wakes it"))
                .thenExecute(() -> h.getLevel().getServer().getPlayerList().remove(walker[0]))
                .thenExecuteAfter(5, () -> {
                    seal.fallAsleep();
                    seal.hurt(h.getLevel().damageSources().generic(), 1f);
                    h.assertFalse(seal.isAsleep(), "being hurt wakes it");
                })
                .thenSucceed();
    }

    /** Sprinting under Ramming until the ram starts is top speed: the further speed boost, gone when the ram ends. */
    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 200, batch = "icebreaker")
    public void rammingTopSpeedBoostsSpeed(GameTestHelper h) {
        floor(h);
        @SuppressWarnings("removal")
        ServerPlayer p = h.makeMockServerPlayerInLevel();
        p.setGameMode(GameType.SURVIVAL);
        Vec3 at = h.absoluteVec(new Vec3(1.5, 1, 4.5));
        p.moveTo(at.x, at.y, at.z, -90f, 0f);
        p.addEffect(new MobEffectInstance(WWEffects.RAMMING, 2000));
        p.setSprinting(true);
        double sprint = p.getAttributeValue(Attributes.MOVEMENT_SPEED);
        h.startSequence()
                .thenExecuteAfter(RamHandler.CHARGE_TICKS / 2, () -> h.assertFalse(RamHandler.atTopSpeed(p), "not yet: still charging"))
                .thenWaitUntil(() -> h.assertTrue(RamHandler.atTopSpeed(p), "sprinting 3 s under Ramming reaches top speed, charge "
                        + RamHandler.charge(p)))
                .thenExecute(() -> {
                    double top = p.getAttributeValue(Attributes.MOVEMENT_SPEED);
                    h.assertTrue(top > sprint * 1.3, "top speed is a further boost: " + sprint + " -> " + top);
                    p.setSprinting(false);
                })
                .thenExecuteAfter(2, () -> {
                    h.assertFalse(RamHandler.atTopSpeed(p), "stopping ends the ram and the boost");
                    h.getLevel().getServer().getPlayerList().remove(p);
                })
                .thenSucceed();
    }
}
