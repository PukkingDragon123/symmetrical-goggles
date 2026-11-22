package dev.lowpix.winterworks.client;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.express.Couplings;
import dev.lowpix.winterworks.express.LocomotiveCart;
import dev.lowpix.winterworks.globe.SnowGlobeBlockEntity;
import dev.lowpix.winterworks.icebreaker.IcebreakerEntity;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWItems;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.Difficulty;
import net.minecraft.world.entity.vehicle.AbstractMinecart;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import net.minecraft.world.phys.AABB;

/**
 * Dev-only: with -Dwinterworks.showcase=true (./gradlew runShowcase) the client makes a flat creative world, builds a
 * few scenes with commands, takes in-game screenshots of the mod's content into run/screenshots/ and quits.
 * Does nothing in normal play.
 */
public final class ShowcaseDirector {
    /**
     * "true": the flat-world scenes; "hex": only the Amber Age and Hexes & Havoc ones; "cold": a real generated world,
     * to photograph natural Ice Caves and tombs.
     */
    private static final String MODE = System.getProperty("winterworks.showcase", "");
    private static final boolean ENABLED = !MODE.isEmpty() && !MODE.equals("false");

    static boolean coldWorld() {
        return MODE.equals("cold");
    }
    private static boolean created;
    private static int ticks;
    private static int step;
    private static final List<Runnable> PLAN = new ArrayList<>();
    private static final List<Integer> AT = new ArrayList<>();

    private ShowcaseDirector() {}

    public static void init() {
        if (!ENABLED) {
            return;
        }
        ClientTickEvents.END_CLIENT_TICK.register(ShowcaseDirector::tick);
        if (coldWorld()) {
            ColdShowcase.plan();
            return;
        }
        int t = 40;
        at(t, () -> {
            cmd("gamerule doDaylightCycle false");
            cmd("gamerule doWeatherCycle false");
            cmd("gamerule doMobSpawning false");
            cmd("gamerule randomTickSpeed 0");
            cmd("time set 2000");
            cmd("weather clear");
        });
        if (MODE.equals("hex")) {   // only the Amber Age and Hexes & Havoc scenes
            at(t += 5, () -> {
                cmd("difficulty normal");
                cmd("gamemode creative");
            });
            t = AmberScenes.plan(t);
            t = HexScenes.plan(t);
            at(t += 5, () -> Minecraft.getInstance().stop());
            return;
        }
        // scene 1: an Icebreaker family by a frozen pond
        at(t += 5, () -> {
            cmd("fill -24 -61 -10 26 -61 40 minecraft:snow_block");
            cmd("fill -6 -61 20 14 -61 34 minecraft:ice");
            cmd("fill 6 -60 -2 9 -60 0 minecraft:snow[layers=3]");
            cmd("setblock -6 -60 12 minecraft:spruce_log");
            cmd("setblock -6 -59 12 minecraft:spruce_log");
            cmd("fill -7 -58 11 -5 -57 13 minecraft:spruce_leaves[persistent=true]");
            cmd("summon winterworks:icebreaker 0.5 -60 12 {NoAI:1b,Rotation:[160f,0f],HornStage:4,Variant:\"grey\",Alpha:1b,PersistenceRequired:1b}");
            cmd("summon winterworks:icebreaker -9.5 -60 16 {NoAI:1b,Rotation:[205f,0f],HornStage:3,Variant:\"harbor\",PersistenceRequired:1b}");
            cmd("summon winterworks:icebreaker 10.5 -60 17 {NoAI:1b,Rotation:[130f,0f],HornStage:2,Variant:\"leopard\",PersistenceRequired:1b}");
            cmd("summon winterworks:icebreaker -4.5 -60 27 {NoAI:1b,Rotation:[180f,0f],HornStage:4,Variant:\"brown\",PersistenceRequired:1b}");
            cmd("summon winterworks:icebreaker 6.5 -60 30 {NoAI:1b,Rotation:[165f,0f],HornStage:4,Variant:\"ringed\",PersistenceRequired:1b}");
            cmd("summon winterworks:icebreaker 16.5 -60 27 {NoAI:1b,Rotation:[120f,0f],HornStage:4,Variant:\"frost\",PersistenceRequired:1b}");
            cmd("summon winterworks:icebreaker -5.5 -60 5.5 {NoAI:1b,Rotation:[215f,0f],Age:-24000,PersistenceRequired:1b}");
            cmd("summon winterworks:icebreaker 5.5 -60 5 {NoAI:1b,Rotation:[150f,0f],Age:-24000,PersistenceRequired:1b}");
            cmd("tp @s 1 -56.2 -1.5 0 14");
        });
        at(t += 120, () -> shot("icebreaker_family"));
        at(t += 5, () -> cmd("tp @s 7.5 -57.6 3.5 38 12"));
        at(t += 40, () -> shot("icebreaker_close"));
        // scene 2: the Winter Express on coaster rails
        at(t += 5, () -> {
            cmd("fill 30 -61 -6 70 -61 8 minecraft:snow_block");
            cmd("fill 30 -60 0 70 -60 0 winterworks:coaster_rail[shape=east_west]");
            cmd("fill 30 -60 3 70 -60 3 winterworks:coaster_rail[shape=east_west,color=15]");
            cmd("summon winterworks:locomotive 52.5 -60 0.5");
            cmd("summon minecraft:chest_minecart 50.9 -60 0.5");
            cmd("summon winterworks:fox_cart 49.3 -60 0.5");
            cmd("summon winterworks:zombie_cart 47.7 -60 0.5");
            cmd("summon winterworks:trailer_cart 46.1 -60 0.5");
            cmd("summon winterworks:dragon_locomotive 44.5 -60 3.5");
            cmd("tp @s 47 -57.8 -5.5 -15 18");
        });
        at(t += 30, () -> server(level -> {
            List<AbstractMinecart> carts = level.getEntitiesOfClass(AbstractMinecart.class, new AABB(40, -62, 0, 56, -58, 1));
            carts.sort((a, b) -> Double.compare(b.getX(), a.getX()));
            for (int i = 0; i + 1 < carts.size(); i++) {
                Couplings.couple(carts.get(i), carts.get(i + 1));
            }
            for (LocomotiveCart loco : level.getEntitiesOfClass(LocomotiveCart.class, new AABB(40, -62, -1, 56, -58, 5))) {
                loco.setHeading(new net.minecraft.world.phys.Vec3(1, 0, 0));
                loco.addFuel(2000);
            }
        }));
        at(t += 100, () -> shot("winter_express"));
        at(t += 5, () -> {
            server(level -> level.getEntitiesOfClass(LocomotiveCart.class, new AABB(40, -62, -1, 56, -58, 1))
                    .forEach(l -> l.setThrottle(1)));
            cmd("tp @s 60 -58.2 -4 25 15");
        });
        at(t += 70, () -> shot("winter_express_running"));
        // scene 2b: Trap Rail and Drop Rail on a little coaster
        at(t += 5, () -> {
            cmd("fill 100 -61 -6 124 -61 8 minecraft:snow_block");
            cmd("fill 100 -60 0 124 -60 0 winterworks:coaster_rail[shape=east_west]");
            cmd("setblock 106 -61 0 minecraft:redstone_block");
            cmd("setblock 106 -60 0 winterworks:trap_rail[shape=east_west]");
            cmd("summon winterworks:fox_cart 106.5 -60 0.5");
            cmd("fill 110 -57 3 122 -57 3 winterworks:coaster_rail[shape=east_west]");
            cmd("fill 110 -58 3 122 -58 3 minecraft:spruce_planks");
            cmd("setblock 114 -58 3 minecraft:air");
            cmd("setblock 114 -57 3 winterworks:drop_rail[shape=east_west]");
            cmd("setblock 117 -58 3 minecraft:air");
            cmd("setblock 117 -57 3 winterworks:drop_rail[shape=east_west]");
            cmd("summon winterworks:zombie_cart 114.5 -57 3.5");
            cmd("fill 110 -60 3 122 -60 3 winterworks:coaster_rail[shape=east_west]");
            cmd("tp @s 110.5 -57.6 -7.5 -8 4");
        });
        at(t += 40, () -> cmd("setblock 117 -57 2 minecraft:redstone_block"));
        at(t += 30, () -> cmd("setblock 114 -57 2 minecraft:redstone_block"));
        at(t += 5, () -> shot("trap_and_drop_rails"));
        // scene 3: the snow globe
        at(t += 5, () -> {
            cmd("fill 88 -61 -4 96 -61 4 minecraft:spruce_planks");
            cmd("setblock 92 -60 0 minecraft:spruce_slab[type=top]");
            cmd("setblock 92 -59 0 winterworks:snow_globe[facing=north]");
            cmd("tp @s 92.5 -58.0 -2.6 0 24");
        });
        at(t += 60, () -> server(level -> level.blockEvent(new BlockPos(92, -59, 0), WWBlocks.SNOW_GLOBE,
                SnowGlobeBlockEntity.EVENT_SHAKE, 7)));
        at(t += 12, () -> shot("snow_globe_shake"));
        at(t += 40, () -> shot("snow_globe_swirl"));
        // scene 4: the Snowball Launcher in first person, firing, HUD up
        at(t += 5, () -> {
            Minecraft mc = Minecraft.getInstance();
            mc.options.hideGui = false;
            cmd("clear @s");
            cmd("give @s winterworks:snowball_launcher");
            cmd("give @s minecraft:snowball 64");
            cmd("give @s winterworks:heavy_shears");
            cmd("give @s winterworks:icebreaker_horn");
            cmd("give @s winterworks:locomotive");
            cmd("give @s winterworks:fox_cart");
            cmd("give @s winterworks:coaster_rail 16");
            cmd("give @s winterworks:snow_globe");
            cmd("tp @s 0.5 -59 -3.5 0 6");
            cmd("gamemode survival");
        });
        at(t += 40, () -> {
            Minecraft mc = Minecraft.getInstance();
            mc.player.getInventory().selected = 0;
            mc.options.keyUse.setDown(true);
        });
        at(t += 14, () -> shot("launcher_firing"));
        at(t += 3, () -> Minecraft.getInstance().options.keyUse.setDown(false));
        at(t += 30, () -> shot("launcher_magazine"));
        t = ColdScenes.plan(t);
        t = AmberScenes.plan(t);
        t = HexScenes.plan(t);
        at(t += 5, () -> Minecraft.getInstance().stop());
    }

    static void at(int tick, Runnable r) {
        AT.add(tick);
        PLAN.add(r);
    }

    static void cmd(String c) {
        Minecraft.getInstance().player.connection.sendCommand(c);
    }

    static void server(java.util.function.Consumer<ServerLevel> job) {
        var srv = Minecraft.getInstance().getSingleplayerServer();
        if (srv != null) {
            srv.execute(() -> job.accept(srv.overworld()));
        }
    }

    static void shot(String name) {
        Minecraft mc = Minecraft.getInstance();
        Screenshot.grab(mc.gameDirectory, "winterworks_" + name + ".png", mc.getMainRenderTarget(), msg -> {});
        Winterworks.LOG.info("showcase: shot {}", name);
    }

    private static void tick(Minecraft mc) {
        // start from whatever menu is up (title screen, or the first-launch accessibility screen) once loading is done
        if (!created && mc.level == null && mc.screen != null && mc.getOverlay() == null) {
            mc.options.onboardAccessibility = false;
            mc.getTutorial().setStep(net.minecraft.client.tutorial.TutorialSteps.NONE);
            created = true;
            GameRules rules = new GameRules();
            LevelSettings settings = new LevelSettings("winterworks_showcase", GameType.CREATIVE, false, Difficulty.PEACEFUL,
                    true, rules, WorldDataConfiguration.DEFAULT);
            WorldOptions options = new WorldOptions(20261115L, coldWorld(), false);
            var preset = coldWorld() ? WorldPresets.NORMAL : WorldPresets.FLAT;
            if (coldWorld()) {
                mc.options.renderDistance().set(8);
            }
            mc.createWorldOpenFlows().createFreshLevel("winterworks_showcase_" + System.currentTimeMillis(), settings, options,
                    reg -> reg.registryOrThrow(Registries.WORLD_PRESET).getHolderOrThrow(preset).value().createWorldDimensions(),
                    mc.screen);
            return;
        }
        if (mc.player == null || mc.level == null || step >= PLAN.size()) {
            return;
        }
        if (ticks == 0) {
            mc.options.hideGui = true;
        }
        ticks++;
        mc.gui.getChat().clearMessages(false);   // keep command feedback and toasts out of the shots
        mc.getToasts().clear();
        while (step < PLAN.size() && ticks >= AT.get(step)) {
            PLAN.get(step++).run();
        }
    }
}
