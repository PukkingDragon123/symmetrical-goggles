package dev.lowpix.winterworks.client.endmob;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.endmob.ChorusCocoonBlock;
import dev.lowpix.winterworks.endmob.EndBloomBlock;
import dev.lowpix.winterworks.endmob.Endling;
import dev.lowpix.winterworks.endmob.Enderfly;
import dev.lowpix.winterworks.endmob.Gucker;
import dev.lowpix.winterworks.endmob.GuckerSpit;
import dev.lowpix.winterworks.endmob.Obolisk;
import dev.lowpix.winterworks.registry.EndBlocks;
import dev.lowpix.winterworks.registry.EndEntities;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.CameraType;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.Difficulty;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import net.minecraft.world.level.levelgen.structure.BoundingBox;

/**
 * Dev-only screenshots of the End mobs and their blocks: with -Dwinterworks.endmobshots=true (e.g. in JAVA_TOOL_OPTIONS
 * for ./gradlew runClient under xvfb-run) the client makes a world, builds a little End garden on a platform out in the
 * End, puts the mobs in their poses, saves screenshots/winterworks_endmob_*.png and quits.
 */
final class EndMobShots {
    private static final boolean ENABLED = Boolean.getBoolean("winterworks.endmobshots");
    private static final List<Runnable> PLAN = new ArrayList<>();
    private static final List<Integer> AT = new ArrayList<>();
    private static final int X = 300, Y = 80, Z = 300;
    private static final List<Entity> CAST = new ArrayList<>();
    private static boolean created;
    private static int ticks, step;

    private EndMobShots() {}

    static void init() {
        if (!ENABLED) {
            return;
        }
        ClientTickEvents.END_CLIENT_TICK.register(EndMobShots::tick);
        int t = 40;
        at(t, () -> {
            for (String c : new String[]{"gamerule doDaylightCycle false", "gamerule doMobSpawning false", "gamerule randomTickSpeed 0",
                    "gamerule mobGriefing false", "gamerule doWeatherCycle false", "gamerule sendCommandFeedback false",
                    "execute in minecraft:the_end run tp @s " + (X + 0.5) + " " + (Y + 1) + " " + (Z - 9.5) + " 0 18"}) {
                cmd(c);
            }
        });
        at(t += 40, () -> end(EndMobShots::garden));
        at(t += 10, () -> end(EndMobShots::cast));
        at(t += 5, () -> Minecraft.getInstance().options.hideGui = true);
        at(t += 60, () -> {
            end(EndMobShots::blooms);
            view(X + 0.5, Y + 2.2, Z - 11.5, 0, 14);
        });
        at(t += 6, () -> shot("overview"));
        at(t += 2, () -> view(X - 3.5, Y + 1.6, Z - 4.5, -35, 18));
        at(t += 4, () -> shot("obolisks"));
        at(t += 2, () -> view(X + 6.5, Y + 1.4, Z - 4.5, 35, 22));
        at(t += 4, () -> shot("guckers"));
        at(t += 2, () -> view(X + 0.5, Y + 1.4, Z - 4.8, 0, 22));
        at(t += 4, () -> shot("endlings"));
        at(t += 2, () -> view(X + 4.0, Y + 2.2, Z + 3.0, 150, 12));
        at(t += 4, () -> shot("enderflies"));
        at(t += 2, () -> {
            end(EndMobShots::blooms);
            view(X - 4.5, Y + 1.4, Z + 1.5, -110, 25);
        });
        at(t += 4, () -> shot("blocks"));
        // in action: the Obolisks wake and slam, a Gucker inflates and spits, the Endling hops
        at(t += 2, () -> end(level -> {
            for (Entity e : CAST) {
                if (e instanceof Obolisk o && o.isDisguised()) {
                    o.wake(null);
                } else if (e instanceof Obolisk o) {
                    o.startSlam();
                } else if (e instanceof Gucker g && g.isBurrowed()) {
                    g.emerge(null);
                }
            }
        }));
        at(t += 9, () -> {
            view(X - 3.5, Y + 1.6, Z - 4.5, -35, 18);
            shot("obolisk_rise_slam");
        });
        at(t += 30, () -> {
            view(X + 6.5, Y + 1.4, Z - 4.5, 35, 22);
            shot("gucker_emerged");
        });
        at(t += 2, () -> end(level -> {
            for (Entity e : CAST) {
                if (e instanceof Gucker g && g.phase() == Gucker.Phase.NORMAL) {
                    g.setPhase(Gucker.Phase.INFLATING);
                }
            }
        }));
        at(t += 20, () -> shot("gucker_inflating"));
        at(t += 2, () -> end(level -> {
            GuckerSpit spit = new GuckerSpit(EndEntities.GUCKER_SPIT, level);
            spit.setPos(X + 3.5, Y + 2.0, Z - 1.5);
            spit.setDeltaMovement(-0.02, 0.0, -0.02);
            spit.setNoGravity(true);
            level.addFreshEntity(spit);
        }));
        at(t += 10, () -> shot("gucker_spit"));
        // End Glow on the player, seen from the front
        at(t += 5, () -> {
            cmd("effect give @s winterworks:end_glow 600 0");
            view(X + 0.5, Y + 1.0, Z - 8.5, 180, 10);
            Minecraft.getInstance().options.setCameraType(CameraType.THIRD_PERSON_FRONT);
        });
        at(t += 30, () -> shot("end_glow"));
        at(t += 2, () -> Minecraft.getInstance().options.setCameraType(CameraType.FIRST_PERSON));
        at(t += 5, () -> Minecraft.getInstance().stop());
    }

    // -------------------------------------------------------------------------------------------- the set

    /** A 25 x 25 platform: End grass in front, End sand at the back right (the Dead End), a chorus stem with cocoons. */
    private static void garden(ServerLevel level) {
        for (int dx = -12; dx <= 12; dx++) {
            for (int dz = -14; dz <= 12; dz++) {
                for (int y = Y - 3; y <= Y + 8; y++) {
                    level.setBlock(new BlockPos(X + dx, y, Z + dz), Blocks.AIR.defaultBlockState(), 2);
                }
                BlockState top = dx > 2 && dz > -6 ? EndBlocks.END_SAND.defaultBlockState()
                        : (dx + dz * 3) % 7 == 0 ? EndBlocks.END_MOSS_BLOCK.defaultBlockState() : EndBlocks.END_GRASS_BLOCK.defaultBlockState();
                level.setBlock(new BlockPos(X + dx, Y - 1, Z + dz), Blocks.END_STONE.defaultBlockState(), 2);
                level.setBlock(new BlockPos(X + dx, Y, Z + dz), top, 2);
            }
        }
        // a chorus stem with a branch of End stone; cocoons of every age hang under it
        for (int y = Y + 1; y <= Y + 5; y++) {
            level.setBlock(new BlockPos(X - 6, y, Z + 4), EndBlocks.CHORUS_STEM.defaultBlockState(), 2);
        }
        for (int dz = 0; dz <= 4; dz++) {
            level.setBlock(new BlockPos(X - 6, Y + 5, Z + dz), Blocks.END_STONE.defaultBlockState(), 2);
        }
        for (int age = 0; age <= 3; age++) {
            level.setBlock(new BlockPos(X - 6, Y + 4, Z + age), EndBlocks.CHORUS_COCOON.defaultBlockState().setValue(ChorusCocoonBlock.AGE, age), 2);
        }
        level.setBlock(new BlockPos(X - 8, Y + 1, Z + 5), Blocks.CHORUS_PLANT.defaultBlockState(), 2);
        level.setBlock(new BlockPos(X - 8, Y + 2, Z + 5), Blocks.CHORUS_FLOWER.defaultBlockState(), 2);
        blooms(level);
    }

    /** End Blooms: closed ones, an open one with its bulb, an open bare one (set directly: the eclipse is the bosses'). */
    private static void blooms(ServerLevel level) {
        level.getBlockTicks().clearArea(new BoundingBox(X - 12, Y, Z - 14, X + 12, Y + 2, Z + 12));
        BlockState b = EndBlocks.END_BLOOM.defaultBlockState();
        put(level, X - 3, Z + 1, b.setValue(EndBloomBlock.OPEN, true));
        put(level, X - 2, Z + 3, b.setValue(EndBloomBlock.OPEN, true).setValue(EndBloomBlock.BULB, false));
        put(level, X - 4, Z + 3, b);
        put(level, X - 1, Z + 5, b.setValue(EndBloomBlock.OPEN, true));
        put(level, X - 5, Z - 1, b);
        put(level, X + 1, Z + 2, b.setValue(EndBloomBlock.OPEN, true));
        for (int[] p : new int[][]{{-1, 0}, {-2, -1}, {0, 6}, {-4, 6}, {1, 4}}) {
            put(level, X + p[0], Z + p[1], EndBlocks.END_GRASS.defaultBlockState());
        }
    }

    private static void put(ServerLevel level, int x, int z, BlockState s) {
        BlockPos pos = new BlockPos(x, Y + 1, z);
        if (level.getBlockState(pos.below()).is(EndBlocks.END_SAND)) {
            level.setBlock(pos.below(), EndBlocks.END_GRASS_BLOCK.defaultBlockState(), 2);
        }
        level.setBlock(pos, s, 2);
    }

    private static void cast(ServerLevel level) {
        CAST.forEach(Entity::discard);
        CAST.clear();
        // the Obolisks: a rock and a risen one
        Obolisk rock = Obolisk.spawnDisguised(level, new BlockPos(X - 7, Y + 1, Z - 1));
        Obolisk awake = Obolisk.spawnAwake(level, new BlockPos(X - 3, Y + 1, Z + 1), null);
        for (Obolisk o : new Obolisk[]{rock, awake}) {
            hold(o, 180f);
        }
        // the Guckers: one burrowed in the sand, one out
        Gucker out = mob(level, EndEntities.GUCKER, X + 6.5, Z - 0.5, 150f);
        Gucker dug = mob(level, EndEntities.GUCKER, X + 9.5, Z + 4.5, 200f);
        dug.setPhase(Gucker.Phase.BURROWED);
        // Endlings: plain, with an End Bloom, with a poppy, one sitting
        Endling e1 = mob(level, EndEntities.ENDLING, X - 0.5, Z - 2.5, 200f);
        Endling e2 = mob(level, EndEntities.ENDLING, X + 1.0, Z - 2.0, 165f);
        e2.setHeadPlant(new ItemStack(EndBlocks.END_BLOOM));
        Endling e3 = mob(level, EndEntities.ENDLING, X + 2.3, Z - 1.0, 150f);
        e3.setHeadPlant(new ItemStack(Items.POPPY));
        Endling e4 = mob(level, EndEntities.ENDLING, X - 1.8, Z - 1.2, 215f);
        e4.setHeadPlant(new ItemStack(EndBlocks.END_GRASS));
        e4.setInSittingPose(true);
        e4.setOrderedToSit(true);
        e1.setHeadPlant(ItemStack.EMPTY);
        // Enderflies round the open bloom
        for (int i = 0; i < 3; i++) {
            Enderfly f = mob(level, EndEntities.ENDERFLY, X + 1.5 + i * 1.1, Z + 2.0 + (i % 2) * 1.2, 120f + i * 50f);
            f.setNoGravity(true);
            f.moveTo(f.getX(), Y + 2.2 + i * 0.5, f.getZ(), f.getYRot(), 0f);
        }
    }

    private static <T extends Mob> T mob(ServerLevel level, net.minecraft.world.entity.EntityType<T> type, double x, double z, float yaw) {
        T m = type.create(level);
        m.moveTo(x, Y + 1, z, yaw, 0f);
        m.finalizeSpawn(level, level.getCurrentDifficultyAt(m.blockPosition()), MobSpawnType.COMMAND, null);
        if (m instanceof Endling e) {
            e.setHeadPlant(ItemStack.EMPTY);
        }
        level.addFreshEntity(m);
        hold(m, yaw);
        return m;
    }

    private static void hold(Mob m, float yaw) {
        m.setNoAi(true);
        m.setPersistenceRequired();
        m.setYRot(yaw);
        m.setYHeadRot(yaw);
        m.yBodyRot = yaw;
        m.setSilent(true);
        CAST.add(m);
    }

    // -------------------------------------------------------------------------------------------- plumbing

    private static void at(int tick, Runnable r) {
        AT.add(tick);
        PLAN.add(r);
    }

    private static void cmd(String c) {
        Minecraft.getInstance().player.connection.sendCommand(c);
    }

    private static void view(double x, double y, double z, float yaw, float pitch) {
        cmd(String.format(java.util.Locale.ROOT, "execute in minecraft:the_end run tp @s %.2f %.2f %.2f %.1f %.1f", x, y, z, yaw, pitch));
    }

    private static void end(Consumer<ServerLevel> job) {
        var srv = Minecraft.getInstance().getSingleplayerServer();
        if (srv != null) {
            srv.execute(() -> job.accept(srv.getLevel(Level.END)));
        }
    }

    private static void shot(String name) {
        Minecraft mc = Minecraft.getInstance();
        Screenshot.grab(mc.gameDirectory, "winterworks_endmob_" + name + ".png", mc.getMainRenderTarget(), msg -> {});
        Winterworks.LOG.info("endmobshots: {}", name);
    }

    private static void tick(Minecraft mc) {
        if (!created && mc.level == null && mc.screen != null && mc.getOverlay() == null) {
            mc.options.onboardAccessibility = false;
            mc.getTutorial().setStep(net.minecraft.client.tutorial.TutorialSteps.NONE);
            created = true;
            GameRules rules = new GameRules();
            LevelSettings settings = new LevelSettings("winterworks_endmobshots", GameType.CREATIVE, false, Difficulty.NORMAL, true,
                    rules, WorldDataConfiguration.DEFAULT);
            mc.createWorldOpenFlows().createFreshLevel("winterworks_endmobshots_" + System.currentTimeMillis(), settings,
                    new WorldOptions(7L, false, false),
                    reg -> reg.registryOrThrow(Registries.WORLD_PRESET).getHolderOrThrow(WorldPresets.FLAT).value().createWorldDimensions(),
                    mc.screen);
            return;
        }
        if (mc.player == null || mc.level == null || step >= PLAN.size()) {
            return;
        }
        ticks++;
        mc.gui.getChat().clearMessages(false);
        mc.getToasts().clear();
        while (step < PLAN.size() && ticks >= AT.get(step)) {
            PLAN.get(step++).run();
        }
    }
}
