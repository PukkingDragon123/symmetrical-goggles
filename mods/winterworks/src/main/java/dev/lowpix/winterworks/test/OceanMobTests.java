package dev.lowpix.winterworks.test;

import dev.lowpix.winterworks.oceanmob.Anglerfish;
import dev.lowpix.winterworks.oceanmob.AnglerLightBlockEntity;
import dev.lowpix.winterworks.oceanmob.Lionfish;
import dev.lowpix.winterworks.oceanmob.Nautilus;
import dev.lowpix.winterworks.oceanmob.TurtleClutches;
import dev.lowpix.winterworks.registry.OceanBlocks;
import dev.lowpix.winterworks.registry.OceanEntities;
import dev.lowpix.winterworks.registry.OceanItems;
import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.component.DataComponents;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.animal.Turtle;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.MobBucketItem;
import net.minecraft.world.item.alchemy.PotionBrewing;
import net.minecraft.world.item.alchemy.PotionContents;
import net.minecraft.world.item.alchemy.Potions;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.TurtleEggBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * GameTests for Tides & Treasures: the creatures (docs/OCEAN_UPDATE.md sections 3, 4). ./gradlew runGametest
 * Each group runs in its own batch (mock players and the anglerfish's light reach across the test grid otherwise) and
 * removes its mobs and players at the end.
 */
public class OceanMobTests implements FabricGameTest {
    // ------------------------------------------------------------------------------------------ helpers

    /** A stone floor and walls round still water from y 1 to `top`. */
    private static void waterBox(GameTestHelper h, int top) {
        for (int x = 0; x < 9; x++) {
            for (int z = 0; z < 9; z++) {
                h.setBlock(new BlockPos(x, 0, z), Blocks.STONE);
                for (int y = 1; y <= top; y++) {
                    boolean wall = x == 0 || z == 0 || x == 8 || z == 8;
                    h.setBlock(new BlockPos(x, y, z), wall ? Blocks.GLASS : Blocks.WATER);
                }
            }
        }
    }

    private static void floor(GameTestHelper h, BlockState s) {
        for (int x = 0; x < 9; x++) {
            for (int z = 0; z < 9; z++) {
                h.setBlock(new BlockPos(x, 0, z), s);
            }
        }
    }

    private static ServerPlayer survivor(GameTestHelper h, double x, double y, double z, ItemStack inHand) {
        @SuppressWarnings("removal")
        ServerPlayer p = h.makeMockServerPlayerInLevel();
        p.setGameMode(GameType.SURVIVAL);
        Vec3 at = h.absoluteVec(new Vec3(x, y, z));
        p.moveTo(at.x, at.y, at.z, 0f, 0f);
        p.setItemInHand(InteractionHand.MAIN_HAND, inHand);
        try {   // a mock player isn't ticked, so its 3 s of spawn invulnerability would never run out
            java.lang.reflect.Field f = ServerPlayer.class.getDeclaredField("spawnInvulnerableTime");
            f.setAccessible(true);
            f.setInt(p, 0);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
        return p;
    }

    private static void cleanup(GameTestHelper h, ServerPlayer... players) {
        for (ServerPlayer p : players) {
            p.stopRiding();
            h.getLevel().getServer().getPlayerList().remove(p);
        }
        for (Entity e : h.getLevel().getEntities((Entity) null, h.getBounds().inflate(6), e -> !(e instanceof ServerPlayer))) {
            e.discard();
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

    private static Anglerfish angler(GameTestHelper h, double x, double y, double z, boolean female, boolean ai) {
        Anglerfish a = OceanEntities.ANGLERFISH.create(h.getLevel());
        a.setFemale(female);
        Vec3 at = h.absoluteVec(new Vec3(x, y, z));
        a.moveTo(at.x, at.y, at.z, 0f, 0f);   // facing south (+z)
        a.setYBodyRot(0f);
        a.setYHeadRot(0f);
        a.setNoAi(!ai);
        h.getLevel().addFreshEntity(a);
        return a;
    }

    private static int lightBlocks(GameTestHelper h) {
        int n = 0;
        for (BlockPos p : BlockPos.betweenClosed(h.absolutePos(new BlockPos(0, 0, 0)), h.absolutePos(new BlockPos(8, 9, 8)))) {
            if (Anglerfish.isLureLight(h.getLevel().getBlockState(p))) {
                n++;
            }
        }
        return n;
    }

    // ------------------------------------------------------------------------------------------ the anglerfish

    @GameTest(template = EMPTY_STRUCTURE, batch = "oceanmob_light", timeoutTicks = 200)
    public void lureLightFollowsAndIsCleanedUp(GameTestHelper h) {
        waterBox(h, 8);
        ServerLevel level = h.getLevel();
        ServerPlayer p = survivor(h, 7.5, 9, 7.5, ItemStack.EMPTY);
        p.setGameMode(GameType.CREATIVE);   // just someone near: the light is only out while a player is
        Anglerfish f = angler(h, 2.5, 2.0, 1.5, true, false);
        BlockPos[] first = new BlockPos[1];
        h.startSequence()
                .thenWaitUntil(() -> {
                    h.assertTrue(f.lightPos() != null, "the female's lure should light the water");
                    h.assertTrue(Anglerfish.isLureLight(level.getBlockState(f.lightPos())), "a waterlogged light block at the lure");
                    h.assertTrue(f.lurePos().distanceTo(Vec3.atCenterOf(f.lightPos())) < 1.5, "the light sits at the lure");
                    h.assertTrue(level.getBlockState(f.lightPos()).getFluidState().isSource(), "the light keeps its water");
                })
                .thenExecute(() -> {
                    first[0] = f.lightPos();
                    f.moveTo(f.getX() + 3, f.getY() + 1, f.getZ(), 0f, 0f);   // swims 3 blocks over
                })
                .thenWaitUntil(() -> {
                    h.assertTrue(f.lightPos() != null && !f.lightPos().equals(first[0]), "the light should follow the lure");
                    h.assertTrue(level.getBlockState(first[0]).is(Blocks.WATER), "the old light is water again");
                    h.assertTrue(lightBlocks(h) == 1, "one light per lure, found " + lightBlocks(h));
                })
                .thenExecute(() -> {
                    first[0] = f.lightPos();
                    f.moveTo(f.getX(), f.getY() + 0.4, f.getZ() + 0.3, 0f, 0f);   // a small drift: the light stays put
                })
                .thenIdle(4)
                .thenExecute(() -> h.assertTrue(first[0].equals(f.lightPos()), "under a block of movement the light doesn't move"))
                .thenExecute(() -> {
                    p.setGameMode(GameType.SPECTATOR);
                    h.getLevel().getServer().getPlayerList().remove(p);
                })
                .thenWaitUntil(() -> h.assertTrue(lightBlocks(h) == 0 && f.lightPos() == null, "no player near: the light goes out"))
                .thenExecute(() -> {
                    ServerPlayer q = survivor(h, 7.5, 9, 7.5, ItemStack.EMPTY);
                    q.setGameMode(GameType.CREATIVE);
                })
                .thenWaitUntil(() -> h.assertTrue(lightBlocks(h) == 1, "back on with a player near"))
                .thenExecute(() -> f.kill())
                .thenExecute(() -> h.assertTrue(lightBlocks(h) == 0, "killed: no light left behind"))
                .thenExecute(() -> {
                    Anglerfish m = angler(h, 4.5, 3.0, 4.5, false, false);
                    m.setYBodyRot(0f);
                })
                .thenWaitUntil(() -> h.assertTrue(lightBlocks(h) == 1, "a male's little lure lights the water too"))
                .thenExecute(() -> {
                    for (Anglerfish a : level.getEntitiesOfClass(Anglerfish.class, h.getBounds().inflate(2))) {
                        a.discard();
                    }
                })
                .thenExecute(() -> {
                    h.assertTrue(lightBlocks(h) == 0, "discarded: no light left behind");
                    cleanup(h, level.getEntitiesOfClass(ServerPlayer.class, h.getBounds().inflate(12)).toArray(new ServerPlayer[0]));
                })
                .thenSucceed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = "oceanmob_grab", timeoutTicks = 200)
    public void femaleGrabsAndReleases(GameTestHelper h) {
        waterBox(h, 8);
        ServerPlayer p = survivor(h, 4.5, 2.0, 5.5, ItemStack.EMPTY);
        Anglerfish f = angler(h, 4.5, 2.0, 2.0, true, false);
        h.onEachTick(() -> p.invulnerableTime = Math.max(0, p.invulnerableTime - 1));   // what the player's own tick would do
        h.assertTrue(f.getBbWidth() >= 2.9f && f.getBbHeight() >= 1.9f, "a female is 3 x 2 blocks");
        h.assertTrue(f.getMaxHealth() == Anglerfish.FEMALE_HEALTH, "a female has 80 health");
        float[] hp = new float[1];
        h.startSequence()
                .thenExecute(() -> {
                    hp[0] = p.getHealth();
                    f.grab(p);
                    h.assertTrue(p.getVehicle() == f && f.isHolding(), "the player should be held in her jaws");
                    h.assertTrue(p.getHealth() <= hp[0] - Anglerfish.HOLD_DAMAGE + 0.01f, "the grab bites (4)");
                    Vec3 mouth = f.mouthPos();
                    h.assertTrue(p.position().add(0, 0.6, 0).distanceTo(mouth) < 0.3, "held at the mouth locator");
                })
                .thenExecuteAfter(21, () -> h.assertTrue(p.getHealth() <= hp[0] - 2 * Anglerfish.HOLD_DAMAGE + 0.01f,
                        "4 damage a second while held, health " + p.getHealth()))
                .thenExecute(() -> {
                    p.stopRiding();   // sneaking off doesn't work: she takes you back
                })
                .thenExecuteAfter(1, () -> h.assertTrue(p.getVehicle() == f, "only struggling frees you"))
                .thenExecute(() -> {
                    p.attack(f);   // struggle: hitting her frees you
                    h.assertTrue(!f.isHolding() && p.getVehicle() == null, "attacking her frees the player");
                    h.assertTrue(f.huntCooldown() > 0, "she waits before hunting again");
                })
                .thenIdle(25)   // the player's damage cooldown runs out
                .thenExecute(() -> {
                    p.setHealth(p.getMaxHealth());
                    f.grab(p);
                })
                .thenExecuteAfter(Anglerfish.HOLD_TICKS + 2, () -> {
                    h.assertTrue(!f.isHolding() && p.getVehicle() == null, "after 3 s she lets go");
                    h.assertTrue(p.isAlive() && p.getHealth() <= p.getMaxHealth() - 3 * Anglerfish.HOLD_DAMAGE + 0.01f,
                            "3 s held: bitten on the grab and each second, health " + p.getHealth());
                    cleanup(h, p);
                })
                .thenSucceed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = "oceanmob_hunt", timeoutTicks = 400)
    public void femaleLuresLungesAndGrabsASwimmer(GameTestHelper h) {
        waterBox(h, 8);
        Anglerfish.eager = true;
        ServerPlayer p = survivor(h, 4.5, 2.5, 7.0, ItemStack.EMPTY);
        Anglerfish f = angler(h, 4.5, 1.2, 2.0, true, true);
        h.succeedWhen(() -> {
            h.assertTrue(f.isHolding() && p.getVehicle() == f, "she should lure, lunge at and grab the swimming player");
            Anglerfish.eager = false;
            cleanup(h, p);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = "oceanmob_swallow", timeoutTicks = 400)
    public void femaleSwallowsSmallMobs(GameTestHelper h) {
        waterBox(h, 8);
        Anglerfish.eager = true;
        Anglerfish f = angler(h, 4.5, 1.2, 2.0, true, true);
        Entity cod = h.spawn(EntityType.COD, new Vec3(4.5, 3.0, 6.5));
        cod.setNoGravity(true);
        ((net.minecraft.world.entity.Mob) cod).setNoAi(true);
        h.succeedWhen(() -> {
            h.assertTrue(cod.isRemoved(), "she should swallow the cod whole");
            h.assertTrue(items(h, Items.COD, new BlockPos(4, 2, 4), 6) == 0, "swallowed, not killed: nothing drops");
            Anglerfish.eager = false;
            cleanup(h);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = "oceanmob_bucket", timeoutTicks = 60)
    public void maleBuckets(GameTestHelper h) {
        waterBox(h, 6);
        ServerPlayer p = survivor(h, 4.5, 1, 1.5, new ItemStack(Items.WATER_BUCKET));
        Anglerfish male = angler(h, 4.5, 2, 4.5, false, false);
        Anglerfish female = angler(h, 2.5, 3, 4.5, true, false);
        h.assertTrue(male.getBbWidth() <= 0.45f, "males are tiny");
        female.interact(p, InteractionHand.MAIN_HAND);
        h.assertTrue(p.getMainHandItem().is(Items.WATER_BUCKET) && female.isAlive(), "a female is far too big for a bucket");
        male.interact(p, InteractionHand.MAIN_HAND);
        h.assertTrue(p.getMainHandItem().is(OceanItems.ANGLERFISH_BUCKET), "the male goes in the bucket");
        h.assertTrue(male.isRemoved(), "and leaves the water");
        // and back out of it
        ItemStack bucket = p.getMainHandItem();
        BlockPos at = h.absolutePos(new BlockPos(6, 2, 6));
        ((MobBucketItem) OceanItems.ANGLERFISH_BUCKET).checkExtraContent(p, h.getLevel(), bucket, at);
        var out = h.getLevel().getEntitiesOfClass(Anglerfish.class, new AABB(at).inflate(1.5));
        h.assertTrue(out.size() == 1 && !out.get(0).isFemale() && out.get(0).fromBucket(), "emptying the bucket lets a male out");
        cleanup(h, p);
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = "oceanmob_loot", timeoutTicks = 40)
    public void anglerfishDrops(GameTestHelper h) {
        floor(h, Blocks.STONE.defaultBlockState());
        ServerPlayer p = survivor(h, 1.5, 1, 1.5, ItemStack.EMPTY);
        Anglerfish f = angler(h, 4.5, 1, 4.5, true, false);
        h.assertTrue(f.getDefaultLootTable().equals(dev.lowpix.winterworks.oceanmob.OceanMobFeature.ANGLERFISH_FEMALE_LOOT),
                "females drop from their own loot table");
        f.hurt(h.getLevel().damageSources().playerAttack(p), 1000f);
        h.succeedWhen(() -> {
            int fish = items(h, OceanItems.RAW_ANGLERFISH, new BlockPos(4, 1, 4), 4);
            int lures = items(h, OceanItems.ANGLER_LURE, new BlockPos(4, 1, 4), 4);
            h.assertTrue(fish >= 3 && lures >= 1, "a female drops 3-5 raw anglerfish and 1-2 lures, got " + fish + " / " + lures);
            cleanup(h, p);
        });
    }

    // ------------------------------------------------------------------------------------------ Night Vision, the Angler Light

    @GameTest(template = EMPTY_STRUCTURE, batch = "oceanmob_brewing", timeoutTicks = 20)
    public void nightVisionBrewsFromAnglerLures(GameTestHelper h) {
        PotionBrewing b = h.getLevel().potionBrewing();
        ItemStack awkward = PotionContents.createItemStack(Items.POTION, Potions.AWKWARD);
        h.assertTrue(b.hasMix(awkward, new ItemStack(OceanItems.ANGLER_LURE)), "awkward potion + angler lure brews");
        ItemStack nv = b.mix(new ItemStack(OceanItems.ANGLER_LURE), awkward);
        h.assertTrue(nv.getOrDefault(DataComponents.POTION_CONTENTS, PotionContents.EMPTY).is(Potions.NIGHT_VISION),
                "awkward + angler lure = Night Vision");
        h.assertTrue(!b.hasMix(awkward, new ItemStack(Items.GOLDEN_CARROT)), "the golden carrot recipe is removed");
        h.assertTrue(!b.isIngredient(new ItemStack(Items.GOLDEN_CARROT)), "golden carrots brew nothing now");
        ItemStack longNv = b.mix(new ItemStack(Items.REDSTONE), nv);
        h.assertTrue(longNv.getOrDefault(DataComponents.POTION_CONTENTS, PotionContents.EMPTY).is(Potions.LONG_NIGHT_VISION),
                "redstone still lengthens it");
        ItemStack invis = b.mix(new ItemStack(Items.FERMENTED_SPIDER_EYE), nv);
        h.assertTrue(invis.getOrDefault(DataComponents.POTION_CONTENTS, PotionContents.EMPTY).is(Potions.INVISIBILITY),
                "a fermented spider eye still turns it to Invisibility");
        ItemStack longInvis = b.mix(new ItemStack(Items.FERMENTED_SPIDER_EYE), longNv);
        h.assertTrue(longInvis.getOrDefault(DataComponents.POTION_CONTENTS, PotionContents.EMPTY).is(Potions.LONG_INVISIBILITY),
                "and the long one to long Invisibility");
        ItemStack splash = b.mix(new ItemStack(Items.GUNPOWDER), nv);
        h.assertTrue(splash.is(Items.SPLASH_POTION), "gunpowder still makes it a splash potion");
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = "oceanmob_anglerlight", timeoutTicks = 100)
    public void anglerLightGivesNightVision(GameTestHelper h) {
        floor(h, Blocks.STONE.defaultBlockState());
        BlockPos at = new BlockPos(1, 1, 1);
        h.setBlock(at, OceanBlocks.ANGLER_LIGHT);
        h.assertTrue(h.getLevel().getBlockState(h.absolutePos(at)).getLightEmission() == 15, "the Angler Light gives light 15");
        h.assertTrue(h.getLevel().getBlockEntity(h.absolutePos(at)) instanceof AnglerLightBlockEntity, "with its block entity");
        ServerPlayer near = survivor(h, 4.5, 1, 4.5, ItemStack.EMPTY);
        ServerPlayer far = survivor(h, 1.5, 1, 12.5, ItemStack.EMPTY);
        h.succeedWhen(() -> {
            MobEffectInstance nv = near.getEffect(MobEffects.NIGHT_VISION);
            h.assertTrue(nv != null && nv.getDuration() > AnglerLightBlockEntity.DURATION - AnglerLightBlockEntity.PERIOD - 2,
                    "a player within 8 blocks gets Night Vision 30 s");
            h.assertTrue(!far.hasEffect(MobEffects.NIGHT_VISION), "not one 11 blocks away");
            cleanup(h, near, far);
        });
    }

    // ------------------------------------------------------------------------------------------ the lionfish

    @GameTest(template = EMPTY_STRUCTURE, batch = "oceanmob_lionfish", timeoutTicks = 60)
    public void lionfishShearsAndRegrows(GameTestHelper h) {
        waterBox(h, 5);
        ServerPlayer p = survivor(h, 4.5, 1, 1.5, new ItemStack(Items.SHEARS));
        Lionfish l = h.spawn(OceanEntities.LIONFISH, new Vec3(4.5, 2, 4.5));
        l.setNoAi(true);
        h.assertTrue(l.readyForShearing(), "a lionfish starts with full spines");
        l.interact(p, InteractionHand.MAIN_HAND);
        h.assertTrue(l.isSheared() && l.spineStage() == 0 && !l.readyForShearing(), "shears take its spines");
        h.assertTrue(Lionfish.REGROW_TICKS == 6000 && l.regrowTicks() == Lionfish.REGROW_TICKS, "they regrow in 5 minutes");
        h.assertTrue(!l.canSting(), "a freshly sheared lionfish can't sting");
        l.setRegrowTicks(Lionfish.REGROW_TICKS / 2);
        h.assertTrue(l.spineStage() == Lionfish.FULL / 2, "half way: half grown, stage " + l.spineStage());
        l.setRegrowTicks(2);
        h.startSequence()
                .thenExecuteAfter(4, () -> {
                    int darts = items(h, OceanItems.LIONFISH_DART, new BlockPos(4, 2, 4), 4);
                    h.assertTrue(darts >= 2 && darts <= 3, "2-3 lionfish darts, got " + darts);
                    h.assertTrue(l.spineStage() == Lionfish.FULL && l.readyForShearing(), "grown back, ready to shear again");
                    cleanup(h, p);
                })
                .thenSucceed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = "oceanmob_lionfish", timeoutTicks = 40)
    public void lionfishPoisonsOnTouch(GameTestHelper h) {
        waterBox(h, 5);
        ServerPlayer p = survivor(h, 4.5, 1, 3.8, ItemStack.EMPTY);
        ServerPlayer q = survivor(h, 2.5, 1, 3.8, ItemStack.EMPTY);
        Lionfish l = h.spawn(OceanEntities.LIONFISH, new Vec3(4.5, 1.2, 4.5));
        Lionfish sheared = h.spawn(OceanEntities.LIONFISH, new Vec3(2.5, 1.2, 4.5));
        l.setNoAi(true);
        sheared.setNoAi(true);
        sheared.setRegrowTicks(Lionfish.REGROW_TICKS);
        l.playerTouch(p);
        MobEffectInstance poison = p.getEffect(MobEffects.POISON);
        h.assertTrue(poison != null && poison.getDuration() == Lionfish.POISON_TICKS, "touching a lionfish poisons (4 s)");
        sheared.playerTouch(q);
        h.assertTrue(!q.hasEffect(MobEffects.POISON), "a sheared one has no spines to sting with");
        cleanup(h, p, q);
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------ the nautilus

    @GameTest(template = EMPTY_STRUCTURE, batch = "oceanmob_nautilus", timeoutTicks = 120)
    public void nautilusTamesRidesAndBreathes(GameTestHelper h) {
        waterBox(h, 8);
        ServerPlayer p = survivor(h, 4.5, 1, 1.5, ItemStack.EMPTY);
        Nautilus n = h.spawn(OceanEntities.NAUTILUS, new Vec3(4.5, 2, 4.5));
        n.setNoAi(true);
        // tame: raw cod or salmon, 1 in 3
        int tamed = 0, feeds = 90;
        for (int i = 0; i < feeds; i++) {
            p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(i % 2 == 0 ? Items.COD : Items.SALMON, 2));
            n.interact(p, InteractionHand.MAIN_HAND);
            h.assertTrue(p.getMainHandItem().getCount() == 1, "each try eats a fish");
            if (n.isTamed()) {
                h.assertTrue(p.getUUID().equals(n.getOwnerUUID()), "tamed to the feeder");
                tamed++;
                n.readAdditionalSaveData(new CompoundTag());   // untame it for the next try
            }
        }
        h.assertTrue(tamed >= 15 && tamed <= 48, "about 1 in 3 fish tame it: " + tamed + " of " + feeds);
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.SADDLE));
        n.interact(p, InteractionHand.MAIN_HAND);
        h.assertTrue(!n.isSaddled(), "an untamed nautilus won't take a saddle");
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.COD));
        for (int i = 0; i < 60 && !n.isTamed(); i++) {
            p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.COD));
            n.interact(p, InteractionHand.MAIN_HAND);
        }
        h.assertTrue(n.isTamed(), "tamed at last");
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.SADDLE));
        p.interactOn(n, InteractionHand.MAIN_HAND);
        h.assertTrue(n.isSaddled(), "a tamed nautilus takes a saddle");
        p.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
        n.interact(p, InteractionHand.MAIN_HAND);
        h.assertTrue(p.getVehicle() == n && n.getControllingPassenger() == p, "riding it");
        Vec3 seat = n.modelPoint(Nautilus.RIDER);
        h.assertTrue(p.position().add(0, 0.6, 0).distanceTo(seat) < 0.3, "the rider sits at the rider locator");
        // ridden, it swims where its rider looks: down and to the east here
        p.setYRot(-90f);
        p.setXRot(40f);
        n.setNoAi(false);
        Vec3 start = n.position();
        for (int i = 0; i < 6; i++) {
            n.swimRidden(p, new Vec3(0, 0, 1));
        }
        Vec3 moved = n.position().subtract(start);
        Vec3 look = Vec3.directionFromRotation(40f, -90f);
        h.assertTrue(moved.length() > 0.5 && moved.normalize().dot(look) > 0.95, "it swims along the rider's look, moved " + moved);
        double before = n.getDeltaMovement().length();
        n.onPlayerJump(50);
        n.swimRidden(p, new Vec3(0, 0, 1));
        h.assertTrue(n.getDeltaMovement().length() > before + 0.6, "a jump is a jet dash");
        h.assertTrue(!n.canJump() && n.getJumpCooldown() > 0, "then the dash recharges");
        h.startSequence()
                .thenExecuteAfter(22, () -> h.assertTrue(p.hasEffect(MobEffects.WATER_BREATHING), "the rider breathes underwater"))
                .thenExecute(() -> {
                    p.stopRiding();
                    n.hurt(h.getLevel().damageSources().playerAttack(p), 1000f);
                })
                .thenExecuteAfter(2, () -> {
                    h.assertTrue(items(h, Items.NAUTILUS_SHELL, new BlockPos(4, 2, 4), 8) == 1, "it drops a nautilus shell");
                    h.assertTrue(items(h, Items.SADDLE, new BlockPos(4, 2, 4), 8) == 1, "and its saddle");
                    cleanup(h, p);
                })
                .thenSucceed();
    }

    // ------------------------------------------------------------------------------------------ turtles

    @GameTest(template = EMPTY_STRUCTURE, batch = "oceanmob_turtles", timeoutTicks = 40)
    public void turtleClutchesAreTwoToSix(GameTestHelper h) {
        floor(h, Blocks.SAND.defaultBlockState());
        ServerLevel level = h.getLevel();
        int min = 99, max = 0;
        for (int trial = 0; trial < 60; trial++) {
            BlockPos at = h.absolutePos(new BlockPos(4, 1, 4));
            for (BlockPos q : BlockPos.betweenClosed(at.offset(-2, 0, -2), at.offset(2, 0, 2))) {
                level.setBlock(q, Blocks.AIR.defaultBlockState(), 2);
            }
            int n = TurtleClutches.lay(level, at, level.random);
            int eggs = 0;
            for (BlockPos q : BlockPos.betweenClosed(at.offset(-2, 0, -2), at.offset(2, 0, 2))) {
                BlockState s = level.getBlockState(q);
                if (s.is(Blocks.TURTLE_EGG)) {
                    eggs += s.getValue(TurtleEggBlock.EGGS);
                }
            }
            h.assertTrue(eggs == n && n >= 2 && n <= 6, "a clutch is 2-6 eggs, laid " + eggs + " for " + n);
            min = Math.min(min, n);
            max = Math.max(max, n);
        }
        h.assertTrue(min == 2 && max == 6, "clutches range 2..6, saw " + min + ".." + max);
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = "oceanmob_turtles", timeoutTicks = 900)
    public void turtleLaysAClutch(GameTestHelper h) {
        floor(h, Blocks.SAND.defaultBlockState());
        Turtle t = h.spawn(EntityType.TURTLE, new Vec3(4.5, 1, 4.5));
        CompoundTag tag = new CompoundTag();
        t.addAdditionalSaveData(tag);
        BlockPos home = h.absolutePos(new BlockPos(4, 1, 4));
        tag.putBoolean("HasEgg", true);
        tag.putInt("HomePosX", home.getX());
        tag.putInt("HomePosY", home.getY());
        tag.putInt("HomePosZ", home.getZ());
        t.readAdditionalSaveData(tag);
        h.succeedWhen(() -> {
            int eggs = 0;
            for (BlockPos q : BlockPos.betweenClosed(h.absolutePos(new BlockPos(0, 1, 0)), h.absolutePos(new BlockPos(8, 1, 8)))) {
                BlockState s = h.getLevel().getBlockState(q);
                if (s.is(Blocks.TURTLE_EGG)) {
                    eggs += s.getValue(TurtleEggBlock.EGGS);
                }
            }
            h.assertTrue(!t.hasEgg() && eggs >= 2 && eggs <= 6, "the turtle should lay a clutch of 2-6, " + eggs + " so far");
            cleanup(h);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = "oceanmob_turtles", timeoutTicks = 40)
    public void turtlesDropShellShards(GameTestHelper h) {
        floor(h, Blocks.SAND.defaultBlockState());
        ServerPlayer p = survivor(h, 1.5, 1, 1.5, ItemStack.EMPTY);
        Turtle adult = h.spawn(EntityType.TURTLE, new Vec3(3.5, 1, 4.5));
        Turtle baby = h.spawn(EntityType.TURTLE, new Vec3(7.5, 1, 7.5));
        baby.setAge(-24000);
        adult.hurt(h.getLevel().damageSources().playerAttack(p), 1000f);
        baby.hurt(h.getLevel().damageSources().playerAttack(p), 1000f);
        h.succeedWhen(() -> {
            int shards = items(h, OceanItems.TURTLE_SHELL_SHARD, new BlockPos(3, 1, 4), 1.8);
            h.assertTrue(shards >= 1 && shards <= 3, "a turtle drops 1-3 turtle shell shards, got " + shards);
            h.assertTrue(items(h, OceanItems.TURTLE_SHELL_SHARD, new BlockPos(7, 1, 7), 1.5) == 0, "hatchlings drop none");
            var recipe = h.getLevel().getRecipeManager().byKey(dev.lowpix.winterworks.Winterworks.id("turtle_helmet_from_shards"));
            h.assertTrue(recipe.isPresent() && recipe.get().value().getResultItem(h.getLevel().registryAccess()).is(Items.TURTLE_HELMET),
                    "9 shards craft a Turtle Shell");
            cleanup(h, p);
        });
    }
}
