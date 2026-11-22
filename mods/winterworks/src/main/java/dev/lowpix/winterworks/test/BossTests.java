package dev.lowpix.winterworks.test;

import dev.lowpix.winterworks.boss.FallingIcicleEntity;
import dev.lowpix.winterworks.boss.FrostMaulerEntity;
import dev.lowpix.winterworks.boss.FrostMaulerSkullBlockEntity;
import dev.lowpix.winterworks.boss.FrozenTomb;
import dev.lowpix.winterworks.boss.IcicleBlock;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEffects;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWItems;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.animal.IronGolem;
import net.minecraft.world.entity.animal.Pig;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.enchantment.Enchantments;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.PointedDripstoneBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.DripstoneThickness;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/** GameTests for the boss part of the Cold Zone update (docs/COLD_UPDATE.md 6-8). ./gradlew runGametest */
public class BossTests implements FabricGameTest {
    /** A 32x20x32 empty structure (data/winterworks/gametest/structure/boss_arena.snbt): room for a whole tomb. */
    private static final String ARENA = "winterworks:boss_arena";

    private static void floor(GameTestHelper h, int size) {
        for (int x = 0; x < size; x++) {
            for (int z = 0; z < size; z++) {
                h.setBlock(new BlockPos(x, 0, z), Blocks.STONE);
            }
        }
    }

    private static <T extends Mob> T still(T mob) {
        mob.setNoAi(true);
        return mob;
    }

    private static ServerPlayer survivalPlayer(GameTestHelper h, Vec3 at) {
        @SuppressWarnings("removal")
        ServerPlayer p = h.makeMockServerPlayerInLevel();
        p.setGameMode(GameType.SURVIVAL);
        Vec3 abs = h.absoluteVec(at);
        p.moveTo(abs.x, abs.y, abs.z, 0f, 0f);
        return p;
    }

    private static boolean frostbitten(net.minecraft.world.entity.LivingEntity e, int minAmplifier) {
        MobEffectInstance fx = e.getEffect(WWEffects.FROSTBITE);
        return fx != null && fx.getAmplifier() >= minAmplifier;
    }

    // ------------------------------------------------------------------------------------------- ancient ice

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 100, batch = "boss")
    public void standingOnAncientIceGivesFrostbite(GameTestHelper h) {
        floor(h, 8);
        h.setBlock(new BlockPos(3, 1, 3), WWBlocks.ANCIENT_ICE);
        Pig pig = h.spawn(EntityType.PIG, new Vec3(3.5, 2.05, 3.5));   // with AI (NoAI mobs don't move, so never step)
        h.succeedWhen(() -> h.assertTrue(frostbitten(pig, 0), "a pig standing on ancient ice should get Frostbite"));
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 100, batch = "boss")
    public void walkingIntoAncientIceGivesFrostbite(GameTestHelper h) {
        floor(h, 8);
        for (int z = 0; z < 8; z++) {
            for (int y = 1; y <= 2; y++) {
                h.setBlock(new BlockPos(5, y, z), WWBlocks.ANCIENT_ICE);
            }
        }
        Pig pig = h.spawn(EntityType.PIG, new Vec3(3.5, 1.0, 3.5));
        h.onEachTick(() -> pig.setDeltaMovement(0.15, pig.getDeltaMovement().y, 0));   // shove it into the wall
        h.succeedWhen(() -> {
            h.assertFalse(pig.getBlockStateOn().is(WWBlocks.ANCIENT_ICE), "the pig should be beside the ice, not on it");
            h.assertTrue(frostbitten(pig, 0), "a pig pressed against ancient ice should get Frostbite");
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 60, batch = "boss")
    public void breakingAncientIceBurstsOnNearbyMobs(GameTestHelper h) {
        floor(h, 8);
        BlockPos ice = new BlockPos(2, 1, 2);
        h.setBlock(ice, WWBlocks.ANCIENT_ICE);
        Pig near = still(h.spawn(EntityType.PIG, new Vec3(4.5, 1.0, 2.5)));   // 2 blocks away
        Pig far = still(h.spawn(EntityType.PIG, new Vec3(7.5, 1.0, 7.5)));    // ~7 blocks away
        ServerPlayer player = survivalPlayer(h, new Vec3(2.5, 1.0, 4.5));
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.NETHERITE_AXE));
        player.gameMode.destroyBlock(h.absolutePos(ice));
        h.assertBlockNotPresent(WWBlocks.ANCIENT_ICE, ice);
        h.assertTrue(frostbitten(near, 1), "the burst should give Frostbite II within 3.5 blocks");
        h.assertFalse(frostbitten(far, 0), "the burst should not reach 7 blocks");
        h.runAfterDelay(5, () -> {
            h.assertItemEntityCountIs(WWItems.ANCIENT_ICE, ice, 3.0, 0);   // no silk touch, no ice
            h.succeed();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 60, batch = "boss")
    public void silkTouchKeepsAncientIce(GameTestHelper h) {
        floor(h, 8);
        BlockPos ice = new BlockPos(2, 1, 2);
        h.setBlock(ice, WWBlocks.ANCIENT_ICE);
        ServerPlayer player = survivalPlayer(h, new Vec3(2.5, 1.0, 4.5));
        ItemStack axe = new ItemStack(Items.NETHERITE_AXE);
        axe.enchant(h.getLevel().registryAccess().lookupOrThrow(Registries.ENCHANTMENT).getOrThrow(Enchantments.SILK_TOUCH), 1);
        player.setItemInHand(InteractionHand.MAIN_HAND, axe);
        player.gameMode.destroyBlock(h.absolutePos(ice));
        h.succeedWhen(() -> h.assertItemEntityCountIs(WWItems.ANCIENT_ICE, ice, 3.0, 1));
    }

    // ------------------------------------------------------------------------------------------- icicles

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 100, batch = "boss")
    public void fallingIcicleDamagesWhatIsBelow(GameTestHelper h) {
        floor(h, 8);
        BlockPos roof = new BlockPos(3, 7, 3);
        h.setBlock(roof, Blocks.STONE);
        h.setBlock(roof.below(), WWBlocks.ICICLE.defaultBlockState().setValue(IcicleBlock.TIP, false));
        h.setBlock(roof.below(2), WWBlocks.ICICLE.defaultBlockState().setValue(IcicleBlock.TIP, true));
        Pig pig = still(h.spawn(EntityType.PIG, new Vec3(3.5, 1.0, 3.5)));
        float before = pig.getHealth();
        h.runAfterDelay(2, () -> h.setBlock(roof, Blocks.AIR));   // the support goes
        h.succeedWhen(() -> {
            h.assertBlockNotPresent(WWBlocks.ICICLE, roof.below());
            h.assertBlockNotPresent(WWBlocks.ICICLE, roof.below(2));
            h.assertTrue(pig.getHealth() <= before - FallingIcicleEntity.DAMAGE + 0.01f || !pig.isAlive(),
                    "the pig should be skewered for 6, health " + pig.getHealth());
            h.assertEntityNotPresent(WWEntities.FALLING_ICICLE);   // they shattered
        });
    }

    // ------------------------------------------------------------------------------------------- the Frost Mauler

    private static FrostMaulerEntity mauler(GameTestHelper h, Vec3 at) {
        FrostMaulerEntity m = h.spawn(WWEntities.FROST_MAULER, at);
        m.setNoAi(true);   // no wandering: the tests drive it
        return m;
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 60, batch = "boss")
    public void furyBitesIgnoreInvulnerabilityFrames(GameTestHelper h) {
        floor(h, 8);
        FrostMaulerEntity m = mauler(h, new Vec3(2.5, 1.0, 4.0));
        m.setYRot(0);   // facing +Z (south)
        IronGolem golem = still(h.spawn(EntityType.IRON_GOLEM, new Vec3(2.5, 1.0, 6.6)));
        float before = golem.getHealth();
        int hits = 0;
        for (int i = 0; i < FrostMaulerEntity.FURY_BITES; i++) {   // all in the same tick: frames would block 5 of them
            hits += m.furyBite(golem) == FrostMaulerEntity.BITE_HIT ? 1 : 0;
        }
        h.assertTrue(hits == FrostMaulerEntity.FURY_BITES, "every bite should land, " + hits + " did");
        h.assertTrue(golem.getHealth() <= before - FrostMaulerEntity.FURY_BITES * FrostMaulerEntity.BITE_DAMAGE + 0.5f,
                "6 bites should take 30, health " + before + " -> " + golem.getHealth());
        m.discard();
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 60, batch = "boss")
    public void raisedShieldBlocksFuryBites(GameTestHelper h) {
        floor(h, 8);
        FrostMaulerEntity m = mauler(h, new Vec3(2.5, 1.0, 2.0));
        m.setYRot(0);
        ServerPlayer player = survivalPlayer(h, new Vec3(2.5, 1.0, 4.6));
        player.setYRot(180f);   // looking north, at the Mauler
        player.setYHeadRot(180f);
        player.setItemInHand(InteractionHand.OFF_HAND, new ItemStack(Items.SHIELD));
        player.startUsingItem(InteractionHand.OFF_HAND);
        for (int i = 0; i < 6; i++) {   // a shield needs 5 ticks raised before it blocks
            player.doTick();
        }
        h.assertTrue(player.isBlocking(), "the player should be blocking with the shield");
        float before = player.getHealth();
        for (int i = 0; i < FrostMaulerEntity.FURY_BITES; i++) {
            int r = m.furyBite(player);
            h.assertTrue(r == FrostMaulerEntity.BITE_BLOCKED, "bite " + i + " should be blocked by the shield, got " + r);
        }
        h.assertTrue(player.getHealth() == before, "a shielded player takes no bite damage");
        m.discard();
        h.succeed();
    }

    /** Its own batch: the roar throws back everything within 8 blocks, the neighbouring test area included. */
    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 60, batch = "boss_roar")
    public void roarSlowsAndBlowsBackAndShattersIce(GameTestHelper h) {
        floor(h, 8);
        FrostMaulerEntity m = mauler(h, new Vec3(2.5, 1.0, 2.5));
        Pig pig = still(h.spawn(EntityType.PIG, new Vec3(6.5, 1.0, 2.5)));
        BlockPos ice = new BlockPos(2, 1, 6);
        h.setBlock(ice, Blocks.PACKED_ICE);
        h.setBlock(ice.above(), Blocks.SNOW_BLOCK);
        m.roarBlast(h.getLevel());
        MobEffectInstance slow = pig.getEffect(MobEffects.MOVEMENT_SLOWDOWN);
        h.assertTrue(slow != null && slow.getAmplifier() == 1, "the roar should give Slowness II");
        h.assertTrue(pig.getDeltaMovement().x > 0.2, "the roar should blow the pig away, dx=" + pig.getDeltaMovement().x);
        h.assertBlockNotPresent(Blocks.PACKED_ICE, ice);
        h.assertBlockNotPresent(Blocks.SNOW_BLOCK, ice.above());
        h.assertBlockPresent(Blocks.STONE, new BlockPos(2, 0, 2));   // the floor it stands on holds
        m.discard();
        h.succeed();
    }

    /** Its own batch: the death burst throws back everything within 14 blocks, neighbouring tests included. */
    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 200, batch = "boss_death")
    public void deathDropsSkullAndFangs(GameTestHelper h) {
        floor(h, 8);
        FrostMaulerEntity m = mauler(h, new Vec3(3.5, 1.0, 3.5));
        m.kill();
        h.assertTrue(m.isDeadOrDying(), "it should be dying");
        h.succeedWhen(() -> {
            h.assertTrue(m.isRemoved(), "it bursts at the end of the death animation");
            h.assertItemEntityCountIs(WWItems.FROST_MAULER_SKULL, new BlockPos(3, 1, 3), 12.0, 1);
            h.assertItemEntityCountIs(WWItems.MAULER_FANG, new BlockPos(3, 1, 3), 12.0, 2);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 40, batch = "boss")
    public void freezingAndFrostbiteCannotHurtIt(GameTestHelper h) {
        floor(h, 8);
        FrostMaulerEntity m = mauler(h, new Vec3(3.5, 1.0, 3.5));
        h.assertTrue(m.getMaxHealth() == 400f, "the Frost Mauler has 400 health, not " + m.getMaxHealth());
        float hp = m.getHealth();
        m.hurt(h.getLevel().damageSources().freeze(), 20f);
        m.addEffect(new MobEffectInstance(WWEffects.FROSTBITE, 200, 1));
        h.assertTrue(m.getHealth() == hp, "freezing should not hurt the Frost Mauler");
        h.assertFalse(m.hasEffect(WWEffects.FROSTBITE), "the Frost Mauler can't get Frostbite");
        m.hurt(h.getLevel().damageSources().inFire(), 10f);
        // 10 fire damage x1.5 = 15, less armour 10: 13.5 (without the 1.5x it would be 8)
        h.assertTrue(hp - m.getHealth() > 12f, "fire should hurt it 1.5x, took " + (hp - m.getHealth()));
        m.discard();
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 40, batch = "boss")
    public void enragedItRecoversFaster(GameTestHelper h) {
        floor(h, 8);
        FrostMaulerEntity m = mauler(h, new Vec3(3.5, 1.0, 3.5));
        h.assertTrue(m.rechargeTicks() == FrostMaulerEntity.RECHARGE_TICKS, "a fresh Mauler recharges for 5 s");
        m.setHealth(m.getMaxHealth() * 0.3f);
        h.runAfterDelay(2, () -> {
            h.assertTrue(m.isEnraged(), "below 35% health it is enraged");
            h.assertTrue(m.rechargeTicks() < FrostMaulerEntity.RECHARGE_TICKS, "enraged, it recovers faster");
            m.discard();
            h.succeed();
        });
    }

    // ------------------------------------------------------------------------------------------- icicle rain, hurling, combo

    /** A pig under a stone roof; the Mauler (kept still) calls one icicle down on it. */
    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 120, batch = "boss_icicles")
    public void icicleRainIsTelegraphedThenHits(GameTestHelper h) {
        floor(h, 8);
        for (int x = 0; x < 8; x++) {
            for (int z = 0; z < 8; z++) {
                h.setBlock(new BlockPos(x, 8, z), Blocks.STONE);
            }
        }
        FrostMaulerEntity m = mauler(h, new Vec3(1.5, 1.0, 1.5));
        m.holdSpecialAttacks(100000);
        Pig pig = still(h.spawn(EntityType.PIG, new Vec3(5.5, 1.0, 5.5)));
        m.setTarget(pig);
        float hp = pig.getHealth();
        long start = h.getTick();
        m.icicleRain(h.getLevel(), 1);
        h.assertTrue(m.pendingIcicles() == 1, "one icicle should be on its way, " + m.pendingIcicles());
        long[] hitAt = {-1};
        boolean[] early = {false};
        h.onEachTick(() -> {
            if (hitAt[0] < 0 && pig.getHealth() < hp) {
                hitAt[0] = h.getTick();
            }
            if (h.getTick() - start < 4 && !h.getEntities(WWEntities.FALLING_ICICLE).isEmpty()) {
                early[0] = true;
            }
        });
        h.succeedWhen(() -> {
            h.assertTrue(hitAt[0] > 0, "the icicle should come down on the pig");
            h.assertFalse(early[0], "it should warn before it drops");
            h.assertTrue(hitAt[0] - start >= 15, "telegraphed about a second ahead, but it hit after " + (hitAt[0] - start) + " ticks");
            h.assertTrue(pig.getHealth() <= hp - FallingIcicleEntity.DAMAGE + 0.01f || !pig.isAlive(), "skewered for 6");
            m.discard();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 60, batch = "boss_icicles")
    public void hurledIcicleHitsTheTarget(GameTestHelper h) {
        floor(h, 8);
        FrostMaulerEntity m = mauler(h, new Vec3(1.5, 1.0, 1.5));
        m.holdSpecialAttacks(100000);
        m.setYRot(-45f);   // facing the pig (south-east)
        m.setYHeadRot(-45f);
        Pig pig = still(h.spawn(EntityType.PIG, new Vec3(6.5, 1.0, 6.5)));
        float hp = pig.getHealth();
        FallingIcicleEntity ice = m.hurlIcicle(h.getLevel(), pig, null);
        h.assertTrue(ice.isThrown() && ice.getDeltaMovement().horizontalDistance() > 0.5, "it should be thrown hard");
        h.succeedWhen(() -> {
            h.assertTrue(pig.getHealth() <= hp - FallingIcicleEntity.DAMAGE + 0.01f || !pig.isAlive(),
                    "the thrown icicle should hit the pig, health " + pig.getHealth());
            h.assertTrue(m.getHealth() == m.getMaxHealth(), "it never hits its thrower");
            h.assertEntityNotPresent(WWEntities.FALLING_ICICLE);
            m.discard();
        });
    }

    /** Fast then slow then spent (like the Fang Daggers): the gaps between hits grow, then it must recharge. */
    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 400, batch = "boss_combo")
    public void comboStartsFastTiresThenRecharges(GameTestHelper h) {
        floor(h, 8);
        FrostMaulerEntity m = h.spawn(WWEntities.FROST_MAULER, new Vec3(2.5, 1.0, 2.0));   // with its AI
        m.holdSpecialAttacks(100000);
        IronGolem golem = still(h.spawn(EntityType.IRON_GOLEM, new Vec3(2.5, 1.0, 5.4)));
        List<Long> hits = new ArrayList<>();
        float[] last = {golem.getHealth()};
        long[] rechargeAt = {-1};
        h.onEachTick(() -> {
            if (m.getTarget() != golem) {
                m.setTarget(golem);
            }
            if (rechargeAt[0] < 0) {
                if (golem.getHealth() < last[0]) {
                    hits.add(h.getTick());
                }
                if (m.isStunned()) {
                    rechargeAt[0] = h.getTick();
                }
            }
            last[0] = golem.getHealth();
        });
        h.succeedWhen(() -> {
            h.assertTrue(rechargeAt[0] > 0, "it should wear itself out and recharge, " + hits.size() + " hits so far");
            h.assertTrue(hits.size() >= 5, "a combo of several hits before it tires, got " + hits.size());
            long first = hits.get(1) - hits.get(0), lastGap = hits.get(hits.size() - 1) - hits.get(hits.size() - 2);
            h.assertTrue(first <= 8, "the combo opens at a frantic pace, first gap " + first + " ticks, hits " + hits);
            h.assertTrue(lastGap >= 11 && lastGap > first, "and slows as it tires, last gap " + lastGap + " ticks, hits " + hits);
            h.assertTrue(m.isStunned() && m.fatigue() > 0.5f, "recharging: winded and open");
            m.discard();
        });
    }

    // ------------------------------------------------------------------------------------------- the tomb

    /** Fills the arena with stone (the tomb is carved out of rock) and builds a tomb in the middle. */
    private static BlockPos buildTomb(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        BlockPos o = h.absolutePos(BlockPos.ZERO);
        for (BlockPos p : BlockPos.betweenClosed(o.offset(0, 0, 0), o.offset(31, 18, 31))) {
            level.setBlock(p, Blocks.STONE.defaultBlockState(), Block.UPDATE_CLIENTS);
        }
        BlockPos centre = new BlockPos(16, 4, 16);
        FrozenTomb.build(level, h.absolutePos(centre), RandomSource.create(42));
        return centre;
    }

    private static List<FrostMaulerEntity> maulers(GameTestHelper h) {
        return h.getLevel().getEntitiesOfClass(FrostMaulerEntity.class, new AABB(h.absolutePos(BlockPos.ZERO)).inflate(0)
                .expandTowards(32, 20, 32));
    }

    private static int countAncientIce(GameTestHelper h, BlockPos centre, int radius) {
        int n = 0;
        for (BlockPos p : BlockPos.betweenClosed(centre.offset(-radius, -radius, -radius), centre.offset(radius, radius, radius))) {
            if (h.getLevel().getBlockState(p).is(WWBlocks.ANCIENT_ICE)) {
                n++;
            }
        }
        return n;
    }

    @GameTest(template = ARENA, timeoutTicks = 100, batch = "boss_tomb_build")
    public void frozenTombHoldsADormantMauler(GameTestHelper h) {
        BlockPos centre = buildTomb(h);
        List<FrostMaulerEntity> ms = maulers(h);
        h.assertTrue(ms.size() == 1, "the tomb should hold exactly one Frost Mauler, found " + ms.size());
        FrostMaulerEntity m = ms.get(0);
        h.assertTrue(m.isDormant() && m.isNoAi() && m.isNoGravity(), "the Mauler should be dormant");
        int ice = countAncientIce(h, m.blockPosition(), FrostMaulerEntity.TOMB_RADIUS);
        h.assertTrue(ice >= 60, "the tomb should have a big block of ancient ice, found " + ice);
        h.assertTrue(m.tombIce() == ice, "the Mauler should know its tomb ice: " + m.tombIce() + " vs " + ice);
        h.assertBlockPresent(Blocks.AIR, centre.above(2));   // hollowed out for it
        // the chamber: a big hollow in the rock, an ice skin, icicles under the roof
        int icicles = 0, coat = 0, air = 0;
        for (BlockPos p : BlockPos.betweenClosed(h.absolutePos(new BlockPos(1, 1, 1)), h.absolutePos(new BlockPos(30, 17, 30)))) {
            var s = h.getLevel().getBlockState(p);
            if (s.is(WWBlocks.ICICLE)) {
                icicles++;
            } else if (s.is(Blocks.PACKED_ICE) || s.is(Blocks.BLUE_ICE) || s.is(Blocks.SNOW_BLOCK)) {
                coat++;
            } else if (s.isAir()) {
                air++;
            }
        }
        h.assertTrue(air >= 800, "a chamber should be carved out, " + air + " air blocks");
        h.assertTrue(icicles >= 10, "icicles should hang from the roof, found " + icicles);
        h.assertTrue(coat >= 300, "the walls should be coated in ice and snow, found " + coat);
        float hp = m.getHealth();
        m.hurt(h.getLevel().damageSources().generic(), 50f);
        h.assertTrue(m.getHealth() == hp, "a dormant Mauler is invulnerable");
        h.runAfterDelay(30, () -> {   // and it stays put
            h.assertTrue(m.isDormant(), "nothing broke: it should still be dormant");
            m.discard();
            h.succeed();
        });
    }

    @GameTest(template = ARENA, timeoutTicks = 300, batch = "boss_tomb_wake")
    public void breakingSixTombBlocksWakesTheMauler(GameTestHelper h) {
        buildTomb(h);
        FrostMaulerEntity m = maulers(h).get(0);
        BlockPos mp = m.blockPosition();
        List<BlockPos> ice = new ArrayList<>();
        for (BlockPos p : BlockPos.betweenClosed(mp.offset(-4, -2, -4), mp.offset(4, 5, 4))) {
            if (h.getLevel().getBlockState(p).is(WWBlocks.ANCIENT_ICE)) {
                ice.add(p.immutable());
            }
        }
        h.assertTrue(ice.size() > 10, "there should be tomb ice, found " + ice.size());
        for (int i = 0; i < 5; i++) {
            h.getLevel().destroyBlock(ice.get(i), false);
        }
        long[] wokeAt = {-1}, sixthAt = {-1}, crackAt = {-1};
        h.runAfterDelay(25, () -> {
            h.assertTrue(m.isDormant() && m.mode() == FrostMaulerEntity.MODE_NONE, "5 broken blocks are not enough");
            h.getLevel().destroyBlock(ice.get(5), false);   // the sixth
            sixthAt[0] = h.getTick();
        });
        h.onEachTick(() -> {
            if (crackAt[0] < 0 && m.mode() == FrostMaulerEntity.MODE_AWAKENING) {
                crackAt[0] = h.getTick();
                h.assertTrue(m.isDormant(), "while the ice cracks it is still frozen in");
            }
            if (wokeAt[0] < 0 && !m.isDormant()) {
                wokeAt[0] = h.getTick();
            }
        });
        h.succeedWhen(() -> {
            h.assertTrue(sixthAt[0] > 0 && wokeAt[0] > sixthAt[0], "the Mauler should wake only after the sixth block breaks");
            h.assertTrue(crackAt[0] >= sixthAt[0] && crackAt[0] <= sixthAt[0] + 11, "the ice should start cracking at once");
            h.assertTrue(wokeAt[0] - crackAt[0] >= FrostMaulerEntity.AWAKEN_TICKS - 1, "the ice cracks for 3 s before it bursts, took "
                    + (wokeAt[0] - crackAt[0]));
            h.assertTrue(!m.isNoAi() && !m.isNoGravity(), "awake: AI and gravity back");
            h.assertTrue(countAncientIce(h, mp, FrostMaulerEntity.TOMB_RADIUS) == 0, "the tomb ice should have burst");
            h.assertTrue(m.onGround(), "it should have dropped to the floor");
            m.discard();
        });
    }

    // ------------------------------------------------------------------------------------------- the skull

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 200, batch = "boss")
    public void netherStarOnEncasedSkullRevivesTheMauler(GameTestHelper h) {
        floor(h, 8);
        BlockPos skull = new BlockPos(3, 2, 3);
        h.setBlock(skull, WWBlocks.FROST_MAULER_SKULL.defaultBlockState());
        for (Direction d : Direction.values()) {
            h.setBlock(skull.relative(d), WWBlocks.ANCIENT_ICE);
        }
        ServerPlayer player = survivalPlayer(h, new Vec3(3.5, 1.0, 6.5));
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.NETHER_STAR));
        BlockPos onIce = skull.above();
        BlockPos abs = h.absolutePos(onIce);
        h.useBlock(onIce, player, new BlockHitResult(Vec3.atCenterOf(abs), Direction.UP, abs, false));
        h.assertTrue(player.getMainHandItem().isEmpty(), "the Nether Star should be used up");
        h.succeedWhen(() -> {
            h.assertBlockNotPresent(WWBlocks.FROST_MAULER_SKULL, skull);
            h.assertBlockNotPresent(WWBlocks.ANCIENT_ICE, onIce);
            List<FrostMaulerEntity> ms = h.getLevel().getEntitiesOfClass(FrostMaulerEntity.class,
                    new AABB(h.absolutePos(skull)).inflate(4));
            h.assertTrue(ms.size() == 1, "one Frost Mauler should rise, found " + ms.size());
            h.assertTrue(!ms.get(0).isDormant(), "it should be awake");
            ms.forEach(FrostMaulerEntity::discard);
        });
    }

    // ---- 0.4 fixes: Cold Zone (docs/FIXES_0_4.md): the skull roars on redstone

    private static BlockState stalactite(DripstoneThickness t) {
        return Blocks.POINTED_DRIPSTONE.defaultBlockState().setValue(PointedDripstoneBlock.TIP_DIRECTION, Direction.DOWN)
                .setValue(PointedDripstoneBlock.THICKNESS, t);
    }

    /**
     * A skull under a cave roof hung with icicles and dripstone. A rising redstone edge: it roars and everything above
     * it within 12 blocks falls (an icicle 13 blocks off stays); powered again within 3 s it stays quiet; after the
     * cooldown it roars again.
     */
    @GameTest(template = ARENA, timeoutTicks = 160, batch = "boss_skull_roar")
    public void poweredSkullRoarsAndBringsDownIciclesAndDripstone(GameTestHelper h) {
        floor(h, 20);
        for (int x = 0; x < 20; x++) {
            for (int z = 0; z < 10; z++) {
                h.setBlock(new BlockPos(x, 12, z), Blocks.STONE);
            }
        }
        BlockPos skull = new BlockPos(4, 1, 4), power = new BlockPos(5, 1, 4);
        h.setBlock(skull, WWBlocks.FROST_MAULER_SKULL.defaultBlockState());
        BlockPos iceTop = new BlockPos(4, 11, 4), iceTip = new BlockPos(4, 10, 4), iceFar = new BlockPos(17, 11, 4),
                iceSide = new BlockPos(12, 11, 9), dripTop = new BlockPos(7, 11, 2), dripTip = new BlockPos(7, 10, 2);
        h.setBlock(iceTop, WWBlocks.ICICLE.defaultBlockState().setValue(IcicleBlock.TIP, false));
        h.setBlock(iceTip, WWBlocks.ICICLE.defaultBlockState().setValue(IcicleBlock.TIP, true));
        h.setBlock(iceSide, WWBlocks.ICICLE.defaultBlockState());
        h.setBlock(iceFar, WWBlocks.ICICLE.defaultBlockState());
        h.setBlock(dripTop, stalactite(DripstoneThickness.FRUSTUM));
        h.setBlock(dripTip, stalactite(DripstoneThickness.TIP));
        FrostMaulerSkullBlockEntity be = h.getBlockEntity(skull);
        h.assertTrue(be != null && be.roarCooldown() == 0, "the skull should be ready to roar");
        long[] firstRoar = {-1};
        h.startSequence()
                .thenExecuteAfter(2, () -> {
                    h.assertBlockPresent(WWBlocks.ICICLE, iceTip);
                    h.assertBlockPresent(Blocks.POINTED_DRIPSTONE, dripTip);
                    h.setBlock(power, Blocks.REDSTONE_BLOCK);   // the rising edge
                    firstRoar[0] = h.getTick();
                    h.assertTrue(be.isPowered() && be.roarCooldown() > 0, "powered, it should have roared");
                    for (BlockPos p : List.of(iceTop, iceTip, iceSide)) {
                        h.assertBlockNotPresent(WWBlocks.ICICLE, p);
                    }
                    h.assertBlockNotPresent(Blocks.POINTED_DRIPSTONE, dripTop);
                    h.assertBlockNotPresent(Blocks.POINTED_DRIPSTONE, dripTip);
                    h.assertBlockPresent(WWBlocks.ICICLE, iceFar);   // 13 blocks off: out of reach
                    h.assertTrue(h.getEntities(WWEntities.FALLING_ICICLE).size() >= 3, "the icicles should be falling");
                    h.assertTrue(h.getEntities(EntityType.FALLING_BLOCK).size() >= 2, "the dripstone should fall like vanilla stalactites");
                })
                .thenExecuteAfter(1, () -> h.setBlock(power, Blocks.AIR))
                .thenExecuteAfter(2, () -> {
                    h.setBlock(iceTop, WWBlocks.ICICLE.defaultBlockState());
                    h.setBlock(power, Blocks.REDSTONE_BLOCK);   // another edge, inside the 3 s cooldown
                    h.assertBlockPresent(WWBlocks.ICICLE, iceTop);
                })
                .thenExecuteAfter(1, () -> h.setBlock(power, Blocks.AIR))
                .thenWaitUntil(() -> h.assertTrue(be.roarCooldown() == 0, "the cooldown should run out"))
                .thenExecute(() -> {
                    h.assertTrue(h.getTick() - firstRoar[0] >= FrostMaulerSkullBlockEntity.ROAR_COOLDOWN - 1,
                            "3 s between roars, ready after " + (h.getTick() - firstRoar[0]));
                    h.assertBlockPresent(WWBlocks.ICICLE, iceTop);
                    h.setBlock(power, Blocks.REDSTONE_BLOCK);
                    h.assertBlockNotPresent(WWBlocks.ICICLE, iceTop);
                    h.assertBlockPresent(WWBlocks.ICICLE, iceFar);
                })
                .thenSucceed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 40, batch = "boss")
    public void skullNeedsAllSixSidesOfIce(GameTestHelper h) {
        floor(h, 8);
        BlockPos skull = new BlockPos(3, 2, 3);
        h.setBlock(skull, WWBlocks.FROST_MAULER_SKULL.defaultBlockState());
        for (Direction d : Direction.values()) {
            if (d != Direction.NORTH) {
                h.setBlock(skull.relative(d), WWBlocks.ANCIENT_ICE);
            }
        }
        ServerPlayer player = survivalPlayer(h, new Vec3(3.5, 1.0, 6.5));
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.NETHER_STAR));
        BlockPos abs = h.absolutePos(skull.above());
        h.useBlock(skull.above(), player, new BlockHitResult(Vec3.atCenterOf(abs), Direction.UP, abs, false));
        h.assertTrue(player.getMainHandItem().is(Items.NETHER_STAR), "an open skull keeps the star");
        h.runAfterDelay(20, () -> {
            h.assertBlockPresent(WWBlocks.FROST_MAULER_SKULL, skull);
            h.assertEntityNotPresent(WWEntities.FROST_MAULER);
            h.succeed();
        });
    }
}
