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
import java.util.Locale;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents;
import net.minecraft.client.CameraType;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.world.Difficulty;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ChorusPlantBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.phys.Vec3;

/**
 * Dev-only screenshots of the End mobs and their blocks: with -Dwinterworks.endmobshots=true (e.g. in JAVA_TOOL_OPTIONS
 * for ./gradlew runClient under xvfb-run) the client makes a world, builds a little End garden on a platform out in the
 * End, puts the mobs in their poses, saves screenshots/winterworks_endmob_*.png and quits. Each step waits for the
 * camera to get where it was sent and for a few fresh frames, so a slow (software GL) client still shoots the right thing.
 */
final class EndMobShots {
    private static final boolean ENABLED = Boolean.getBoolean("winterworks.endmobshots");
    private static final int X = 300, Y = 80, Z = 300;

    private record Step(int delay, BooleanSupplier gate, Runnable action) {}

    private static final List<Step> PLAN = new ArrayList<>();
    private static final List<Integer> CAST = new ArrayList<>();
    private static boolean created;
    private static int ticks, frames, step, stepTick, stepFrame;
    private static Vec3 viewTarget;

    private EndMobShots() {}

    static void init() {
        if (!ENABLED) {
            return;
        }
        ClientTickEvents.END_CLIENT_TICK.register(EndMobShots::tick);
        WorldRenderEvents.END.register(ctx -> frames++);
        then(40, () -> {
            for (String c : new String[]{"gamerule doDaylightCycle false", "gamerule doMobSpawning false", "gamerule randomTickSpeed 0",
                    "gamerule mobGriefing false", "gamerule doWeatherCycle false", "gamerule sendCommandFeedback false"}) {
                cmd(c);
            }
        });
        // the set first (the server loads the End chunks for it), flying, and only then the camera goes there
        then(10, () -> end(level -> {
            garden(level);
            fly();
        }));
        then(20, () -> look(X + 0.5, Y + 4.5, Z - 13, X, Y + 1.5, Z + 1));
        then(20, () -> end(EndMobShots::cast));
        then(5, () -> Minecraft.getInstance().options.hideGui = true);
        then(40, () -> end(EndMobShots::blooms));
        shot("overview", X + 0.5, Y + 4.5, Z - 13, X - 1, Y + 1.5, Z + 1);
        shot("obolisks", X - 6, Y + 3.2, Z - 13, X - 6, Y + 2, Z - 4.5);
        shot("guckers", X + 3.5, Y + 3.2, Z - 5.0, X + 8, Y + 1, Z + 2);
        shot("gucker_face", X + 5.0, Y + 2.7, Z - 3.1, X + 6.3, Y + 1.3, Z - 0.8);
        shot("endlings", X + 0.5, Y + 2.7, Z - 5.3, X + 0.3, Y + 1.4, Z - 1.8);
        shot("enderflies", X + 4.5, Y + 3.4, Z - 0.5, X + 2.6, Y + 2.6, Z + 2.6);
        then(2, () -> end(EndMobShots::blooms));
        shot("blocks", X - 1.5, Y + 3.0, Z - 2.5, X - 4.5, Y + 2.0, Z + 2.5);
        // in action (the camera goes first, then the cue): the rock rises, the risen one slams
        then(2, () -> look(X - 6, Y + 3.2, Z - 13, X - 6, Y + 2, Z - 4.5));
        then(3, () -> end(level -> cast(level, Obolisk.class).forEach(o -> {
            if (o.isDisguised()) {
                o.wake(null);
            } else {
                o.startSlam();
            }
        })));
        until(() -> client(Obolisk.class).stream().anyMatch(o -> o.phase() == Obolisk.Phase.SLAMMING && since(o) >= 9),
                () -> grab("obolisk_slam"));
        until(() -> client(Obolisk.class).stream().anyMatch(o -> o.phase() == Obolisk.Phase.RISING && since(o) >= 20),
                () -> grab("obolisk_rise"));
        // the burrowed Gucker bursts out; the other inflates and spits
        then(2, () -> look(X + 6.5, Y + 3.0, Z + 1.2, X + 9.5, Y + 0.8, Z + 4.5));
        then(3, () -> end(level -> cast(level, Gucker.class).forEach(g -> {
            if (g.isBurrowed()) {
                g.emerge(null);
            }
        })));
        until(() -> client(Gucker.class).stream().anyMatch(g -> g.phase() == Gucker.Phase.EMERGING && since(g) >= 7), () -> grab("gucker_emerge"));
        then(2, () -> look(X + 5.0, Y + 2.7, Z - 3.1, X + 6.3, Y + 1.3, Z - 0.8));
        then(3, () -> end(level -> cast(level, Gucker.class).forEach(g -> g.setPhase(Gucker.Phase.INFLATING))));
        until(() -> client(Gucker.class).stream().anyMatch(g -> g.phase() == Gucker.Phase.INFLATING && since(g) >= 22),
                () -> grab("gucker_inflating"));
        then(2, () -> end(level -> {
            GuckerSpit spit = new GuckerSpit(EndEntities.GUCKER_SPIT, level);
            spit.setPos(X + 5.7, Y + 1.6, Z - 1.9);
            spit.setDeltaMovement(-0.005, 0.0, -0.005);
            spit.setNoGravity(true);
            level.addFreshEntity(spit);
        }));
        then(12, () -> grab("gucker_spit"));
        // End Glow: the player from the front, without and with it
        then(2, () -> {
            view(X + 0.5, Y + 1.0, Z - 8.5, 0, 10);
            Minecraft.getInstance().options.setCameraType(CameraType.THIRD_PERSON_FRONT);
        });
        then(10, () -> grab("end_glow_off"));
        // End Glow on the player, seen from the front
        then(2, () -> cmd("effect give @s winterworks:end_glow 600 0"));
        then(30, () -> grab("end_glow"));
        then(2, () -> Minecraft.getInstance().options.setCameraType(CameraType.FIRST_PERSON));
        then(5, () -> Minecraft.getInstance().stop());
    }

    // -------------------------------------------------------------------------------------------- the set

    /** A 25 x 27 platform: End grass in front, End sand at the back right (the Dead End), a chorus stem with cocoons. */
    private static void garden(ServerLevel level) {
        for (int dx = -12; dx <= 12; dx++) {
            for (int dz = -14; dz <= 12; dz++) {
                for (int y = Y - 3; y <= Y + 8; y++) {
                    level.setBlock(new BlockPos(X + dx, y, Z + dz), Blocks.AIR.defaultBlockState(), 2);
                }
                BlockState top = dx > 2 && dz > -6 ? or(EndBlocks.END_SAND, Blocks.END_STONE)
                        : (dx + dz * 3) % 7 == 0 ? or(EndBlocks.END_MOSS_BLOCK, Blocks.END_STONE) : or(EndBlocks.END_GRASS_BLOCK, Blocks.END_STONE);
                level.setBlock(new BlockPos(X + dx, Y - 1, Z + dz), Blocks.END_STONE.defaultBlockState(), 2);
                level.setBlock(new BlockPos(X + dx, Y, Z + dz), top, 2);
            }
        }
        // a chorus stem with a branch of End stone; cocoons of every age hang under it
        for (int y = Y + 1; y <= Y + 5; y++) {
            level.setBlock(new BlockPos(X - 6, y, Z + 4), or(EndBlocks.CHORUS_STEM, Blocks.PURPUR_PILLAR), 2);
        }
        for (int dz = 0; dz <= 4; dz++) {
            level.setBlock(new BlockPos(X - 6, Y + 5, Z + dz), Blocks.END_STONE.defaultBlockState(), 2);
        }
        for (int age = 0; age <= 3; age++) {
            level.setBlock(new BlockPos(X - 6, Y + 4, Z + age), EndBlocks.CHORUS_COCOON.defaultBlockState().setValue(ChorusCocoonBlock.AGE, age), 2);
        }
        // a vanilla chorus plant with a branch, and a cocoon hanging under the branch
        BlockPos[] plant = {new BlockPos(X - 9, Y + 1, Z + 3), new BlockPos(X - 9, Y + 2, Z + 3), new BlockPos(X - 9, Y + 3, Z + 3),
                new BlockPos(X - 8, Y + 3, Z + 3)};
        for (BlockPos p : plant) {
            level.setBlock(p, Blocks.CHORUS_PLANT.defaultBlockState(), 2);
        }
        level.setBlock(plant[0].below(), Blocks.END_STONE.defaultBlockState(), 2);
        level.setBlock(new BlockPos(X - 9, Y + 4, Z + 3), Blocks.CHORUS_FLOWER.defaultBlockState(), 2);
        level.setBlock(new BlockPos(X - 7, Y + 3, Z + 3), Blocks.CHORUS_FLOWER.defaultBlockState(), 2);
        level.setBlock(new BlockPos(X - 8, Y + 2, Z + 3), EndBlocks.CHORUS_COCOON.defaultBlockState().setValue(ChorusCocoonBlock.AGE, 3), 2);
        for (BlockPos p : plant) {
            level.setBlock(p, ChorusPlantBlock.getStateWithConnections(level, p, Blocks.CHORUS_PLANT.defaultBlockState()), 2);
        }
        blooms(level);
    }

    /** End Blooms: closed ones, open ones with their bulb, an open bare one (set directly: the eclipse is the bosses'). */
    private static void blooms(ServerLevel level) {
        level.getBlockTicks().clearArea(new BoundingBox(X - 12, Y, Z - 14, X + 12, Y + 2, Z + 12));
        BlockState b = EndBlocks.END_BLOOM.defaultBlockState();
        put(level, X - 3, Z + 1, b.setValue(EndBloomBlock.OPEN, true));
        put(level, X - 2, Z + 3, b.setValue(EndBloomBlock.OPEN, true).setValue(EndBloomBlock.BULB, false));
        put(level, X - 4, Z + 3, b);
        put(level, X - 1, Z + 5, b.setValue(EndBloomBlock.OPEN, true));
        put(level, X - 5, Z - 1, b);
        put(level, X + 1, Z + 2, b.setValue(EndBloomBlock.OPEN, true));
        put(level, X - 4, Z + 1, b.setValue(EndBloomBlock.OPEN, true).setValue(EndBloomBlock.BULB, false));
        for (int[] p : new int[][]{{-1, 0}, {-2, -1}, {0, 6}, {-4, 6}, {1, 4}}) {
            put(level, X + p[0], Z + p[1], or(EndBlocks.END_GRASS, Blocks.AIR));
        }
    }

    /** The world area's block when its art is in (its blockstate file), else a vanilla stand-in. */
    private static BlockState or(Block block, Block fallback) {
        ResourceLocation id = BuiltInRegistries.BLOCK.getKey(block);
        boolean art = Minecraft.getInstance().getResourceManager().getResource(id.withPath("blockstates/" + id.getPath() + ".json")).isPresent();
        return (art ? block : fallback).defaultBlockState();
    }

    private static void put(ServerLevel level, int x, int z, BlockState s) {
        BlockPos pos = new BlockPos(x, Y + 1, z);
        if (level.getBlockState(pos.below()).is(EndBlocks.END_SAND)) {
            level.setBlock(pos.below(), or(EndBlocks.END_GRASS_BLOCK, Blocks.END_STONE), 2);
        }
        level.setBlock(pos, s, 2);
    }

    private static void cast(ServerLevel level) {
        for (Integer id : CAST) {
            Entity e = level.getEntity(id);
            if (e != null) {
                e.discard();
            }
        }
        CAST.clear();
        // the Obolisks: a rock and a risen one
        hold(Obolisk.spawnDisguised(level, new BlockPos(X - 8, Y + 1, Z - 4)), 180f);
        hold(Obolisk.spawnAwake(level, new BlockPos(X - 4, Y + 1, Z - 5), null), 180f);
        // the Guckers: one out, one burrowed in the sand
        mob(level, EndEntities.GUCKER, X + 6.5, Z - 0.5, 150f);
        mob(level, EndEntities.GUCKER, X + 9.5, Z + 4.5, 200f).setPhase(Gucker.Phase.BURROWED);
        // Endlings: plain, with an End Bloom, with a poppy, one sitting with End grass
        mob(level, EndEntities.ENDLING, X - 0.5, Z - 2.5, 200f);
        mob(level, EndEntities.ENDLING, X + 1.0, Z - 2.0, 165f).setHeadPlant(new ItemStack(EndBlocks.END_BLOOM));
        mob(level, EndEntities.ENDLING, X + 2.3, Z - 1.0, 150f).setHeadPlant(new ItemStack(Items.POPPY));
        Endling sitting = mob(level, EndEntities.ENDLING, X - 1.8, Z - 1.2, 215f);
        sitting.setHeadPlant(new ItemStack(Items.FERN));
        sitting.setInSittingPose(true);
        sitting.setOrderedToSit(true);
        // Enderflies round the open bloom
        for (int i = 0; i < 3; i++) {
            Enderfly f = mob(level, EndEntities.ENDERFLY, X + 1.5 + i * 1.1, Z + 2.0 + (i % 2) * 1.2, 120f + i * 50f);
            f.setNoGravity(true);
            f.moveTo(f.getX(), Y + 2.2 + i * 0.5, f.getZ(), f.getYRot(), 0f);
        }
    }

    private static <T extends Mob> T mob(ServerLevel level, EntityType<T> type, double x, double z, float yaw) {
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
        CAST.add(m.getId());
    }

    private static <T extends Entity> List<T> cast(ServerLevel level, Class<T> type) {
        List<T> out = new ArrayList<>();
        for (Integer id : CAST) {
            if (type.isInstance(level.getEntity(id))) {
                out.add(type.cast(level.getEntity(id)));
            }
        }
        return out;
    }

    /** The cast as the client sees it. */
    private static <T extends Entity> List<T> client(Class<T> type) {
        List<T> out = new ArrayList<>();
        var level = Minecraft.getInstance().level;
        if (level != null) {
            for (Integer id : CAST) {
                Entity e = level.getEntity(id);
                if (type.isInstance(e)) {
                    out.add(type.cast(e));
                }
            }
        }
        return out;
    }

    private static int since(Entity e) {
        return e instanceof Obolisk o ? o.tickCount - o.phaseStartTick : e instanceof Gucker g ? g.tickCount - g.phaseStartTick : 0;
    }

    // -------------------------------------------------------------------------------------------- plumbing

    private static void then(int delay, Runnable r) {
        PLAN.add(new Step(delay, () -> true, r));
    }

    private static void until(BooleanSupplier gate, Runnable r) {
        PLAN.add(new Step(1, gate, r));
    }

    /** Moves the camera, then (once it is there) takes a screenshot. */
    private static void shot(String name, double ex, double ey, double ez, double tx, double ty, double tz) {
        then(2, () -> look(ex, ey, ez, tx, ty, tz));
        then(3, () -> grab(name));
    }

    /** Puts the eye at (ex, ey, ez) looking at (tx, ty, tz). */
    private static void look(double ex, double ey, double ez, double tx, double ty, double tz) {
        double dx = tx - ex, dy = ty - ey, dz = tz - ez;
        float yaw = (float) (-Math.atan2(dx, dz) * Mth.RAD_TO_DEG);
        float pitch = (float) (-Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)) * Mth.RAD_TO_DEG);
        view(ex, ey - 1.62, ez, yaw, pitch);
    }

    private static void view(double x, double y, double z, float yaw, float pitch) {
        viewTarget = new Vec3(x, y, z);
        cmd(String.format(Locale.ROOT, "execute in minecraft:the_end run tp @s %.2f %.2f %.2f %.1f %.1f", x, y, z, yaw, pitch));
    }

    private static void fly() {
        var srv = Minecraft.getInstance().getSingleplayerServer();
        if (srv != null) {
            srv.getPlayerList().getPlayers().forEach(p -> {
                p.getAbilities().flying = true;
                p.onUpdateAbilities();
            });
        }
    }

    private static void cmd(String c) {
        Minecraft.getInstance().player.connection.sendCommand(c);
    }

    private static void end(Consumer<ServerLevel> job) {
        var srv = Minecraft.getInstance().getSingleplayerServer();
        if (srv != null) {
            srv.execute(() -> job.accept(srv.getLevel(Level.END)));
        }
    }

    private static void grab(String name) {
        Minecraft mc = Minecraft.getInstance();
        Screenshot.grab(mc.gameDirectory, "winterworks_endmob_" + name + ".png", mc.getMainRenderTarget(), msg -> {});
        Winterworks.LOG.info("endmobshots: {}", name);
    }

    private static boolean ready(Minecraft mc) {
        Step s = PLAN.get(step);
        if (ticks - stepTick > 600) {
            Winterworks.LOG.warn("endmobshots: step {} timed out, going on", step);
            viewTarget = null;
            return true;
        }
        if (ticks - stepTick < s.delay() || frames - stepFrame < 3) {
            return false;
        }
        if (viewTarget != null) {
            if (mc.player.level().dimension() != Level.END || mc.player.position().distanceTo(viewTarget) > 0.3) {
                stepFrame = frames;   // not there yet: count fresh frames from when it arrives
                return false;
            }
            viewTarget = null;
            stepFrame = frames;
            return false;
        }
        return s.gate().getAsBoolean();
    }

    private static void tick(Minecraft mc) {
        if (!created && mc.level == null && mc.screen != null && mc.getOverlay() == null) {
            mc.options.onboardAccessibility = false;
            mc.getTutorial().setStep(net.minecraft.client.tutorial.TutorialSteps.NONE);
            created = true;
            LevelSettings settings = new LevelSettings("winterworks_endmobshots", GameType.CREATIVE, false, Difficulty.NORMAL, true,
                    new GameRules(), WorldDataConfiguration.DEFAULT);
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
        if (ready(mc)) {
            PLAN.get(step++).action().run();
            stepTick = ticks;
            stepFrame = frames;
        }
    }
}
