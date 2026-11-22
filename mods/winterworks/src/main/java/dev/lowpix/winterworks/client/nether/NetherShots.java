package dev.lowpix.winterworks.client.nether;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.nether.GoldenPiglin;
import dev.lowpix.winterworks.nether.HexFortress;
import dev.lowpix.winterworks.nether.HoglinJockeys;
import dev.lowpix.winterworks.nether.PiglinGreed;
import dev.lowpix.winterworks.nether.PiglinWitch;
import dev.lowpix.winterworks.nether.WitheredCommander;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.soulbull.SoulBull;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents;
import net.minecraft.client.CameraType;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.RandomSource;
import net.minecraft.world.Difficulty;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.monster.Zombie;
import net.minecraft.world.entity.monster.hoglin.Hoglin;
import net.minecraft.world.entity.monster.piglin.Piglin;
import net.minecraft.world.entity.monster.piglin.PiglinBrute;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * Dev-only screenshots of the 0.4 Nether fixes: with -Dwinterworks.nethershots=true (e.g. in JAVA_TOOL_OPTIONS for
 * ./gradlew runClient under xvfb-run) the client makes a world, clears a stretch of the Nether over a lava lake, builds
 * a Hex Fortress there and shoots it from above and from the gate, its crew at work, the bull yard, the lab and the
 * portal hall; the Piglin Witch casting with her floating spellbook; a hoglin jockey; the Withered Commander on its
 * Soul Bull (a lunge, a sweep) and on foot after its bull falls; gilding piglins; and the Netherite Spear in hand. It saves
 * screenshots/winterworks_nether_*.png and quits. A shot freezes the game ticks (/tick freeze) and waits for the
 * chunks and a few fresh frames, so a slow software-GL client shoots the moment it was asked for.
 */
final class NetherShots {
    private static final boolean ENABLED = Boolean.getBoolean("winterworks.nethershots");
    private static final List<Runnable> PLAN = new ArrayList<>();
    private static final List<Integer> AT = new ArrayList<>();
    /** The cleared ground: floor blocks at y=79 (stand at y=80), x within +-R, z from -R to Z1; air up to TOP. */
    private static final int FLOOR = 79, R = 30, Z1 = 50, TOP = 118;
    private static final BlockPos ORIGIN = new BlockPos(0, 80, 0);
    private static boolean created;
    private static int ticks, step, frames;
    @Nullable
    private static String pending;
    private static boolean pendingFrozen;
    /** Server jobs still to run: a shot waits for them (the server is slow while it builds). */
    private static final java.util.concurrent.atomic.AtomicInteger BUSY = new java.util.concurrent.atomic.AtomicInteger();
    /** Where the last tp put the camera: a shot waits until the client is there. */
    @Nullable
    private static Vec3 expectEye;
    /** While set and false, the plan waits. */
    @Nullable
    private static java.util.function.BooleanSupplier gate;
    private static int pendingFrame, pendingWait;
    private static PiglinWitch witch;
    private static Mob dummy;
    private static WitheredCommander commander;
    private static SoulBull bull;

    private NetherShots() {}

    static void init() {
        if (!ENABLED) {
            return;
        }
        ClientTickEvents.END_CLIENT_TICK.register(NetherShots::tick);
        WorldRenderEvents.END.register(ctx -> frames++);
        int t = 40;
        at(t, () -> {
            Minecraft mc = Minecraft.getInstance();
            mc.options.hideGui = true;
            mc.options.renderDistance().set(7);   // the Nether's fog ends at half the render distance
            mc.options.simulationDistance().set(5);
            mc.options.gamma().set(1.0);
            for (String c : new String[]{"gamerule doDaylightCycle false", "gamerule doMobSpawning false", "gamerule doFireTick false",
                    "gamerule sendCommandFeedback false", "gamerule commandModificationBlockLimit 2000000", "difficulty normal",
                    "gamemode spectator", "effect give @s minecraft:night_vision infinite 0 true",
                    "execute in minecraft:the_nether run tp @s 0.5 100 30.5"}) {
                cmd(c);
            }
        });
        at(t += 5, () -> gate = () -> {   // wait for the client to arrive in the Nether
            Minecraft mc = Minecraft.getInstance();
            return mc.level != null && mc.level.dimension() == Level.NETHER && mc.screen == null && mc.levelRenderer.hasRenderedAllSections();
        });
        at(t += 40, () -> nether(NetherShots::clearGround));
        at(t += 5, () -> cmd("execute in minecraft:the_nether run fillbiome -40 64 -40 40 127 60 minecraft:nether_wastes"));   // red fog, not grey
        at(t += 20, () -> nether(level -> HexFortress.build(level, ORIGIN, Rotation.NONE, 20261122L)));
        at(t += 10, () -> nether(NetherShots::commanderStage));
        // 1. the fortress, and its crew at work
        at(t += 40, () -> tpFacing(new Vec3(-17, 103, 30), new Vec3(1, 82, -2)));
        at(t += 60, () -> shot("fortress_overview"));
        at(t += 2, () -> tpFacing(new Vec3(-3, 88, 36), new Vec3(0, 83, 4)));
        at(t += 20, () -> shot("fortress_gate"));
        at(t += 2, () -> tpFacing(new Vec3(-22, 98, -27), new Vec3(-1, 82, -8)));
        at(t += 20, () -> shot("fortress_back"));
        at(t += 150, () -> tpFacing(new Vec3(0.5, 93, 9), new Vec3(0.5, 80, -4)));   // the crew has had time to get to work
        at(t += 20, () -> shot("crew_at_work"));
        at(t += 1, NetherShots::logCrew);
        at(t += 2, () -> tpFacing(new Vec3(-14, 84.5, 2.5), new Vec3(-17, 80.5, -3)));
        at(t += 20, () -> shot("brewing_room"));
        at(t += 2, () -> tpFacing(new Vec3(4, 92, 20.5), new Vec3(0, 80, 10)));
        at(t += 20, () -> shot("bull_yard"));
        at(t += 2, () -> tpFacing(new Vec3(-12, 88, 19), new Vec3(-13, 80, 10)));
        at(t += 20, () -> shot("hoglin_pen"));
        at(t += 2, () -> tpFacing(new Vec3(13, 84.5, -10.5), new Vec3(13, 80.8, -18)));
        at(t += 20, () -> shot("laboratory"));
        at(t += 2, () -> tpFacing(new Vec3(0.5, 83, -10.5), new Vec3(0.5, 82.5, -18)));
        at(t += 20, () -> shot("portal_hall"));
        // 2. the hoglin jockey at the gate
        at(t += 2, () -> nether(level -> {
            Hoglin jockey = level.getEntitiesOfClass(Hoglin.class, new AABB(ORIGIN).inflate(40), h -> HoglinJockeys.rider(h) != null)
                    .stream().findFirst().orElse(null);
            if (jockey != null) {
                frontOf(jockey, 4.5, 2.5, 2.4, 1.3);
            }
        }));
        at(t += 20, () -> shot("hoglin_jockey"));
        // 3. the witch fights: out in the courtyard, a dummy to cast at
        at(t += 2, () -> nether(level -> {
            witch = level.getEntitiesOfClass(PiglinWitch.class, new AABB(ORIGIN).inflate(40)).stream().findFirst().orElse(null);
            Zombie z = EntityType.ZOMBIE.create(level);
            z.moveTo(-3.5, 80, 1.5, 200f, 0f);
            z.setNoAi(true);
            z.getAttribute(Attributes.MAX_HEALTH).setBaseValue(1000);
            z.setHealth(1000);
            z.setItemSlot(EquipmentSlot.HEAD, new ItemStack(Items.IRON_HELMET));
            level.addFreshEntity(z);
            dummy = z;
            if (witch != null) {
                witch.moveTo(0.5, 80, -5.5, 20f, 0f);
                witch.provoke(z);
            }
        }));
        at(t += 40, () -> nether(level -> {
            Vec3 eye = new Vec3(-1.6, 82.4, -1.2);
            float yaw = (float) (Math.atan2(eye.z - witch.getZ(), eye.x - witch.getX()) * 180 / Math.PI) - 90f;
            face(witch, yaw);
            witch.setNoAi(true);
            tpFacing(eye, witch.position().add(0, 1.5, 0));
        }));
        at(t += 20, () -> shot("witch_spellbook"));
        at(t += 2, () -> nether(level -> witch.castNow(PiglinWitch.Spell.BOLTS)));
        at(t += 12, () -> shot("witch_casting_bolts"));
        at(t += 14, () -> shot("witch_bolts_fly"));
        at(t += 40, () -> nether(level -> witch.castNow(PiglinWitch.Spell.RING)));
        at(t += 16, () -> shot("witch_ring_telegraph"));
        at(t += 16, () -> shot("witch_soul_ring"));
        at(t += 2, () -> tpFacing(new Vec3(0.5, 84.0, 3.5), new Vec3(-0.5, 80.8, -4.5)));
        at(t += 30, () -> nether(level -> witch.castNow(PiglinWitch.Spell.HEX)));
        at(t += 14, () -> shot("witch_hex"));
        at(t += 30, () -> nether(level -> witch.castNow(PiglinWitch.Spell.SUMMON)));
        at(t += 20, () -> shot("witch_summon_bones"));
        at(t += 20, () -> shot("witch_summon_rises"));
        // 4. the Withered Commander on its bull: at rest, a lunge, a sweep; then on foot
        at(t += 30, () -> nether(level -> {
            for (Mob m : level.getEntitiesOfClass(Mob.class, new AABB(ORIGIN).inflate(30), m -> !(m instanceof SoulBull) || m != bull)) {
                if (m.position().z < 24) {
                    m.setNoAi(true);   // the fortress holds still from here on
                }
            }
        }));
        at(t += 2, () -> nether(level -> frontOf(bull, 6.0, 3.5, 3.6, 2.6)));
        at(t += 30, () -> shot("commander_mounted"));
        at(t += 2, () -> nether(level -> frontOf(bull, 3.5, -5.5, 2.6, 2.4)));
        at(t += 20, () -> shot("commander_mounted_front"));
        at(t += 2, () -> nether(level -> commander.startLunge(dummyNear(level, new Vec3(0.5, 80, 34.5)))));
        at(t += 7, () -> shot("commander_lunge"));
        at(t += 30, () -> nether(level -> commander.startSpin()));
        at(t += 13, () -> shot("commander_spin"));
        at(t += 30, () -> nether(level -> bull.kill()));
        at(t += 40, () -> nether(level -> frontOf(commander, 4.5, 1.5, 2.4, 1.9)));
        at(t += 10, () -> shot("commander_on_foot_war_cry"));
        at(t += 40, () -> shot("commander_on_foot"));
        at(t += 1, NetherShots::logCommander);
        // 5. gilding: a piglin and a brute part way to gold, and a golden brute
        at(t += 2, () -> nether(level -> {
            Piglin p = EntityType.PIGLIN.create(level);
            p.moveTo(-2.5, 80, 30.5, 200f, 0f);
            face(p, 200f);
            p.setNoAi(true);
            level.addFreshEntity(p);
            PiglinGreed.setGilding(p, PiglinGreed.GILD_TICKS / 3, true);
            PiglinBrute b = EntityType.PIGLIN_BRUTE.create(level);
            b.moveTo(0.5, 80, 30.5, 180f, 0f);
            face(b, 180f);
            b.setNoAi(true);
            b.setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(Items.GOLDEN_AXE));
            level.addFreshEntity(b);
            PiglinGreed.setGilding(b, PiglinGreed.GILD_TICKS * 3 / 4, true);
            GoldenPiglin g = WWEntities.GOLDEN_PIGLIN.create(level);
            g.moveTo(3.5, 80, 30.5, 160f, 0f);
            face(g, 160f);
            g.setNoAi(true);
            level.addFreshEntity(g);
            g.setBrute(true);
        }));
        at(t += 2, () -> tpFacing(new Vec3(0.5, 81.8, 26.0), new Vec3(0.5, 81.0, 30.5)));
        at(t += 30, () -> shot("gilding"));
        // 6. the Netherite Spear in hand
        at(t += 2, () -> {
            cmd("gamemode creative");
            cmd("tp @s -3.5 80 33.5 180 10");   // beside the deck, clear of the lunge's dummy
            cmd("clear @s");
            cmd("give @s winterworks:netherite_spear");
            cmd("give @s winterworks:withered_commander_spawn_egg");
            cmd("give @s winterworks:cursed_elixir 4");
        });
        at(t += 20, () -> {
            Minecraft mc = Minecraft.getInstance();
            mc.options.hideGui = false;
            mc.options.setCameraType(CameraType.FIRST_PERSON);
            mc.player.getInventory().selected = 0;
        });
        at(t += 60, () -> shot("spear_first_person"));
        at(t += 2, () -> Minecraft.getInstance().options.keyUse.setDown(true));
        at(t += 14, () -> shot("spear_drawn", false));
        at(t += 1, () -> Minecraft.getInstance().options.keyUse.setDown(false));
        at(t += 10, () -> {
            Minecraft mc = Minecraft.getInstance();
            mc.options.setCameraType(CameraType.THIRD_PERSON_FRONT);
        });
        at(t += 10, () -> shot("spear_third_person"));
        at(t += 5, () -> Minecraft.getInstance().stop());
    }

    /** The ground: netherrack round a lava lake, cleared to the sky; a nether-brick bridge deck for the commander. */
    private static void clearGround(ServerLevel level) {
        RandomSource r = RandomSource.create(5L);
        BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos();
        for (int x = -R; x <= R; x++) {
            for (int z = -R; z <= Z1; z++) {
                boolean lake = Math.abs(x) > 22 || z > 23 && z < 30 || z < -23;
                for (int y = FLOOR - 6; y <= TOP; y++) {
                    p.set(x, y, z);
                    BlockState s;
                    if (y <= FLOOR) {
                        s = lake && y >= FLOOR - 2 ? Blocks.LAVA.defaultBlockState()
                                : (r.nextFloat() < 0.85f ? Blocks.NETHERRACK : Blocks.SOUL_SOIL).defaultBlockState();
                    } else {
                        s = Blocks.AIR.defaultBlockState();
                    }
                    level.setBlock(p, s, 2 | 16);
                }
            }
        }
        for (int x = -6; x <= 6; x++) {   // a vanilla-fortress bridge crossing for the commander
            for (int z = 30; z <= 46; z++) {
                boolean deck = Math.abs(x) <= 2 || z >= 36 && z <= 40;
                if (deck) {
                    level.setBlock(p.set(x, FLOOR, z), (Math.floorMod(x + z, 5) == 0 ? Blocks.CRACKED_NETHER_BRICKS : Blocks.NETHER_BRICKS)
                            .defaultBlockState(), 2 | 16);
                }
            }
        }
    }

    private static void commanderStage(ServerLevel level) {
        bull = SoulBull.createPenBull(level, 0.5, 80, 38.5, 180f, false);
        bull.setNoAi(true);
        face(bull, 180f);
        level.addFreshEntity(bull);
        commander = WWEntities.WITHERED_COMMANDER.create(level);
        commander.moveTo(0.5, 80, 38.5, 180f, 0f);
        face(commander, 180f);
        commander.setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(WWItems.NETHERITE_SPEAR));
        commander.setPersistenceRequired();
        level.addFreshEntity(commander);
        commander.startRiding(bull, true);
        commander.setNoAi(true);
        for (int i = 0; i < 2; i++) {   // its escort
            Mob w = EntityType.WITHER_SKELETON.create(level);
            w.moveTo(-3.5 + 7 * i, 80, 42.5, 180f, 0f);
            w.setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(Items.STONE_SWORD));
            w.setNoAi(true);
            level.addFreshEntity(w);
        }
    }

    /** Puts the camera in front of `m` (by its body's facing): `dist` out, `side` to its right, `up` above its feet. */
    private static void frontOf(net.minecraft.world.entity.Entity m, double dist, double side, double up, double lookUp) {
        float yaw = m.getYRot() * net.minecraft.util.Mth.DEG_TO_RAD;
        Vec3 fwd = new Vec3(-Math.sin(yaw), 0, Math.cos(yaw)), right = new Vec3(-Math.cos(yaw), 0, -Math.sin(yaw));
        Vec3 at = m.position();
        tpFacing(at.add(fwd.scale(dist)).add(right.scale(side)).add(0, up, 0), at.add(0, lookUp, 0));
    }

    private static void face(Mob m, float yaw) {
        m.setYRot(yaw);
        m.setYHeadRot(yaw);
        m.setYBodyRot(yaw);
    }

    private static Mob dummyNear(ServerLevel level, Vec3 at) {
        Zombie z = EntityType.ZOMBIE.create(level);
        z.moveTo(at.x, at.y, at.z, 0f, 0f);
        z.setNoAi(true);
        z.getAttribute(Attributes.MAX_HEALTH).setBaseValue(1000);
        z.setHealth(1000);
        level.addFreshEntity(z);
        commander.setTarget(z);
        return z;
    }

    private static void logCrew() {
        nether(level -> {
            for (Mob m : level.getEntitiesOfClass(Mob.class, new AABB(ORIGIN).inflate(30))) {
                Winterworks.LOG.info("nethershots: {} at {}", m.getType().toShortString(), m.blockPosition());
            }
        });
    }

    private static void logCommander() {
        nether(level -> Winterworks.LOG.info("nethershots: commander at {} on foot {} passenger {} hp {}", commander.position(),
                commander.isOnFoot(), commander.isPassenger(), commander.getHealth()));
    }

    /** Puts the camera (the eye: the feet are 1.62 lower) at `eye`, looking at `to`. */
    private static void tpFacing(Vec3 eye, Vec3 to) {
        expectEye = eye;
        cmd(String.format(Locale.ROOT, "tp @s %.2f %.2f %.2f facing %.2f %.2f %.2f", eye.x, eye.y - 1.62, eye.z, to.x, to.y, to.z));
    }

    private static void at(int tick, Runnable r) {
        AT.add(tick);
        PLAN.add(r);
    }

    private static void cmd(String c) {
        Minecraft.getInstance().player.connection.sendCommand(c);
    }

    private static void nether(Consumer<ServerLevel> job) {
        var srv = Minecraft.getInstance().getSingleplayerServer();
        if (srv != null) {
            BUSY.incrementAndGet();
            srv.execute(() -> {
                try {
                    job.accept(srv.getLevel(Level.NETHER));
                } catch (RuntimeException e) {
                    Winterworks.LOG.error("nethershots: a step failed", e);
                } finally {
                    BUSY.decrementAndGet();
                }
            });
        }
    }

    private static void shot(String name) {
        shot(name, true);
    }

    /** Asks for a shot: the plan waits until it is taken. `freeze` stops the game ticks meanwhile. */
    private static void shot(String name, boolean freeze) {
        pending = name;
        pendingFrozen = freeze;
        pendingFrame = frames;
        pendingWait = 0;
        if (freeze) {
            cmd("tick freeze");
        }
    }

    private static void takePending(Minecraft mc) {
        pendingWait++;
        boolean chunks = mc.levelRenderer.hasRenderedAllSections();
        boolean there = expectEye == null || mc.player.getEyePosition().distanceTo(expectEye) < 0.6;
        if (BUSY.get() > 0 || !there) {
            pendingFrame = frames;   // not yet: count the frames from when the server has caught up
        }
        boolean ready = pendingFrozen ? chunks && frames - pendingFrame >= 4 && pendingWait >= 3 : frames - pendingFrame >= 1;
        if (!ready && pendingWait < 600) {
            return;
        }
        Screenshot.grab(mc.gameDirectory, "winterworks_nether_" + pending + ".png", mc.getMainRenderTarget(), msg -> {});
        Winterworks.LOG.info("nethershots: {} ({} fps, waited {} ticks)", pending, mc.getFps(), pendingWait);
        if (pendingFrozen) {
            cmd("tick unfreeze");
        }
        pending = null;
    }

    private static void tick(Minecraft mc) {
        if (!created && mc.level == null && mc.screen != null && mc.getOverlay() == null) {
            mc.options.onboardAccessibility = false;
            mc.getTutorial().setStep(net.minecraft.client.tutorial.TutorialSteps.NONE);
            created = true;
            try {
                mc.getWindow().setWindowed(1280, 720);
            } catch (RuntimeException e) {
                Winterworks.LOG.warn("nethershots: can't resize the window", e);
            }
            LevelSettings settings = new LevelSettings("winterworks_nethershots", GameType.CREATIVE, false, Difficulty.NORMAL,
                    true, new GameRules(), WorldDataConfiguration.DEFAULT);
            mc.createWorldOpenFlows().createFreshLevel("winterworks_nethershots_" + System.currentTimeMillis(), settings,
                    new WorldOptions(13L, false, false),
                    reg -> reg.registryOrThrow(Registries.WORLD_PRESET).getHolderOrThrow(WorldPresets.FLAT).value().createWorldDimensions(),
                    mc.screen);
            return;
        }
        if (mc.player == null || mc.level == null || step >= PLAN.size()) {
            return;
        }
        mc.gui.getChat().clearMessages(false);
        mc.getToasts().clear();
        if (pending != null) {
            takePending(mc);
            return;
        }
        if (gate != null) {
            if (!gate.getAsBoolean()) {
                return;
            }
            gate = null;
        }
        ticks++;
        while (pending == null && step < PLAN.size() && ticks >= AT.get(step)) {
            PLAN.get(step++).run();
        }
    }
}
