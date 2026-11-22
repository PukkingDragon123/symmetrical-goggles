package dev.lowpix.winterworks.test;

import dev.lowpix.winterworks.end.Petrify;
import dev.lowpix.winterworks.endgear.DragonEggs;
import dev.lowpix.winterworks.endgear.Dragonling;
import dev.lowpix.winterworks.endgear.EndGlider;
import dev.lowpix.winterworks.endgear.MonolithWandItem;
import dev.lowpix.winterworks.endgear.ObsidianShieldItem;
import dev.lowpix.winterworks.registry.EndEffects;
import dev.lowpix.winterworks.registry.EndEntities;
import dev.lowpix.winterworks.registry.EndItems;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.Difficulty;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.animal.Chicken;
import net.minecraft.world.entity.animal.IronGolem;
import net.minecraft.world.entity.animal.Pig;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.monster.Zombie;
import net.minecraft.world.entity.monster.warden.Warden;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/**
 * GameTests for the Living End's gear (docs/END_UPDATE.md sections 9, 11-13): petrification, the Monolith Wand, the
 * Obsidian Shield, the End Glider's rules, Dragon Egg cracking and hatching, and the Dragonling. ./gradlew runGametest
 * Mock players don't tick on their own: tests call {@code doTick()} where using an item over time matters.
 */
public class EndGearTests implements FabricGameTest {

    private static void floor(GameTestHelper h) {
        for (int x = 0; x < 8; x++) {
            for (int z = 0; z < 8; z++) {
                h.setBlock(new BlockPos(x, 0, z), Blocks.STONE);
            }
        }
    }

    /** A floor with a glass fence round it, two high. */
    private static void pen(GameTestHelper h) {
        floor(h);
        for (int i = 0; i < 8; i++) {
            for (int y = 1; y <= 2; y++) {
                h.setBlock(new BlockPos(i, y, 0), Blocks.GLASS);
                h.setBlock(new BlockPos(i, y, 7), Blocks.GLASS);
                h.setBlock(new BlockPos(0, y, i), Blocks.GLASS);
                h.setBlock(new BlockPos(7, y, i), Blocks.GLASS);
            }
        }
    }

    /** A mock player at `at` (relative), facing +X. */
    @SuppressWarnings("removal")
    private static ServerPlayer player(GameTestHelper h, Vec3 at) {
        ServerPlayer p = h.makeMockServerPlayerInLevel();
        Vec3 abs = h.absoluteVec(at);
        p.moveTo(abs.x, abs.y, abs.z, -90f, 0f);
        p.setYHeadRot(-90f);
        return p;
    }

    private static void leave(GameTestHelper h, ServerPlayer p) {
        h.getLevel().getServer().getPlayerList().remove(p);
    }

    private static Zombie zombie(GameTestHelper h, BlockPos at) {
        Zombie z = h.spawn(EntityType.ZOMBIE, at);
        z.setPersistenceRequired();
        return z;
    }

    /** What a mob's hit of `amount` does to a player at this difficulty. */
    private static float scaled(GameTestHelper h, float amount) {
        Difficulty d = h.getLevel().getDifficulty();
        return switch (d) {
            case PEACEFUL -> 0f;
            case EASY -> Math.min(amount / 2f + 1f, amount);
            case NORMAL -> amount;
            case HARD -> amount * 1.5f;
        };
    }

    private static Dragonling dragonling(GameTestHelper h, BlockPos at, ServerPlayer owner) {
        Dragonling d = h.spawn(EndEntities.DRAGONLING, at);
        d.setPersistenceRequired();
        if (owner != null) {
            d.tame(owner);
        }
        return d;
    }

    // ------------------------------------------------------------------------------------------------ petrification

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 100)
    public void petrifiedMobIsInvulnerableAndStill(GameTestHelper h) {
        floor(h);
        Zombie z = zombie(h, new BlockPos(2, 1, 2));
        Petrify.freeze(z, 200, true);
        h.assertTrue(Petrify.isFrozen(z) && Petrify.isInvulnerable(z), "the zombie should be frozen in an invulnerable shell");
        h.assertTrue(z.getEffect(EndEffects.PETRIFIED).getAmplifier() == 0, "the wand's shell is amplifier 0");
        Vec3 start = z.position();
        float hp = z.getHealth();
        h.assertFalse(z.hurt(h.getLevel().damageSources().generic(), 8f), "an invulnerable shell takes no damage");
        h.assertTrue(z.getHealth() == hp, "health unchanged, " + z.getHealth());
        z.getNavigation().moveTo(h.absoluteVec(new Vec3(6.5, 1, 6.5)).x, z.getY(), h.absoluteVec(new Vec3(6.5, 1, 6.5)).z, 1.2);
        z.setDeltaMovement(0.4, 0.3, 0.4);   // a push and a hop: both cancelled
        h.runAfterDelay(40, () -> {
            h.assertTrue(z.position().distanceTo(start) < 0.05, "a petrified mob doesn't move, moved " + z.position().distanceTo(start));
            h.assertFalse(z.isPushable(), "a petrified mob can't be pushed");
            z.kill();   // ... but /kill still works
            h.assertFalse(z.isAlive(), "/kill gets through the shell");
            h.succeed();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 60)
    public void monolithPetrifyIsVulnerableAndShatters(GameTestHelper h) {
        floor(h);
        Zombie z = zombie(h, new BlockPos(2, 1, 2));
        Petrify.freeze(z, 20, false);
        h.assertTrue(Petrify.isFrozen(z) && !Petrify.isInvulnerable(z), "the Monolith's shell is vulnerable");
        float hp = z.getHealth();
        z.hurt(h.getLevel().damageSources().generic(), 5f);
        h.assertTrue(z.getHealth() < hp, "a vulnerable shell takes damage, health " + z.getHealth());
        Petrify.freeze(z, 10, false);   // shorter: doesn't shorten it
        h.assertTrue(z.getEffect(EndEffects.PETRIFIED).getDuration() > 15, "a shorter freeze doesn't cut it short");
        h.runAfterDelay(25, () -> {
            h.assertFalse(Petrify.isFrozen(z), "the shell shatters when the effect ends");
            h.succeed();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 40)
    public void bossesArePetrifyImmune(GameTestHelper h) {
        floor(h);
        for (EntityType<?> t : List.of(EntityType.ENDER_DRAGON, EntityType.WITHER, EntityType.WARDEN, EndEntities.MONOLITH)) {
            h.assertTrue(t.is(Petrify.IMMUNE), t + " should be in winterworks:petrify_immune");
        }
        h.assertFalse(EntityType.ZOMBIE.is(Petrify.IMMUNE), "zombies can be petrified");
        Warden w = h.spawn(EntityType.WARDEN, new BlockPos(3, 1, 3));
        w.setNoAi(true);
        Petrify.freeze(w, 100, true);
        h.assertFalse(Petrify.isFrozen(w), "a boss shrugs petrification off");
        w.discard();
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------------ the wand

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 40)
    public void wandPetrifiesWithCooldownAndWear(GameTestHelper h) {
        floor(h);
        Zombie z = zombie(h, new BlockPos(6, 1, 3));
        z.setNoAi(true);
        ServerPlayer p = player(h, new Vec3(1.5, 1, 3.5));
        p.setGameMode(GameType.SURVIVAL);
        ItemStack wand = new ItemStack(EndItems.MONOLITH_WAND);
        p.setItemInHand(InteractionHand.MAIN_HAND, wand);
        h.assertTrue(MonolithWandItem.target(p) == z, "the wand should aim at the zombie, got " + MonolithWandItem.target(p));
        var r = wand.getItem().use(h.getLevel(), p, InteractionHand.MAIN_HAND);
        h.assertTrue(r.getResult().consumesAction(), "using the wand on a mob succeeds");
        h.assertTrue(Petrify.isInvulnerable(z), "the zombie is petrified (invulnerable)");
        h.assertTrue(z.getEffect(EndEffects.PETRIFIED).getDuration() > 190, "for 10 s");
        h.assertTrue(p.getCooldowns().isOnCooldown(EndItems.MONOLITH_WAND), "3 s cooldown");
        h.assertTrue(p.getItemInHand(InteractionHand.MAIN_HAND).getDamageValue() == 1, "1 durability per use");
        // nothing in sight: nothing happens
        p.setXRot(-90f);
        h.assertTrue(MonolithWandItem.target(p) == null, "nothing overhead");
        p.setXRot(0f);
        // bosses resist: cooldown, but no wear
        Warden w = h.spawn(EntityType.WARDEN, new BlockPos(3, 1, 6));
        w.setNoAi(true);
        p.getCooldowns().removeCooldown(EndItems.MONOLITH_WAND);
        h.assertFalse(MonolithWandItem.fire(h.getLevel(), p, InteractionHand.MAIN_HAND, w), "a boss isn't petrified");
        h.assertFalse(Petrify.isFrozen(w), "the warden stays free");
        h.assertTrue(p.getItemInHand(InteractionHand.MAIN_HAND).getDamageValue() == 1, "a resisted shot doesn't wear the wand");
        w.discard();
        leave(h, p);
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------------ the shield

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 100)
    public void shieldReflectsHalfTheBlockedHit(GameTestHelper h) {
        floor(h);
        IronGolem z = h.spawn(EntityType.IRON_GOLEM, new BlockPos(3, 1, 3));   // no armour
        z.setNoAi(true);
        ServerPlayer p = player(h, new Vec3(1.5, 1, 3.5));
        p.setGameMode(GameType.SURVIVAL);
        p.setItemInHand(InteractionHand.OFF_HAND, new ItemStack(EndItems.OBSIDIAN_SHIELD));
        p.startUsingItem(InteractionHand.OFF_HAND);
        for (int i = 0; i < 6; i++) {
            p.doTick();
        }
        h.assertTrue(p.isBlocking(), "the player should be blocking with the offhand shield");
        h.runAfterDelay(62, () -> {   // past a new player's spawn invulnerability (the server ticks it down)
            h.assertTrue(p.isBlocking(), "still blocking");
            float hp = p.getHealth(), zhp = z.getHealth();
            float hit = 8f, dealt = scaled(h, hit);
            p.hurt(h.getLevel().damageSources().mobAttack(z), hit);
            h.assertTrue(p.getHealth() == hp, "a blocked hit does no damage, health " + p.getHealth());
            if (dealt > 0) {
                float lost = zhp - z.getHealth();
                h.assertTrue(Math.abs(lost - dealt * ObsidianShieldItem.REFLECT) < 0.01f,
                        "half of the blocked " + dealt + " goes back at the attacker, it lost " + lost);
                h.assertTrue(p.getOffhandItem().getDamageValue() == 1 + (int) dealt, "the shield wears like a vanilla one: "
                        + p.getOffhandItem().getDamageValue());
            }
            leave(h, p);
            h.succeed();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 40)
    public void shieldShockwaveOnSneakBlock(GameTestHelper h) {
        floor(h);
        h.setBlock(new BlockPos(3, 1, 5), Blocks.DIRT);
        Pig near = h.spawn(EntityType.PIG, new BlockPos(4, 1, 3));
        Pig far = h.spawn(EntityType.PIG, new BlockPos(7, 1, 7));
        near.setNoAi(true);
        far.setNoAi(true);
        ServerPlayer p = player(h, new Vec3(1.5, 1, 3.5));
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(EndItems.OBSIDIAN_SHIELD));
        float nearHp = near.getHealth(), farHp = far.getHealth();
        // blocking without sneaking: no shockwave
        EndItems.OBSIDIAN_SHIELD.use(h.getLevel(), p, InteractionHand.MAIN_HAND);
        h.assertTrue(near.getHealth() == nearHp && !p.getCooldowns().isOnCooldown(EndItems.OBSIDIAN_SHIELD), "no shockwave unless sneaking");
        p.stopUsingItem();
        p.setShiftKeyDown(true);
        EndItems.OBSIDIAN_SHIELD.use(h.getLevel(), p, InteractionHand.MAIN_HAND);
        h.assertTrue(p.isUsingItem(), "it still raises the shield");
        h.assertTrue(Math.abs(nearHp - near.getHealth() - ObsidianShieldItem.SHOCKWAVE_DAMAGE) < 0.01f,
                "the shockwave deals 4, the near pig lost " + (nearHp - near.getHealth()));
        h.assertTrue(near.getDeltaMovement().x > 0.5, "and throws it back hard, " + near.getDeltaMovement());
        h.assertTrue(far.getHealth() == farHp, "a pig 7 blocks away is out of range");
        h.assertTrue(p.getCooldowns().isOnCooldown(EndItems.OBSIDIAN_SHIELD), "5 s cooldown");
        h.assertBlockPresent(Blocks.DIRT, new BlockPos(3, 1, 5));
        leave(h, p);
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------------ the glider

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 20)
    public void gliderGlidesAloneAndFliesWithAnElytra(GameTestHelper h) {
        ServerPlayer p = player(h, new Vec3(3.5, 4, 3.5));
        p.setGameMode(GameType.SURVIVAL);
        p.setOnGround(false);
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(EndItems.END_GLIDER));
        // alone: hold use in the air to hang-glide; free flight needs an Elytra
        p.startFallFlying();
        h.assertFalse(EndGlider.freeFlight(p), "no Elytra: no free flight");
        p.stopFallFlying();
        h.assertTrue(EndGlider.canHangGlide(p) && !EndGlider.hangGliding(p), "in the air with it: holding use would glide");
        EndItems.END_GLIDER.use(h.getLevel(), p, InteractionHand.MAIN_HAND);
        h.assertTrue(EndGlider.hangGliding(p) && EndGlider.inUse(p) && !EndGlider.boosting(p), "holding use: hang-gliding");
        p.resetFallDistance();
        p.fallDistance = 6f;
        p.setDeltaMovement(0, -0.6, 0);
        h.assertTrue(EndGlider.travel(p), "the glider carries the player");
        h.assertTrue(p.fallDistance == 0f, "no fall damage while gliding");
        p.stopUsingItem();
        p.setOnGround(true);
        h.assertFalse(EndGlider.canHangGlide(p), "not on the ground");
        p.setOnGround(false);
        // with an Elytra: free flight
        p.setItemSlot(EquipmentSlot.CHEST, new ItemStack(Items.ELYTRA));
        h.assertFalse(EndGlider.freeFlight(p), "not fall-flying: no free flight");
        p.startFallFlying();
        h.assertTrue(EndGlider.freeFlight(p), "fall-flying on an Elytra with the glider in hand: free flight");
        h.assertFalse(EndGlider.canHangGlide(p), "free flight, not hang-gliding");
        p.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
        p.setItemInHand(InteractionHand.OFF_HAND, new ItemStack(EndItems.END_GLIDER));
        h.assertTrue(EndGlider.freeFlight(p), "the off hand works too");
        // 1 durability per second of flight
        for (int i = 0; i < 20; i++) {
            EndGlider.serverTick(h.getLevel().getServer());
        }
        h.assertTrue(p.getOffhandItem().getDamageValue() >= 1, "a second of flight wears it, " + p.getOffhandItem().getDamageValue());
        h.assertTrue(EndItems.END_GLIDER.isValidRepairItem(p.getOffhandItem(), new ItemStack(Items.PHANTOM_MEMBRANE)),
                "repaired with phantom membrane");

        // steering: settles to 1.1 blocks/tick along the look (climbing too), 2.2 boosting, with slower turns
        Vec3 up = new Vec3(0, 0.6, 1).normalize();
        Vec3 v = new Vec3(0, -0.4, 0.3);
        for (int i = 0; i < 80; i++) {
            v = EndGlider.steer(v, up, false);
        }
        h.assertTrue(Math.abs(v.length() - EndGlider.CRUISE) < 0.01, "cruise speed 1.1, got " + v.length());
        h.assertTrue(v.normalize().dot(up) > 0.999 && v.y > 0.5, "flies where you look, climbing included: " + v);
        Vec3 b = v;
        for (int i = 0; i < 120; i++) {
            b = EndGlider.steer(b, up, true);
        }
        h.assertTrue(Math.abs(b.length() - EndGlider.BOOST) < 0.01, "boost speed 2.2, got " + b.length());
        Vec3 side = new Vec3(1, 0, 0);
        Vec3 cruiseTurn = v, boostTurn = b;
        for (int i = 0; i < 5; i++) {
            cruiseTurn = EndGlider.steer(cruiseTurn, side, false);
            boostTurn = EndGlider.steer(boostTurn, side, true);
        }
        h.assertTrue(cruiseTurn.normalize().dot(side) > boostTurn.normalize().dot(side) + 0.2, "boosting turns much slower");

        // hang-gliding: 0.6 forward along the look (pitch ignored), sinking 0.08, never climbing
        Vec3 g = new Vec3(0, -1.2, 0.1);
        Vec3 lookUp = new Vec3(1, 0.8, 0).normalize();
        double highest = g.y;
        for (int i = 0; i < 80; i++) {
            g = EndGlider.glide(g, lookUp);
            highest = Math.max(highest, g.y);
        }
        h.assertTrue(Math.abs(g.horizontalDistance() - EndGlider.GLIDE_SPEED) < 0.01, "glides at 0.6, got " + g.horizontalDistance());
        h.assertTrue(Math.abs(g.y + EndGlider.GLIDE_SINK) < 0.005, "sinks at 0.08, got " + g.y);
        h.assertTrue(g.x > 0.59 && highest <= -EndGlider.GLIDE_SINK + 1e-6, "steered by the look, no climbing: " + g);
        Vec3 jump = new Vec3(0, 0.42, 0.3);
        for (int i = 0; i < 3; i++) {
            Vec3 next = EndGlider.glide(jump, lookUp);
            h.assertTrue(next.y < jump.y, "gliding never lifts you");
            jump = next;
        }
        leave(h, p);
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------------ the Dragon Egg

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 40)
    public void dragonEggCracksOnItsWayBack(GameTestHelper h) {
        floor(h);
        ServerPlayer p = player(h, new Vec3(3.5, 1, 3.5));
        Vec3 at = h.absoluteVec(new Vec3(5.5, 2, 5.5));
        ItemEntity egg = new ItemEntity(h.getLevel(), at.x, at.y, at.z, new ItemStack(Items.DRAGON_EGG));
        egg.setThrower(p);
        h.getLevel().addFreshEntity(egg);
        Vec3 land = DragonEggs.landing(h.getLevel(), egg);
        h.assertTrue(Math.abs(land.x - p.getX()) < 0.01 && Math.abs(land.z - p.getZ()) < 0.01 && land.y > p.getEyeY(),
                "it comes back above its thrower, " + land);
        DragonEggs.comeBack(h.getLevel(), egg);
        h.assertTrue(DragonEggs.cracks(egg.getItem()) == 1, "first crack");
        DragonEggs.comeBack(h.getLevel(), egg);
        h.assertTrue(DragonEggs.cracks(egg.getItem()) == 2, "second crack");
        h.assertFalse(DragonEggs.fromVoid(egg), "only the End's void brings eggs back");
        egg.discard();
        leave(h, p);

        // in the End: falling out of the world brings it back over the exit portal (the mixin on onBelowWorld)
        ServerLevel end = h.getLevel().getServer().getLevel(Level.END);
        h.assertTrue(end != null, "the End is loaded");
        ItemEntity lost = new ItemEntity(end, 30.5, 70, 30.5, new ItemStack(Items.DRAGON_EGG));
        end.addFreshEntity(lost);
        lost.setPos(30.5, end.getMinBuildHeight() - 100, 30.5);
        lost.checkBelowWorld();
        h.assertFalse(lost.isRemoved(), "the egg isn't lost to the void");
        h.assertTrue(DragonEggs.cracks(lost.getItem()) == 1, "it came back with a crack");
        h.assertTrue(lost.getY() > end.getMinBuildHeight() && Math.abs(lost.getX() - 0.5) < 0.01 && Math.abs(lost.getZ() - 0.5) < 0.01,
                "above the exit portal, at " + lost.position());
        lost.discard();
        ItemEntity stone = new ItemEntity(end, 30.5, end.getMinBuildHeight() - 100, 30.5, new ItemStack(Items.STONE));
        end.addFreshEntity(stone);
        stone.checkBelowWorld();
        h.assertTrue(stone.isRemoved(), "anything else is lost as usual");
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 100)
    public void thirdCrackHatchesADragonling(GameTestHelper h) {
        floor(h);
        ItemStack stack = new ItemStack(Items.DRAGON_EGG);
        stack.set(EndEffects.EGG_CRACKS, 2);
        Vec3 at = h.absoluteVec(new Vec3(3.5, 3, 3.5));
        ItemEntity egg = new ItemEntity(h.getLevel(), at.x, at.y, at.z, stack);
        ServerPlayer p = player(h, new Vec3(1.5, 1, 1.5));   // mock players don't tick, so it won't pick the egg up
        egg.setThrower(p);
        h.getLevel().addFreshEntity(egg);
        DragonEggs.comeBack(h.getLevel(), egg);
        h.assertTrue(DragonEggs.cracks(egg.getItem()) == DragonEggs.HATCHING, "the third time it's ready to hatch");
        egg.teleportTo(at.x, at.y, at.z);   // away from the thrower's head
        egg.setDeltaMovement(Vec3.ZERO);
        leave(h, p);
        h.succeedWhen(() -> {
            h.assertTrue(egg.isRemoved(), "the egg hatches once it lands");
            List<Dragonling> babies = h.getLevel().getEntitiesOfClass(Dragonling.class, egg.getBoundingBox().inflate(3));
            h.assertTrue(babies.size() == 1 && !babies.get(0).isTeen(), "into one baby Dragonling, " + babies.size());
            babies.get(0).discard();
        });
    }

    // ------------------------------------------------------------------------------------------------ the Dragonling

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 40)
    public void dragonlingTamesWithChorusFruit(GameTestHelper h) {
        floor(h);
        Dragonling d = dragonling(h, new BlockPos(4, 1, 3), null);
        h.assertTrue(d.getBbWidth() == 0.8f && d.getBbHeight() == 0.7f && d.getMaxHealth() == 20f, "a baby is 0.8 x 0.7, 20 health");
        ServerPlayer p = player(h, new Vec3(2.5, 1, 3.5));
        p.setGameMode(GameType.SURVIVAL);
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.CHORUS_FRUIT, 64));
        int tries = 0;
        while (!d.isTame() && tries < 60) {
            d.mobInteract(p, InteractionHand.MAIN_HAND);
            tries++;
        }
        h.assertTrue(d.isTame() && d.isOwnedBy(p), "chorus fruit tames it (1 in 3), " + tries + " tries");
        h.assertTrue(p.getMainHandItem().getCount() == 64 - tries, "each try eats a fruit");
        leave(h, p);
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 40)
    public void dragonlingGrowsIntoATeen(GameTestHelper h) {
        floor(h);
        ServerPlayer p = player(h, new Vec3(1.5, 1, 1.5));
        Dragonling d = dragonling(h, new BlockPos(4, 1, 4), p);
        for (int i = 0; i < 9; i++) {
            d.eat(EntityType.ENDERMITE);
        }
        h.assertTrue(d.getGrowth() == 36 && !d.isTeen(), "nine Endermites: 36, still a baby");
        d.eat(EntityType.CHICKEN);
        h.assertFalse(d.isTeen(), "38: still a baby");
        d.eat(EntityType.RABBIT);
        h.assertTrue(d.isTeen(), "at 40 it's a teen");
        h.assertTrue(Math.abs(d.getBbWidth() - 2.2f) < 1e-4 && Math.abs(d.getBbHeight() - 1.6f) < 1e-4,
                "a teen is 2.2 x 1.6, got " + d.getBbWidth() + " x " + d.getBbHeight());
        h.assertTrue(d.getMaxHealth() == 60f && d.getHealth() == 60f, "60 health, full: " + d.getHealth() + "/" + d.getMaxHealth());
        leave(h, p);
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 600)
    public void tamedBabyHuntsAndGrows(GameTestHelper h) {
        pen(h);
        ServerPlayer p = player(h, new Vec3(1.5, 1, 1.5));
        Dragonling d = dragonling(h, new BlockPos(2, 1, 5), p);
        Chicken c = h.spawn(EntityType.CHICKEN, new BlockPos(5, 1, 2));
        h.assertTrue(Dragonling.isPrey(c), "chickens are prey");
        h.assertFalse(Dragonling.isPrey(p), "players never are");
        h.succeedWhen(() -> {
            h.assertFalse(c.isAlive(), "the baby should catch the chicken");
            h.assertTrue(d.getGrowth() == 2, "a chicken is worth 2, growth " + d.getGrowth());
            leave(h, p);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 40)
    public void teenTakesBreathSaddleAndArmour(GameTestHelper h) {
        floor(h);
        ServerPlayer p = player(h, new Vec3(1.5, 1, 3.5));
        p.setGameMode(GameType.SURVIVAL);
        Dragonling d = dragonling(h, new BlockPos(3, 1, 3), p);
        d.growUp();
        d.setNoAi(true);
        // Dragon's Breath: 6 charges a bottle, up to 24, and the bottle comes back
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.DRAGON_BREATH, 5));
        for (int i = 0; i < 4; i++) {
            d.mobInteract(p, InteractionHand.MAIN_HAND);
        }
        h.assertTrue(d.getBreath() == Dragonling.MAX_BREATH, "four bottles: 24 charges, got " + d.getBreath());
        h.assertTrue(p.getMainHandItem().getCount() == 1, "four bottles used");
        h.assertTrue(p.getInventory().countItem(Items.GLASS_BOTTLE) == 4, "the glass bottles come back");
        d.mobInteract(p, InteractionHand.MAIN_HAND);
        h.assertTrue(d.getBreath() == Dragonling.MAX_BREATH && p.getMainHandItem().getCount() == 1, "no more than 24");
        // saddle and armour
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.SADDLE));
        d.mobInteract(p, InteractionHand.MAIN_HAND);
        h.assertTrue(d.isSaddled(), "saddled");
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.DIAMOND_HORSE_ARMOR));
        d.mobInteract(p, InteractionHand.MAIN_HAND);
        h.assertTrue(d.getBodyArmorItem().is(Items.DIAMOND_HORSE_ARMOR) && "diamond".equals(d.armorVariant()), "wears the armour");
        // riding
        p.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
        d.mobInteract(p, InteractionHand.MAIN_HAND);
        h.assertTrue(p.getVehicle() == d && d.getControllingPassenger() == p, "the owner rides a saddled teen");
        Zombie z = zombie(h, new BlockPos(6, 1, 3));
        z.setNoAi(true);
        Zombie behind = zombie(h, new BlockPos(0, 1, 6));
        behind.setNoAi(true);
        h.runAfterDelay(2, () -> {
            h.assertTrue(d.getAttributeValue(Attributes.ARMOR) >= 10, "diamond horse armour: armour " + d.getAttributeValue(Attributes.ARMOR));
            // fire breath: a cone in front, 6 damage and fire, one charge
            d.setYRot(-90f);
            d.yBodyRot = d.yHeadRot = -90f;
            p.setYRot(-90f);
            p.setXRot(10f);
            float hp = z.getHealth();
            h.assertTrue(d.breathe(p), "it breathes fire");
            h.assertTrue(hp - z.getHealth() >= 5f && z.isOnFire(), "the zombie in front is burnt: " + (hp - z.getHealth()));
            h.assertTrue(behind.getHealth() == behind.getMaxHealth(), "the one behind isn't");
            h.assertTrue(d.getBreath() == Dragonling.MAX_BREATH - 1, "one charge used");
            h.assertFalse(d.breathe(p), "it needs a second to draw breath again");
            p.stopRiding();
            leave(h, p);
            h.succeed();
        });
    }
}
