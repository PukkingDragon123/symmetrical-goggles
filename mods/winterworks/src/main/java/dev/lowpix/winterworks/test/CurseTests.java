package dev.lowpix.winterworks.test;

import dev.lowpix.winterworks.curse.Curse;
import dev.lowpix.winterworks.curse.Curses;
import dev.lowpix.winterworks.curse.LesserCurses;
import dev.lowpix.winterworks.curse.LustSpawns;
import dev.lowpix.winterworks.curse.Sins;
import dev.lowpix.winterworks.registry.WWEnchantments;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.commands.arguments.EntityAnchorArgument;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.EnchantmentTags;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.memory.MemoryModuleType;
import net.minecraft.world.entity.animal.Pig;
import net.minecraft.world.entity.animal.Wolf;
import net.minecraft.world.entity.monster.piglin.Piglin;
import net.minecraft.world.entity.monster.piglin.PiglinAi;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.EnchantmentHelper;
import net.minecraft.world.item.enchantment.Enchantments;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/** GameTests for the curses and sins of Hexes & Havoc (docs/HEXES_UPDATE.md 3-5). ./gradlew runGametest */
public class CurseTests implements FabricGameTest {
    /** Tests whose curses reach out to mobs nearby (Greed, Lust) run in their own batch. */
    private static final String HUNT = "curses_hunt";

    private static Holder<Enchantment> ench(GameTestHelper h, ResourceKey<Enchantment> key) {
        return h.getLevel().registryAccess().registryOrThrow(Registries.ENCHANTMENT).getHolderOrThrow(key);
    }

    private static ItemStack enchanted(GameTestHelper h, Item item, ResourceKey<Enchantment> key, int level) {
        ItemStack s = new ItemStack(item);
        s.enchant(ench(h, key), level);
        return s;
    }

    private static void floor(GameTestHelper h) {
        for (int x = 0; x < 8; x++) {
            for (int z = 0; z < 8; z++) {
                h.setBlock(new BlockPos(x, 0, z), Blocks.STONE);
            }
        }
    }

    /** A survival mock player standing at a spot in the test area. */
    private static ServerPlayer player(GameTestHelper h, int x, int z) {
        ServerPlayer p = h.makeMockServerPlayerInLevel();
        p.setGameMode(GameType.SURVIVAL);
        BlockPos at = h.absolutePos(new BlockPos(x, 1, z));
        p.teleportTo(at.getX() + 0.5, at.getY(), at.getZ() + 0.5);
        return p;
    }

    /** Strip the cursed gear (mock players outlive their test) and pass. */
    private static void done(GameTestHelper h, ServerPlayer... players) {
        for (ServerPlayer p : players) {
            Curses.force(p, false);
            for (EquipmentSlot slot : EquipmentSlot.values()) {
                p.setItemSlot(slot, ItemStack.EMPTY);
            }
        }
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void enchantmentsLoadFromData(GameTestHelper h) {
        Registry<Enchantment> reg = h.getLevel().registryAccess().registryOrThrow(Registries.ENCHANTMENT);
        List<ResourceKey<Enchantment>> curses = new ArrayList<>(WWEnchantments.LESSER);
        curses.addAll(WWEnchantments.HIDDEN);
        for (ResourceKey<Enchantment> k : curses) {
            Holder<Enchantment> e = reg.getHolder(k).orElse(null);
            h.assertTrue(e != null, "curse " + k.location() + " should load from data");
            h.assertTrue(e.is(EnchantmentTags.CURSE), k.location() + " should be a curse");
            h.assertTrue(!e.is(EnchantmentTags.IN_ENCHANTING_TABLE) && !e.is(EnchantmentTags.TRADEABLE)
                    && !e.is(EnchantmentTags.ON_RANDOM_LOOT), k.location() + " only comes from hexing");
            h.assertTrue(Curse.of(e) != null, k.location() + " should map to a Curse");
        }
        for (ResourceKey<Enchantment> k : WWEnchantments.SINS) {
            Holder<Enchantment> e = reg.getHolder(k).orElse(null);
            h.assertTrue(e != null, "sin " + k.location() + " should load from data");
            h.assertTrue(!e.is(EnchantmentTags.IN_ENCHANTING_TABLE) && !e.is(EnchantmentTags.TRADEABLE)
                    && !e.is(EnchantmentTags.ON_TRADED_EQUIPMENT), k.location() + " only comes from hexing");
        }
        // a sin replaces its source: they can't sit on one item together
        String[][] pairs = {{"wrath", "fire_aspect"}, {"greed", "fortune"}, {"greed", "silk_touch"}, {"lust", "looting"},
                {"gluttony", "mending"}, {"sloth", "efficiency"}, {"envy", "thorns"}, {"pride", "protection"},
                {"pride", "blast_protection"}};
        for (String[] pair : pairs) {
            Holder<Enchantment> sin = ench(h, ResourceKey.create(Registries.ENCHANTMENT, dev.lowpix.winterworks.Winterworks.id(pair[0])));
            Holder<Enchantment> src = ench(h, ResourceKey.create(Registries.ENCHANTMENT,
                    net.minecraft.resources.ResourceLocation.withDefaultNamespace(pair[1])));
            h.assertFalse(Enchantment.areCompatible(sin, src), pair[0] + " should exclude " + pair[1]);
        }
        // Greed counts as Fortune +2, Lust as Looting +3
        ItemStack pick = enchanted(h, Items.DIAMOND_PICKAXE, WWEnchantments.GREED, 3);
        h.assertTrue(EnchantmentHelper.getItemEnchantmentLevel(ench(h, Enchantments.FORTUNE), pick) == 5,
                "Greed III should count as Fortune V");
        ItemStack sword = enchanted(h, Items.DIAMOND_SWORD, WWEnchantments.LUST, 2);
        h.assertTrue(EnchantmentHelper.getItemEnchantmentLevel(ench(h, Enchantments.LOOTING), sword) == 5,
                "Lust II should count as Looting V");
        h.assertTrue(EnchantmentHelper.getItemEnchantmentLevel(ench(h, Enchantments.FORTUNE), new ItemStack(Items.DIAMOND_PICKAXE)) == 0,
                "a plain pickaxe has no Fortune");
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = LesserCurses.STARE_TICKS + 120)
    public void narcissusTransfixesAfterStaringAtWater(GameTestHelper h) {
        floor(h);
        h.setBlock(new BlockPos(4, 0, 6), Blocks.WATER);
        ServerPlayer p = player(h, 4, 3);
        p.setItemSlot(EquipmentSlot.HEAD, enchanted(h, Items.IRON_HELMET, WWEnchantments.NARCISSUS, 1));
        BlockPos water = h.absolutePos(new BlockPos(4, 0, 6));
        p.lookAt(EntityAnchorArgument.Anchor.EYES, new Vec3(water.getX() + 0.5, water.getY() + 0.85, water.getZ() + 0.5));
        h.runAfterDelay(20, () -> h.assertTrue(LesserCurses.reflection(p) != null, "the player should see their reflection"));
        h.runAfterDelay(LesserCurses.STARE_TICKS / 2, () -> h.assertFalse(LesserCurses.transfixed(p), "not yet transfixed"));
        h.runAfterDelay(LesserCurses.STARE_TICKS + 15, () -> {
            h.assertTrue(LesserCurses.transfixed(p), "10 s of staring at still water should transfix");
            h.assertTrue(Curses.frozen(p) && p.getAttributeValue(Attributes.MOVEMENT_SPEED) == 0,
                    "a transfixed player can't move, speed " + p.getAttributeValue(Attributes.MOVEMENT_SPEED));
        });
        h.runAfterDelay(LesserCurses.STARE_TICKS + 70, () -> {
            h.assertTrue(p.getHealth() < p.getMaxHealth(), "a transfixed player wastes away, health " + p.getHealth());
            p.hurt(h.getLevel().damageSources().generic(), 3f);   // something else hurts you: the spell breaks
            h.assertFalse(LesserCurses.transfixed(p), "being hurt by something else should break the spell");
            h.assertFalse(Curses.frozen(p), "and free you");
            done(h, p);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void midasTurnsFoodToGold(GameTestHelper h) {
        floor(h);
        ServerPlayer p = player(h, 4, 4);
        p.setItemSlot(EquipmentSlot.HEAD, enchanted(h, Items.GOLDEN_HELMET, WWEnchantments.MIDAS, 1));
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.BREAD, 5));
        Curses.force(p, true);
        p.startUsingItem(InteractionHand.MAIN_HAND);
        h.assertTrue(p.isUsingItem(), "the player should be eating");
        h.runAfterDelay(3, () -> {
            ItemStack hand = p.getMainHandItem();
            h.assertTrue(hand.is(Items.GOLD_NUGGET) && hand.getCount() == 5, "Midas should turn the bread to gold, got " + hand);
            h.assertFalse(p.isUsingItem(), "and stop you eating");
            done(h, p);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 300)
    public void wrathStrengthOnHitSlownessWhenIdle(GameTestHelper h) {
        floor(h);
        ServerPlayer p = player(h, 2, 2);
        p.setItemSlot(EquipmentSlot.MAINHAND, enchanted(h, Items.DIAMOND_SWORD, WWEnchantments.WRATH, 1));
        Pig pig = h.spawn(EntityType.PIG, new BlockPos(3, 1, 2));
        pig.setNoAi(true);
        h.runAfterDelay(5, () -> {
            pig.hurt(p.damageSources().playerAttack(p), 1f);
            h.assertTrue(p.hasEffect(MobEffects.DAMAGE_BOOST), "dealing damage with Wrath should give Strength");
            h.assertTrue(Curses.soulBurning(pig), "Wrath should set the pig alight with soul fire");
            pig.hurt(p.damageSources().playerAttack(p), 1f);
            pig.invulnerableTime = 0;
            pig.hurt(p.damageSources().playerAttack(p), 2f);
            h.assertTrue(Sins.fury(p) >= 2, "Wrath should build with each hit, fury " + Sins.fury(p));
            h.assertFalse(p.hasEffect(MobEffects.MOVEMENT_SLOWDOWN), "no Slowness while fighting");
        });
        h.runAfterDelay(5 + Sins.WRATH_IDLE + 15, () -> {
            h.assertTrue(p.hasEffect(MobEffects.MOVEMENT_SLOWDOWN) && p.hasEffect(MobEffects.WEAKNESS),
                    "5 s without dealing damage should bring Slowness and Weakness");
            h.assertTrue(Sins.fury(p) == 0, "idle Wrath loses its fury");
            done(h, p);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 200)
    public void prideTriplesFallDamage(GameTestHelper h) {
        floor(h);
        ServerPlayer proud = player(h, 2, 2);
        ServerPlayer humble = player(h, 5, 5);
        proud.setItemSlot(EquipmentSlot.FEET, enchanted(h, Items.IRON_BOOTS, WWEnchantments.PRIDE, 1));
        humble.setItemSlot(EquipmentSlot.FEET, new ItemStack(Items.IRON_BOOTS));
        h.runAfterDelay(70, () -> {   // past the spawn invulnerability
            float before = proud.getHealth();
            proud.hurt(proud.damageSources().fall(), 2f);
            humble.hurt(humble.damageSources().fall(), 2f);
            h.assertTrue(Math.abs(before - proud.getHealth() - 6f) < 0.01f, "Pride should triple fall damage, took "
                    + (before - proud.getHealth()));
            h.assertTrue(Math.abs(humble.getMaxHealth() - humble.getHealth() - 2f) < 0.01f, "without Pride a fall hurts as usual");
            var level = h.getLevel();
            h.assertTrue(EnchantmentHelper.getDamageProtection(level, proud, level.damageSources().generic()) > 0,
                    "above half health Pride protects");
            proud.setHealth(proud.getMaxHealth() * 0.4f);
            h.assertTrue(EnchantmentHelper.getDamageProtection(level, proud, level.damageSources().generic()) == 0,
                    "below half health Pride's protection is gone");
            done(h, proud, humble);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = HUNT)
    public void lustDoublesSpawnPressure(GameTestHelper h) {
        floor(h);
        ServerPlayer p = player(h, 4, 4);
        ChunkPos here = new ChunkPos(p.blockPosition());
        ChunkPos far = new ChunkPos(here.x + 20, here.z);
        h.assertTrue(LustSpawns.pressure(h.getLevel(), here) == 1, "no Lust, no extra pressure");
        p.setItemSlot(EquipmentSlot.MAINHAND, enchanted(h, Items.IRON_SWORD, WWEnchantments.LUST, 1));
        h.runAfterDelay(3, () -> {
            h.assertTrue(LustSpawns.pressure(h.getLevel(), here) == 2, "Lust should double the spawn pressure round you");
            h.assertTrue(LustSpawns.pressure(h.getLevel(), far) == 1, "but not 320 blocks away");
            int monsters = MobCategory.MONSTER.getMaxInstancesPerChunk(), animals = MobCategory.CREATURE.getMaxInstancesPerChunk();
            LustSpawns.begin(h.getLevel(), here);
            try {
                h.assertTrue(MobCategory.MONSTER.getMaxInstancesPerChunk() == monsters * 2, "the monster cap doubles near Lust");
                h.assertTrue(MobCategory.CREATURE.getMaxInstancesPerChunk() == animals, "other caps don't");
                h.assertTrue(LustSpawns.attempts(MobCategory.MONSTER) == 2 && LustSpawns.attempts(MobCategory.CREATURE) == 1,
                        "monsters get two spawn attempts");
            } finally {
                LustSpawns.end();
            }
            h.assertTrue(MobCategory.MONSTER.getMaxInstancesPerChunk() == monsters, "the cap is back once the chunk is done");
            p.setItemSlot(EquipmentSlot.MAINHAND, ItemStack.EMPTY);
        });
        h.runAfterDelay(6, () -> {
            h.assertTrue(LustSpawns.pressure(h.getLevel(), here) == 1, "put the sword away and the pressure is gone");
            done(h, p);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = HUNT, timeoutTicks = 200)
    public void greedMakesPiglinsHostile(GameTestHelper h) {
        floor(h);
        ServerPlayer p = player(h, 2, 2);
        p.setItemSlot(EquipmentSlot.HEAD, new ItemStack(Items.GOLDEN_HELMET));
        h.assertTrue(PiglinAi.isWearingGold(p), "a golden helmet is gold");
        p.setItemSlot(EquipmentSlot.MAINHAND, enchanted(h, Items.DIAMOND_PICKAXE, WWEnchantments.GREED, 1));
        Piglin piglin = h.spawn(EntityType.PIGLIN, new BlockPos(5, 1, 5));
        piglin.setImmuneToZombification(true);
        h.runAfterDelay(2, () -> h.assertFalse(PiglinAi.isWearingGold(p), "Greed: piglins ignore your gold"));
        h.runAfterDelay(45, () -> {
            var angry = piglin.getBrain().getMemory(MemoryModuleType.ANGRY_AT);
            h.assertTrue(angry.isPresent() && angry.get().equals(p.getUUID()), "the piglin should hunt the Greed bearer, angry at " + angry);
            piglin.discard();
            done(h, p);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void cainHurtsYourPet(GameTestHelper h) {
        floor(h);
        ServerPlayer p = player(h, 2, 2);
        p.setItemSlot(EquipmentSlot.MAINHAND, enchanted(h, Items.IRON_SWORD, WWEnchantments.CAIN, 1));
        Wolf wolf = h.spawn(EntityType.WOLF, new BlockPos(2, 1, 5));
        wolf.tame(p);
        wolf.setNoAi(true);
        Pig pig = h.spawn(EntityType.PIG, new BlockPos(4, 1, 2));
        pig.setNoAi(true);
        h.runAfterDelay(3, () -> {
            float hp = wolf.getHealth();
            pig.hurt(p.damageSources().playerAttack(p), 4f);
            h.assertTrue(wolf.getHealth() < hp, "Cain: your blow should wound your own wolf, health " + wolf.getHealth() + " of " + hp);
            h.assertTrue(Curses.seen(p, Curse.CAIN), "the hidden curse is discovered when it first triggers");
            done(h, p);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 200)
    public void envyBurnsAttackersAndStealsTheirBuffs(GameTestHelper h) {
        floor(h);
        ServerPlayer p = player(h, 2, 2);
        p.setItemSlot(EquipmentSlot.CHEST, enchanted(h, Items.IRON_CHESTPLATE, WWEnchantments.ENVY, 1));
        Pig pig = h.spawn(EntityType.PIG, new BlockPos(4, 1, 2));
        pig.setNoAi(true);
        pig.addEffect(new net.minecraft.world.effect.MobEffectInstance(MobEffects.MOVEMENT_SPEED, 600));
        h.runAfterDelay(70, () -> {
            float hp = pig.getHealth();
            p.hurt(h.getLevel().damageSources().mobAttack(pig), 2f);
            h.assertTrue(pig.getHealth() < hp, "Envy: the attacker takes the damage back");
            h.assertTrue(Curses.soulBurning(pig), "as soul fire");
            h.assertTrue(!pig.hasEffect(MobEffects.MOVEMENT_SPEED) && p.hasEffect(MobEffects.MOVEMENT_SPEED), "and loses its buffs to you");
            done(h, p);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void gluttonyHungersAndFeeds(GameTestHelper h) {
        floor(h);
        ServerPlayer p = player(h, 2, 2);
        ItemStack chest = enchanted(h, Items.DIAMOND_CHESTPLATE, WWEnchantments.GLUTTONY, 1);
        chest.setDamageValue(100);
        p.setItemSlot(EquipmentSlot.CHEST, chest);
        h.runAfterDelay(1, () -> {
            h.assertTrue(Sins.exhaustion(p, 1f) == 3f, "Gluttony: hunger drains three times as fast");
            h.assertTrue(dev.lowpix.winterworks.curse.CurseHooks.incomingDamage(p, h.getLevel().damageSources().starve(), 1f) == 2f,
                    "and starving hurts twice as much");
            p.eat(h.getLevel(), new ItemStack(Items.BREAD), net.minecraft.world.food.Foods.BREAD);
            int mended = 100 - p.getItemBySlot(EquipmentSlot.CHEST).getDamageValue();
            h.assertTrue(mended == net.minecraft.world.food.Foods.BREAD.nutrition() * Sins.GLUTTONY_REPAIR,
                    "food should mend Gluttony gear, mended " + mended);
            done(h, p);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 200)
    public void lotsWifeTurnsToStone(GameTestHelper h) {
        floor(h);
        ServerPlayer p = player(h, 2, 2);
        p.setItemSlot(EquipmentSlot.FEET, enchanted(h, Items.IRON_BOOTS, WWEnchantments.LOTS_WIFE, 1));
        h.runAfterDelay(70, () -> {
            p.hurt(h.getLevel().damageSources().generic(), 1f);   // fleeing...
            p.setYRot(p.getYRot() + 180f);                         // ...and looking back
        });
        h.runAfterDelay(74, () -> {
            h.assertTrue(Curses.frozen(p), "looking back while fleeing should turn you to stone");
            h.assertTrue(Curses.seen(p, Curse.LOTS_WIFE), "and discover the curse");
        });
        h.runAfterDelay(74 + dev.lowpix.winterworks.curse.HiddenCurses.STONE_TICKS + 4, () -> {
            h.assertFalse(Curses.frozen(p), "the stone wears off after 4 s");
            done(h, p);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void greedMakesThrownItemsVanish(GameTestHelper h) {
        floor(h);
        ServerPlayer greedy = player(h, 2, 2);
        ServerPlayer plain = player(h, 5, 5);
        greedy.setItemSlot(EquipmentSlot.MAINHAND, enchanted(h, Items.IRON_PICKAXE, WWEnchantments.GREED, 1));
        h.runAfterDelay(1, () -> {
            var gone = greedy.drop(new ItemStack(Items.DIAMOND), false, true);
            var kept = plain.drop(new ItemStack(Items.DIAMOND), false, true);
            h.assertTrue(gone != null && gone.isRemoved(), "Greed: a thrown item vanishes");
            h.assertTrue(kept != null && !kept.isRemoved(), "without Greed it stays");
            kept.discard();
            done(h, greedy, plain);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 260)
    public void sisyphusBlocksComeBackHollow(GameTestHelper h) {
        floor(h);
        ServerPlayer p = player(h, 2, 2);
        p.setItemSlot(EquipmentSlot.MAINHAND, enchanted(h, Items.DIAMOND_PICKAXE, WWEnchantments.SISYPHUS, 1));
        BlockPos rock = new BlockPos(5, 1, 5);
        h.setBlock(rock, Blocks.STONE);
        Curses.force(p, true);
        h.runAfterDelay(2, () -> {
            h.assertTrue(p.gameMode.destroyBlock(h.absolutePos(rock)), "the player mines the stone");
            h.assertBlockPresent(Blocks.AIR, rock);
        });
        h.runAfterDelay(2 + 105, () -> {
            h.assertBlockPresent(Blocks.STONE, rock);
            h.assertTrue(LesserCurses.hollow(h.getLevel(), h.absolutePos(rock)), "the stone came back hollow");
            p.gameMode.destroyBlock(h.absolutePos(rock));
            h.assertBlockPresent(Blocks.AIR, rock);
            h.assertFalse(LesserCurses.hollow(h.getLevel(), h.absolutePos(rock)), "a hollow stone crumbles to nothing");
            done(h, p);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void leechHealsTheTarget(GameTestHelper h) {
        floor(h);
        ServerPlayer p = player(h, 2, 2);
        p.setItemSlot(EquipmentSlot.MAINHAND, enchanted(h, Items.IRON_SWORD, WWEnchantments.LEECH, 1));
        Pig pig = h.spawn(EntityType.PIG, new BlockPos(4, 1, 2));
        pig.setNoAi(true);
        pig.setHealth(4f);
        h.runAfterDelay(3, () -> {
            Curses.force(p, true);
            boolean hit = pig.hurt(p.damageSources().playerAttack(p), 3f);
            h.assertFalse(hit, "a leeching hit does no damage");
            h.assertTrue(pig.getHealth() > 6.9f, "Leech: the hit should heal the pig instead, health " + pig.getHealth());
            Curses.force(p, false);
            done(h, p);
        });
    }
}
