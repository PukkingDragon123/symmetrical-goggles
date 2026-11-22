package dev.lowpix.winterworks.test;

import com.mojang.authlib.GameProfile;
import dev.lowpix.winterworks.curse.Curse;
import dev.lowpix.winterworks.curse.Curses;
import dev.lowpix.winterworks.curse.LesserCurses;
import dev.lowpix.winterworks.curse.LustSpawns;
import dev.lowpix.winterworks.curse.Sins;
import dev.lowpix.winterworks.curse.SoulFirePayload;
import dev.lowpix.winterworks.hex.CurseTooltips;
import dev.lowpix.winterworks.hex.CursedItems;
import dev.lowpix.winterworks.registry.WWEnchantments;
import io.netty.channel.embedded.EmbeddedChannel;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import net.minecraft.locale.Language;
import net.minecraft.network.Connection;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.PacketFlow;
import net.minecraft.network.protocol.common.ClientboundCustomPayloadPacket;
import net.minecraft.network.protocol.game.ClientboundSystemChatPacket;
import net.minecraft.server.network.CommonListenerCookie;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.enchantment.ItemEnchantments;
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

    // ------------------------------------------------------------------------------------------------ 0.4 fixes: hexes

    /** A survival mock player whose connection we can read: outbound packets pile up in the channel. */
    private static ServerPlayer listening(GameTestHelper h, int x, int z, EmbeddedChannel[] channel) {
        CommonListenerCookie cookie = CommonListenerCookie.createInitial(new GameProfile(UUID.randomUUID(), "test-mock-listener"), false);
        ServerPlayer p = new ServerPlayer(h.getLevel().getServer(), h.getLevel(), cookie.gameProfile(), cookie.clientInformation()) {
            @Override
            public boolean isSpectator() {
                return false;
            }
        };
        Connection connection = new Connection(PacketFlow.SERVERBOUND);
        channel[0] = new EmbeddedChannel(connection);
        h.getLevel().getServer().getPlayerList().placeNewPlayer(connection, p, cookie);
        p.setGameMode(GameType.SURVIVAL);
        BlockPos at = h.absolutePos(new BlockPos(x, 1, z));
        p.teleportTo(at.getX() + 0.5, at.getY(), at.getZ() + 0.5);
        return p;
    }

    private static List<Object> sent(EmbeddedChannel channel) {
        channel.flushOutbound();
        List<Object> out = new ArrayList<>();
        for (Object o; (o = channel.readOutbound()) != null; ) {
            out.add(o);
        }
        return out;
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 200)
    public void cursesShowNoTextOnlyTheirScreenEffect(GameTestHelper h) {
        floor(h);
        EmbeddedChannel[] ch = new EmbeddedChannel[1];
        ServerPlayer p = listening(h, 3, 3, ch);
        p.setItemSlot(EquipmentSlot.MAINHAND, enchanted(h, Items.DIAMOND_PICKAXE, WWEnchantments.GREED, 1));
        p.setItemSlot(EquipmentSlot.HEAD, enchanted(h, Items.GOLDEN_HELMET, WWEnchantments.MIDAS, 1));
        p.setItemSlot(EquipmentSlot.FEET, enchanted(h, Items.IRON_BOOTS, WWEnchantments.LOTS_WIFE, 1));
        List<Object> packets = new ArrayList<>();
        h.runAfterDelay(70, () -> {
            sent(ch[0]);   // forget the join packets
            int before = Curses.effects(p);
            Curses.force(p, true);
            p.setItemInHand(InteractionHand.OFF_HAND, new ItemStack(Items.BREAD, 3));
            p.startUsingItem(InteractionHand.OFF_HAND);
            p.drop(new ItemStack(Items.DIAMOND), false, true);   // Greed: it vanishes
            h.assertTrue(Curses.lastEffect(p) == Curse.GREED, "Greed should play its screen effect, got " + Curses.lastEffect(p));
            p.hurt(h.getLevel().damageSources().generic(), 1f);  // fleeing...
            p.setYRot(p.getYRot() + 180f);                         // ...and looking back: Lot's Wife
            h.assertTrue(Curses.effects(p) == before + 1, "one curse, one effect, " + (Curses.effects(p) - before) + " so far");
            packets.addAll(sent(ch[0]));
        });
        h.runAfterDelay(73, () -> {
            Sins.nodOff(p);   // Sloth
            h.assertTrue(Curses.lastEffect(p) == Curse.SLOTH, "Sloth should play its screen effect, got " + Curses.lastEffect(p));
        });
        h.runAfterDelay(76, () -> {
            h.assertTrue(p.getOffhandItem().is(Items.GOLD_NUGGET), "Midas should have struck, hand " + p.getOffhandItem());
            h.assertTrue(Curses.seen(p, Curse.MIDAS), "Midas should have triggered");
            h.assertTrue(Curses.seen(p, Curse.GREED), "Greed should have triggered");
            h.assertTrue(Curses.seen(p, Curse.LOTS_WIFE), "Lot's Wife should have triggered");
            h.assertTrue(Curses.effects(p) >= 4, "four curses, four screen effects, got " + Curses.effects(p));
            packets.addAll(sent(ch[0]));
            h.assertTrue(packets.stream().anyMatch(o -> o instanceof net.minecraft.network.protocol.game.ClientboundSoundPacket),
                    "the curses were heard (so we are reading what the player was sent), packets " + packets.size());
            for (Object packet : packets) {   // (the test framework's own chat lines about other tests may pass by)
                if (packet instanceof ClientboundSystemChatPacket chat) {
                    h.assertFalse(chat.overlay() || chat.content().getContents() instanceof net.minecraft.network.chat.contents.TranslatableContents t
                                    && t.getKey().startsWith("curse."), "a curse must not say anything, but sent: " + chat.content().getString());
                }
            }
            for (Curse c : Curse.ALL) {
                for (String suffix : new String[]{".trigger", ".warn", ".vanish"}) {
                    h.assertFalse(Language.getInstance().has("curse.winterworks." + c.id() + suffix),
                            "no curse text should remain: curse.winterworks." + c.id() + suffix);
                }
                h.assertTrue(Curses.effectTicks(c) >= 60 && Curses.effectTicks(c) <= 120,
                        c.id() + "'s screen effect should last a few seconds, " + Curses.effectTicks(c) + " ticks");
            }
            done(h, p);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void curseTooltipsAreJustTheName(GameTestHelper h) {
        Registry<Enchantment> reg = h.getLevel().registryAccess().registryOrThrow(Registries.ENCHANTMENT);
        h.assertTrue(Language.getInstance().has("enchantment.winterworks.narcissus"), "the curse names are in the server's language");
        List<ResourceKey<Enchantment>> keys = new ArrayList<>();
        for (Curse c : Curse.ALL) {
            keys.add(c.key);
        }
        keys.add(Enchantments.BINDING_CURSE);
        keys.add(Enchantments.VANISHING_CURSE);
        for (ResourceKey<Enchantment> k : keys) {
            Holder<Enchantment> curse = reg.getHolderOrThrow(k);
            String name = Enchantment.getFullname(curse, 1).getString();
            ItemStack sword = new ItemStack(Items.DIAMOND_SWORD);
            sword.enchant(curse, 1);
            ItemStack book = new ItemStack(Items.ENCHANTED_BOOK);
            ItemEnchantments.Mutable m = new ItemEnchantments.Mutable(ItemEnchantments.EMPTY);
            m.set(curse, 1);
            book.set(net.minecraft.core.component.DataComponents.STORED_ENCHANTMENTS, m.toImmutable());
            for (ItemStack stack : new ItemStack[]{sword, book}) {
                List<Component> lines = new ArrayList<>(stack.getTooltipLines(Item.TooltipContext.of(h.getLevel()), null, TooltipFlag.NORMAL));
                // a description mod's line, the way they write it: it must come out again
                lines.add(Component.translatable("enchantment." + k.location().getNamespace() + "." + k.location().getPath() + ".desc"));
                int removed = CurseTooltips.nameOnly(lines);
                h.assertTrue(removed == 1, k.location() + ": the description line should come out, removed " + removed);
                long named = lines.stream().filter(l -> l.getString().equals(name)).count();
                h.assertTrue(named == 1, k.location() + " should show just its name once on " + stack + ", lines "
                        + lines.stream().map(Component::getString).toList());
                for (String desc : CurseTooltips.descriptionKeys()) {
                    h.assertFalse(Language.getInstance().has(desc), "no description string should exist: " + desc);
                }
                h.assertTrue(lines.stream().noneMatch(CurseTooltips::isDescription), k.location() + ": no description lines left");
            }
        }
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void cursedBooksAndGearAreKnown(GameTestHelper h) {
        ItemStack binding = new ItemStack(Items.ENCHANTED_BOOK);
        ItemEnchantments.Mutable m = new ItemEnchantments.Mutable(ItemEnchantments.EMPTY);
        m.set(ench(h, Enchantments.BINDING_CURSE), 1);
        m.set(ench(h, Enchantments.SHARPNESS), 2);
        binding.set(net.minecraft.core.component.DataComponents.STORED_ENCHANTMENTS, m.toImmutable());
        ItemStack sin = new ItemStack(Items.ENCHANTED_BOOK);
        ItemEnchantments.Mutable s = new ItemEnchantments.Mutable(ItemEnchantments.EMPTY);
        s.set(ench(h, WWEnchantments.WRATH), 1);
        sin.set(net.minecraft.core.component.DataComponents.STORED_ENCHANTMENTS, s.toImmutable());
        ItemStack plain = new ItemStack(Items.ENCHANTED_BOOK);
        ItemEnchantments.Mutable p = new ItemEnchantments.Mutable(ItemEnchantments.EMPTY);
        p.set(ench(h, Enchantments.SHARPNESS), 2);
        plain.set(net.minecraft.core.component.DataComponents.STORED_ENCHANTMENTS, p.toImmutable());
        h.assertTrue(CursedItems.tier(binding) == CursedItems.CURSE, "a book of Binding is a cursed book");
        h.assertTrue(CursedItems.tier(sin) == CursedItems.SIN, "a book of Wrath is a sin book");
        h.assertTrue(CursedItems.tier(plain) == CursedItems.NONE, "a book of Sharpness is just an enchanted book");
        h.assertTrue(CursedItems.cursed(enchanted(h, Items.IRON_HELMET, WWEnchantments.NARCISSUS, 1)), "cursed gear glints with souls");
        h.assertTrue(CursedItems.cursed(enchanted(h, Items.IRON_SWORD, WWEnchantments.LEECH, 1)), "hidden curses too");
        h.assertFalse(CursedItems.cursed(enchanted(h, Items.IRON_SWORD, Enchantments.SHARPNESS, 1)), "plain gear keeps its purple glint");
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 260)
    public void soulFireSyncsAndBurnsItsFullTime(GameTestHelper h) {
        floor(h);
        EmbeddedChannel[] ch = new EmbeddedChannel[1];
        ServerPlayer viewer = listening(h, 1, 1, ch);
        Pig pig = h.spawn(EntityType.PIG, new BlockPos(4, 1, 4));
        pig.setNoAi(true);
        pig.addEffect(new net.minecraft.world.effect.MobEffectInstance(MobEffects.FIRE_RESISTANCE, 1200));
        int[] sentBefore = new int[1];
        h.runAfterDelay(5, () -> {   // by now the viewer tracks the pig
            sent(ch[0]);
            sentBefore[0] = SoulFirePayload.sentCount();
            Curses.soulIgnite(pig, 160);
            h.assertTrue(Curses.soulBurning(pig), "the pig should burn with soul fire");
            h.assertTrue(SoulFirePayload.sentCount() == sentBefore[0] + 1, "soul fire is synced to clients");
            SoulFirePayload last = SoulFirePayload.lastSent();
            h.assertTrue(last.entity() == pig.getId() && last.ticks() == 160, "the update names the pig and its 8 s, got " + last);
            // a burning player is told too (it draws its own first-person soul flames from this)
            viewer.addEffect(new net.minecraft.world.effect.MobEffectInstance(MobEffects.FIRE_RESISTANCE, 1200));
            Curses.soulIgnite(viewer, 40);
            boolean told = sent(ch[0]).stream().anyMatch(o -> o instanceof ClientboundCustomPayloadPacket pk
                    && pk.payload() instanceof SoulFirePayload sf && sf.entity() == viewer.getId() && sf.ticks() == 40);
            h.assertTrue(told, "a player set alight with soul fire is sent the soul fire update");
            var codec = SoulFirePayload.CODEC;
            var buf = new net.minecraft.network.RegistryFriendlyByteBuf(io.netty.buffer.Unpooled.buffer(), h.getLevel().registryAccess());
            codec.encode(buf, last);
            h.assertTrue(codec.decode(buf).equals(last), "the soul fire payload survives the wire");
        });
        h.runAfterDelay(30, () -> pig.setRemainingFireTicks(3));   // something cuts the fire short...
        h.runAfterDelay(40, () -> {
            h.assertTrue(Curses.soulBurning(pig) && pig.getRemainingFireTicks() > 100, "...but soul fire burns its full time, "
                    + pig.getRemainingFireTicks() + " ticks left");
        });
        h.runAfterDelay(5 + 150, () -> h.assertTrue(Curses.soulBurning(pig), "still burning after 7.5 s"));
        h.runAfterDelay(5 + 170, () -> {
            h.assertFalse(Curses.soulBurning(pig), "8 s of soul fire, then out");
            SoulFirePayload last = SoulFirePayload.lastSent();
            h.assertTrue(last.entity() == pig.getId() && last.ticks() == 0, "and the clients are told it's out, got " + last);
            h.assertFalse(Curses.soulBurning(viewer), "the player's 2 s of soul fire are long out");
            pig.discard();
            done(h, viewer);
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
