package dev.lowpix.winterworks.test;

import dev.lowpix.winterworks.amber.AmberFeature;
import dev.lowpix.winterworks.hex.ElixirJarBlockEntity;
import dev.lowpix.winterworks.potion.PotionFeature;
import java.util.List;
import net.minecraft.world.item.alchemy.Potion;
import net.minecraft.world.item.alchemy.PotionBrewing;
import net.minecraft.world.item.alchemy.PotionContents;
import net.minecraft.world.item.alchemy.Potions;
import net.minecraft.world.item.crafting.CraftingInput;
import net.minecraft.world.item.crafting.RecipeType;
import dev.lowpix.winterworks.hex.ElixirType;
import dev.lowpix.winterworks.hex.HexComponents;
import dev.lowpix.winterworks.hex.HexingTableMenu;
import dev.lowpix.winterworks.hex.Hexing;
import dev.lowpix.winterworks.hex.SoulTankBlockEntity;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEffects;
import dev.lowpix.winterworks.registry.WWEnchantments;
import dev.lowpix.winterworks.registry.WWItems;
import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.animal.Pig;
import net.minecraft.world.inventory.AnvilMenu;
import net.minecraft.world.inventory.ContainerLevelAccess;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.EnchantmentHelper;
import net.minecraft.world.item.enchantment.Enchantments;
import net.minecraft.world.item.enchantment.ItemEnchantments;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;

/** GameTests for the hex part of Hexes & Havoc (docs/HEXES_UPDATE.md sections 1-2). ./gradlew runGametest */
public class HexTests implements FabricGameTest {
    private static final BlockPos JAR = new BlockPos(1, 2, 1);
    private static final BlockPos TABLE = new BlockPos(1, 1, 1);
    private static final BlockPos TANK = new BlockPos(3, 1, 1);

    @SuppressWarnings("removal")
    private static ServerPlayer survivor(GameTestHelper h) {
        ServerPlayer p = h.makeMockServerPlayerInLevel();
        p.setGameMode(GameType.SURVIVAL);   // mock players report isCreative() but abilities follow the game mode
        return p;
    }

    private static Holder<Enchantment> ench(GameTestHelper h, ResourceKey<Enchantment> key) {
        return h.getLevel().registryAccess().registryOrThrow(Registries.ENCHANTMENT).getHolderOrThrow(key);
    }

    private static ItemStack book(GameTestHelper h, Object... keysAndLevels) {
        ItemEnchantments.Mutable m = new ItemEnchantments.Mutable(ItemEnchantments.EMPTY);
        for (int i = 0; i < keysAndLevels.length; i += 2) {
            @SuppressWarnings("unchecked")
            ResourceKey<Enchantment> key = (ResourceKey<Enchantment>) keysAndLevels[i];
            m.set(ench(h, key), (Integer) keysAndLevels[i + 1]);
        }
        ItemStack book = new ItemStack(Items.ENCHANTED_BOOK);
        book.set(DataComponents.STORED_ENCHANTMENTS, m.toImmutable());
        return book;
    }

    private static ElixirJarBlockEntity jar(GameTestHelper h, BlockState heat) {
        h.setBlock(JAR.below().below(), heat.is(Blocks.SOUL_FIRE) ? Blocks.SOUL_SOIL : Blocks.NETHERRACK);
        h.setBlock(JAR.below(), heat);
        h.setBlock(JAR, WWBlocks.ELIXIR_JAR);
        return (ElixirJarBlockEntity) h.getBlockEntity(JAR);
    }

    private static void brews(GameTestHelper h, BlockState heat, ItemStack ingredient, ElixirType expected, ElixirType start) {
        ElixirJarBlockEntity jar = jar(h, heat);
        if (start == ElixirType.BLOOD) {
            jar.pourBlood();
        } else if (start != ElixirType.NONE) {
            jar.setContents(start, ElixirJarBlockEntity.DOSES);
        }
        ServerPlayer p = survivor(h);
        p.setItemInHand(InteractionHand.MAIN_HAND, ingredient);
        int before = ingredient.getCount();
        h.useBlock(JAR, p);
        h.assertTrue(jar.isBrewing(), "the jar should start brewing " + expected + " over " + heat);
        h.assertTrue(p.getMainHandItem().getCount() == before - 1, "the ingredient should go into the jar");
        h.succeedWhen(() -> {
            h.assertTrue(!jar.isBrewing(), "still brewing, " + jar.progress() + " ticks");
            h.assertTrue(jar.liquid() == expected && jar.doses() == ElixirJarBlockEntity.DOSES,
                    "expected 3 doses of " + expected + ", got " + jar.doses() + " of " + jar.liquid());
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 320)
    public void jarBrewsSoulElixirOverSoulFire(GameTestHelper h) {
        brews(h, Blocks.SOUL_FIRE.defaultBlockState(), new ItemStack(Items.SOUL_SAND, 2), ElixirType.SOUL, ElixirType.NONE);
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 320)
    public void jarBrewsGreedOverMagma(GameTestHelper h) {
        brews(h, Blocks.MAGMA_BLOCK.defaultBlockState(), new ItemStack(Items.GOLD_BLOCK, 2), ElixirType.GREED, ElixirType.BLOOD);
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 320)
    public void jarNeedsBloodBeforeGoldForGreed(GameTestHelper h) {
        ElixirJarBlockEntity jar = jar(h, Blocks.MAGMA_BLOCK.defaultBlockState());
        ServerPlayer p = survivor(h);
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.GOLD_BLOCK, 2));
        h.useBlock(JAR, p);
        h.assertTrue(!jar.isBrewing(), "gold alone in an empty jar makes nothing: the blood goes in first");
        h.assertTrue(p.getMainHandItem().getCount() == 2, "the gold stays in hand");
        ItemStack gold = p.getMainHandItem().copy();
        p.setItemInHand(InteractionHand.MAIN_HAND, AmberFeature.bloodPotion(Items.POTION));
        h.useBlock(JAR, p);
        h.assertTrue(jar.hasBlood() && jar.liquid() == ElixirType.BLOOD && jar.doses() == 1, "the Potion of Blood is poured in, jar "
                + jar.doses() + " of " + jar.liquid());
        h.assertTrue(p.getMainHandItem().is(Items.GLASS_BOTTLE), "leaving an empty bottle, hand " + p.getMainHandItem());
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(WWItems.ELIXIR_BOTTLE));
        h.useBlock(JAR, p);
        h.assertTrue(jar.hasBlood() && p.getMainHandItem().is(WWItems.ELIXIR_BOTTLE), "blood is not an elixir: the bottle takes none");
        p.setItemInHand(InteractionHand.MAIN_HAND, AmberFeature.bloodPotion(Items.POTION));
        h.useBlock(JAR, p);
        h.assertTrue(jar.doses() == 1 && p.getMainHandItem().is(Items.POTION), "one Potion of Blood is enough: the second stays");
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.SOUL_SAND));
        h.useBlock(JAR, p);
        h.assertTrue(!jar.isBrewing() && p.getMainHandItem().getCount() == 1, "soul sand doesn't mix with blood");
        p.setItemInHand(InteractionHand.MAIN_HAND, gold);
        h.useBlock(JAR, p);
        h.assertTrue(jar.isBrewing() && jar.brewing() == ElixirType.GREED, "now the gold dissolves in the blood");
        h.assertTrue(p.getMainHandItem().getCount() == 1, "taking one gold block");
        h.succeedWhen(() -> {
            h.assertTrue(!jar.isBrewing(), "still brewing, " + jar.progress() + " ticks");
            h.assertTrue(jar.liquid() == ElixirType.GREED && jar.doses() == ElixirJarBlockEntity.DOSES,
                    "expected 3 doses of Greed, got " + jar.doses() + " of " + jar.liquid());
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 320)
    public void jarBrewsCursedFromGreedOverCampfire(GameTestHelper h) {
        brews(h, Blocks.CAMPFIRE.defaultBlockState(), new ItemStack(Items.SOUL_SAND, 2), ElixirType.CURSED, ElixirType.GREED);
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 320)
    public void jarDoesNotBrewWithoutHeat(GameTestHelper h) {
        ElixirJarBlockEntity jar = jar(h, Blocks.STONE.defaultBlockState());
        ServerPlayer p = survivor(h);
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.SOUL_SAND, 4));
        h.useBlock(JAR, p);
        h.assertTrue(!jar.isBrewing(), "a cold jar shouldn't take the soul sand");
        h.assertTrue(p.getMainHandItem().getCount() == 4, "the soul sand should stay in hand");
        // a brew that loses its heat stops bubbling
        jar.startBrew(ElixirType.SOUL);
        h.runAfterDelay(ElixirJarBlockEntity.BREW_TICKS + 40, () -> {
            h.assertTrue(jar.isBrewing() && jar.progress() == 0, "a cold brew must not progress, at " + jar.progress());
            h.assertTrue(jar.doses() == 0, "no elixir without heat");
            h.succeed();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void bottleFillsFromTheJar(GameTestHelper h) {
        ElixirJarBlockEntity jar = jar(h, Blocks.STONE.defaultBlockState());
        jar.setContents(ElixirType.SOUL, ElixirJarBlockEntity.DOSES);
        ServerPlayer p = survivor(h);
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(WWItems.ELIXIR_BOTTLE, 2));
        h.useBlock(JAR, p);
        h.assertTrue(jar.doses() == 2, "one dose should be taken, left " + jar.doses());
        h.assertTrue(p.getMainHandItem().is(WWItems.ELIXIR_BOTTLE) && p.getMainHandItem().getCount() == 1,
                "one bottle should be used, hand " + p.getMainHandItem());
        h.assertTrue(p.getInventory().countItem(WWItems.SOUL_ELIXIR) == 1, "the player should get a Soul Elixir");
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 100)
    public void tankFillsFromNearbyDeathsAndElixir(GameTestHelper h) {
        h.setBlock(TANK, WWBlocks.SOUL_TANK);
        SoulTankBlockEntity tank = (SoulTankBlockEntity) h.getBlockEntity(TANK);
        Pig pig = h.spawn(EntityType.PIG, new BlockPos(1, 2, 3));
        pig.kill();
        h.assertTrue(tank.souls() == SoulTankBlockEntity.PER_MOB, "a nearby death should add 10 souls, got " + tank.souls());
        ServerPlayer p = survivor(h);
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(WWItems.SOUL_ELIXIR, 2));
        h.useBlock(TANK, p);
        h.assertTrue(tank.souls() == SoulTankBlockEntity.PER_MOB + SoulTankBlockEntity.PER_ELIXIR,
                "Soul Elixir should add 50, got " + tank.souls());
        h.assertTrue(p.getMainHandItem().getCount() == 1, "one Soul Elixir should be used");
        h.succeed();
    }

    private static HexingTableMenu table(GameTestHelper h, ServerPlayer p, int souls) {
        h.setBlock(TABLE, WWBlocks.HEXING_TABLE);
        if (souls >= 0) {
            h.setBlock(TANK, WWBlocks.SOUL_TANK);
            ((SoulTankBlockEntity) h.getBlockEntity(TANK)).setSouls(souls);
        }
        return new HexingTableMenu(1, p.getInventory(), ContainerLevelAccess.create(h.getLevel(), h.absolutePos(TABLE)));
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void lesserHexRaisesLevelsAndAddsACurse(GameTestHelper h) {
        ServerPlayer p = survivor(h);
        HexingTableMenu menu = table(h, p, 500);
        menu.getSlot(HexingTableMenu.BOOK_SLOT).set(book(h, Enchantments.SHARPNESS, 3, Enchantments.UNBREAKING, 2, Enchantments.MENDING, 1));
        menu.getSlot(HexingTableMenu.ELIXIR_SLOT).set(new ItemStack(WWItems.SOUL_ELIXIR, 2));
        h.assertTrue(menu.problem(Hexing.Kind.LESSER) == Hexing.OK, "lesser hex should be ready, problem " + menu.problem(Hexing.Kind.LESSER));
        h.assertTrue(menu.clickMenuButton(p, 0), "the lesser hex should go through");

        ItemStack out = menu.getSlot(HexingTableMenu.BOOK_SLOT).getItem();
        h.assertTrue(out.is(WWItems.HEXED_BOOK), "the book should come out hexed, got " + out);
        ItemEnchantments e = out.get(DataComponents.STORED_ENCHANTMENTS);
        h.assertTrue(e.getLevel(ench(h, Enchantments.SHARPNESS)) == 4, "Sharpness III -> IV");
        h.assertTrue(e.getLevel(ench(h, Enchantments.UNBREAKING)) == 3, "Unbreaking II -> III");
        h.assertTrue(e.getLevel(ench(h, Enchantments.MENDING)) == 1, "Mending (max I) doesn't upgrade");
        long curses = e.keySet().stream().filter(Hexing::isLesserCurse).count();
        h.assertTrue(curses == 1, "exactly one lesser curse expected, got " + e);
        Holder<Enchantment> curse = e.keySet().stream().filter(Hexing::isLesserCurse).findFirst().orElseThrow();
        h.assertTrue(curse.value().isSupportedItem(new ItemStack(Items.DIAMOND_SWORD)) || curse.value().isSupportedItem(new ItemStack(Items.DIAMOND_AXE)),
                "the curse must go where the book goes (a sword or an axe), got " + curse);
        h.assertTrue(out.getOrDefault(HexComponents.HEX, HexComponents.HexInfo.NONE).tier() == HexComponents.LESSER, "a lesser hex");
        h.assertTrue(EnchantmentHelper.getEnchantmentsForCrafting(out).size() == e.size(), "anvils read a hexed book's enchantments");

        h.assertTrue(menu.getSlot(HexingTableMenu.ELIXIR_SLOT).getItem().getCount() == 1, "costs 1 Soul Elixir");
        h.assertTrue(((SoulTankBlockEntity) h.getBlockEntity(TANK)).souls() == 400, "costs 100 souls");
        MobEffectInstance hexed = p.getEffect(WWEffects.HEXED);
        h.assertTrue(hexed != null && hexed.getDuration() == 5 * 60 * 20, "hexed for 5 minutes, got " + hexed);
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void lesserHexToSixIsHexedLonger(GameTestHelper h) {
        ServerPlayer p = survivor(h);
        HexingTableMenu menu = table(h, p, 100);
        menu.getSlot(HexingTableMenu.BOOK_SLOT).set(book(h, Enchantments.EFFICIENCY, 5));
        menu.getSlot(HexingTableMenu.ELIXIR_SLOT).set(new ItemStack(WWItems.SOUL_ELIXIR, 1));
        h.assertTrue(menu.clickMenuButton(p, 0), "the lesser hex should go through");
        ItemEnchantments e = menu.getSlot(HexingTableMenu.BOOK_SLOT).getItem().get(DataComponents.STORED_ENCHANTMENTS);
        h.assertTrue(e.getLevel(ench(h, Enchantments.EFFICIENCY)) == 6, "Efficiency V -> VI");
        h.assertTrue(e.keySet().stream().filter(Hexing::isLesserCurse).allMatch(c -> c.value().isSupportedItem(new ItemStack(Items.IRON_PICKAXE))),
                "a tool book gets a curse tools can carry, got " + e);
        h.assertTrue(p.getEffect(WWEffects.HEXED).getDuration() == 10 * 60 * 20, "VI means 10 minutes of hexed");
        h.assertTrue(menu.getSlot(HexingTableMenu.ELIXIR_SLOT).getItem().isEmpty(), "the elixir is used up");
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void sinHexTurnsFireAspectIntoWrath(GameTestHelper h) {
        ServerPlayer p = survivor(h);
        HexingTableMenu menu = table(h, p, 1000);
        menu.getSlot(HexingTableMenu.BOOK_SLOT).set(book(h, Enchantments.FIRE_ASPECT, 2, Enchantments.SHARPNESS, 2));
        menu.getSlot(HexingTableMenu.ELIXIR_SLOT).set(new ItemStack(WWItems.SOUL_ELIXIR, 2));
        h.assertTrue(menu.problem(Hexing.Kind.SIN) == Hexing.NO_ELIXIR, "a sin hex needs 3 Soul Elixir, problem " + menu.problem(Hexing.Kind.SIN));
        h.assertTrue(!menu.clickMenuButton(p, 1), "two elixirs are not enough");
        menu.getSlot(HexingTableMenu.ELIXIR_SLOT).set(new ItemStack(WWItems.SOUL_ELIXIR, 4));
        menu.getSlot(HexingTableMenu.BLOOD_SLOT).set(blood(1));   // a sin hex always takes one Potion of Blood
        h.assertTrue(menu.clickMenuButton(p, 1), "the sin hex should go through");

        ItemStack out = menu.getSlot(HexingTableMenu.BOOK_SLOT).getItem();
        ItemEnchantments e = out.get(DataComponents.STORED_ENCHANTMENTS);
        h.assertTrue(e.getLevel(ench(h, WWEnchantments.WRATH)) >= 1, "Fire Aspect should become Wrath, got " + e);
        h.assertTrue(e.getLevel(ench(h, Enchantments.FIRE_ASPECT)) == 0, "Fire Aspect is gone");
        h.assertTrue(e.getLevel(ench(h, Enchantments.SHARPNESS)) == 2, "the rest of the book is untouched");
        h.assertTrue(out.get(HexComponents.HEX).tier() == HexComponents.SIN, "a sin hex");
        h.assertTrue(menu.getSlot(HexingTableMenu.ELIXIR_SLOT).getItem().getCount() == 1, "costs 3 Soul Elixir");
        h.assertTrue(((SoulTankBlockEntity) h.getBlockEntity(TANK)).souls() == 700, "costs 300 souls");
        h.assertTrue(p.getEffect(WWEffects.HEXED).getDuration() == 20 * 60 * 20, "hexed for 20 minutes");
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void tableRefusesWithoutATank(GameTestHelper h) {
        ServerPlayer p = survivor(h);
        HexingTableMenu menu = table(h, p, -1);
        ItemStack b = book(h, Enchantments.SHARPNESS, 3);
        menu.getSlot(HexingTableMenu.BOOK_SLOT).set(b);
        menu.getSlot(HexingTableMenu.ELIXIR_SLOT).set(new ItemStack(WWItems.SOUL_ELIXIR, 3));
        h.assertTrue(menu.problem(Hexing.Kind.LESSER) == Hexing.NO_TANK, "no tank: problem " + menu.problem(Hexing.Kind.LESSER));
        h.assertTrue(!menu.clickMenuButton(p, 0), "no hex without a Soul Tank");
        h.assertTrue(menu.getSlot(HexingTableMenu.BOOK_SLOT).getItem().is(Items.ENCHANTED_BOOK), "the book is untouched");
        h.assertTrue(menu.getSlot(HexingTableMenu.ELIXIR_SLOT).getItem().getCount() == 3, "the elixir is untouched");
        h.assertTrue(!p.hasEffect(WWEffects.HEXED), "not hexed");
        // a tank too far away doesn't count either
        h.setBlock(new BlockPos(6, 1, 1), WWBlocks.SOUL_TANK);
        ((SoulTankBlockEntity) h.getBlockEntity(new BlockPos(6, 1, 1))).setSouls(1000);
        h.assertTrue(!menu.clickMenuButton(p, 0), "a tank 5 blocks away is out of reach");
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void hexedBlocksFoodRegeneration(GameTestHelper h) {
        ServerPlayer p = survivor(h);
        p.setHealth(10f);
        p.getFoodData().eat(20, 1.0f);
        p.addEffect(new MobEffectInstance(WWEffects.HEXED, 6000));
        for (int i = 0; i < 200; i++) {
            p.getFoodData().tick(p);
        }
        h.assertTrue(p.getHealth() == 10f, "hexed: no natural regeneration, health " + p.getHealth());
        MobEffects.HEAL.value().applyInstantenousEffect(null, null, p, 0, 1.0);
        h.assertTrue(p.getHealth() > 10f, "potions still heal, health " + p.getHealth());
        float healed = p.getHealth();
        p.removeEffect(WWEffects.HEXED);
        for (int i = 0; i < 200; i++) {
            p.getFoodData().tick(p);
        }
        h.assertTrue(p.getHealth() > healed, "without hexed food heals again, health " + p.getHealth());
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void anvilKeepsHexedLevelSix(GameTestHelper h) {
        ServerPlayer p = survivor(h);
        p.experienceLevel = 100;
        h.setBlock(TABLE, Blocks.ANVIL);
        AnvilMenu anvil = new AnvilMenu(2, p.getInventory(), ContainerLevelAccess.create(h.getLevel(), h.absolutePos(TABLE)));
        ItemStack sword = new ItemStack(Items.DIAMOND_SWORD);
        sword.enchant(ench(h, Enchantments.SHARPNESS), 5);
        ItemStack hexed = Hexing.hexedBook(ItemStack.EMPTY, book(h, Enchantments.SHARPNESS, 6).get(DataComponents.STORED_ENCHANTMENTS),
                Hexing.Kind.LESSER, java.util.Optional.empty());
        anvil.getSlot(0).set(sword);
        anvil.getSlot(1).set(hexed);
        anvil.createResult();
        ItemStack out = anvil.getSlot(2).getItem();
        h.assertTrue(out.is(Items.DIAMOND_SWORD), "the anvil should combine them, got " + out);
        h.assertTrue(EnchantmentHelper.getItemEnchantmentLevel(ench(h, Enchantments.SHARPNESS), out) == 6,
                "Sharpness VI should survive the anvil, got " + out.get(DataComponents.ENCHANTMENTS));
        // two vanilla maxima still don't go past V
        ItemStack sword2 = new ItemStack(Items.DIAMOND_SWORD);
        sword2.enchant(ench(h, Enchantments.SHARPNESS), 5);
        anvil.getSlot(1).set(book(h, Enchantments.SHARPNESS, 5));
        anvil.getSlot(0).set(sword2);
        anvil.createResult();
        int lvl = EnchantmentHelper.getItemEnchantmentLevel(ench(h, Enchantments.SHARPNESS), anvil.getSlot(2).getItem());
        h.assertTrue(lvl == 0 || lvl == 5, "V + V stays V, got " + lvl);
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------------ 0.4 fixes: hexes

    private static ItemStack blood(int n) {
        ItemStack b = AmberFeature.bloodPotion(Items.POTION);
        b.setCount(n);
        return b;
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void hexingWithBloodSparesYou(GameTestHelper h) {
        ServerPlayer p = survivor(h);
        HexingTableMenu menu = table(h, p, 1000);
        // the blood slot takes up to three Potions of Blood, and nothing else
        h.assertTrue(!menu.getSlot(HexingTableMenu.BLOOD_SLOT).mayPlace(new ItemStack(Items.GLASS_BOTTLE)), "only blood in the blood slot");
        h.assertTrue(!menu.getSlot(HexingTableMenu.BLOOD_SLOT).mayPlace(AmberFeature.bloodPotion(Items.SPLASH_POTION)),
                "drinkable Potions of Blood only");
        h.assertTrue(menu.getSlot(HexingTableMenu.BLOOD_SLOT).getMaxStackSize(blood(1)) == HexingTableMenu.BLOOD_MAX, "it holds three");
        // a lesser hex with 1 Potion of Blood: the blood instead of you
        menu.getSlot(HexingTableMenu.BOOK_SLOT).set(book(h, Enchantments.SHARPNESS, 3));
        menu.getSlot(HexingTableMenu.ELIXIR_SLOT).set(new ItemStack(WWItems.SOUL_ELIXIR, 1));
        menu.getSlot(HexingTableMenu.BLOOD_SLOT).set(blood(1));
        h.assertTrue(menu.spares(Hexing.Kind.LESSER), "one Potion of Blood spares you a lesser hex");
        h.assertTrue(menu.clickMenuButton(p, 0), "the lesser hex should go through");
        h.assertTrue(menu.getSlot(HexingTableMenu.BOOK_SLOT).getItem().is(WWItems.HEXED_BOOK), "the book is hexed");
        h.assertTrue(!p.hasEffect(WWEffects.HEXED), "the blood was taken instead of you: not Hexed");
        h.assertTrue(menu.getSlot(HexingTableMenu.BLOOD_SLOT).getItem().isEmpty(), "the Potion of Blood is used up");
        // the same without blood: Hexed, as before
        menu.getSlot(HexingTableMenu.BOOK_SLOT).set(book(h, Enchantments.SHARPNESS, 3));
        menu.getSlot(HexingTableMenu.ELIXIR_SLOT).set(new ItemStack(WWItems.SOUL_ELIXIR, 1));
        h.assertTrue(menu.clickMenuButton(p, 0), "a lesser hex needs no blood");
        h.assertTrue(p.hasEffect(WWEffects.HEXED), "without blood you are Hexed");
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void sinHexNeedsBlood(GameTestHelper h) {
        ServerPlayer p = survivor(h);
        HexingTableMenu menu = table(h, p, 1000);
        menu.getSlot(HexingTableMenu.BOOK_SLOT).set(book(h, Enchantments.FIRE_ASPECT, 2));
        menu.getSlot(HexingTableMenu.ELIXIR_SLOT).set(new ItemStack(WWItems.SOUL_ELIXIR, 9));
        h.assertTrue(menu.problem(Hexing.Kind.SIN) == Hexing.NO_BLOOD, "a sin hex needs blood, problem " + menu.problem(Hexing.Kind.SIN));
        h.assertTrue(!menu.clickMenuButton(p, 1), "no sin hex without blood");
        h.assertTrue(menu.getSlot(HexingTableMenu.BOOK_SLOT).getItem().is(Items.ENCHANTED_BOOK), "the book is untouched");
        // 1 Potion of Blood: the sin hex happens, and you are Hexed
        menu.getSlot(HexingTableMenu.BLOOD_SLOT).set(blood(1));
        h.assertTrue(menu.problem(Hexing.Kind.SIN) == Hexing.OK && !menu.spares(Hexing.Kind.SIN), "1 blood: possible, but not spared");
        h.assertTrue(menu.clickMenuButton(p, 1), "the sin hex should go through with 1 blood");
        h.assertTrue(p.getEffect(WWEffects.HEXED) != null && p.getEffect(WWEffects.HEXED).getDuration() == 20 * 60 * 20, "Hexed for 20 minutes");
        h.assertTrue(menu.getSlot(HexingTableMenu.BLOOD_SLOT).getItem().isEmpty(), "the blood is used");
        // 3 Potions of Blood: all taken, instead of you
        p.removeEffect(WWEffects.HEXED);
        menu.getSlot(HexingTableMenu.BOOK_SLOT).set(book(h, Enchantments.FIRE_ASPECT, 2));
        menu.getSlot(HexingTableMenu.BLOOD_SLOT).set(blood(3));
        h.assertTrue(menu.spares(Hexing.Kind.SIN), "3 Potions of Blood spare you a sin hex");
        h.assertTrue(menu.clickMenuButton(p, 1), "the sin hex should go through with 3 blood");
        h.assertTrue(!p.hasEffect(WWEffects.HEXED), "spared: not Hexed");
        h.assertTrue(menu.getSlot(HexingTableMenu.BLOOD_SLOT).getItem().isEmpty(), "all three are used");
        h.assertTrue(menu.getSlot(HexingTableMenu.BOOK_SLOT).getItem().get(DataComponents.STORED_ENCHANTMENTS)
                .getLevel(ench(h, WWEnchantments.WRATH)) >= 1, "and the book holds Wrath");
        h.succeed();
    }

    private static ItemStack potion(net.minecraft.world.item.Item form, Holder<Potion> potion) {
        return PotionContents.createItemStack(form, potion);
    }

    private static void mixes(GameTestHelper h, PotionBrewing brewing, Holder<Potion> from, net.minecraft.world.item.Item ingredient,
                              Holder<Potion> to) {
        h.assertTrue(brewing.isIngredient(new ItemStack(ingredient)), ingredient + " should be a brewing ingredient");
        for (net.minecraft.world.item.Item form : new net.minecraft.world.item.Item[]{Items.POTION, Items.SPLASH_POTION, Items.LINGERING_POTION}) {
            ItemStack out = brewing.mix(new ItemStack(ingredient), potion(form, from));
            PotionContents pc = out.get(DataComponents.POTION_CONTENTS);
            h.assertTrue(out.is(form) && pc != null && pc.is(to), from.getRegisteredName() + " + " + ingredient + " in " + form
                    + " should brew " + to.getRegisteredName() + ", got " + out + " " + pc);
        }
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void everyBrewingRecipe(GameTestHelper h) {
        PotionBrewing b = h.getLevel().potionBrewing();
        mixes(h, b, Potions.AWKWARD, Items.TORCHFLOWER, WWEffects.BURNING_POTION);
        mixes(h, b, WWEffects.BURNING_POTION, Items.REDSTONE, WWEffects.LONG_BURNING_POTION);
        mixes(h, b, WWEffects.BURNING_POTION, Items.GLOWSTONE_DUST, WWEffects.STRONG_BURNING_POTION);
        mixes(h, b, Potions.AWKWARD, WWItems.WITHER_BONE, WWEffects.DECAY_POTION);
        mixes(h, b, WWEffects.DECAY_POTION, Items.REDSTONE, WWEffects.LONG_DECAY_POTION);
        mixes(h, b, WWEffects.DECAY_POTION, Items.GLOWSTONE_DUST, WWEffects.STRONG_DECAY_POTION);
        mixes(h, b, WWEffects.BLOOD_POTION, Items.FERMENTED_SPIDER_EYE, Potions.HARMING);
        mixes(h, b, WWEffects.BLOOD_POTION, Items.GHAST_TEAR, Potions.REGENERATION);
        mixes(h, b, Potions.HARMING, Items.GLOWSTONE_DUST, Potions.STRONG_HARMING);   // and on as usual
        mixes(h, b, Potions.REGENERATION, Items.REDSTONE, Potions.LONG_REGENERATION);
        mixes(h, b, Potions.WATER, Items.FERMENTED_SPIDER_EYE, Potions.WEAKNESS);   // vanilla's stay
        mixes(h, b, WWEffects.BLOOD_POTION, Items.TORCHFLOWER, WWEffects.IMMUNITY_POTION);
        mixes(h, b, WWEffects.IMMUNITY_POTION, Items.REDSTONE, WWEffects.LONG_IMMUNITY_POTION);
        mixes(h, b, Potions.AWKWARD, WWItems.ICEBREAKER_HORN, WWEffects.RAMMING_POTION);
        mixes(h, b, WWEffects.RAMMING_POTION, Items.REDSTONE, WWEffects.LONG_RAMMING_POTION);
        mixes(h, b, WWEffects.RAMMING_POTION, Items.GLOWSTONE_DUST, WWEffects.STRONG_RAMMING_POTION);
        // Decay is the Wither effect: 0:40, long 1:30, strong II 0:20
        var decay = WWEffects.DECAY_POTION.value().getEffects().get(0);
        h.assertTrue(decay.getEffect().is(MobEffects.WITHER) && decay.getDuration() == 800, "Decay is 0:40 of Wither");
        h.assertTrue(WWEffects.LONG_DECAY_POTION.value().getEffects().get(0).getDuration() == 1800, "long Decay is 1:30");
        var strong = WWEffects.STRONG_DECAY_POTION.value().getEffects().get(0);
        h.assertTrue(strong.getAmplifier() == 1 && strong.getDuration() == 400, "strong Decay is Wither II for 0:20");
        h.assertTrue(WWEffects.BURNING_POTION.value().getEffects().get(0).getDuration() == 3600, "Burning lasts 3:00");
        // every mod potion: splash with gunpowder, lingering with dragon's breath, tipped arrows from lingering
        var recipes = h.getLevel().getRecipeManager();
        for (List<Holder<Potion>> family : PotionFeature.families()) {
            for (Holder<Potion> p : family) {
                ItemStack splash = b.mix(new ItemStack(Items.GUNPOWDER), potion(Items.POTION, p));
                h.assertTrue(splash.is(Items.SPLASH_POTION) && splash.get(DataComponents.POTION_CONTENTS).is(p), p.getRegisteredName() + " splashes");
                ItemStack lingering = b.mix(new ItemStack(Items.DRAGON_BREATH), splash);
                h.assertTrue(lingering.is(Items.LINGERING_POTION) && lingering.get(DataComponents.POTION_CONTENTS).is(p),
                        p.getRegisteredName() + " lingers");
                List<ItemStack> grid = new java.util.ArrayList<>();
                for (int i = 0; i < 9; i++) {
                    grid.add(i == 4 ? lingering : new ItemStack(Items.ARROW));
                }
                CraftingInput input = CraftingInput.of(3, 3, grid);
                ItemStack arrows = recipes.getRecipeFor(RecipeType.CRAFTING, input, h.getLevel())
                        .map(r -> r.value().assemble(input, h.getLevel().registryAccess())).orElse(ItemStack.EMPTY);
                h.assertTrue(arrows.is(Items.TIPPED_ARROW) && arrows.getCount() == 8 && arrows.get(DataComponents.POTION_CONTENTS).is(p),
                        p.getRegisteredName() + " tips 8 arrows, got " + arrows);
            }
        }
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void everyPotionFormIsInTheCreativeTabs(GameTestHelper h) {
        var params = new net.minecraft.world.item.CreativeModeTab.ItemDisplayParameters(h.getLevel().enabledFeatures(), true,
                h.getLevel().registryAccess());
        List<ItemStack> shown = new java.util.ArrayList<>();
        for (var tab : new net.minecraft.world.item.CreativeModeTab[]{WWItems.TAB, dev.lowpix.winterworks.registry.EndItems.TAB}) {
            tab.buildContents(params);
            shown.addAll(tab.getDisplayItems());
        }
        for (List<Holder<Potion>> family : PotionFeature.families()) {
            for (ItemStack want : PotionFeature.stacks(family)) {
                h.assertTrue(shown.stream().anyMatch(s -> ItemStack.isSameItemSameComponents(s, want)), want + " "
                        + want.get(DataComponents.POTION_CONTENTS).potion().map(Holder::getRegisteredName).orElse("?")
                        + " should be in the mod's creative tabs");
            }
        }
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 200)
    public void burningKeepsBurningInWater(GameTestHelper h) {
        for (int x = 0; x < 5; x++) {
            for (int z = 0; z < 5; z++) {
                h.setBlock(new BlockPos(x, 0, z), Blocks.STONE);
                h.setBlock(new BlockPos(x, 1, z), Blocks.WATER);
                h.setBlock(new BlockPos(x, 2, z), Blocks.WATER);
            }
        }
        Pig pig = h.spawn(EntityType.PIG, new BlockPos(2, 1, 2));
        pig.setNoAi(true);
        Pig wet = h.spawn(EntityType.PIG, new BlockPos(3, 1, 3));
        wet.setNoAi(true);
        pig.addEffect(new MobEffectInstance(WWEffects.BURNING, 100));
        wet.setRemainingFireTicks(100);   // ordinary fire, for comparison
        h.runAfterDelay(40, () -> {
            h.assertTrue(pig.isInWater(), "the pig is in the water");
            h.assertTrue(pig.getRemainingFireTicks() > 0, "Burning: the water doesn't put it out");
            h.assertTrue(pig.getHealth() < pig.getMaxHealth(), "and it burns, health " + pig.getHealth());
            h.assertTrue(wet.getRemainingFireTicks() <= 0, "ordinary fire goes out in water");
        });
        h.runAfterDelay(110, () -> {
            h.assertTrue(!pig.hasEffect(WWEffects.BURNING), "the potion has worn off");
            h.assertTrue(pig.getRemainingFireTicks() <= 0, "and now the water puts the fire out, " + pig.getRemainingFireTicks());
            h.succeed();
        });
    }
}
