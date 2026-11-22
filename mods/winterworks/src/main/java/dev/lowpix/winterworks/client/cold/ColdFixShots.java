package dev.lowpix.winterworks.client.cold;

import com.mojang.blaze3d.platform.InputConstants;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.boss.FrozenTomb;
import dev.lowpix.winterworks.icebreaker.IcebreakerEntity;
import dev.lowpix.winterworks.registry.WWEntities;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.CameraType;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.Difficulty;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.animal.Salmon;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * Dev-only screenshots of the 0.4 Cold Zone fixes: with -Dwinterworks.coldfixshots=true (e.g. in JAVA_TOOL_OPTIONS for
 * ./gradlew runClient under xvfb-run) the client makes a flat world and saves screenshots/winterworks_coldfix_*.png:
 * the dual Fang Daggers in first person mid-swing (left and right click), the Snowball Launcher held, fur armour worn,
 * the ramming pose with speed lines, the skull roaring with icicles falling, the Frost Mauler's eyes, the frozen tomb's
 * ancient ice, and Icebreakers swimming, sleeping and hunting salmon. Then it quits. A comma list instead of true
 * (hands,ramming,skull,mauler,icebreaker) runs only those scenes.
 */
final class ColdFixShots {
    private static final boolean ENABLED = !System.getProperty("winterworks.coldfixshots", "false").equals("false");
    private static final List<Runnable> PLAN = new ArrayList<>();
    private static final List<Integer> AT = new ArrayList<>();
    private static final BlockPos TOMB = new BlockPos(120, -52, 36);
    private static boolean created;
    private static int ticks, step;
    @Nullable
    private static volatile IcebreakerEntity hunter, swimmer;

    private ColdFixShots() {}

    static void init() {
        if (!ENABLED) {
            return;
        }
        ClientTickEvents.END_CLIENT_TICK.register(ColdFixShots::tick);
        int t = 40;
        at(t, () -> {
            for (String c : new String[]{"gamerule doDaylightCycle false", "gamerule doMobSpawning false", "gamerule doWeatherCycle false",
                    "time set 6000", "weather clear", "difficulty normal", "gamemode creative"}) {
                cmd(c);
            }
            Minecraft.getInstance().options.renderDistance().set(8);
            Minecraft.getInstance().getWindow().setWindowed(1280, 720);
        });
        t += 10;
        if (want("hands")) {
            t = hands(t);
        }
        if (want("ramming")) {
            t = ramming(t);
        }
        at(t += 2, () -> cmd("gamemode spectator"));
        if (want("skull")) {
            t = skull(t);
        }
        if (want("mauler")) {
            t = mauler(t);
        }
        if (want("icebreaker")) {
            t = icebreakers(t);
        }
        at(t += 5, () -> Minecraft.getInstance().stop());
    }

    /** -Dwinterworks.coldfixshots=true runs every scene; a comma list (hands,ramming,skull,mauler,icebreaker) only those. */
    private static boolean want(String scene) {
        String v = System.getProperty("winterworks.coldfixshots", "");
        return v.equals("true") || List.of(v.split(",")).contains(scene);
    }

    /** The Fang Daggers (and a vanilla sword for reference), the Snowball Launcher, fur armour. */
    private static int hands(int t) {
        at(t, () -> {
            cmd("summon minecraft:iron_golem 0.5 -60 3.3 {NoAI:1b,Rotation:[180f,0f],PersistenceRequired:1b}");
            cmd("item replace entity @s weapon.mainhand with minecraft:iron_sword");
            cmd("item replace entity @s weapon.offhand with minecraft:iron_sword");
            cmd("tp @s 0.5 -60 0.5 0 12");
        });
        at(t += 60, () -> shot("ref_swords"));
        // the pair in the main hand, a dagger in each hand; left click, then right click
        at(t += 2, () -> {
            cmd("item replace entity @s weapon.mainhand with winterworks:fang_dagger");
            cmd("item replace entity @s weapon.offhand with minecraft:air");
        });
        at(t += 20, () -> shot("daggers_idle"));
        at(t += 2, () -> click(Minecraft.getInstance().options.keyAttack));
        t = burst(t, "daggers_left", 5);
        at(t += 14, () -> click(Minecraft.getInstance().options.keyUse));
        t = burst(t, "daggers_right", 5);
        at(t += 10, () -> {
            camera(CameraType.THIRD_PERSON_FRONT);
            Minecraft.getInstance().options.hideGui = true;
            cmd("tp @s 0.5 -60 0.5 -30 15");
        });
        at(t += 20, () -> shot("daggers_third_person"));
        at(t += 2, () -> {
            cmd("item replace entity @s weapon.mainhand with minecraft:iron_sword");
            cmd("item replace entity @s weapon.offhand with minecraft:iron_sword");
        });
        at(t += 10, () -> shot("ref_swords_third_person"));
        // the Snowball Launcher, held
        at(t += 2, () -> {
            camera(CameraType.FIRST_PERSON);
            Minecraft.getInstance().options.hideGui = false;
            cmd("kill @e[type=minecraft:iron_golem]");
            cmd("item replace entity @s weapon.mainhand with winterworks:snowball_launcher");
            cmd("item replace entity @s weapon.offhand with minecraft:air");
            cmd("tp @s 0.5 -60 0.5 0 5");
        });
        at(t += 30, () -> shot("launcher_first_person"));
        at(t += 2, () -> {
            camera(CameraType.THIRD_PERSON_FRONT);
            Minecraft.getInstance().options.hideGui = true;
            cmd("tp @s 0.5 -60 0.5 -35 12");
        });
        at(t += 20, () -> shot("launcher_third_person"));
        // fur armour, worn (vanilla armour layers), and on an armour stand beside you
        at(t += 2, () -> {
            cmd("item replace entity @s weapon.mainhand with minecraft:air");
            cmd("item replace entity @s armor.head with winterworks:fur_hood");
            cmd("item replace entity @s armor.chest with winterworks:fur_coat");
            cmd("item replace entity @s armor.legs with winterworks:fur_leggings");
            cmd("item replace entity @s armor.feet with winterworks:fur_boots");
            cmd("summon minecraft:armor_stand -1.0 -60 0.5 {Rotation:[-20f,0f],ShowArms:1b,ArmorItems:["
                    + "{id:\"winterworks:fur_boots\",count:1},{id:\"winterworks:fur_leggings\",count:1},"
                    + "{id:\"winterworks:fur_coat\",count:1},{id:\"winterworks:fur_hood\",count:1}]}");
            cmd("tp @s 0.5 -60 0.5 10 10");
        });
        at(t += 30, () -> shot("fur_armour_worn"));
        at(t += 2, () -> cmd("tp @s 0.5 -60 0.5 150 10"));
        at(t += 20, () -> shot("fur_armour_back"));
        at(t += 2, () -> {
            camera(CameraType.FIRST_PERSON);
            cmd("kill @e[type=minecraft:armor_stand]");
            for (String s : new String[]{"head", "chest", "legs", "feet"}) {
                cmd("item replace entity @s armor." + s + " with minecraft:air");
            }
        });
        return t;
    }

    /** The Potion of Ramming at top speed: sprint 3 s, then the ram (speed lines, the pose front and back). */
    private static int ramming(int t) {
        at(t += 2, () -> {
            camera(CameraType.FIRST_PERSON);
            Minecraft.getInstance().options.hideGui = false;
            cmd("effect give @s winterworks:ramming 120 0");
            cmd("tp @s 60.5 -60 -20.5 90 0");
        });
        at(t += 20, () -> {
            Minecraft mc = Minecraft.getInstance();
            mc.options.keyUp.setDown(true);
            mc.options.keySprint.setDown(true);
        });
        at(t += 75, () -> shot("ramming_first_person"));
        at(t += 4, () -> shot("ramming_first_person_2"));
        at(t += 2, () -> {
            camera(CameraType.THIRD_PERSON_FRONT);
            Minecraft.getInstance().options.hideGui = true;
            Minecraft.getInstance().options.keyLeft.setDown(true);   // diagonally: the body turns, the camera sees it side-on
        });
        at(t += 10, () -> shot("ramming_pose_front"));
        at(t += 2, () -> camera(CameraType.THIRD_PERSON_BACK));
        at(t += 8, () -> shot("ramming_pose_back"));
        at(t += 2, () -> {
            Minecraft mc = Minecraft.getInstance();
            mc.options.keyUp.setDown(false);
            mc.options.keySprint.setDown(false);
            mc.options.keyLeft.setDown(false);
            camera(CameraType.FIRST_PERSON);
            cmd("effect clear @s");
        });
        return t;
    }

    /** The skull roars on redstone: icicles and dripstone above it fall. */
    private static int skull(int t) {
        at(t += 5, () -> {
            Minecraft.getInstance().options.hideGui = true;
            cmd("fill 40 -52 30 52 -52 42 minecraft:stone");
            cmd("fill 40 -61 30 52 -61 42 minecraft:packed_ice");
            cmd("setblock 46 -60 37 winterworks:frost_mauler_skull[facing=north]");
            for (int[] c : new int[][]{{44, 35}, {46, 34}, {48, 36}, {45, 38}, {47, 39}, {43, 33}, {49, 33}, {44, 40}, {48, 40}}) {
                cmd("setblock " + c[0] + " -53 " + c[1] + " winterworks:icicle[tip=false]");
                cmd("setblock " + c[0] + " -54 " + c[1] + " winterworks:icicle[tip=true]");
            }
            for (int[] c : new int[][]{{42, 37}, {50, 37}, {46, 41}, {50, 31}}) {
                cmd("setblock " + c[0] + " -53 " + c[1] + " minecraft:pointed_dripstone[vertical_direction=down,thickness=frustum]");
                cmd("setblock " + c[0] + " -54 " + c[1] + " minecraft:pointed_dripstone[vertical_direction=down,thickness=tip]");
            }
            cmd("tp @s 46.5 -60.2 32.5 0 -12");
        });
        at(t += 40, () -> shot("skull_before"));
        at(t += 2, () -> cmd("setblock 47 -60 37 minecraft:redstone_block"));
        t = burst(t, "skull_roar", 8);
        at(t += 4, () -> shot("skull_roar_late"));
        at(t += 6, () -> shot("skull_roar_later"));
        return t;
    }

    /** The Frost Mauler's new head: its eyes and soul flames, by day and night; then the frozen tomb's ancient ice. */
    private static int mauler(int t) {
        at(t += 5, () -> {
            Minecraft.getInstance().options.hideGui = true;
            cmd("fill 70 -61 30 92 -61 50 minecraft:snow_block");
            cmd("summon winterworks:frost_mauler 80.5 -60 40 {NoAI:1b,Rotation:[180f,0f],PersistenceRequired:1b}");
            cmd("tp @s 80.5 -58.2 34.6 0 8");
        });
        at(t += 60, () -> shot("mauler_eyes_day"));
        at(t += 2, () -> cmd("time set 18000"));
        at(t += 30, () -> shot("mauler_eyes_night"));
        at(t += 2, () -> cmd("tp @s 78.6 -58.0 36.2 -30 10"));
        at(t += 25, () -> shot("mauler_eyes_close"));
        at(t += 2, () -> {
            cmd("time set 6000");
            cmd("kill @e[type=winterworks:frost_mauler]");
            cmd("fill 105 -61 20 135 -40 52 minecraft:stone");
            cmd("effect give @s minecraft:night_vision infinite 0 true");
        });
        at(t += 10, () -> server(level -> FrozenTomb.build(level, TOMB, RandomSource.create(7))));
        at(t += 20, () -> cmd("tp @s 120.5 -50 28.5 0 12"));
        at(t += 100, () -> shot("ancient_ice_tomb"));
        at(t += 2, () -> cmd("tp @s 121.5 -50.5 31.5 -10 18"));
        at(t += 40, () -> shot("ancient_ice_close"));
        at(t += 2, () -> cmd("effect clear @s"));
        return t;
    }

    /** A frozen lake with a snowy shore and an ice floe: swimmers, a hungry hunter after salmon, sleepers on the shore. */
    private static int icebreakers(int t) {
        at(t += 5, () -> {
            Minecraft.getInstance().options.hideGui = true;
            cmd("tp @s 169.5 -51 16.5 0 40");   // load the chunks before building there
        });
        at(t += 60, () -> {
            cmd("fill 146 -61 14 186 -61 56 minecraft:snow_block");
            cmd("fill 156 -63 20 182 -61 50 minecraft:water");
            cmd("fill 170 -61 30 174 -61 34 minecraft:packed_ice");
        });
        at(t += 20, () -> server(level -> {
            swimmer = seal(level, new Vec3(166.5, -62.5, 36.5), false, false);
            seal(level, new Vec3(160.5, -62.5, 26.5), false, false);
            hunter = seal(level, new Vec3(178.5, -62.5, 30.5), false, false);
            for (int i = 0; i < 5; i++) {
                Salmon s = EntityType.SALMON.create(level);
                if (s != null) {
                    s.moveTo(166.5 + i * 2, -62.5, 40.5 + (i % 2), 0f, 0f);
                    s.setPersistenceRequired();
                    level.addFreshEntity(s);
                }
            }
            IcebreakerEntity sleeper = seal(level, new Vec3(150.5, -60, 34.5), false, false);
            sleeper.setYRot(90f);
            sleeper.setYBodyRot(90f);
            sleeper.setYHeadRot(90f);
            sleeper.fallAsleep();
            IcebreakerEntity cub = seal(level, new Vec3(151.0, -60, 37.5), true, false);
            cub.setYRot(60f);
            cub.setYBodyRot(60f);
            cub.setYHeadRot(60f);
            cub.fallAsleep();
        }));
        at(t += 30, () -> cmd("tp @s 172.5 -54 27.5 15 50"));
        at(t += 20, () -> server(level -> {   // now it is hungry: the hunt starts
            if (hunter != null) {
                hunter.setHungry(true);
            }
        }));
        for (int i = 0; i < 12; i++) {   // the hunt, from above: a shot every 5 ticks
            at(t += 5, () -> shot("icebreaker_hunt_" + ticks));
        }
        at(t += 40, () -> server(level -> Winterworks.LOG.info("coldfixshots: the hunter is {}; {} salmon left",
                hunter != null && hunter.isHungry() ? "still hungry" : "fed", level.getEntitiesOfClass(Salmon.class,
                        new net.minecraft.world.phys.AABB(150, -70, 14, 190, -50, 56)).size())));
        at(t += 2, () -> cmd("tp @s 144.5 -58.2 31.5 -50 18"));
        at(t += 30, () -> shot("icebreaker_sleeping"));
        for (int i = 0; i < 3; i++) {   // a swimmer, from the side just above the surface
            at(t += 2, () -> follow(swimmer, 4.5, 0.9));
            at(t += 14, () -> shot("icebreaker_swimming_" + ticks));
        }
        for (int i = 0; i < 2; i++) {   // and underwater
            at(t += 2, () -> follow(swimmer, 4.0, -1.6));
            at(t += 14, () -> shot("icebreaker_underwater_" + ticks));
        }
        at(t += 2, () -> cmd("tp @s 169.5 -53 14.5 0 25"));
        at(t += 40, () -> shot("icebreaker_lake"));
        return t;
    }

    /** A seal in the lake (or on the shore), daytime-calm; `hungry`: it hunts at once. */
    private static IcebreakerEntity seal(ServerLevel level, Vec3 at, boolean cub, boolean hungry) {
        IcebreakerEntity e = WWEntities.ICEBREAKER.create(level);
        e.moveTo(at.x, at.y, at.z, level.random.nextFloat() * 360f, 0f);
        e.setAge(cub ? -24000 : 0);
        e.setHornStage(cub ? 0 : IcebreakerEntity.MAX_HORN);
        e.setHungry(hungry);
        e.setPersistenceRequired();
        level.addFreshEntity(e);
        return e;
    }

    /** Puts the (spectator) camera `back` blocks behind and `up` above a seal, looking at it. */
    private static void follow(@Nullable IcebreakerEntity e, double back, double up) {
        if (e == null) {
            return;
        }
        Vec3 at = e.position();
        Vec3 dir = Vec3.directionFromRotation(0, e.getYRot());
        Vec3 cam = at.add(-dir.x * back + dir.z * 1.5, up + 0.5, -dir.z * back - dir.x * 1.5);
        Vec3 d = at.add(0, 0.6, 0).subtract(cam);
        float yaw = (float) Math.toDegrees(Math.atan2(-d.x, d.z));
        float pitch = (float) Math.toDegrees(-Math.atan2(d.y, Math.sqrt(d.x * d.x + d.z * d.z)));
        cmd(String.format(java.util.Locale.ROOT, "tp @s %.2f %.2f %.2f %.1f %.1f", cam.x, cam.y, cam.z, yaw, pitch));
    }

    /** `n` shots on consecutive ticks (the moment is quick: the software renderer may draw a frame every other tick). */
    private static int burst(int t, String name, int n) {
        for (int i = 1; i <= n; i++) {
            int k = i;
            at(t + i, () -> shot(name + "_" + k));
        }
        return t + n;
    }

    private static void at(int tick, Runnable r) {
        AT.add(tick);
        PLAN.add(r);
    }

    private static void cmd(String c) {
        Minecraft.getInstance().player.connection.sendCommand(c);
    }

    private static void camera(CameraType type) {
        Minecraft.getInstance().options.setCameraType(type);
    }

    /** A real key press, handled by the game on its next tick (left click: attack; right click: use). */
    private static void click(KeyMapping key) {
        InputConstants.Key k = KeyMappingAccess.key(key);
        KeyMapping.click(k);
    }

    private static void server(Consumer<ServerLevel> job) {
        var srv = Minecraft.getInstance().getSingleplayerServer();
        if (srv != null) {
            srv.execute(() -> job.accept(srv.overworld()));
        }
    }

    private static void shot(String name) {
        Minecraft mc = Minecraft.getInstance();
        Screenshot.grab(mc.gameDirectory, "winterworks_coldfix_" + name + ".png", mc.getMainRenderTarget(), msg -> {});
        Winterworks.LOG.info("coldfixshots: {}", name);
    }

    private static void tick(Minecraft mc) {
        if (!created && mc.level == null && mc.screen != null && mc.getOverlay() == null) {
            mc.options.onboardAccessibility = false;
            mc.getTutorial().setStep(net.minecraft.client.tutorial.TutorialSteps.NONE);
            created = true;
            LevelSettings settings = new LevelSettings("winterworks_coldfixshots", GameType.CREATIVE, false, Difficulty.NORMAL,
                    true, new GameRules(), WorldDataConfiguration.DEFAULT);
            mc.createWorldOpenFlows().createFreshLevel("winterworks_coldfixshots_" + System.currentTimeMillis(), settings,
                    new WorldOptions(11L, false, false),
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

    /** KeyMapping keeps its bound key private; it is the default key here (a fresh options file). */
    private static final class KeyMappingAccess {
        static InputConstants.Key key(KeyMapping m) {
            return InputConstants.getKey(m.saveString());
        }
    }
}
