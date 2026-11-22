package dev.lowpix.winterworks.test;

import dev.lowpix.winterworks.end.Eclipse;
import dev.lowpix.winterworks.end.Petrify;
import dev.lowpix.winterworks.endboss.DragonLightBeam;
import dev.lowpix.winterworks.endboss.DragonRework;
import dev.lowpix.winterworks.endboss.EclipseState;
import dev.lowpix.winterworks.endboss.Monolith;
import dev.lowpix.winterworks.endmob.Obolisk;
import dev.lowpix.winterworks.registry.EndBlocks;
import dev.lowpix.winterworks.registry.EndEntities;
import dev.lowpix.winterworks.registry.EndItems;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ExperienceOrb;
import net.minecraft.world.entity.animal.IronGolem;
import net.minecraft.world.entity.animal.Pig;
import net.minecraft.world.entity.boss.enderdragon.EndCrystal;
import net.minecraft.world.entity.boss.enderdragon.EnderDragon;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.projectile.Arrow;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * GameTests for the Living End's bosses (docs/END_UPDATE.md sections 5, 10, 11). Tests that touch the End's one
 * eclipse, or put a boss in an arena (they reach 32 blocks), each run in a batch of their own.
 */
public class EndBossTests implements FabricGameTest {
    /** A 32x20x32 empty structure (data/winterworks/gametest/structure/boss_arena.snbt). */
    private static final String ARENA = "winterworks:boss_arena";

    @GameTest(template = EMPTY_STRUCTURE)
    public void registered(GameTestHelper h) {
        h.assertTrue(EndEntities.MONOLITH != null, "registered");
        h.succeed();
    }

    private static void floor(GameTestHelper h, int size) {
        for (int x = 0; x < size; x++) {
            for (int z = 0; z < size; z++) {
                h.setBlock(new BlockPos(x, 0, z), Blocks.STONE);
            }
        }
    }

    private static ServerPlayer survivalPlayer(GameTestHelper h, Vec3 at) {
        @SuppressWarnings("removal")
        ServerPlayer p = h.makeMockServerPlayerInLevel();
        p.setGameMode(GameType.SURVIVAL);
        Vec3 abs = h.absoluteVec(at);
        p.moveTo(abs.x, abs.y, abs.z, 0f, 0f);
        return p;
    }

    private static ServerLevel end(GameTestHelper h) {
        return h.getLevel().getServer().getLevel(Level.END);
    }

    // ------------------------------------------------------------------------------------------- the eclipse

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 300, batch = "endboss_eclipse")
    public void eclipseStartsFadesAndStops(GameTestHelper h) {
        ServerLevel level = h.getLevel(), end = end(h);
        h.assertTrue(end != null, "the test server has an End");
        Eclipse.stop(level);
        h.assertFalse(Eclipse.isActive(end), "stopped: no eclipse");
        Eclipse.start(level, 1000);
        h.assertTrue(Eclipse.isActive(end), "started from any level, it is on in the End at once");
        h.assertTrue(Eclipse.fraction(end) < 0.01f, "it fades in from nothing");
        h.assertFalse(Eclipse.isActive(level), "the eclipse is the End's only");
        Eclipse.start(level, 200);
        h.assertTrue(EclipseState.get(end).remaining() >= 999, "starting a shorter one never shortens it");
        h.runAfterDelay(60, () -> {
            float f = Eclipse.fraction(end);
            h.assertTrue(f > 0.07f && f < 0.13f, "after 60 of its 600 fade-in ticks it is about a tenth on, was " + f);
            h.assertTrue(Eclipse.fraction(level) == 0f, "the overworld never darkens");
            // saved state
            EclipseState s = EclipseState.get(end);
            h.assertTrue(s.isDirty(), "the eclipse marks its saved data dirty");
            CompoundTag tag = s.save(new CompoundTag(), level.registryAccess());
            EclipseState back = EclipseState.load(tag, level.registryAccess());
            h.assertTrue(back.remaining() == s.remaining() && Math.abs(back.level() - s.level()) < 1.0E-6, "it saves and loads");
            Eclipse.stop(level);
            h.assertFalse(Eclipse.isActive(end), "stopped");
            h.assertTrue(Eclipse.fraction(end) == 0f, "stopped: no fraction left");
            Eclipse.start(level, 120);   // a short one: it fades out over its last ticks
        });
        h.runAfterDelay(150, () -> {
            float f = Eclipse.fraction(end);
            h.assertTrue(f > 0f && f <= 34f / EclipseState.FADE, "it fades out with the ticks it has left (about 30), was " + f);
        });
        h.runAfterDelay(185, () -> {
            h.assertFalse(Eclipse.isActive(end), "a 120-tick eclipse is over after 120 ticks");
            h.succeed();
        });
    }

    // ------------------------------------------------------------------------------------------- the Ender Dragon

    /** A 3x3 obsidian tower at (x, z), 6 tall, capped with bedrock; returns its pillar (absolute). */
    private static DragonRework.Pillar tower(GameTestHelper h, int x, int z, boolean crystal) {
        for (int y = 1; y <= 6; y++) {
            for (int dx = -1; dx <= 1; dx++) {
                for (int dz = -1; dz <= 1; dz++) {
                    h.setBlock(new BlockPos(x + dx, y, z + dz), Blocks.OBSIDIAN);
                }
            }
        }
        h.setBlock(new BlockPos(x, 7, z), Blocks.BEDROCK);
        if (crystal) {
            h.spawn(EntityType.END_CRYSTAL, new Vec3(x + 0.5, 8, z + 0.5));
        }
        BlockPos abs = h.absolutePos(new BlockPos(x, 7, z));
        return new DragonRework.Pillar(abs.getX(), abs.getZ(), 1, abs.getY());
    }

    @GameTest(template = ARENA, timeoutTicks = 400, batch = "endboss_dragon")
    public void dragonSecondPhaseOnceAtHalfHealth(GameTestHelper h) {
        ServerLevel level = h.getLevel(), end = end(h);
        Eclipse.stop(level);
        DragonRework.Pillar a = tower(h, 6, 6, true), b = tower(h, 25, 25, false);
        EnderDragon d = h.spawn(EntityType.ENDER_DRAGON, new Vec3(16, 14, 16));
        d.setNoAi(true);   // stays put: a NoAI dragon keeps its second phase's world changes, without attacks
        DragonRework.setPillars(d, List.of(a, b));
        h.runAfterDelay(5, () -> {
            h.assertFalse(DragonRework.phaseTwo(d), "above half health: first phase");
            h.assertFalse(Eclipse.isActive(end), "no eclipse yet");
            d.setHealth(d.getMaxHealth() * 0.5f - 1f);
        });
        h.runAfterDelay(8, () -> {
            h.assertTrue(DragonRework.phaseTwo(d), "at half health its second phase begins");
            h.assertTrue(Eclipse.isActive(end), "its second phase starts an eclipse");
            DragonRework.state(d).crystalTimer = 1;   // the 40 s regrowth, now
        });
        h.runAfterDelay(12, () -> {
            List<EndCrystal> onB = level.getEntitiesOfClass(EndCrystal.class,
                    new AABB(b.x() - 2, b.height() - 1, b.z() - 2, b.x() + 3, b.height() + 20, b.z() + 3));
            h.assertTrue(onB.size() == 1, "a crystal regrows on the bare tower top, found " + onB.size());
            d.setHealth(d.getMaxHealth());   // healed above half: the second phase stays, and doesn't start twice
        });
        h.runAfterDelay(240, () -> {
            for (DragonRework.Pillar p : List.of(a, b)) {
                BlockPos top = new BlockPos(p.x(), p.height() + DragonRework.TOWER_STEPS, p.z());
                h.assertTrue(level.getBlockState(top.below()).is(Blocks.OBSIDIAN), "the tower grew 10 blocks of obsidian");
                h.assertTrue(level.getBlockState(top).is(Blocks.BEDROCK), "its bedrock cap rose with it");
                List<EndCrystal> crystals = level.getEntitiesOfClass(EndCrystal.class, new AABB(top).inflate(2, 3, 2));
                h.assertTrue(crystals.size() == 1, "its crystal was carried up, found " + crystals.size());
                h.assertTrue(crystals.get(0).getY() >= top.getY() + 0.9, "the crystal sits on the new top");
            }
            h.assertTrue(DragonRework.state(d).towerSteps == DragonRework.TOWER_STEPS, "towers stop at 10");
            h.assertTrue(DragonRework.phaseTwo(d), "still enraged");
            h.assertTrue(Eclipse.isActive(end), "the eclipse lasts while it lives");
            d.discard();
            Eclipse.stop(level);
            h.succeed();
        });
    }

    @GameTest(template = ARENA, timeoutTicks = 200, batch = "endboss_beam")
    public void lightBeamWarnsThenBurnsAndBlinds(GameTestHelper h) {
        floor(h, 12);
        IronGolem golem = h.spawn(EntityType.IRON_GOLEM, new Vec3(5.5, 1, 5.5));
        golem.setNoAi(true);
        Pig aside = h.spawn(EntityType.PIG, new Vec3(9.5, 1, 9.5));   // off the beam's line: untouched
        aside.setNoAi(true);
        Vec3 g = golem.position();
        DragonLightBeam beam = DragonLightBeam.fire(h.getLevel(), g.add(0, 12, 0), g, null);
        float max = golem.getMaxHealth();
        h.runAfterDelay(DragonLightBeam.WARNING - 4, () -> {
            h.assertTrue(golem.getHealth() == max, "the warning line doesn't hurt");
            h.assertTrue(beam.end().y < -11, "the beam reaches down to the ground");
        });
        h.runAfterDelay(DragonLightBeam.WARNING + 3, () -> {
            h.assertTrue(golem.getHealth() <= max - DragonLightBeam.DAMAGE + 0.5f, "the beam hits for 10, health " + golem.getHealth());
            MobEffectInstance blind = golem.getEffect(MobEffects.BLINDNESS);
            h.assertTrue(blind != null && blind.getDuration() > 100, "and blinds for 6 s");
        });
        h.runAfterDelay(DragonLightBeam.WARNING + DragonLightBeam.FIRING + 3, () -> {
            h.assertTrue(golem.getHealth() <= max - 2 * DragonLightBeam.DAMAGE + 0.5f, "every half second: twice in its 1 s");
            h.assertTrue(aside.getHealth() == aside.getMaxHealth() && !aside.hasEffect(MobEffects.BLINDNESS), "only what is in it");
            h.assertTrue(beam.isRemoved(), "then it is gone");
            h.succeed();
        });
    }

    // ------------------------------------------------------------------------------------------- the Monolith

    private static Monolith monolith(GameTestHelper h) {
        Monolith m = h.spawn(EndEntities.MONOLITH, new Vec3(16.5, 2.2, 16.5));
        m.setYRot(180f);
        return m;
    }

    @GameTest(template = ARENA, timeoutTicks = 300, batch = "endboss_stare")
    public void monolithStarePetrifies(GameTestHelper h) {
        floor(h, 32);
        Monolith m = monolith(h);
        Pig target = h.spawn(EntityType.PIG, new Vec3(16.5, 1, 6.5));
        target.setNoAi(true);
        // does the gear agent's Petrify work yet? (a stub does nothing; then only the call is checked)
        Pig probe = h.spawn(EntityType.PIG, new Vec3(2.5, 1, 2.5));
        probe.setNoAi(true);
        Petrify.freeze(probe, 40, true);
        boolean petrifyWorks = Petrify.isFrozen(probe);
        h.runAfterDelay(2, () -> {
            m.wakeFor(target);
            m.holdActions(100000);   // no slams: just the stare
            m.startStare(target);
        });
        h.runAfterDelay(2 + 45, () -> {
            MobEffectInstance slow = target.getEffect(MobEffects.MOVEMENT_SLOWDOWN);
            h.assertTrue(slow != null && slow.getAmplifier() >= 1, "Slowness builds while it stares");
            h.assertTrue(m.petrifyCalls() == 0, "not petrified before 4 s");
        });
        h.runAfterDelay(2 + Monolith.STARE_PETRIFY + 3, () -> {
            h.assertTrue(m.petrifyCalls() == 1, "4 s of unbroken stare petrifies");
            if (petrifyWorks) {
                h.assertTrue(Petrify.isFrozen(target), "the stared-at pig is encased in obsidian");
            }
            h.assertTrue(m.stareTarget() < 0, "then the stare ends");
            h.succeed();
        });
    }

    @GameTest(template = ARENA, timeoutTicks = 300, batch = "endboss_stare_break")
    public void monolithStareBrokenByCover(GameTestHelper h) {
        floor(h, 32);
        Monolith m = monolith(h);
        Pig target = h.spawn(EntityType.PIG, new Vec3(16.5, 1, 6.5));
        target.setNoAi(true);
        h.runAfterDelay(2, () -> {
            m.wakeFor(target);
            m.holdActions(100000);
            m.startStare(target);
        });
        h.runAfterDelay(50, () -> {   // a wall goes up between them before 4 s
            for (int x = 12; x <= 21; x++) {
                for (int y = 1; y <= 12; y++) {
                    h.setBlock(new BlockPos(x, y, 9), Blocks.OBSIDIAN);
                }
            }
        });
        h.runAfterDelay(130, () -> {
            h.assertTrue(m.petrifyCalls() == 0, "breaking line of sight escapes the stare");
            h.succeed();
        });
    }

    private static int obolisks(GameTestHelper h) {
        return h.getLevel().getEntitiesOfClass(Obolisk.class, new AABB(h.absolutePos(BlockPos.ZERO)).inflate(40), Obolisk::isAlive).size();
    }

    @GameTest(template = ARENA, timeoutTicks = 400, batch = "endboss_summon")
    public void monolithSummonsAtItsThresholds(GameTestHelper h) {
        floor(h, 32);
        Monolith m = monolith(h);
        ServerPlayer p = survivalPlayer(h, new Vec3(16.5, 1, 4.5));
        h.runAfterDelay(2, () -> {
            m.wakeFor(p);
            m.holdActions(100000);   // no slams or stares, but the threshold summons still come
            m.hurt(m.damageSources().playerAttack(p), 300f);
            h.assertTrue(m.getHealth() < m.getMaxHealth() * 0.66f && m.getHealth() > m.getMaxHealth() * 0.33f,
                    "below 66%: " + m.getHealth());
        });
        h.runAfterDelay(2 + Monolith.SUMMON_AT + 12, () -> {
            h.assertTrue(m.summonCalls() == 2, "2 Obolisks at 66%, asked for " + m.summonCalls());
            if (obolisks(h) > 0) {
                h.assertTrue(obolisks(h) == 2, "and they come: " + obolisks(h));
            }
            m.invulnerableTime = 0;
            m.hurt(m.damageSources().playerAttack(p), 300f);
            h.assertTrue(m.getHealth() < m.getMaxHealth() * 0.33f, "below 33%: " + m.getHealth());
        });
        h.runAfterDelay(2 + Monolith.SUMMON_AT + 12 + Monolith.SUMMON_TICKS + Monolith.SUMMON_AT + 12, () -> {
            h.assertTrue(m.summonCalls() == 4, "2 more at 33%, asked for " + m.summonCalls());
            if (obolisks(h) > 0) {
                h.assertTrue(obolisks(h) == 4, "4 alive: " + obolisks(h));
            }
            h.assertTrue(m.phase() == 3, "its last phase");
            m.discard();
            h.getLevel().getEntitiesOfClass(Obolisk.class, new AABB(h.absolutePos(BlockPos.ZERO)).inflate(40)).forEach(o -> o.discard());
            h.succeed();
        });
    }

    @GameTest(template = ARENA, timeoutTicks = 200, batch = "endboss_body")
    public void monolithOnlyItsBodyTakesDamage(GameTestHelper h) {
        floor(h, 32);
        Monolith m = monolith(h);
        ServerPlayer p = survivalPlayer(h, new Vec3(16.5, 1, 2.5));
        h.runAfterDelay(2, () -> {
            m.wakeFor(p);
            m.holdActions(100000);
        });
        h.runAfterDelay(40, () -> {   // the hands are at rest by its sides: shoot one from outside
            Vec3 hand = m.handPos(true);
            Vec3 out = hand.subtract(m.position()).multiply(1, 0, 1).normalize();
            Vec3 from = hand.add(out.scale(5));
            Arrow arrow = new Arrow(h.getLevel(), from.x, from.y, from.z, new ItemStack(Items.ARROW), null);
            Vec3 v = m.position().add(0, hand.y - m.getY(), 0).subtract(from).normalize().scale(2.0);
            arrow.setDeltaMovement(v);
            h.getLevel().addFreshEntity(arrow);
        });
        h.runAfterDelay(70, () -> {
            h.assertTrue(m.getHealth() == m.getMaxHealth(), "an arrow at a hand glances off: " + m.getHealth());
            m.invulnerableTime = 0;
            float before = m.getHealth();
            m.hurt(m.damageSources().playerAttack(p), 20f);
            float melee = before - m.getHealth();
            m.invulnerableTime = 0;
            before = m.getHealth();
            Arrow shot = new Arrow(h.getLevel(), m.getX(), m.getY() + 3, m.getZ() - 4, new ItemStack(Items.ARROW), null);
            m.hurt(m.damageSources().arrow(shot, p), 20f);
            float projectile = before - m.getHealth();
            h.assertTrue(melee > 0 && projectile > 0, "the body takes both: melee " + melee + ", projectile " + projectile);
            h.assertTrue(projectile < melee * 0.75f, "projectiles do half (before armour): melee " + melee + ", projectile " + projectile);
            h.assertTrue(m.getAttributeValue(net.minecraft.world.entity.ai.attributes.Attributes.ARMOR) == 20, "armour 20");
            m.discard();
            h.succeed();
        });
    }

    private static int count(List<ItemEntity> items, Item item) {
        return items.stream().filter(e -> e.getItem().is(item)).mapToInt(e -> e.getItem().getCount()).sum();
    }

    @GameTest(template = ARENA, timeoutTicks = 200, batch = "endboss_drops")
    public void monolithCrumblesAndDrops(GameTestHelper h) {
        floor(h, 32);
        Monolith m = monolith(h);
        ServerPlayer p = survivalPlayer(h, new Vec3(16.5, 1, 2.5));
        h.runAfterDelay(2, () -> {
            m.wakeFor(p);
            m.holdActions(100000);
            m.hurt(m.damageSources().playerAttack(p), 5000f);
            h.assertTrue(m.isDeadOrDying(), "dead");
        });
        h.runAfterDelay(2 + Monolith.DEATH_TICKS / 2, () -> {
            AABB around = m.getBoundingBox().inflate(8);
            h.assertTrue(h.getLevel().getEntitiesOfClass(ItemEntity.class, around).isEmpty(), "nothing drops while it crumbles");
        });
        h.runAfterDelay(2 + Monolith.DEATH_TICKS + 10, () -> {
            AABB around = new AABB(h.absolutePos(BlockPos.ZERO)).expandTowards(32, 20, 32).inflate(4);
            List<ItemEntity> items = h.getLevel().getEntitiesOfClass(ItemEntity.class, around);
            h.assertTrue(count(items, EndItems.MONOLITH_EYE) == 3, "3 Monolith Eyes, got " + count(items, EndItems.MONOLITH_EYE));
            h.assertTrue(count(items, EndBlocks.METEORITE_CORE.asItem()) == 1, "a Meteorite Core");
            h.assertTrue(count(items, EndItems.OBSIDIAN_SHARD) >= 6, "its loot table (obsidian shards)");
            int xp = h.getLevel().getEntitiesOfClass(ExperienceOrb.class, around).stream().mapToInt(ExperienceOrb::getValue).sum();
            h.assertTrue(xp == Monolith.XP, "500 XP, got " + xp);
            h.assertTrue(m.isRemoved(), "the body is gone");
            h.succeed();
        });
    }
}
