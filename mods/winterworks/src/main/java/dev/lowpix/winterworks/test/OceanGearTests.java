package dev.lowpix.winterworks.test;

import com.mojang.authlib.GameProfile;
import com.mojang.brigadier.tree.CommandNode;
import dev.lowpix.winterworks.ocean.Trust;
import dev.lowpix.winterworks.oceangear.ElderBoss;
import dev.lowpix.winterworks.oceangear.ElderBubble;
import dev.lowpix.winterworks.oceangear.EyeOfTheOceanBlock;
import dev.lowpix.winterworks.oceangear.EyeOfTheOceanBlockEntity;
import dev.lowpix.winterworks.oceangear.LionfishDart;
import dev.lowpix.winterworks.oceangear.LionfishDartItem;
import dev.lowpix.winterworks.oceangear.TrustData;
import dev.lowpix.winterworks.oceangear.TurtleShell;
import dev.lowpix.winterworks.registry.OceanBlocks;
import dev.lowpix.winterworks.registry.OceanItems;
import io.netty.channel.embedded.EmbeddedChannel;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import net.fabricmc.fabric.api.event.player.AttackBlockCallback;
import net.fabricmc.fabric.api.event.player.AttackEntityCallback;
import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.HolderLookup;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.Connection;
import net.minecraft.network.protocol.PacketFlow;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.CommonListenerCookie;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.animal.Pig;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.monster.ElderGuardian;
import net.minecraft.world.entity.monster.Guardian;
import net.minecraft.world.entity.monster.Zombie;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.projectile.AbstractArrow;
import net.minecraft.world.entity.projectile.Arrow;
import net.minecraft.world.item.BowItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.crafting.CraftingInput;
import net.minecraft.world.item.crafting.RecipeType;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * GameTests for Tides & Treasures' gear and boss (docs/OCEAN_UPDATE.md sections 4-6): lionfish darts underwater, the
 * Turtle Shell retreat, guardian scales, the Elder Guardian's bubbles / stare / tail whip / summons / eye, the Eye of
 * the Ocean, and trust. The boss tests each run in a batch of their own (its beam reaches 32 blocks, its aura 50).
 */
public class OceanGearTests implements FabricGameTest {
    /** A 32x20x32 empty structure (data/winterworks/gametest/structure/boss_arena.snbt). */
    private static final String ARENA = "winterworks:boss_arena";
    private static final AtomicInteger NAMES = new AtomicInteger();

    @GameTest(template = EMPTY_STRUCTURE)
    public void registered(GameTestHelper h) {
        h.assertTrue(OceanItems.TURTLE_SHELL_CHESTPLATE != null, "registered");
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------- helpers

    /** A survival player that is not creative (the vanilla mock player always is), with a name of its own. */
    private static ServerPlayer player(GameTestHelper h, Vec3 at, float yaw) {
        ServerLevel level = h.getLevel();
        String name = "gear" + NAMES.incrementAndGet();
        CommonListenerCookie cookie = CommonListenerCookie.createInitial(new GameProfile(UUID.randomUUID(), name), false);
        ServerPlayer p = new ServerPlayer(level.getServer(), level, cookie.gameProfile(), cookie.clientInformation()) {
            @Override
            public boolean isSpectator() {
                return false;
            }

            @Override
            public boolean isCreative() {
                return false;
            }
        };
        Connection connection = new Connection(PacketFlow.SERVERBOUND);
        new EmbeddedChannel(connection);
        level.getServer().getPlayerList().placeNewPlayer(connection, p, cookie);
        p.setGameMode(GameType.SURVIVAL);
        Vec3 abs = h.absoluteVec(at);
        p.moveTo(abs.x, abs.y, abs.z, yaw, 0f);
        p.yBodyRot = yaw;
        p.yHeadRot = yaw;
        for (int i = 0; i < 61; i++) {   // past a new player's 3 s of spawn invulnerability (mock players only get the light tick)
            p.tick();
        }
        return p;
    }

    private static void leave(ServerPlayer... players) {
        for (ServerPlayer p : players) {
            p.getServer().getPlayerList().remove(p);
        }
    }

    /** Fills the box (relative, inclusive) with `inside`, walled with glass. */
    private static void box(GameTestHelper h, int x0, int y0, int z0, int x1, int y1, int z1, BlockState inside) {
        ServerLevel level = h.getLevel();
        BlockState glass = Blocks.GLASS.defaultBlockState();
        for (int x = x0 - 1; x <= x1 + 1; x++) {
            for (int y = y0 - 1; y <= y1 + 1; y++) {
                for (int z = z0 - 1; z <= z1 + 1; z++) {
                    boolean wall = x < x0 || x > x1 || y < y0 || y > y1 || z < z0 || z > z1;
                    level.setBlock(h.absolutePos(new BlockPos(x, y, z)), wall ? glass : inside, Block.UPDATE_CLIENTS);
                }
            }
        }
    }

    private static void water(GameTestHelper h, int x0, int y0, int z0, int x1, int y1, int z1) {
        box(h, x0, y0, z0, x1, y1, z1, Blocks.WATER.defaultBlockState());
    }

    private static void wearShell(ServerPlayer p) {
        p.setItemSlot(EquipmentSlot.HEAD, new ItemStack(Items.TURTLE_HELMET));
        p.setItemSlot(EquipmentSlot.CHEST, new ItemStack(OceanItems.TURTLE_SHELL_CHESTPLATE));
        p.setItemSlot(EquipmentSlot.LEGS, new ItemStack(OceanItems.TURTLE_SHELL_LEGGINGS));
        p.setItemSlot(EquipmentSlot.FEET, new ItemStack(OceanItems.TURTLE_SHELL_BOOTS));
    }

    private static ElderGuardian boss(GameTestHelper h, Vec3 at, float yaw, boolean ai) {
        ElderGuardian eg = h.spawn(EntityType.ELDER_GUARDIAN, at);
        eg.setNoAi(!ai);
        eg.setYRot(yaw);
        eg.yBodyRot = yaw;
        eg.yHeadRot = yaw;
        return eg;
    }

    // ------------------------------------------------------------------------------------------- lionfish darts

    /** A bow at full draw (the vanilla path: projectile selection, draw, shoot). */
    private static void loose(ServerPlayer p, Item ammo) {
        ItemStack bow = new ItemStack(Items.BOW);
        p.setItemInHand(InteractionHand.MAIN_HAND, bow);
        p.getInventory().add(new ItemStack(ammo, 8));
        ((BowItem) Items.BOW).releaseUsing(bow, p.level(), p, bow.getUseDuration(p) - 30);
    }

    @GameTest(template = ARENA, timeoutTicks = 200, batch = "oceangear_darts")
    public void dartsFromABowGoFarUnderwaterAndPoison(GameTestHelper h) {
        // three channels of water: a dart, an arrow, a dart at a pig
        water(h, 1, 1, 1, 3, 4, 30);
        water(h, 5, 1, 1, 7, 4, 30);
        water(h, 9, 1, 1, 11, 4, 30);
        ServerPlayer a = player(h, new Vec3(2.5, 1, 1.5), 0f), b = player(h, new Vec3(6.5, 1, 1.5), 0f);
        ServerPlayer c = player(h, new Vec3(10.5, 1, 1.5), 0f);
        h.assertTrue(a.getProjectile(new ItemStack(Items.BOW)).isEmpty(), "no ammo yet");
        a.getInventory().add(new ItemStack(OceanItems.LIONFISH_DART, 2));
        h.assertTrue(a.getProjectile(new ItemStack(Items.BOW)).is(OceanItems.LIONFISH_DART), "a bow takes lionfish darts as ammunition");
        h.assertTrue(a.getProjectile(new ItemStack(Items.CROSSBOW)).is(OceanItems.LIONFISH_DART), "so does a crossbow");
        a.getInventory().clearContent();
        Pig pig = h.spawn(EntityType.PIG, new Vec3(10.5, 2.1, 23.5));
        pig.setNoAi(true);
        pig.setNoGravity(true);
        Vec3 start = a.getEyePosition();
        loose(a, OceanItems.LIONFISH_DART);
        loose(b, Items.ARROW);
        loose(c, OceanItems.LIONFISH_DART);
        AABB area = new AABB(h.absolutePos(BlockPos.ZERO)).expandTowards(32, 20, 32);
        List<LionfishDart> darts = h.getLevel().getEntitiesOfClass(LionfishDart.class, area);
        List<Arrow> arrows = h.getLevel().getEntitiesOfClass(Arrow.class, area);
        h.assertTrue(darts.size() == 2, "the bows loosed lionfish darts (" + darts.size() + ")");
        h.assertTrue(arrows.size() == 1, "and an arrow");
        LionfishDart dart = darts.stream().filter(d -> d.getX() < h.absoluteVec(new Vec3(4, 0, 0)).x).findFirst().orElseThrow();
        Arrow arrow = arrows.get(0);
        h.assertTrue(dart.getBaseDamage() == LionfishDart.BOW_DAMAGE, "a bow dart's damage");
        h.runAfterDelay(7, () -> {
            double far = dart.position().subtract(start).horizontalDistance();
            double arrowFar = arrow.position().subtract(b.getEyePosition()).horizontalDistance();
            h.assertTrue(far > 16, "underwater a dart keeps its speed: " + String.format("%.1f", far) + " blocks in 7 ticks");
            h.assertTrue(Math.abs(dart.getY() - start.y) < 0.6, "and flies straight (no sinking)");
            h.assertTrue(arrowFar < 8, "an arrow stalls underwater (" + String.format("%.1f", arrowFar) + " blocks)");
        });
        h.succeedWhen(() -> {
            MobEffectInstance poison = pig.getEffect(MobEffects.POISON);
            h.assertTrue(poison != null, "the dart that hit the pig poisoned it");
            h.assertTrue(poison.getDuration() > LionfishDart.POISON_TICKS - 40 && poison.getDuration() <= LionfishDart.POISON_TICKS,
                    "for 5 s");
            h.assertTrue(pig.getHealth() < pig.getMaxHealth(), "and hurt it");
            leave(a, b, c);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 60, batch = "oceangear_shell")
    public void dartsThrownByHandAreWeaker(GameTestHelper h) {
        ServerPlayer p = player(h, new Vec3(4, 2, 1), 0f);
        ItemStack darts = new ItemStack(OceanItems.LIONFISH_DART, 5);
        p.setItemInHand(InteractionHand.MAIN_HAND, darts);
        OceanItems.LIONFISH_DART.use(h.getLevel(), p, InteractionHand.MAIN_HAND);
        h.assertTrue(p.getMainHandItem().getCount() == 4, "a throw uses one dart");
        List<LionfishDart> thrown = h.getLevel().getEntitiesOfClass(LionfishDart.class, p.getBoundingBox().inflate(3));
        h.assertTrue(thrown.size() == 1, "and throws it");
        LionfishDart d = thrown.get(0);
        h.assertTrue(d.getBaseDamage() < LionfishDart.BOW_DAMAGE, "weaker than from a bow");
        h.assertTrue(d.getDeltaMovement().length() < LionfishDartItem.THROW_SPEED + 0.1 && d.getDeltaMovement().length() < 3.0,
                "and slower than a full bow (3.0)");
        h.assertTrue(d.pickup == AbstractArrow.Pickup.ALLOWED, "and it can be picked up again");
        h.assertTrue(p.getCooldowns().isOnCooldown(OceanItems.LIONFISH_DART), "a short cooldown between throws");
        d.discard();   // not into the next test along
        leave(p);
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------- the Turtle Shell

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 60, batch = "oceangear_shell")
    public void retreatCutsFrontAndBackDamageAndWearsTheShell(GameTestHelper h) {
        ServerPlayer p = player(h, new Vec3(4, 2, 4), 0f);   // facing +z
        Zombie front = h.spawn(EntityType.ZOMBIE, new Vec3(4, 2, 6.5)), back = h.spawn(EntityType.ZOMBIE, new Vec3(4, 2, 1.5));
        front.setNoAi(true);
        back.setNoAi(true);
        h.assertFalse(TurtleShell.isRetreating(p), "no shell, no retreat");
        p.setShiftKeyDown(true);
        h.assertFalse(TurtleShell.isRetreating(p), "sneaking alone isn't a retreat");
        wearShell(p);
        h.assertTrue(TurtleShell.pieces(p) == 4 && TurtleShell.swimFactor(p) > 1.39f, "four pieces swim 40% faster");
        h.assertTrue(TurtleShell.isRetreating(p), "the full set and sneaking: in the shell");
        ServerLevel level = h.getLevel();
        // the cut itself: 60% from the front, 90% from behind and from above
        h.assertTrue(Math.abs(TurtleShell.shellDamage(p, level.damageSources().mobAttack(front), 10f) - 4f) < 1.0E-4, "front: 60% off");
        h.assertTrue(Math.abs(TurtleShell.shellDamage(p, level.damageSources().mobAttack(back), 10f) - 1f) < 1.0E-4, "back: 90% off");
        front.moveTo(p.getX(), p.getY() + 4, p.getZ() + 0.5);
        h.assertTrue(Math.abs(TurtleShell.shellDamage(p, level.damageSources().mobAttack(front), 10f) - 1f) < 1.0E-4, "above: 90% off");
        front.moveTo(p.getX(), p.getY(), p.getZ() + 2.5, 180f, 0f);
        h.assertTrue(TurtleShell.shellDamage(p, level.damageSources().fall(), 10f) == 10f, "falling isn't stopped by a shell");
        // real hits: front, then back
        ItemStack chest = p.getItemBySlot(EquipmentSlot.CHEST);
        p.setDeltaMovement(Vec3.ZERO);
        float hp = p.getHealth();
        p.hurt(level.damageSources().mobAttack(front), 10f);
        float lostFront = hp - p.getHealth();
        h.assertTrue(p.getDeltaMovement().horizontalDistanceSqr() < 1.0E-8, "no knockback in the shell");
        int worn = chest.getDamageValue();
        h.assertTrue(worn > 0, "a blocked hit wears the carapace");
        p.invulnerableTime = 0;
        hp = p.getHealth();
        p.hurt(level.damageSources().mobAttack(back), 10f);
        float lostBack = hp - p.getHealth();
        h.assertTrue(lostFront > 0 && lostBack > 0, "some gets through either way");
        h.assertTrue(lostFront > lostBack * 2.5f, "far more from the front than the back: " + lostFront + " vs " + lostBack);
        h.assertTrue(chest.getDamageValue() > worn, "and every blocked hit costs durability");
        // no attacking from inside
        h.assertTrue(AttackEntityCallback.EVENT.invoker().interact(p, level, InteractionHand.MAIN_HAND, front, null) == InteractionResult.FAIL,
                "no attacking while retreated");
        h.assertTrue(AttackBlockCallback.EVENT.invoker().interact(p, level, InteractionHand.MAIN_HAND, p.blockPosition().below(), Direction.UP)
                == InteractionResult.FAIL, "or digging");
        // out of the shell: knockback and the full hit again
        p.setShiftKeyDown(false);
        h.assertFalse(TurtleShell.isRetreating(p), "standing up leaves the shell");
        p.invulnerableTime = 0;
        p.setHealth(20f);
        p.setDeltaMovement(Vec3.ZERO);
        p.hurt(level.damageSources().mobAttack(back), 10f);
        h.assertTrue(20f - p.getHealth() > lostFront, "unshelled it hurts more than even a front hit in the shell");
        h.assertTrue(p.getDeltaMovement().horizontalDistanceSqr() > 1.0E-4, "and knocks you back");
        h.assertTrue(AttackEntityCallback.EVENT.invoker().interact(p, level, InteractionHand.MAIN_HAND, front, null) == InteractionResult.PASS,
                "and you can fight again");
        leave(p);
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------- guardian scales

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 60, batch = "oceangear_shell")
    public void guardiansDropScales(GameTestHelper h) {
        List<Guardian> gs = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            Guardian g = h.spawn(EntityType.GUARDIAN, new Vec3(1.5 + i * 1.8, 2, 4));
            g.setNoAi(true);
            gs.add(g);
        }
        for (Guardian g : gs) {
            g.kill();
        }
        h.runAfterDelay(2, () -> {
            int scales = 0;
            for (ItemEntity it : h.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(h.absolutePos(BlockPos.ZERO)).inflate(12))) {
                if (it.getItem().is(OceanItems.GUARDIAN_SCALE)) {
                    scales += it.getItem().getCount();
                }
            }
            h.assertTrue(scales >= 4 && scales <= 12, "4 guardians drop 1-3 scales each: " + scales);
            h.succeed();
        });
    }

    // ------------------------------------------------------------------------------------------- the Elder Guardian boss

    @GameTest(template = ARENA, timeoutTicks = 160, batch = "oceangear_boss_bubbles")
    public void bossBubblesTrapDragAndHurt(GameTestHelper h) {
        water(h, 8, 1, 4, 24, 8, 26);
        ElderGuardian eg = boss(h, new Vec3(16, 3, 8), 0f, false);
        h.assertTrue(eg.getMaxHealth() == ElderBoss.MAX_HEALTH && eg.getHealth() == ElderBoss.MAX_HEALTH, "the boss has 300 health");
        ServerPlayer p = player(h, new Vec3(16, 3, 15.5), 180f);
        double before = p.distanceTo(eg);
        ElderBoss.start(eg, ElderBoss.BUBBLE, p);
        h.runAfterDelay(ElderBoss.BUBBLE_SHOTS[2] + 2, () -> {
            h.assertTrue(ElderBoss.state(eg).bubblesFired == 3, "three bubbles in the barrage (" + ElderBoss.state(eg).bubblesFired + ")");
            h.assertTrue(ElderBoss.state(eg).bar() != null && ElderBoss.state(eg).bar().getPlayers().contains(p), "a boss bar for those near");
        });
        h.succeedWhen(() -> {
            ElderBubble held = null;
            for (ElderBubble b : h.getLevel().getEntitiesOfClass(ElderBubble.class, p.getBoundingBox().inflate(3))) {
                if (b.trappedId() == p.getId()) {
                    held = b;
                }
            }
            h.assertTrue(held != null, "a bubble caught the player");
            h.assertTrue(held.trapTicks() > 12, "and holds them");
            h.assertTrue(p.getHealth() < 20f, "hurting them");
            h.assertTrue(p.distanceTo(eg) < before - 0.6, "dragging them toward the boss");
            leave(p);
        });
    }

    @GameTest(template = ARENA, timeoutTicks = 320, batch = "oceangear_boss_stare")
    public void bossStareHurtsInTheOpenButNotBehindAPillar(GameTestHelper h) {
        water(h, 8, 1, 2, 24, 9, 28);
        ElderGuardian eg = boss(h, new Vec3(16, 3, 6), 0f, false);
        ServerPlayer p = player(h, new Vec3(13.5, 2, 20.5), 180f);
        ElderBoss.start(eg, ElderBoss.STARE, p);
        h.runAfterDelay(ElderBoss.STARE_TELEGRAPH - 2, () -> {
            h.assertTrue(p.getHealth() == 20f, "the 2 s telegraph does no harm");
            h.assertTrue(ElderBoss.attack(eg) == ElderBoss.STARE, "still staring");
        });
        h.runAfterDelay(ElderBoss.STARE_TICKS + 4, () -> {
            h.assertTrue(p.getHealth() < 20f, "in the open the beam burns (" + p.getHealth() + ")");
            h.assertTrue(ElderBoss.state(eg).beamHits > 0, "the beam hit");
            h.assertTrue(ElderBoss.attack(eg) == ElderBoss.IDLE, "and ends");
            // now a pillar between them
            for (int y = 1; y <= 9; y++) {
                for (int x = 12; x <= 16; x++) {
                    h.setBlock(new BlockPos(x, y, 14), Blocks.PRISMARINE_BRICKS);
                }
            }
            p.setHealth(20f);
            p.invulnerableTime = 0;
            ElderBoss.state(eg).beamHits = 0;
            ElderBoss.start(eg, ElderBoss.STARE, p);
        });
        h.runAfterDelay(2L * (ElderBoss.STARE_TICKS + 4), () -> {
            h.assertTrue(p.getHealth() == 20f, "behind a pillar the stare can't reach you (" + p.getHealth() + ")");
            h.assertTrue(ElderBoss.state(eg).beamHits == 0, "no hits through stone");
            leave(p);
            h.succeed();
        });
    }

    @GameTest(template = ARENA, timeoutTicks = 120, batch = "oceangear_boss_whip")
    public void bossTailWhipHitsAndThrowsBackWhatsClose(GameTestHelper h) {
        water(h, 8, 1, 8, 24, 8, 26);
        ElderGuardian eg = boss(h, new Vec3(16, 3, 14), 0f, false);
        ServerPlayer near = player(h, new Vec3(16, 3, 17.5), 180f), far = player(h, new Vec3(16, 3, 24), 180f);
        near.setDeltaMovement(Vec3.ZERO);
        ElderBoss.start(eg, ElderBoss.TAIL_WHIP, near);
        h.runAfterDelay(ElderBoss.WHIP_FROM - 2, () -> h.assertTrue(near.getHealth() == 20f, "the wind-up warns first"));
        h.runAfterDelay(ElderBoss.WHIP_TO + 2, () -> {
            h.assertTrue(near.getHealth() < 20f, "the whip hits what's close");
            Vec3 away = near.position().subtract(eg.position()).multiply(1, 0, 1).normalize();
            Vec3 v = near.getDeltaMovement();
            h.assertTrue(v.x * away.x + v.z * away.z > 0.5, "and throws it back: " + v);
            h.assertTrue(far.getHealth() == 20f, "but not what's 10 blocks off");
            leave(near, far);
            h.succeed();
        });
    }

    @GameTest(template = ARENA, timeoutTicks = 200, batch = "oceangear_boss_summon")
    public void bossSummonsGuardiansOnceAtHalfHealth(GameTestHelper h) {
        water(h, 6, 1, 6, 26, 9, 26);
        ElderGuardian eg = boss(h, new Vec3(16, 4, 16), 0f, true);
        h.assertTrue(eg.getMaxHealth() == ElderBoss.MAX_HEALTH, "a new elder is the boss: 300 health");
        // an elder from an old save (vanilla's 80 health) is raised to the boss's 300 once
        ElderGuardian old = boss(h, new Vec3(10, 4, 10), 0f, false);
        ElderBoss.state(old).upgraded = false;
        old.getAttribute(Attributes.MAX_HEALTH).setBaseValue(80);
        old.setHealth(80);
        h.runAfterDelay(2, () -> h.assertTrue(old.getMaxHealth() == ElderBoss.MAX_HEALTH && old.getHealth() == ElderBoss.MAX_HEALTH,
                "an old elder grows into the boss"));
        AABB area = new AABB(h.absolutePos(BlockPos.ZERO)).expandTowards(32, 20, 32);
        h.runAfterDelay(5, () -> {
            h.assertFalse(ElderBoss.enraged(eg), "not enraged at full health");
            h.assertTrue(h.getLevel().getEntitiesOfClass(Guardian.class, area, g -> !(g instanceof ElderGuardian)).isEmpty(), "no guardians yet");
            eg.setHealth(ElderBoss.MAX_HEALTH * 0.45f);
        });
        h.runAfterDelay(5 + ElderBoss.ROAR_SUMMON + 4, () -> {
            h.assertTrue(ElderBoss.enraged(eg), "enraged under half health");
            h.assertTrue(ElderBoss.state(eg).summoned, "it called for help");
            int n = h.getLevel().getEntitiesOfClass(Guardian.class, area, g -> !(g instanceof ElderGuardian)).size();
            h.assertTrue(n == ElderBoss.SUMMONS, "three guardians came (" + n + ")");
        });
        h.runAfterDelay(5 + ElderBoss.ROAR_TICKS + 6, () -> eg.setHealth(ElderBoss.MAX_HEALTH * 0.2f));
        h.runAfterDelay(5 + ElderBoss.ROAR_TICKS + 60, () -> {
            int n = h.getLevel().getEntitiesOfClass(Guardian.class, area, g -> !(g instanceof ElderGuardian)).size();
            h.assertTrue(n == ElderBoss.SUMMONS, "only once (" + n + ")");
            h.succeed();
        });
    }

    @GameTest(template = ARENA, timeoutTicks = 120, batch = "oceangear_boss_eye")
    public void bossDiesSlowlyAndDropsItsEye(GameTestHelper h) {
        water(h, 10, 1, 10, 22, 7, 22);
        ElderGuardian eg = boss(h, new Vec3(16, 3, 16), 0f, false);
        ServerPlayer p = player(h, new Vec3(16, 3, 22), 180f);
        eg.hurt(h.getLevel().damageSources().playerAttack(p), 1000f);
        h.assertTrue(eg.isDeadOrDying(), "dead");
        AABB area = new AABB(h.absolutePos(BlockPos.ZERO)).expandTowards(32, 20, 32);
        h.runAfterDelay(3, () -> {
            boolean eye = h.getLevel().getEntitiesOfClass(ItemEntity.class, area, it -> it.getItem().is(OceanItems.ELDER_GUARDIAN_EYE)).size() == 1;
            h.assertTrue(eye, "it drops the Elder Guardian Eye");
        });
        h.runAfterDelay(28, () -> h.assertFalse(eg.isRemoved(), "the 2 s death clip plays out (vanilla's would be gone)"));
        h.runAfterDelay(48, () -> {
            h.assertTrue(eg.isRemoved(), "then it's gone");
            leave(p);
            h.succeed();
        });
    }

    // ------------------------------------------------------------------------------------------- the Eye of the Ocean and trust

    private static ItemStack craft(GameTestHelper h, List<ItemStack> grid) {
        return h.getLevel().getRecipeManager().getRecipeFor(RecipeType.CRAFTING, CraftingInput.of(3, 3, grid), h.getLevel())
                .map(r -> r.value().assemble(CraftingInput.of(3, 3, grid), h.getLevel().registryAccess())).orElse(ItemStack.EMPTY);
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 120, batch = "oceangear_eye")
    public void eyeOfTheOceanCraftsGuardsAndEmpowers(GameTestHelper h) {
        ItemStack scale = new ItemStack(OceanItems.GUARDIAN_SCALE), eyeItem = new ItemStack(OceanItems.ELDER_GUARDIAN_EYE);
        List<ItemStack> grid = new ArrayList<>(List.of(scale, scale, scale, scale, eyeItem, scale, scale, scale, scale));
        h.assertTrue(craft(h, grid).is(OceanBlocks.EYE_OF_THE_OCEAN.asItem()), "8 guardian scales round the eye make the Eye of the Ocean");
        grid.set(0, ItemStack.EMPTY);
        h.assertTrue(craft(h, grid).isEmpty(), "it takes all eight");
        ServerPlayer owner = player(h, new Vec3(1.5, 2, 1.5), 0f), friend = player(h, new Vec3(6.5, 2, 6.5), 0f);
        ServerPlayer stranger = player(h, new Vec3(1.5, 2, 6.5), 0f);
        for (int x = 0; x < 8; x++) {
            for (int z = 0; z < 8; z++) {
                h.setBlock(new BlockPos(x, 1, z), Blocks.STONE);
            }
        }
        BlockPos at = new BlockPos(4, 2, 4);
        h.setBlock(at, OceanBlocks.EYE_OF_THE_OCEAN.defaultBlockState().setValue(EyeOfTheOceanBlock.WATERLOGGED, false));
        BlockPos abs = h.absolutePos(at);
        BlockState state = h.getLevel().getBlockState(abs);
        state.getBlock().setPlacedBy(h.getLevel(), abs, state, owner, new ItemStack(OceanBlocks.EYE_OF_THE_OCEAN));
        EyeOfTheOceanBlockEntity eye = (EyeOfTheOceanBlockEntity) h.getLevel().getBlockEntity(abs);
        h.assertTrue(eye != null && owner.getUUID().equals(eye.owner()), "placing it makes you its owner");
        TrustData.get(h.getLevel().getServer()).trust(owner.getUUID(), friend.getUUID(), friend.getGameProfile().getName());
        h.runAfterDelay(EyeOfTheOceanBlockEntity.PULSE + 3, () -> {
            h.assertTrue(owner.hasEffect(MobEffects.CONDUIT_POWER), "Conduit Power for its owner (on land too)");
            h.assertTrue(friend.hasEffect(MobEffects.CONDUIT_POWER), "and for players they trust");
            h.assertFalse(stranger.hasEffect(MobEffects.CONDUIT_POWER), "but not for strangers");
            ServerLevel level = h.getLevel();
            BlockPos dig = h.absolutePos(new BlockPos(2, 1, 6));
            AttackBlockCallback.EVENT.invoker().interact(stranger, level, InteractionHand.MAIN_HAND, dig, Direction.UP);
            MobEffectInstance fatigue = stranger.getEffect(MobEffects.DIG_SLOWDOWN);
            h.assertTrue(fatigue != null && fatigue.getAmplifier() == 2, "a stranger who starts digging there gets Mining Fatigue III");
            AttackBlockCallback.EVENT.invoker().interact(friend, level, InteractionHand.MAIN_HAND, dig, Direction.UP);
            AttackBlockCallback.EVENT.invoker().interact(owner, level, InteractionHand.MAIN_HAND, dig, Direction.UP);
            h.assertFalse(friend.hasEffect(MobEffects.DIG_SLOWDOWN), "the trusted dig freely");
            h.assertFalse(owner.hasEffect(MobEffects.DIG_SLOWDOWN), "and so does the owner");
            TrustData.get(level.getServer()).untrust(owner.getUUID(), friend.getUUID());
            leave(owner, friend, stranger);
            h.succeed();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 40, batch = "oceangear_eye")
    public void turtleShellRecipes(GameTestHelper h) {
        ItemStack s = new ItemStack(OceanItems.TURTLE_SHELL_SHARD), p = new ItemStack(Items.PRISMARINE_SHARD), e = ItemStack.EMPTY;
        h.assertTrue(craft(h, List.of(s, e, s, p, new ItemStack(Items.TURTLE_HELMET), p, s, s, s)).is(OceanItems.TURTLE_SHELL_CHESTPLATE),
                "a Turtle Shell bound with shards and prismarine: the chestplate");
        h.assertTrue(craft(h, List.of(s, p, s, s, e, s, p, e, p)).is(OceanItems.TURTLE_SHELL_LEGGINGS), "the leggings");
        h.assertTrue(craft(h, List.of(s, e, s, p, e, p, e, e, e)).is(OceanItems.TURTLE_SHELL_BOOTS), "the boots");
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 40, batch = "oceangear_eye")
    public void trustCommandsNeedNoOp(GameTestHelper h) throws Exception {
        ServerPlayer a = player(h, new Vec3(2, 2, 2), 0f), b = player(h, new Vec3(5, 2, 5), 0f);
        var server = h.getLevel().getServer();
        CommandSourceStack src = a.createCommandSourceStack().withPermission(0);   // a plain player
        var dispatcher = server.getCommands().getDispatcher();
        CommandNode<CommandSourceStack> root = dispatcher.getRoot().getChild("winterworks");
        h.assertTrue(root.canUse(src) && root.getChild("trust").canUse(src) && root.getChild("untrust").canUse(src),
                "anyone can use /winterworks trust and untrust");
        for (CommandNode<CommandSourceStack> child : root.getChildren()) {
            if (!child.getName().equals("trust") && !child.getName().equals("untrust")) {
                h.assertFalse(child.canUse(src), "the rest of /winterworks still needs op: " + child.getName());
            }
        }
        h.assertFalse(Trust.isTrusted(a.getUUID(), b), "nobody is trusted at first");
        h.assertTrue(Trust.isTrusted(a.getUUID(), a), "but you trust yourself");
        String name = b.getGameProfile().getName();
        h.assertTrue(dispatcher.execute("winterworks trust " + name, src) == 1, "trust");
        h.assertTrue(Trust.isTrusted(a.getUUID(), b), name + " is trusted");
        h.assertFalse(Trust.isTrusted(b.getUUID(), a), "one way only: each player has their own list");
        h.assertTrue(dispatcher.execute("winterworks trust", src) == 1, "the list");
        // saved with the world
        HolderLookup.Provider reg = server.registryAccess();
        TrustData back = TrustData.load(TrustData.get(server).save(new CompoundTag(), reg), reg);
        h.assertTrue(back.trusts(a.getUUID(), b.getUUID()) && back.names(a.getUUID()).contains(name), "the lists save and load");
        h.assertTrue(dispatcher.execute("winterworks untrust " + name, src) == 1, "untrust");
        h.assertFalse(Trust.isTrusted(a.getUUID(), b), name + " is no longer trusted");
        h.assertTrue(dispatcher.execute("winterworks untrust " + name, src) == 0, "untrusting twice does nothing");
        leave(a, b);
        h.succeed();
    }
}
