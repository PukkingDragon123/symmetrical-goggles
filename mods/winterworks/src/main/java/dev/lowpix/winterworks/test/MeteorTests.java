package dev.lowpix.winterworks.test;

import dev.lowpix.winterworks.end.FallingMeteorite;
import dev.lowpix.winterworks.end.MeteorImpact;
import dev.lowpix.winterworks.end.MeteorShower;
import dev.lowpix.winterworks.registry.EndBlocks;
import dev.lowpix.winterworks.registry.EndEntities;
import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.monster.Zombie;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;

/**
 * GameTests for falling meteorites (docs/END_UPDATE.md section 16): a dropped meteor crashes, digs a crater of meteorite
 * round its heart and throws back and burns what's near; the heart is a meteorite_core one time in three (by the
 * meteor's seed); the End's main island is safe (no crater, no harm); and the schedule's rates. The craters go far from
 * the test grid, where nothing ticks, so the meteors are flown there tick by tick.
 */
public class MeteorTests implements FabricGameTest {
    private static final String BATCH = "winterworks_meteor";

    /** A disc of end stone `r` round `c` (its top at c.y), cleared above. */
    private static void platform(ServerLevel level, BlockPos c, int r) {
        for (int dx = -r; dx <= r; dx++) {
            for (int dz = -r; dz <= r; dz++) {
                if (dx * dx + dz * dz > r * r) {
                    continue;
                }
                for (int dy = -5; dy <= 0; dy++) {
                    level.setBlock(c.offset(dx, dy, dz), Blocks.END_STONE.defaultBlockState(), 2);
                }
                for (int dy = 1; dy <= 10; dy++) {
                    level.setBlock(c.offset(dx, dy, dz), Blocks.AIR.defaultBlockState(), 2);
                }
            }
        }
    }

    private static int count(ServerLevel level, BlockPos c, int r, Block b) {
        int n = 0;
        for (BlockPos p : BlockPos.betweenClosed(c.offset(-r, -r, -r), c.offset(r, r, r))) {
            if (level.getBlockState(p).is(b)) {
                n++;
            }
        }
        return n;
    }

    /** The first seed from `from` whose crater has (or hasn't) a core. */
    private static long seed(long from, boolean core) {
        long s = from;
        while (MeteorImpact.hasCore(s) != core) {
            s++;
        }
        return s;
    }

    /** Flies a meteor tick by tick (nothing ticks out here) until it lands; false if it never does. */
    private static boolean fly(FallingMeteorite m) {
        for (int i = 0; i < 300 && m.flying() && !m.isRemoved(); i++) {
            m.tick();
        }
        return !m.flying();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 100)
    public void droppedMeteorCratersAndBlasts(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        BlockPos c = h.absolutePos(BlockPos.ZERO).offset(-2600, 0, 2300).atY(90);
        platform(level, c, 16);
        Zombie near = EntityType.ZOMBIE.create(level);
        near.moveTo(c.getX() + 4.5, c.getY() + 1, c.getZ() + 0.5, 0f, 0f);
        level.addFreshEntity(near);
        Zombie far = EntityType.ZOMBIE.create(level);
        far.moveTo(c.getX() + 0.5, c.getY() + 1, c.getZ() + 14.5, 0f, 0f);
        level.addFreshEntity(far);
        long seed = seed(7, true);
        Vec3 target = Vec3.atBottomCenterOf(c.above());
        FallingMeteorite m = FallingMeteorite.launch(level, target.add(25, 60, -10), target, seed);
        h.assertTrue(m.getType() == EndEntities.FALLING_METEORITE && m.flying(), "a meteor in flight");
        h.assertTrue(fly(m), "it lands");
        h.assertTrue(m.state() == FallingMeteorite.CRASHED, "it crashed (not safe out here), state " + m.state());
        Vec3 hit = m.impact();
        h.assertTrue(hit.distanceTo(target) < 1.5, "where it was aimed: " + hit + " vs " + target);
        BlockPos at = BlockPos.containing(hit);
        int met = count(level, at, 6, EndBlocks.METEORITE), cores = count(level, at, 6, EndBlocks.METEORITE_CORE);
        h.assertTrue(met >= 15, "a cluster of meteorite in the crater, " + met);
        h.assertTrue(cores == 1, "a seed with a core gives one meteorite_core, " + cores);
        h.assertTrue(level.getBlockState(c).isAir() || level.getBlockState(c).is(EndBlocks.METEORITE)
                || level.getBlockState(c).is(EndBlocks.METEORITE_CORE), "the ground where it struck is dug out");
        h.assertTrue(near.getHealth() < near.getMaxHealth(), "the shockwave hurts what's near: " + near.getHealth());
        h.assertTrue(near.isOnFire(), "... and sets it burning");
        h.assertTrue(near.getDeltaMovement().x > 0.3 && near.getDeltaMovement().y > 0.2, "... and throws it back, " + near.getDeltaMovement());
        h.assertTrue(far.getHealth() == far.getMaxHealth() && !far.isOnFire(), "beyond the shockwave nothing happens");
        h.assertTrue(m.sinceImpact() == 0 && !m.isRemoved(), "it lingers as the crater's smoke");
        for (int i = 0; i <= FallingMeteorite.SMOULDER; i++) {
            m.tick();
        }
        h.assertTrue(m.isRemoved(), "and goes when the crater stops smoking");
        near.discard();
        far.discard();
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 100)
    public void oneCraterInThreeHasACore(GameTestHelper h) {
        int cores = 0, n = 3000;
        for (long s = 0; s < n; s++) {
            cores += MeteorImpact.hasCore(s * 0x9E3779B97F4A7C15L + 17) ? 1 : 0;
        }
        h.assertTrue(Math.abs(cores / (double) n - 1 / 3.0) < 0.04, "about one in three, " + cores + " of " + n);
        // a crater without a core: plain meteorite at its heart, no meteorite_core anywhere
        ServerLevel level = h.getLevel();
        BlockPos c = h.absolutePos(BlockPos.ZERO).offset(-2600, 0, 2400).atY(90);
        platform(level, c, 14);
        BlockPos heart = MeteorImpact.crater(level, c, seed(101, false));
        h.assertTrue(level.getBlockState(heart).is(EndBlocks.METEORITE), "a plain meteorite heart, got " + level.getBlockState(heart));
        h.assertTrue(count(level, heart, 6, EndBlocks.METEORITE_CORE) == 0, "and no core");
        h.assertTrue(count(level, heart, 6, EndBlocks.METEORITE) >= 15, "round a cluster of meteorite");
        // ... and with one
        BlockPos c2 = c.offset(40, 0, 0);
        platform(level, c2, 14);
        BlockPos heart2 = MeteorImpact.crater(level, c2, seed(101, true));
        h.assertTrue(level.getBlockState(heart2).is(EndBlocks.METEORITE_CORE), "a core at the heart, got " + level.getBlockState(heart2));
        h.succeed();
    }

    /** Within 1000 blocks of the End's centre a meteor only flashes and booms: no crater, no harm, no push. */
    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 100)
    public void mainIslandIsSafe(GameTestHelper h) {
        ServerLevel end = h.getLevel().getServer().getLevel(Level.END);
        h.assertTrue(end != null, "the End is loaded");
        BlockPos c = new BlockPos(420, 90, 380);
        h.assertTrue(MeteorImpact.mainIsland(end, c.getX(), c.getZ()) && MeteorImpact.safe(end, c), "inside the main island's zone");
        h.assertFalse(MeteorImpact.mainIsland(end, 1500, 200), "the outer End is not");
        h.assertFalse(MeteorImpact.mainIsland(h.getLevel(), c.getX(), c.getZ()), "only the End has a main island");
        platform(end, c, 12);
        Zombie z = EntityType.ZOMBIE.create(end);
        z.moveTo(c.getX() + 3.5, c.getY() + 1, c.getZ() + 0.5, 0f, 0f);
        end.addFreshEntity(z);
        Vec3 start = z.position();
        Vec3 target = Vec3.atBottomCenterOf(c.above());
        FallingMeteorite m = FallingMeteorite.launch(end, target.add(-20, 70, 15), target, seed(3, true));
        h.assertTrue(fly(m), "it lands");
        h.assertTrue(m.state() == FallingMeteorite.BURST, "a harmless burst, state " + m.state());
        h.assertTrue(count(end, c, 8, EndBlocks.METEORITE) + count(end, c, 8, EndBlocks.METEORITE_CORE) == 0, "no meteorite placed");
        int stone = 0;
        for (int dx = -8; dx <= 8; dx++) {
            for (int dz = -8; dz <= 8; dz++) {
                BlockState s = end.getBlockState(c.offset(dx, 0, dz));
                stone += dx * dx + dz * dz <= 64 && s.is(Blocks.END_STONE) ? 1 : 0;
                h.assertTrue(end.getBlockState(c.offset(dx, 1, dz)).isAir(), "no fire or rim at " + c.offset(dx, 1, dz));
            }
        }
        h.assertTrue(stone >= 190, "the ground is untouched, " + stone);
        h.assertTrue(z.getHealth() == z.getMaxHealth() && !z.isOnFire(), "nothing is hurt or burnt");
        h.assertTrue(z.getDeltaMovement().horizontalDistance() < 0.01 && z.position().distanceTo(start) < 0.01, "or pushed");
        m.discard();
        z.discard();
        for (int dx = -12; dx <= 12; dx++) {   // leave the End's void as it was
            for (int dz = -12; dz <= 12; dz++) {
                for (int dy = -5; dy <= 0; dy++) {
                    end.setBlock(c.offset(dx, dy, dz), Blocks.AIR.defaultBlockState(), 2);
                }
            }
        }
        h.succeed();
    }

    /** About one every 10-15 minutes in the outer End, three times as often in the Dead End and during an eclipse. */
    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 100)
    public void scheduleRates(GameTestHelper h) {
        h.assertTrue(MeteorShower.rate(false, false, false) == 0 && MeteorShower.rate(false, true, true) == 0, "none off the outer End");
        h.assertTrue(MeteorShower.rate(true, false, false) == 1, "the outer End: the base rate");
        h.assertTrue(MeteorShower.rate(true, true, false) == 3, "three times as often in the Dead End");
        h.assertTrue(MeteorShower.rate(true, false, true) == 3, "... and during an eclipse");
        RandomSource r = RandomSource.create(42);
        long sum = 0;
        for (int i = 0; i < 2000; i++) {
            int d = MeteorShower.nextDelay(r);
            h.assertTrue(d >= 12000 && d <= 18000, "a countdown of 10-15 minutes, " + d);
            sum += d;
        }
        h.assertTrue(Math.abs(sum / 2000.0 - 15000) < 300, "averaging 12.5 minutes, " + sum / 2000.0);
        int hours = 20, ticks = hours * 72000;
        for (int rate : new int[]{0, 1, 3}) {
            MeteorShower.Countdown c = new MeteorShower.Countdown(r);
            int fired = 0;
            for (int t = 0; t < ticks; t++) {
                fired += c.tick(rate, r) ? 1 : 0;
            }
            double perHour = fired / (double) hours, expect = rate * 60 / 12.5;
            h.assertTrue(Math.abs(perHour - expect) <= 0.12 * expect + 0.01, "rate " + rate + ": " + perHour + " an hour, expected " + expect);
        }
        h.succeed();
    }
}
