package dev.lowpix.winterworks.client.endboss;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.endboss.DragonRework;
import dev.lowpix.winterworks.endboss.EclipseState;
import dev.lowpix.winterworks.endboss.Monolith;
import dev.lowpix.winterworks.registry.EndEntities;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.Difficulty;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.boss.enderdragon.EnderDragon;
import net.minecraft.world.entity.boss.enderdragon.phases.EnderDragonPhase;
import net.minecraft.world.entity.npc.Villager;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * Dev-only screenshots of the bosses: with -Dwinterworks.endbossshots=true (e.g. in JAVA_TOOL_OPTIONS for
 * ./gradlew runClient under xvfb-run) the client makes a fresh world, goes to the End as a spectator (a free camera)
 * and saves screenshots/winterworks_endboss_*.png: the island before and during an eclipse, the enraged dragon (four
 * wings) firing a light beam, and the Monolith on an obsidian arena staring at a villager, slamming, clapping, grabbing
 * and summoning. Then it quits.
 */
final class EndBossShots {
    private static final boolean ENABLED = Boolean.getBoolean("winterworks.endbossshots");
    private static final List<Runnable> PLAN = new ArrayList<>();
    private static final List<Integer> AT = new ArrayList<>();
    private static final BlockPos ARENA = new BlockPos(300, 90, 40);
    private static final List<String> PENDING = new ArrayList<>();
    private static final List<Integer> PENDING_FRAME = new ArrayList<>();
    private static boolean created, stopWhenDone;
    private static int ticks, step;
    /** Frames drawn (render thread), and the frame a camera move must be drawn by before the plan goes on. */
    private static volatile int frames, settleUntil;
    /** The island vantage point (set on the server thread once the chunks are there). */
    private static volatile Vec3 view = new Vec3(88.5, 90, 25.5), dragonAt = Vec3.ZERO;
    @Nullable
    private static Villager victim;

    private EndBossShots() {}

    static void init() {
        if (!ENABLED) {
            return;
        }
        ClientTickEvents.END_CLIENT_TICK.register(EndBossShots::tick);
        net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents.END_SERVER_TICK.register(EndBossShots::serverTick);
        net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents.END.register(ctx -> frames++);
        int t = 40;
        at(t, () -> {
            Minecraft mc = Minecraft.getInstance();
            mc.options.renderDistance().set(10);
            mc.options.hideGui = true;
            mc.getWindow().setWindowed(1280, 720);
            for (String c : new String[]{"gamerule doDaylightCycle false", "gamerule doMobSpawning false", "gamerule doWeatherCycle false",
                    "difficulty normal", "gamemode spectator"}) {
                cmd(c);
            }
        });
        at(t += 10, () -> server(srv -> player(srv).teleportTo(end(srv), 88.5, 100, 25.5, 75f, 0f)));
        // the island: wait for the chunks, then a high look west-south-west over the towers, where the moon will rise
        at(t += 160, () -> server(srv -> {
            ServerLevel end = end(srv);
            int g = Math.max(ground(end, 88, 25), ground(end, 70, 20));
            view = new Vec3(88.5, g + 14, 25.5);
            look(srv, view, 75f, 2f);
            for (EnderDragon d : end.getDragons()) {   // out of the first views (a dragon of our own comes later)
                d.discard();
            }
        }));
        at(t += 80, () -> shot("end_plain"));
        at(t += 2, () -> server(srv -> EclipseState.get(end(srv)).forceFull(end(srv), 30000)));
        at(t += 40, () -> shot("eclipse_moon"));
        at(t += 2, () -> server(srv -> {
            ServerLevel end = end(srv);
            look(srv, new Vec3(58.5, ground(end, 58, 22) + 2.5, 22.5), 72f, -16f);   // low, under the towers
        }));
        at(t += 40, () -> shot("eclipse_towers"));
        at(t += 2, () -> server(srv -> look(srv, view, 200f, -55f)));
        at(t += 30, () -> shot("eclipse_sky"));
        at(t += 2, () -> server(srv -> look(srv, view.add(0, -11, 0), 40f, 30f)));
        at(t += 30, () -> shot("eclipse_ground"));
        // the enraged dragon: hovering ahead (its second phase: four wings), then a light beam crossing the view
        at(t += 2, () -> server(srv -> {
            ServerLevel end = end(srv);
            Vec3 fwd = forward(75f), right = new Vec3(-fwd.z, 0, fwd.x);
            dragonAt = view.add(fwd.scale(19)).add(right.scale(-9)).add(0, 7, 0);   // left of the moon, against the bright sky
            Vec3 heading = right.add(fwd.scale(-0.35)).normalize();   // crossing the view, a little towards us
            EnderDragon d = EntityType.ENDER_DRAGON.create(end);
            d.moveTo(dragonAt.x, dragonAt.y, dragonAt.z, (float) (Mth.atan2(heading.x, -heading.z) * Mth.RAD_TO_DEG), 0f);
            end.addFreshEntity(d);
            d.getPhaseManager().setPhase(EnderDragonPhase.HOVERING);
            d.setHealth(d.getMaxHealth() * 0.45f);   // its second phase: the wings grow, the towers rise
            look(srv, view, 75f, -10f);
        }));
        at(t += 50, () -> shot("dragon_enraged"));
        at(t += 20, () -> shot("dragon_wings"));
        at(t += 2, () -> server(srv -> look(srv, view, 75f, -6f)));
        at(t += 2, () -> server(srv -> {
            ServerLevel end = end(srv);
            EnderDragon d = dragon(end);
            if (d != null) {
                Vec3 fwd = forward(75f), right = new Vec3(-fwd.z, 0, fwd.x);
                Vec3 to = view.add(fwd.scale(13)).add(right.scale(5));
                DragonRework.beam(end, d, DragonRework.state(d), new Vec3(to.x, ground(end, Mth.floor(to.x), Mth.floor(to.z)), to.z));
            }
        }));
        at(t += 16, () -> shot("dragon_beam_warning"));
        at(t += 20, () -> shot("dragon_beam"));
        at(t += 6, () -> shot("dragon_beam_late"));
        // the Monolith on an obsidian arena out over the void, a villager before it, the camera off to the side
        at(t += 10, () -> server(srv -> {   // go there first, so its chunks stay loaded with what is put in them
            for (EnderDragon d : end(srv).getDragons()) {
                d.discard();
            }
            look(srv, side(), focus());
        }));
        at(t += 30, () -> server(srv -> {
            ServerLevel end = end(srv);
            BlockPos c = ARENA;
            for (int x = -13; x <= 13; x++) {
                for (int z = -13; z <= 13; z++) {
                    if (x * x + z * z <= 13 * 13) {
                        end.setBlockAndUpdate(c.offset(x, -1, z), (x * 7 + z * 3) % 11 == 0 ? Blocks.CRYING_OBSIDIAN.defaultBlockState()
                                : Blocks.OBSIDIAN.defaultBlockState());
                    }
                }
            }
            for (int[] pl : new int[][]{{8, 5}, {-8, 5}, {-9, -5}, {10, -2}}) {
                for (int y = 0; y < 4; y++) {
                    end.setBlockAndUpdate(c.offset(pl[0], y, pl[1]), Blocks.OBSIDIAN.defaultBlockState());
                }
            }
            Monolith m = EndEntities.MONOLITH.create(end);
            m.moveTo(c.getX() + 0.5, c.getY(), c.getZ() + 0.5, 180f, 0f);
            m.setPersistenceRequired();
            end.addFreshEntity(m);
            victim = villager(end, c.getX() + 0.5, c.getZ() - 8.5);
        }));
        at(t += 60, () -> server(srv -> {
            Monolith m = monolith(end(srv));
            if (m != null && victim != null) {
                m.wakeFor(victim);
                m.holdActions(100000);
            }
        }));
        at(t += 40, () -> shot("monolith_awake"));
        at(t += 2, () -> server(srv -> {
            Monolith m = monolith(end(srv));
            if (m != null && victim != null) {
                m.startStare(victim);
            }
        }));
        at(t += 30, () -> server(srv -> {
            Monolith m = monolith(end(srv));
            if (m != null && victim != null) {
                m.startStare(victim);
                m.startSlam(true, victim, victim.position().add(3.4, 0, 1.5));
                m.startSlam(false, victim, victim.position().add(-3.4, 0, 0.5));
            }
        }));
        at(t += 13, () -> shot("monolith_stare_slam"));
        at(t += 6, () -> shot("monolith_slam_fall"));
        at(t += 3, () -> shot("monolith_slam_impact"));
        at(t += 60, () -> server(srv -> {
            Monolith m = monolith(end(srv));
            if (m != null) {
                m.startClap(end(srv));
            }
            look(srv, side().add(0, 2.5, -2), focus());
        }));
        at(t += 14, () -> shot("monolith_clap"));
        at(t += 16, () -> shot("monolith_ring"));
        at(t += 40, () -> server(srv -> {
            ServerLevel end = end(srv);
            Monolith m = monolith(end);
            Villager v = villager(end, ARENA.getX() - 1.5, ARENA.getZ() - 6.5);
            if (m != null) {
                m.wakeFor(v);
                m.startGrab(false, v);
            }
            look(srv, side(), focus());
        }));
        at(t += 20, () -> shot("monolith_grab"));
        at(t += 16, () -> shot("monolith_grab_hold"));
        at(t += 40, () -> server(srv -> {
            Monolith m = monolith(end(srv));
            if (m != null) {
                m.startSummon(end(srv));
            }
        }));
        at(t += 18, () -> shot("monolith_summon_raise"));
        at(t += 12, () -> shot("monolith_summon"));
        at(t += 30, () -> server(srv -> {
            Minecraft.getInstance().options.hideGui = false;
            BlockPos c = ARENA;
            ServerLevel end = end(srv);
            end.getEntities(EntityType.VILLAGER, v -> true).forEach(v -> v.discard());
            look(srv, new Vec3(c.getX() + 0.5, c.getY() + 1.62, c.getZ() - 10.5), new Vec3(c.getX() + 0.5, c.getY() + 4.4, c.getZ() + 0.5));
            Monolith m = monolith(end);
            Villager v = villager(end, c.getX() - 4.5, c.getZ() - 7.5);
            if (m != null) {
                m.wakeFor(v);
                m.startStare(v);
            }
        }));
        at(t += 50, () -> shot("monolith_hud"));
        at(t += 5, () -> stopWhenDone = true);
    }

    /** The Monolith shots' camera: off its left shoulder, looking past it towards its victim. */
    private static Vec3 side() {
        return new Vec3(ARENA.getX() + 7.0, ARENA.getY() + 3.0, ARENA.getZ() - 11.0);
    }

    private static Vec3 focus() {
        return new Vec3(ARENA.getX() + 0.5, ARENA.getY() + 4.8, ARENA.getZ() - 3.5);
    }

    private static Villager villager(ServerLevel end, double x, double z) {
        Villager v = EntityType.VILLAGER.create(end);
        v.moveTo(x, ARENA.getY(), z, 0f, 0f);
        v.setNoAi(true);
        v.setPersistenceRequired();
        end.addFreshEntity(v);
        return v;
    }

    private static ServerLevel end(MinecraftServer srv) {
        return srv.getLevel(Level.END);
    }

    private static ServerPlayer player(MinecraftServer srv) {
        return srv.getPlayerList().getPlayers().get(0);
    }

    private static int ground(ServerLevel end, int x, int z) {
        return end.getHeightmapPos(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, new BlockPos(x, 0, z)).getY();
    }

    /** MC yaw -> the way it looks (horizontal). */
    private static Vec3 forward(float yaw) {
        return new Vec3(-Mth.sin(yaw * Mth.DEG_TO_RAD), 0, Mth.cos(yaw * Mth.DEG_TO_RAD));
    }

    private static void look(MinecraftServer srv, Vec3 from, float yaw, float pitch) {
        settleUntil = frames + 3;   // the plan waits until the new view has been drawn
        player(srv).teleportTo(end(srv), from.x, from.y, from.z, yaw, pitch);
    }

    private static void look(MinecraftServer srv, Vec3 from, Vec3 at) {
        Vec3 d = at.subtract(from);
        float yaw = (float) (Mth.atan2(d.z, d.x) * Mth.RAD_TO_DEG) - 90f;
        float pitch = (float) -(Mth.atan2(d.y, Math.sqrt(d.x * d.x + d.z * d.z)) * Mth.RAD_TO_DEG);
        look(srv, from.subtract(0, 1.62, 0), yaw, pitch);   // a spectator's eyes are 1.62 above its feet
    }

    @Nullable
    private static EnderDragon dragon(ServerLevel end) {
        List<? extends EnderDragon> ds = end.getDragons();
        return ds.isEmpty() ? null : ds.get(0);
    }

    @Nullable
    private static Monolith monolith(ServerLevel end) {
        for (var e : end.getAllEntities()) {
            if (e instanceof Monolith m && m.isAlive()) {
                return m;
            }
        }
        return null;
    }

    private static void at(int tick, Runnable r) {
        AT.add(tick);
        PLAN.add(r);
    }

    private static void cmd(String c) {
        Minecraft.getInstance().player.connection.sendCommand(c);
    }

    private static void server(Consumer<MinecraftServer> job) {
        var srv = Minecraft.getInstance().getSingleplayerServer();
        if (srv != null) {
            srv.execute(() -> job.accept(srv));
        }
    }

    /** Taken two frames on (so a camera move just made is drawn), at the next client tick after them. */
    private static void shot(String name) {
        PENDING.add(name);
        PENDING_FRAME.add(frames + 1);
    }

    private static void takeShots(Minecraft mc) {
        while (!PENDING.isEmpty() && frames >= PENDING_FRAME.get(0)) {
            String name = PENDING.remove(0);
            PENDING_FRAME.remove(0);
            Screenshot.grab(mc.gameDirectory, "winterworks_endboss_" + name + ".png", mc.getMainRenderTarget(), msg -> {});
            Monolith m = mc.level == null ? null : mc.level.getEntitiesOfClass(Monolith.class, mc.player.getBoundingBox().inflate(40)).stream().findFirst().orElse(null);
            Winterworks.LOG.info("endbossshots: {}{}", name, m == null ? "" : " (stare " + m.stareTarget() + " at " + m.stareProgress() + ", hands " + m.handState(true) + "/" + m.handState(false) + ")");
        }
    }

    private static void tick(Minecraft mc) {
        if (!created && mc.level == null && mc.screen != null && mc.getOverlay() == null) {
            mc.options.onboardAccessibility = false;
            mc.getTutorial().setStep(net.minecraft.client.tutorial.TutorialSteps.NONE);
            created = true;
            LevelSettings settings = new LevelSettings("winterworks_endbossshots", GameType.CREATIVE, false, Difficulty.NORMAL,
                    true, new GameRules(), WorldDataConfiguration.DEFAULT);
            mc.createWorldOpenFlows().createFreshLevel("winterworks_endbossshots_" + System.currentTimeMillis(), settings,
                    new WorldOptions(20261122L, false, false),
                    reg -> reg.registryOrThrow(Registries.WORLD_PRESET).getHolderOrThrow(WorldPresets.NORMAL).value().createWorldDimensions(),
                    mc.screen);
            return;
        }
        if (mc.player != null) {
            mc.gui.getChat().clearMessages(false);
            mc.getToasts().clear();
            takeShots(mc);
            if (stopWhenDone && PENDING.isEmpty()) {
                mc.stop();
            }
        }
    }

    /**
     * The plan keeps the server's time (a slow software-rendered client must not run ahead of what it shows): each step
     * is handed to the client thread when its server tick comes.
     */
    private static void serverTick(MinecraftServer srv) {
        if (srv.getPlayerList().getPlayers().isEmpty() || step >= PLAN.size()) {
            return;
        }
        if (frames < settleUntil) {
            return;   // a camera move not drawn yet
        }
        ticks++;
        while (step < PLAN.size() && ticks >= AT.get(step)) {
            Minecraft.getInstance().execute(PLAN.get(step++));
        }
    }
}
