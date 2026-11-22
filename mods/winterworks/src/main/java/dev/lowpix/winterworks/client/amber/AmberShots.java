package dev.lowpix.winterworks.client.amber;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.golem.PotGolemEntity;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.Difficulty;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Dev-only screenshots and play-tests of the 0.4 amber and golem fixes (docs/FIXES_0_4.md): with
 * -Dwinterworks.ambershots=true (e.g. in JAVA_TOOL_OPTIONS for ./gradlew runClient under xvfb-run) the client makes a
 * flat world and plays a survival player who builds Pot Golems by clicking blocks into place, the real
 * client-to-server path (MultiPlayerGameMode#useItemOn), in several orientations and orders, logging what each build
 * made ("ambershots: golem build ..."). Then it builds a little Amberwood house, lays out amber blocks, sand and gravel,
 * lines up golems with glowing heads by day and night, lands a headshot, saves screenshots/winterworks_amber_*.png and
 * quits. Does nothing in normal play.
 */
public final class AmberShots {
    private static final boolean ENABLED = Boolean.getBoolean("winterworks.ambershots");
    private static final List<Runnable> PLAN = new ArrayList<>();
    private static final List<Integer> AT = new ArrayList<>();
    /** The flat world's grass is at y=-61. */
    private static final int G = -61;
    private static final String[] HEADS = {"heart", "burn", "flow", "shelter", "plenty", "brewer", "howl", "danger"};
    private static boolean created;
    private static int ticks, step, shotAt;
    private static String pendingShot;

    private AmberShots() {}

    public static void init() {
        if (!ENABLED) {
            return;
        }
        ClientTickEvents.END_CLIENT_TICK.register(AmberShots::tick);
        int t = 40;
        at(t, () -> {
            for (String c : new String[]{"gamerule doDaylightCycle false", "gamerule doMobSpawning false", "gamerule sendCommandFeedback false",
                    "gamerule doWeatherCycle false", "time set 6000", "weather clear", "difficulty peaceful"}) {
                cmd(c);
            }
        });
        t = golemBuilds(t + 10);
        t = house(t + 10);
        t = amberBlocks(t + 10);
        t = glowingGolems(t + 10);
        at(t += 10, () -> Minecraft.getInstance().stop());
    }

    /** The pot_decorations list of a pot with this sherd on all four faces. */
    private static String sherds(String sherd) {
        String s = "\"minecraft:" + sherd + "_pottery_sherd\"";
        return "[" + s + "," + s + "," + s + "," + s + "]";
    }

    private static String pot(String sherd) {
        String s = "\"minecraft:" + sherd + "_pottery_sherd\"";
        return "{id:\"minecraft:decorated_pot\",count:1,components:{\"minecraft:pot_decorations\":[" + s + "," + s + "," + s + "," + s + "]}}";
    }

    // ------------------------------------------------------------------------------------------------ golem building

    /** A T to build: where its foot stands, the axis its arms run along, upright or lying, the order the blocks go in. */
    private record Build(String name, BlockPos foot, Direction.Axis arms, boolean lying, String order, float yaw, String corners) {}

    private static int golemBuilds(int t) {
        List<Build> builds = List.of(
                new Build("x_pot_last", new BlockPos(0, G + 1, 6), Direction.Axis.X, false, "LCWEP", 180f, null),
                new Build("z_pot_last", new BlockPos(8, G + 1, 6), Direction.Axis.Z, false, "LCWEP", 90f, null),
                new Build("x_arm_last", new BlockPos(16, G + 1, 6), Direction.Axis.X, false, "LCPWE", 180f, null),
                new Build("z_arm_last", new BlockPos(24, G + 1, 6), Direction.Axis.Z, false, "LCPEW", 270f, null),
                new Build("pot_sideways", new BlockPos(32, G + 1, 6), Direction.Axis.X, false, "LCWEP", 90f, null),
                new Build("in_grass_and_snow", new BlockPos(40, G + 1, 6), Direction.Axis.X, false, "LCWEP", 180f, "short_grass"),
                new Build("lying_foot_last", new BlockPos(48, G + 1, 8), Direction.Axis.X, true, "PCWEL", 180f, null));
        at(t, () -> {
            cmd("gamemode survival");
            cmd("clear @s");
            cmd("item replace entity @s hotbar.0 with winterworks:amber_block 64");
            cmd("item replace entity @s hotbar.1 with minecraft:decorated_pot[minecraft:pot_decorations=[\"minecraft:heart_pottery_sherd\","
                    + "\"minecraft:heart_pottery_sherd\",\"minecraft:heart_pottery_sherd\",\"minecraft:heart_pottery_sherd\"]] 16");
            cmd("fill 39 -60 4 43 -60 8 minecraft:snow");
        });
        for (Build b : builds) {
            BlockPos stand = b.lying() ? b.foot().offset(0, 0, 3) : b.foot().offset(b.arms() == Direction.Axis.X ? 0 : 3, 0,
                    b.arms() == Direction.Axis.X ? 3 : 0);
            at(t += 10, () -> {
                cmd(String.format(Locale.ROOT, "tp @s %d.5 %d %d.5 %.0f %d", stand.getX(), stand.getY(), stand.getZ(), b.yaw(),
                        b.name().equals("x_arm_last") ? -12 : 35));
                if (b.corners() != null) {   // plants beside the foot (and snow all round)
                    Direction side = b.arms() == Direction.Axis.X ? Direction.EAST : Direction.SOUTH;
                    BlockPos a = b.foot().relative(side), c = b.foot().relative(side.getOpposite());
                    cmd(String.format(Locale.ROOT, "setblock %d %d %d minecraft:%s", a.getX(), a.getY(), a.getZ(), b.corners()));
                }
            });
            String order = b.order();
            for (int i = 0; i < order.length(); i++) {
                char c = order.charAt(i);
                if (i == order.length() - 1 && b.name().equals("x_arm_last")) {
                    at(t += 30, () -> shot("golem_build_before_last_block", false));   // software GL re-meshes slowly
                }
                at(t += 8, () -> placePart(b, c));
                if (i == order.length() - 1 && b.name().equals("x_arm_last")) {
                    at(t += 4, () -> shot("golem_build_comes_alive", false));
                }
            }
            at(t += 20, () -> server(level -> {
                AABB box = new AABB(b.foot()).inflate(2.5);
                int n = level.getEntitiesOfClass(PotGolemEntity.class, box).size();
                Winterworks.LOG.info("ambershots: golem build {}: {} golem(s), blocks left: foot={} centre={}", b.name(), n,
                        level.getBlockState(b.foot()), level.getBlockState(b.lying() ? b.foot().north() : b.foot().above()));
                for (PotGolemEntity g : level.getEntitiesOfClass(PotGolemEntity.class, box)) {
                    g.setNoAi(true);   // stay put for the group photo
                }
            }));
        }
        at(t += 10, () -> cmd("tp @s 24.5 -59 -9.5 0 10"));
        at(t += 40, () -> shot("golems_built", true));
        return t;
    }

    /** Clicks one block of the T into place the way a player does: aim at a face of its neighbour and use the item. */
    private static void placePart(Build b, char part) {
        Direction west = b.arms() == Direction.Axis.X ? Direction.WEST : Direction.NORTH;
        if (b.lying()) {   // on the floor: foot at +z, the pot towards -z
            BlockPos centre = b.foot().north();
            BlockPos target = switch (part) {
                case 'L' -> b.foot();
                case 'C' -> centre;
                case 'W' -> centre.west();
                case 'E' -> centre.east();
                default -> centre.north();
            };
            use(part == 'P' ? 1 : 0, target.below(), Direction.UP);
            return;
        }
        BlockPos centre = b.foot().above();
        switch (part) {
            case 'L' -> use(0, b.foot().below(), Direction.UP);
            case 'C' -> use(0, b.foot(), Direction.UP);
            case 'W' -> use(0, centre, west);
            case 'E' -> use(0, centre, west.getOpposite());
            case 'P' -> use(1, centre, Direction.UP);
            default -> {}
        }
    }

    private static void use(int slot, BlockPos against, Direction face) {
        Minecraft mc = Minecraft.getInstance();
        mc.player.getInventory().selected = slot;
        Vec3 hit = Vec3.atCenterOf(against).add(face.getStepX() * 0.5, face.getStepY() * 0.5, face.getStepZ() * 0.5);
        var result = mc.gameMode.useItemOn(mc.player, InteractionHand.MAIN_HAND, new BlockHitResult(hit, face, against, false));
        if (result.shouldSwing()) {
            mc.player.swing(InteractionHand.MAIN_HAND);
        }
    }

    // ------------------------------------------------------------------------------------------------ the wood set

    private static int house(int t) {
        at(t, () -> {
            cmd("gamemode creative");
            cmd("clear @s");
            // a sandy lot with a pond
            cmd("fill 52 -61 -4 80 -61 16 minecraft:sand");
            cmd("fill 70 -61 2 75 -61 7 minecraft:water");
            // floor, log corners, plank walls
            cmd("fill 58 -61 2 66 -61 8 winterworks:amberwood_planks");
            cmd("fill 59 -60 3 65 -57 7 winterworks:amberwood_planks hollow");
            for (int[] c : new int[][]{{59, 3}, {65, 3}, {59, 7}, {65, 7}}) {
                cmd(String.format(Locale.ROOT, "fill %d -60 %d %d -57 %d winterworks:amberwood_log[axis=y]", c[0], c[1], c[0], c[1]));
            }
            cmd("fill 60 -57 7 64 -57 7 winterworks:stripped_amberwood_log[axis=x]");
            cmd("fill 60 -57 3 64 -57 3 winterworks:stripped_amberwood_log[axis=x]");
            cmd("fill 59 -57 4 59 -57 6 winterworks:stripped_amberwood_wood");
            cmd("fill 65 -57 4 65 -57 6 winterworks:stripped_amberwood_wood");
        });
        at(t += 4, () -> {
            // the roof: stairs both ways up to the ridge, gables of planks, a slab ridge
            for (int i = 0; i < 3; i++) {
                cmd(String.format(Locale.ROOT, "fill 58 %d %d 66 %d %d winterworks:amberwood_stairs[facing=north]", -56 + i, 8 - i, -56 + i, 8 - i));
                cmd(String.format(Locale.ROOT, "fill 58 %d %d 66 %d %d winterworks:amberwood_stairs[facing=south]", -56 + i, 2 + i, -56 + i, 2 + i));
            }
            cmd("fill 58 -53 5 66 -53 5 winterworks:amberwood_slab");
            cmd("fill 59 -56 4 59 -55 6 winterworks:amberwood_planks");
            cmd("fill 65 -56 4 65 -55 6 winterworks:amberwood_planks");
            cmd("fill 59 -54 5 59 -54 5 winterworks:amberwood_planks");
            cmd("fill 65 -54 5 65 -54 5 winterworks:amberwood_planks");
        });
        at(t += 4, () -> {
            // door, windows with trapdoor shutters, a button and a pressure plate
            cmd("setblock 62 -60 7 winterworks:amberwood_door[facing=south,half=lower,hinge=left]");
            cmd("setblock 62 -59 7 winterworks:amberwood_door[facing=south,half=upper,hinge=left]");
            cmd("setblock 62 -60 8 winterworks:amberwood_pressure_plate");
            cmd("setblock 63 -59 8 winterworks:amberwood_button[face=wall,facing=south]");
            for (int x : new int[]{60, 64}) {
                cmd(String.format(Locale.ROOT, "setblock %d -59 7 minecraft:glass_pane", x));
                cmd(String.format(Locale.ROOT, "setblock %d -58 7 minecraft:glass_pane", x));
                cmd(String.format(Locale.ROOT, "setblock %d -60 8 winterworks:amberwood_trapdoor[facing=south,half=top,open=false]", x));
            }
            // open shutters flat against the wall beside the windows
            cmd("setblock 59 -59 8 winterworks:amberwood_trapdoor[facing=south,half=bottom,open=true]");
            cmd("setblock 65 -59 8 winterworks:amberwood_trapdoor[facing=south,half=bottom,open=true]");
            // a fenced yard with a gate, a sign and a hanging sign under a beam
            cmd("fill 56 -60 12 68 -60 12 winterworks:amberwood_fence");
            cmd("fill 56 -60 9 56 -60 11 winterworks:amberwood_fence");
            cmd("fill 68 -60 9 68 -60 11 winterworks:amberwood_fence");
            cmd("setblock 62 -60 12 winterworks:amberwood_fence_gate[facing=south,open=true]");
            cmd("setblock 58 -60 10 winterworks:amberwood_sign[rotation=0]{front_text:{messages:['\"Amberwood\"','\"Lodge\"','\"\"','\"\"']}}");
            cmd("setblock 66 -57 8 winterworks:stripped_amberwood_log[axis=z]");
            cmd("setblock 66 -58 8 winterworks:amberwood_hanging_sign[rotation=0,attached=false]"
                    + "{front_text:{messages:['\"\"','\"Amber\"','\"Shards\"','\"\"']}}");
            cmd("setblock 64 -60 10 winterworks:amberwood_slab");
            cmd("setblock 65 -60 10 winterworks:amberwood_wood[axis=x]");
            cmd("setblock 66 -60 10 winterworks:stripped_amberwood_wood[axis=x]");
            // a bloom planted in the sand, and a grown Amberwood behind the house
            cmd("setblock 57 -60 7 winterworks:amberwood_bloom");
            cmd("setblock 64 -59 8 winterworks:potted_amberwood_bloom");
            cmd("setblock 67 -60 5 winterworks:amberwood_bloom");
            cmd("summon winterworks:amberwood_boat 72 -60.4 4 {Rotation:[30f,0f]}");
            cmd("summon winterworks:amberwood_chest_boat 73.5 -60.4 6.2 {Rotation:[100f,0f]}");
        });
        at(t += 5, () -> server(level -> level.registryAccess().registryOrThrow(Registries.CONFIGURED_FEATURE)
                .getHolder(net.minecraft.resources.ResourceKey.create(Registries.CONFIGURED_FEATURE, Winterworks.id("amberwood")))
                .ifPresent(f -> {
                    for (int i = 0; i < 6 && !f.value().place(level, level.getChunkSource().getGenerator(),
                            net.minecraft.util.RandomSource.create(5 + i), new BlockPos(55, -60, 1)); i++) {
                        Winterworks.LOG.info("ambershots: amberwood try {}", i);
                    }
                })));
        at(t += 5, () -> {
            cmd("tp @s 62.5 -56.6 17.5 180 12");
            hotbar("winterworks:amberwood_log", "winterworks:amberwood_planks", "winterworks:amberwood_stairs", "winterworks:amberwood_door",
                    "winterworks:amberwood_trapdoor", "winterworks:amberwood_sign", "winterworks:amberwood_hanging_sign",
                    "winterworks:amberwood_boat", "winterworks:amberwood_bloom");
        });
        at(t += 100, () -> shot("amberwood_house", true));
        at(t += 4, () -> shot("amberwood_house_hotbar", false));
        at(t += 4, () -> cmd("tp @s 70.5 -58.5 13.5 160 22"));
        at(t += 40, () -> shot("amberwood_boats_and_signs", true));
        // a boat put on the pond from the hotbar (BoatItem#use: the player looks at the water)
        at(t += 4, () -> cmd("tp @s 72.5 -60 9.5 180 50"));
        at(t += 10, () -> {
            Minecraft mc = Minecraft.getInstance();
            mc.player.getInventory().selected = 7;
            mc.gameMode.useItem(mc.player, InteractionHand.MAIN_HAND);
        });
        at(t += 4, () -> cmd("tp @s 73.0 -58.2 11.5 180 32"));
        at(t += 40, () -> shot("amberwood_boats", true));
        // signs open their editors when placed, like vanilla's (the hanging one with the art's gui/hanging_signs texture)
        at(t += 4, () -> cmd("tp @s 60.5 -60 10.5 180 -20"));
        at(t += 10, () -> use(5, new BlockPos(60, -61, 9), Direction.UP));
        at(t += 10, () -> type("Amberwood"));
        at(t += 10, () -> shot("amberwood_sign_editor", false));
        at(t += 4, () -> Minecraft.getInstance().setScreen(null));
        at(t += 10, () -> use(6, new BlockPos(61, -56, 8), Direction.DOWN));
        at(t += 10, () -> type("Hanging"));
        at(t += 10, () -> shot("amberwood_hanging_sign_editor", false));
        at(t += 4, () -> Minecraft.getInstance().setScreen(null));
        at(t += 10, () -> cmd("tp @s 61.0 -59.4 13.5 180 -8"));
        at(t += 30, () -> shot("amberwood_signs_written", true));
        return t;
    }

    /** Types into the open sign editor, a key at a time. */
    private static void type(String text) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.screen == null) {
            Winterworks.LOG.warn("ambershots: no sign editor open");
            return;
        }
        Winterworks.LOG.info("ambershots: editor {}", mc.screen.getClass().getSimpleName());
        for (char c : text.toCharArray()) {
            mc.screen.charTyped(c, 0);
        }
    }

    private static void hotbar(String... items) {
        for (int i = 0; i < items.length && i < 9; i++) {
            cmd("item replace entity @s hotbar." + i + " with " + items[i]);
        }
    }

    // ------------------------------------------------------------------------------------------------ amber blocks

    private static int amberBlocks(int t) {
        at(t, () -> {
            cmd("fill 86 -61 -2 104 -61 10 minecraft:smooth_sandstone");
            String[] inc = {"none", "seed", "mosquito"};
            for (int i = 0; i < 3; i++) {
                cmd(String.format(Locale.ROOT, "setblock %d -60 9 winterworks:amber_block[inclusion=%s]", 91 + i * 2, inc[i]));
            }
            for (int d = 0; d < 4; d++) {
                cmd(String.format(Locale.ROOT, "setblock %d -60 7 winterworks:amber_sand[dusted=%d]", 90 + d * 2, d));
                cmd(String.format(Locale.ROOT, "setblock %d -60 5 winterworks:amber_gravel[dusted=%d]", 90 + d * 2, d));
                cmd(String.format(Locale.ROOT, "setblock %d -60 2 winterworks:amber_fossil[dusted=%d]", 90 + d * 2, d));
            }
            cmd("setblock 98 -60 7 minecraft:suspicious_sand");
            cmd("setblock 98 -60 5 minecraft:suspicious_gravel");
            cmd("summon minecraft:item 97 -59.5 9.5 {Item:{id:\"winterworks:amber_shard\",count:3},PickupDelay:32767,Age:-32768}");
            hotbar("winterworks:amber_shard", "winterworks:amber_block", "winterworks:amber_sand", "winterworks:amber_gravel",
                    "winterworks:amber_fossil", "minecraft:brush");
            cmd("tp @s 94.5 -57.3 13.5 180 28");
        });
        at(t += 80, () -> shot("amber_blocks_sand_gravel", true));
        at(t += 4, () -> shot("amber_items_hotbar", false));
        return t;
    }

    // ------------------------------------------------------------------------------------------------ glowing golems

    private static int glowingGolems(int t) {
        at(t, () -> {
            cmd("fill 112 -61 -4 146 -61 14 minecraft:polished_andesite");
            cmd("fill 112 -60 0 146 -59 4 minecraft:polished_andesite");   // the back row stands on a step, heads above the front row
            for (int i = 0; i < HEADS.length; i++) {
                int x = 116 + (i % 4) * 4 + (i < 4 ? 0 : 2), z = i < 4 ? 2 : 7, y = i < 4 ? -58 : -60;
                cmd(String.format(Locale.ROOT, "summon winterworks:pot_golem %d.5 %d %d.5 {NoAI:1b,Rotation:[0f,0f],PersistenceRequired:1b,Head:%s}",
                        x, y, z, pot(HEADS[i])));
            }
            cmd(String.format(Locale.ROOT, "summon winterworks:pot_golem 134.5 -60 7.5 {NoAI:1b,Rotation:[0f,0f],PersistenceRequired:1b,Head:%s}",
                    "{id:\"minecraft:decorated_pot\",count:1,components:{\"minecraft:pot_decorations\":[\"minecraft:heart_pottery_sherd\","
                            + "\"minecraft:burn_pottery_sherd\",\"minecraft:flow_pottery_sherd\",\"minecraft:brick\"]}}"));
            cmd("tp @s 125.0 -56.0 19.5 180 9");
        });
        at(t += 100, () -> shot("glowing_golems_day", true));
        at(t += 4, () -> cmd("time set 18000"));
        at(t += 40, () -> shot("glowing_golems_night", true));
        at(t += 4, () -> cmd("tp @s 118.5 -57.4 11.0 180 4"));
        at(t += 30, () -> shot("glowing_golem_close", true));
        at(t += 4, () -> cmd("time set 6000"));
        // ability pots glow as items too: a hotbar of them (one mixed pot at the end, vanilla) and one in hand
        at(t += 4, () -> {
            String[] all = new String[9];
            for (int i = 0; i < HEADS.length; i++) {
                all[i] = "minecraft:decorated_pot[minecraft:pot_decorations=" + sherds(HEADS[i]) + "]";
            }
            all[8] = "minecraft:decorated_pot[minecraft:pot_decorations=[\"minecraft:heart_pottery_sherd\",\"minecraft:burn_pottery_sherd\","
                    + "\"minecraft:flow_pottery_sherd\",\"minecraft:shelter_pottery_sherd\"]]";
            hotbar(all);
            Minecraft.getInstance().player.getInventory().selected = 0;
            cmd("tp @s 125.0 -59.0 19.5 180 6");
        });
        at(t += 30, () -> shot("ability_pots_hotbar", false));
        at(t += 4, () -> cmd("time set 18000"));
        at(t += 30, () -> shot("ability_pots_hotbar_night", false));
        at(t += 4, () -> cmd("time set 6000"));
        // a headshot: an arrow into a plain golem's pot
        at(t += 5, () -> {
            cmd("summon winterworks:pot_golem 140.5 -60 9.5 {NoAI:1b,Rotation:[90f,0f],PersistenceRequired:1b,Head:{id:\"minecraft:decorated_pot\",count:1}}");
            cmd("tp @s 136.5 -58.8 14.5 215 -6");
        });
        at(t += 30, () -> Minecraft.getInstance().getEntityRenderDispatcher().setRenderHitBoxes(true));
        at(t += 5, () -> shot("golem_hitbox", true));
        at(t += 4, () -> Minecraft.getInstance().getEntityRenderDispatcher().setRenderHitBoxes(false));
        at(t += 4, () -> cmd("summon minecraft:arrow 137.5 -57.2 9.5 {Motion:[1.5d,0.0d,0.0d]}"));
        at(t += 2, () -> shot("golem_headshot", true));
        at(t += 5, () -> shot("golem_headshot_after", true));
        at(t += 10, () -> server(level -> level.getEntitiesOfClass(PotGolemEntity.class, new AABB(new BlockPos(140, -60, 9)).inflate(2))
                .forEach(g -> Winterworks.LOG.info("ambershots: headshot golem health {} cracks {}", g.getHealth(), g.cracks()))));
        return t;
    }

    // ------------------------------------------------------------------------------------------------ plumbing

    private static void at(int tick, Runnable r) {
        AT.add(tick);
        PLAN.add(r);
    }

    private static void cmd(String c) {
        Minecraft.getInstance().player.connection.sendCommand(c);
    }

    private static void server(Consumer<ServerLevel> job) {
        var srv = Minecraft.getInstance().getSingleplayerServer();
        if (srv != null) {
            srv.execute(() -> job.accept(srv.overworld()));
        }
    }

    /** Hides (or shows) the HUD now and grabs the screen two frames later, once a frame has been drawn that way. */
    private static void shot(String name, boolean hideGui) {
        Minecraft.getInstance().options.hideGui = hideGui;
        pendingShot = name;
        shotAt = ticks + 2;
    }

    private static void grab(Minecraft mc, String name) {
        Screenshot.grab(mc.gameDirectory, "winterworks_amber_" + name + ".png", mc.getMainRenderTarget(), msg -> {});
        Winterworks.LOG.info("ambershots: {}", name);
    }

    private static void tick(Minecraft mc) {
        if (!created && mc.level == null && mc.screen != null && mc.getOverlay() == null) {
            mc.options.onboardAccessibility = false;
            mc.getTutorial().setStep(net.minecraft.client.tutorial.TutorialSteps.NONE);
            created = true;
            LevelSettings settings = new LevelSettings("winterworks_ambershots", GameType.CREATIVE, false, Difficulty.PEACEFUL,
                    true, new GameRules(), WorldDataConfiguration.DEFAULT);
            mc.createWorldOpenFlows().createFreshLevel("winterworks_ambershots_" + System.currentTimeMillis(), settings,
                    new WorldOptions(7L, false, false),
                    reg -> reg.registryOrThrow(Registries.WORLD_PRESET).getHolderOrThrow(WorldPresets.FLAT).value().createWorldDimensions(),
                    mc.screen);
            return;
        }
        if (mc.player == null || mc.level == null || (step >= PLAN.size() && pendingShot == null)) {
            return;
        }
        ticks++;
        mc.gui.getChat().clearMessages(false);
        mc.getToasts().clear();
        if (pendingShot != null && ticks >= shotAt) {
            grab(mc, pendingShot);
            pendingShot = null;
        }
        while (step < PLAN.size() && ticks >= AT.get(step)) {
            PLAN.get(step++).run();
        }
    }
}
