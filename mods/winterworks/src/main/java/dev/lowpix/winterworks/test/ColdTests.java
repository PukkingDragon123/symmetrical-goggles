package dev.lowpix.winterworks.test;

import dev.lowpix.winterworks.cold.ColdSystem;
import dev.lowpix.winterworks.registry.WWEffects;
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
import net.minecraft.world.entity.monster.Zombie;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.biome.MultiNoiseBiomeSourceParameterLists;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CampfireBlock;

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

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 200)
    public void iceCavesFreezeYou(GameTestHelper h) {
        ServerPlayer p = playerInIceCaves(h);
        h.runAfterDelay(80, () -> {
            h.assertTrue(ColdSystem.exposure(p) > 0, "the Ice Caves should be cold, exposure=" + ColdSystem.exposure(p));
            h.assertTrue(p.getTicksFrozen() >= 15, "the player should be freezing, frozen ticks=" + p.getTicksFrozen());
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
        p.setItemSlot(EquipmentSlot.FEET, new ItemStack(Items.LEATHER_BOOTS));
        h.runAfterDelay(80, () -> {
            h.assertTrue(p.getTicksFrozen() <= 2, "leather should stop freezing, frozen ticks=" + p.getTicksFrozen());
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
}
