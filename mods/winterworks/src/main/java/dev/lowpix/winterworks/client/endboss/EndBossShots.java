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
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.Difficulty;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.boss.enderdragon.EnderDragon;
import net.minecraft.world.entity.boss.enderdragon.phases.EnderDragonPhase;
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
 * ./gradlew runClient under xvfb-run) the client makes a fresh world, goes to the End, and saves
 * screenshots/winterworks_endboss_*.png: the End before and during an eclipse, the enraged dragon (four wings) firing a
 * light beam, and the Monolith staring, slamming, clapping and grabbing on an obsidian arena. Then it quits.
 */
final class EndBossShots {
    private static final boolean ENABLED = Boolean.getBoolean("winterworks.endbossshots");
    private static final String ONLY = System.getProperty("winterworks.endbossshots.only", "");
    private static final List<Runnable> PLAN = new ArrayList<>();
    private static final List<Integer> AT = new ArrayList<>();
    private static boolean created;
    private static int ticks, step;
    /** Where the views are set up (server thread writes, client reads after). */
    private static volatile Vec3 view = new Vec3(60, 70, 8);
    private static final BlockPos ARENA = new BlockPos(260, 90, 0);

    private EndBossShots() {}

    static void init() {
        if (!ENABLED) {
            return;
        }
        ClientTickEvents.END_CLIENT_TICK.register(EndBossShots::tick);
        int t = 40;
        at(t, () -> {
            Minecraft mc = Minecraft.getInstance();
            mc.options.renderDistance().set(8);
            mc.options.hideGui = true;
            for (String c : new String[]{"gamerule doDaylightCycle false", "gamerule doMobSpawning false", "gamerule doWeatherCycle false",
                    "difficulty normal", "gamemode survival"}) {
                cmd(c);
            }
        });
        at(t += 10, () -> server(srv -> {
            ServerLevel end = srv.getLevel(Level.END);
            ServerPlayer p = srv.getPlayerList().getPlayers().get(0);
            p.addEffect(new MobEffectInstance(MobEffects.DAMAGE_RESISTANCE, 100000, 4, false, false));
            p.addEffect(new MobEffectInstance(MobEffects.REGENERATION, 100000, 4, false, false));
            p.addEffect(new MobEffectInstance(MobEffects.SATURATION, 100000, 4, false, false));
            p.addEffect(new MobEffectInstance(MobEffects.FIRE_RESISTANCE, 100000, 0, false, false));
            p.teleportTo(end, 62.5, 90, 10.5, 75f, -6f);
        }));
        // the island under the eclipse: wait for the chunks, find the ground, look west-south-west at the moon over the towers
        at(t += 160, () -> server(srv -> {
            ServerLevel end = srv.getLevel(Level.END);
            ServerPlayer p = srv.getPlayerList().getPlayers().get(0);
            BlockPos g = end.getHeightmapPos(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, new BlockPos(62, 0, 10));
            view = new Vec3(62.5, Math.max(g.getY(), 50) + 1.6, 10.5);
            p.teleportTo(end, view.x, view.y, view.z, 75f, -10f);
            for (EnderDragon d : end.getDragons()) {   // keep the dragon out of the first views
                d.moveTo(-40, 130, -120, 0f, 0f);
                d.setNoAi(true);
            }
        }));
        at(t += 80, () -> shot("end_plain"));
        at(t += 2, () -> server(srv -> EclipseState.get(srv.getLevel(Level.END)).forceFull(srv.getLevel(Level.END), 20000)));
        at(t += 40, () -> shot("eclipse_moon"));
        at(t += 2, () -> server(srv -> srv.getPlayerList().getPlayers().get(0).teleportTo(srv.getLevel(Level.END), view.x, view.y,
                view.z, 120f, -25f)));
        at(t += 30, () -> shot("eclipse_sky"));
        at(t += 2, () -> server(srv -> srv.getPlayerList().getPlayers().get(0).teleportTo(srv.getLevel(Level.END), view.x, view.y + 1,
                view.z, 60f, 18f)));
        at(t += 30, () -> shot("eclipse_ground"));
        // the enraged dragon: hovering before you, four wings, a beam
        at(t += 2, () -> server(srv -> {
            ServerLevel end = srv.getLevel(Level.END);
            ServerPlayer p = srv.getPlayerList().getPlayers().get(0);
            EnderDragon d = dragon(end);
            if (d == null) {
                Winterworks.LOG.warn("endbossshots: no dragon");
                return;
            }
            Vec3 at = view.add(-26, 9, -9);
            d.setNoAi(false);
            d.moveTo(at.x, at.y, at.z, 120f, 0f);
            d.setDeltaMovement(Vec3.ZERO);
            d.getPhaseManager().setPhase(EnderDragonPhase.HOLDING_PATTERN);
            d.getPhaseManager().setPhase(EnderDragonPhase.HOVERING);
            d.setHealth(d.getMaxHealth() * 0.45f);
            p.teleportTo(end, view.x, view.y, view.z, 72f, -14f);
        }));
        at(t += 50, () -> shot("dragon_enraged"));
        at(t += 2, () -> server(srv -> {
            ServerLevel end = srv.getLevel(Level.END);
            EnderDragon d = dragon(end);
            if (d != null) {
                Vec3 to = view.add(-10, -1.5, -6);
                BlockPos g = end.getHeightmapPos(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, BlockPos.containing(to));
                DragonRework.beam(end, d, DragonRework.state(d), new Vec3(to.x, g.getY(), to.z));
            }
        }));
        at(t += 16, () -> shot("dragon_beam_warning"));
        at(t += 20, () -> shot("dragon_beam"));
        at(t += 8, () -> shot("dragon_beam_late"));
        // the Monolith on an obsidian arena, away from the island
        at(t += 2, () -> server(srv -> {
            ServerLevel end = srv.getLevel(Level.END);
            for (EnderDragon d : end.getDragons()) {
                d.discard();
            }
            BlockPos c = ARENA;
            for (int x = -13; x <= 13; x++) {
                for (int z = -13; z <= 13; z++) {
                    if (x * x + z * z <= 13 * 13) {
                        end.setBlockAndUpdate(c.offset(x, -1, z), (x + z) % 5 == 0 ? Blocks.CRYING_OBSIDIAN.defaultBlockState()
                                : Blocks.OBSIDIAN.defaultBlockState());
                    }
                }
            }
            for (int[] pl : new int[][]{{7, 7}, {-8, 6}, {6, -8}, {-7, -7}}) {
                for (int y = 0; y < 4; y++) {
                    end.setBlockAndUpdate(c.offset(pl[0], y, pl[1]), Blocks.OBSIDIAN.defaultBlockState());
                }
            }
            Monolith m = EndEntities.MONOLITH.create(end);
            m.moveTo(c.getX() + 0.5, c.getY() + 1.2, c.getZ() + 0.5, 180f, 0f);
            m.setPersistenceRequired();
            end.addFreshEntity(m);
            ServerPlayer p = srv.getPlayerList().getPlayers().get(0);
            p.teleportTo(end, c.getX() + 0.5, c.getY(), c.getZ() - 10.5, 0f, -16f);
        }));
        at(t += 60, () -> server(srv -> {
            Monolith m = monolith(srv.getLevel(Level.END));
            ServerPlayer p = srv.getPlayerList().getPlayers().get(0);
            if (m != null) {
                m.wakeFor(p);
                m.holdActions(100000);
            }
        }));
        at(t += 40, () -> shot("monolith_awake"));
        at(t += 2, () -> server(srv -> {
            Monolith m = monolith(srv.getLevel(Level.END));
            if (m != null) {
                m.startStare(srv.getPlayerList().getPlayers().get(0));
            }
        }));
        at(t += 30, () -> server(srv -> {
            Monolith m = monolith(srv.getLevel(Level.END));
            ServerPlayer p = srv.getPlayerList().getPlayers().get(0);
            if (m != null) {
                m.startSlam(true, p, p.position().add(-3.5, 0, 1.5));
                m.startSlam(false, p, p.position().add(3.0, 0, 2.5));
            }
        }));
        at(t += 13, () -> shot("monolith_stare_slam"));
        at(t += 6, () -> shot("monolith_slam_fall"));
        at(t += 4, () -> shot("monolith_slam_impact"));
        at(t += 50, () -> server(srv -> {
            Monolith m = monolith(srv.getLevel(Level.END));
            if (m != null) {
                m.startClap(srv.getLevel(Level.END));
            }
        }));
        at(t += 16, () -> shot("monolith_clap"));
        at(t += 14, () -> shot("monolith_ring"));
        at(t += 40, () -> server(srv -> {
            Monolith m = monolith(srv.getLevel(Level.END));
            if (m != null) {
                m.startGrab(false, srv.getPlayerList().getPlayers().get(0));
            }
        }));
        at(t += 18, () -> shot("monolith_grab"));
        at(t += 2, () -> Minecraft.getInstance().options.hideGui = false);
        at(t += 60, () -> shot("monolith_hud"));
        at(t += 5, () -> Minecraft.getInstance().stop());
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

    private static void server(Consumer<net.minecraft.server.MinecraftServer> job) {
        var srv = Minecraft.getInstance().getSingleplayerServer();
        if (srv != null) {
            srv.execute(() -> job.accept(srv));
        }
    }

    private static void shot(String name) {
        if (!ONLY.isEmpty() && !name.startsWith(ONLY)) {
            return;
        }
        Minecraft mc = Minecraft.getInstance();
        Screenshot.grab(mc.gameDirectory, "winterworks_endboss_" + name + ".png", mc.getMainRenderTarget(), msg -> {});
        Winterworks.LOG.info("endbossshots: {}", name);
    }

    private static void tick(Minecraft mc) {
        if (!created && mc.level == null && mc.screen != null && mc.getOverlay() == null) {
            mc.options.onboardAccessibility = false;
            mc.getTutorial().setStep(net.minecraft.client.tutorial.TutorialSteps.NONE);
            created = true;
            GameRules rules = new GameRules();
            LevelSettings settings = new LevelSettings("winterworks_endbossshots", GameType.CREATIVE, false, Difficulty.NORMAL,
                    true, rules, WorldDataConfiguration.DEFAULT);
            mc.createWorldOpenFlows().createFreshLevel("winterworks_endbossshots_" + System.currentTimeMillis(), settings,
                    new WorldOptions(20261122L, false, false),
                    reg -> reg.registryOrThrow(Registries.WORLD_PRESET).getHolderOrThrow(WorldPresets.NORMAL).value().createWorldDimensions(),
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
