package dev.lowpix.winterworks.client.oceanmob;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.oceanmob.Anglerfish;
import dev.lowpix.winterworks.oceanmob.Lionfish;
import dev.lowpix.winterworks.oceanmob.Nautilus;
import dev.lowpix.winterworks.oceanmob.TurtleGoals;
import dev.lowpix.winterworks.registry.OceanEntities;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.CameraType;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.Difficulty;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.animal.TropicalFish;
import net.minecraft.world.entity.animal.Turtle;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.block.BaseCoralWallFanBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.SeaPickleBlock;
import net.minecraft.world.level.block.TurtleEggBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Dev-only screenshots of the Tides & Treasures creatures: with -Dwinterworks.oceanmobshots=all (e.g. in JAVA_TOOL_OPTIONS
 * for ./gradlew runClient under xvfb-run) the client makes a flat world, builds the scenes and saves
 * screenshots/winterworks_oceanmob_*.png, then quits: a female anglerfish's lure lighting a dark, roofed tank (no night
 * vision), a male, the female grabbing the player, lionfish on a coral reef (one flaring, one sheared), riding a nautilus
 * (gliding, from the front, dashing), and the new turtles basking on a beach, a nest hatching, and turtles swimming. A
 * comma list instead of all (angler,grab,lionfish,nautilus,turtles) runs only those scenes.
 * <p>
 * The camera is the player itself, flying in creative (so the underwater fog is a player's, with a short look of fresh
 * eyes: the player leaves the water between shots), or the player's own third-person camera where the player is in the
 * picture (held in the jaws, riding). Software rendering is slow, so every shot waits well over a frame.
 */
final class OceanMobShots {
    private static final String MODE = System.getProperty("winterworks.oceanmobshots", "");
    private static final Set<String> SCENES = Set.copyOf(Arrays.asList(MODE.split(",")));
    private static final List<Step> PLAN = new ArrayList<>();
    private static final int Y = -60;   // standing height in the flat world
    private static boolean created;
    private static int ticks, step, waitStart = -1;
    private static volatile int femaleId = -1, maleId = -1, mountId = -1;
    private static final int[] FISH = new int[4], TURTLES = new int[8];

    private record Step(int tick, Runnable job, BooleanSupplier until, int timeout) {}

    private OceanMobShots() {}

    private static boolean on(String scene) {
        return SCENES.contains("all") || SCENES.contains(scene);
    }

    static void init() {
        if (MODE.isEmpty()) {
            return;
        }
        ClientTickEvents.END_CLIENT_TICK.register(OceanMobShots::tick);
        int t = 40;
        at(t, () -> {
            for (String c : new String[]{"gamerule doDaylightCycle false", "gamerule doMobSpawning false", "gamerule doWeatherCycle false",
                    "gamerule doInsomnia false", "time set 6000", "weather clear", "difficulty normal", "gamemode creative"}) {
                cmd(c);
            }
            Minecraft mc = Minecraft.getInstance();
            mc.getWindow().setWindowed(1280, 720);
            mc.options.renderDistance().set(8);
            mc.options.hideGui = true;
            mc.options.pauseOnLostFocus = false;
        });
        t += 10;
        if (on("angler")) {
            t = angler(t);
        }
        if (on("grab")) {
            t = grab(t);
        }
        if (on("lionfish")) {
            t = reef(t);
        }
        if (on("nautilus")) {
            t = nautilus(t);
        }
        if (on("turtles")) {
            t = turtles(t);
        }
        at(t + 10, () -> Minecraft.getInstance().stop());
    }

    // --------------------------------------------------------------------------------------- scenes

    private static final int TANK_X = 0, TANK_Z = 80, TANK_R = 22;

    /** A roofed deepslate tank full of dark water: the female's lure lights it (no night vision). */
    private static int angler(int t) {
        int x0 = TANK_X, z0 = TANK_Z;
        at(t, () -> tp(x0 + 0.5, Y + 20, z0 + 0.5));
        at(t += 40, () -> {
            cmd("time set 18000");
            server(level -> {
                tank(level, x0, z0, TANK_R, 14);
                Anglerfish f = angler(level, x0 + 0.5, Y + 2.4, z0 + 2.5, 150f, true);
                f.setNoAi(true);
                femaleId = f.getId();
                Anglerfish m = angler(level, x0 - 8.5, Y + 5.0, z0 - 5.5, 230f, false);
                m.setNoAi(true);
                maleId = m.getId();
            });
        });
        // three quarters from the front, low: her lure and its pool of light on the seafloor, darkness beyond
        t = underwaterShot(t + 40, "angler_lure", () -> look(x0 - 4.2, Y + 3.3, z0 - 2.0, x0 + 0.3, Y + 2.4, z0 + 2.3));
        t = underwaterShot(t, "angler_lure_side", () -> look(x0 + 5.5, Y + 3.0, z0 - 0.5, x0 + 0.2, Y + 2.7, z0 + 2.5));
        t = underwaterShot(t, "angler_lure_far", () -> look(x0 - 5.0, Y + 5.5, z0 + 9.5, x0 - 0.2, Y + 2.0, z0 + 2.4));
        // the tiny male in front, the giant female's lure glowing behind him
        t = underwaterShot(t, "angler_male", () -> {
            var lvl = Minecraft.getInstance().level;
            if (lvl.getEntity(maleId) instanceof Anglerfish m && lvl.getEntity(femaleId) instanceof Anglerfish f) {
                Vec3 c = m.position().add(0, 0.18, 0), away = c.subtract(f.lurePos()).normalize();
                Vec3 side = new Vec3(-away.z, 0, away.x).normalize();
                Vec3 eye = c.add(away.scale(1.1)).add(side.scale(0.35)).add(0, 0.12, 0);
                look(eye.x, eye.y, eye.z, c.x, c.y, c.z);
            }
        });
        return t;
    }

    /** The female lures, lunges and grabs the player (survival, swimming in front of her), seen in third person and from inside her jaws. */
    private static int grab(int t) {
        int x0 = TANK_X, z0 = TANK_Z;
        if (!on("angler")) {
            at(t, () -> tp(x0 + 0.5, Y + 20, z0 + 0.5));
            at(t += 40, () -> {
                cmd("time set 18000");
                server(level -> tank(level, x0, z0, TANK_R, 14));
            });
            t += 40;
        }
        at(t, () -> server(level -> {
            Anglerfish.eager = true;
            for (Anglerfish a : level.getEntitiesOfClass(Anglerfish.class, new AABB(x0 - 30, Y - 5, z0 - 30, x0 + 30, Y + 20, z0 + 30))) {
                a.discard();
            }
            Anglerfish f = angler(level, x0 + 0.5, Y + 3.0, z0 + 3.5, 180f, true);
            femaleId = f.getId();
            ServerPlayer p = player(level);
            p.setGameMode(GameType.SURVIVAL);
            p.setHealth(p.getMaxHealth());
            p.addEffect(new MobEffectInstance(MobEffects.DAMAGE_RESISTANCE, 2400, 4, false, false));
            p.connection.teleport(x0 + 0.5, Y + 3.5, z0 - 3.0, 0f, 0f);
        }));
        t += 2;
        when(t, () -> holding(femaleId), 400, () -> server(level -> {
            if (level.getEntity(femaleId) instanceof Anglerfish f) {
                f.holdFor(600);   // long enough for slow software frames
            }
        }));
        at(t += 10, () -> grabView(femaleId, new Vec3(4.0, 0.5, 0.8)));
        at(t += 40, () -> shot("angler_grab"));
        at(t += 2, () -> grabView(femaleId, new Vec3(-2.2, 0.9, 3.2)));
        at(t += 40, () -> shot("angler_grab_front"));
        at(t += 2, () -> {   // the held player's own view: up between her upper fangs at the lure
            Minecraft mc = Minecraft.getInstance();
            mc.options.setCameraType(CameraType.FIRST_PERSON);
            if (mc.level.getEntity(femaleId) instanceof Anglerfish f) {
                setLook(f.yBodyRot + 12f, -24f);
            }
        });
        at(t += 40, () -> shot("angler_grab_inside"));
        at(t += 2, () -> {
            Minecraft mc = Minecraft.getInstance();
            mc.options.setCameraType(CameraType.FIRST_PERSON);
            mc.options.fov().set(70);
            server(level -> {
                Anglerfish.eager = false;
                ServerPlayer p = player(level);
                if (level.getEntity(femaleId) instanceof Anglerfish f) {
                    f.release(true);
                    f.discard();
                }
                p.removeAllEffects();
                p.setGameMode(GameType.CREATIVE);
                p.setHealth(p.getMaxHealth());
                p.connection.teleport(x0 + 0.5, Y + 20, z0 + 0.5, 0f, 0f);
            });
        });
        return t + 10;
    }

    /** A coral reef in warm water (fill biome warm ocean), lionfish hovering over it (one flaring, one sheared), tropical fish. */
    private static int reef(int t) {
        int x0 = 140, z0 = 80;
        at(t, () -> {
            cmd("time set 6000");
            tp(x0 + 0.5, Y + 20, z0 + 0.5);
        });
        at(t += 40, () -> {
            cmd(String.format(Locale.ROOT, "fillbiome %d %d %d %d %d %d minecraft:warm_ocean", x0 - 30, Y - 4, z0 - 30, x0 + 30, Y + 16, z0 + 30));
            server(level -> {
                pool(level, x0, z0, 28, 11, Blocks.SAND.defaultBlockState(), Blocks.SANDSTONE.defaultBlockState());
                corals(level, x0, z0, 26, level.random);
                float[][] at = {{0.5f, 3.4f, 2.0f, 200f}, {-2.5f, 4.6f, 4.5f, 150f}, {3.2f, 2.7f, 5.0f, 240f}, {-0.8f, 2.2f, 6.5f, 175f}};
                for (int i = 0; i < at.length; i++) {
                    Lionfish l = lionfish(level, x0 + at[i][0], Y + at[i][1], z0 + at[i][2], at[i][3]);
                    l.setNoAi(true);
                    FISH[i] = l.getId();
                }
                if (level.getEntity(FISH[2]) instanceof Lionfish sheared) {
                    sheared.setRegrowTicks(Lionfish.REGROW_TICKS);   // freshly sheared: stubby spines
                }
                for (int i = 0; i < 8; i++) {
                    TropicalFish f = EntityType.TROPICAL_FISH.create(level);
                    f.moveTo(x0 - 5 + level.random.nextInt(11), Y + 3 + level.random.nextInt(4), z0 + 3 + level.random.nextInt(7), 0, 0);
                    level.addFreshEntity(f);
                }
            });
        });
        t = underwaterShot(t + 30, "lionfish_reef", () -> look(x0 - 1.6, Y + 4.4, z0 - 2.3, x0 + 0.2, Y + 3.4, z0 + 3.6));
        t = underwaterShot(t, "lionfish_flare", () -> trackLook(FISH[0], 1.6, 0.9, 0.35), () -> server(level -> {
            if (level.getEntity(FISH[0]) instanceof Lionfish l) {
                l.flare();   // spines out
            }
        }));
        t = underwaterShot(t, "lionfish_sheared", () -> trackLook(FISH[2], 1.3, -1.0, 0.25));
        return t;
    }

    /** A deep pool with a kelp forest: the player rides a tamed, saddled nautilus, swims, glides and dashes. */
    private static int nautilus(int t) {
        int x0 = 260, z0 = 80;
        at(t, () -> {
            cmd("time set 6000");
            tp(x0 + 0.5, Y + 24, z0 + 0.5);
        });
        at(t += 40, () -> {
            cmd(String.format(Locale.ROOT, "fillbiome %d %d %d %d %d %d minecraft:deep_ocean", x0 - 38, Y - 4, z0 - 38, x0 + 38, Y + 20, z0 + 38));
            server(level -> {
                pool(level, x0, z0, 36, 16, Blocks.GRAVEL.defaultBlockState(), Blocks.DARK_PRISMARINE.defaultBlockState());
                RandomSource r = level.random;
                for (int i = 0; i < 160; i++) {   // kelp forest
                    int x = x0 - 34 + r.nextInt(69), z = z0 - 34 + r.nextInt(69);
                    if (Math.abs(x - x0) < 3) {
                        continue;   // a clear lane down the middle
                    }
                    int h = 3 + r.nextInt(11);
                    for (int y = 1; y <= h; y++) {
                        level.setBlock(new BlockPos(x, Y + y, z), y == h ? Blocks.KELP.defaultBlockState() : Blocks.KELP_PLANT.defaultBlockState(),
                                Block.UPDATE_CLIENTS);
                    }
                }
                for (int i = 0; i < 120; i++) {
                    BlockPos p = new BlockPos(x0 - 34 + r.nextInt(69), Y + 1, z0 - 34 + r.nextInt(69));
                    if (level.getBlockState(p).is(Blocks.WATER)) {
                        level.setBlock(p, Blocks.SEAGRASS.defaultBlockState(), Block.UPDATE_CLIENTS);
                    }
                }
                Nautilus n = OceanEntities.NAUTILUS.create(level);
                n.moveTo(x0 + 0.5, Y + 10, z0 - 28.5, 0f, 0f);
                n.tame(player(level));
                n.equipSaddle(new ItemStack(Items.SADDLE), null);
                level.addFreshEntity(n);
                mountId = n.getId();
                ServerPlayer p = player(level);
                p.setGameMode(GameType.SURVIVAL);
                p.connection.teleport(x0 + 0.5, Y + 12, z0 - 28.5, 0f, 0f);
                p.startRiding(n, true);
            });
        });
        at(t += 30, () -> riderView(0f, 10f, CameraType.THIRD_PERSON_BACK));
        at(t += 2, () -> Minecraft.getInstance().options.keyUp.setDown(true));
        // swim on, then let it glide and look round at it (it holds its heading without input)
        at(t += 30, () -> {
            Minecraft.getInstance().options.keyUp.setDown(false);
            setLook(-125f, 18f);
        });
        at(t += 30, () -> shot("nautilus_ride"));
        at(t += 2, () -> setLook(150f, 22f));
        at(t += 30, () -> shot("nautilus_ride_back"));
        at(t += 2, () -> riderView(10f, -18f, CameraType.THIRD_PERSON_FRONT));
        at(t += 30, () -> shot("nautilus_ride_front"));
        // swim on, glide, look to the side, then dash (the jet goes the way the shell faces)
        at(t += 2, () -> {
            riderView(0f, 0f, CameraType.THIRD_PERSON_BACK);
            Minecraft.getInstance().options.keyUp.setDown(true);
        });
        at(t += 25, () -> {
            Minecraft.getInstance().options.keyUp.setDown(false);
            setLook(-75f, 14f);
        });
        at(t += 30, () -> Minecraft.getInstance().options.keyJump.setDown(true));
        at(t += 3, () -> Minecraft.getInstance().options.keyJump.setDown(false));
        at(t += 3, () -> shot("nautilus_dash"));
        at(t += 30, () -> shot("nautilus_dash_after"));
        at(t += 2, () -> {
            Minecraft mc = Minecraft.getInstance();
            mc.options.keyUp.setDown(false);
            mc.options.setCameraType(CameraType.FIRST_PERSON);
            mc.options.fov().set(70);
            server(level -> {
                ServerPlayer p = player(level);
                p.stopRiding();
                p.setGameMode(GameType.CREATIVE);
                p.removeAllEffects();
                p.connection.teleport(x0 + 0.5, Y + 24, z0 + 0.5, 0f, 0f);
            });
        });
        return t + 10;
    }

    /** A beach into warm water: turtles basking on the sand, a nest hatching, and turtles swimming. */
    private static int turtles(int t) {
        int x0 = 640, z0 = 80;
        at(t, () -> {
            cmd("time set 6000");
            tp(x0 + 0.5, Y + 16, z0 + 0.5);
        });
        at(t += 40, () -> {
            cmd(String.format(Locale.ROOT, "fillbiome %d %d %d %d %d %d minecraft:beach", x0 - 30, Y - 8, z0 - 30, x0 - 1, Y + 16, z0 + 30));
            cmd(String.format(Locale.ROOT, "fillbiome %d %d %d %d %d %d minecraft:warm_ocean", x0, Y - 8, z0 - 30, x0 + 40, Y + 16, z0 + 30));
            server(level -> {
                beach(level, x0, z0);
                TurtleGoals.eagerBask = true;
                for (int i = 0; i < 3; i++) {
                    Turtle tt = turtle(level, x0 - 7.5 - i * 3.0, Y, z0 - 2.5 + i * 2.4, 70f + i * 35f, false);
                    tt.setHomePos(tt.blockPosition());
                    TURTLES[i] = tt.getId();
                }
                for (int i = 0; i < 4; i++) {
                    Turtle tt = turtle(level, x0 + 10.5 + i * 3.0, Y - 4.0 + (i % 2), z0 - 3.5 + i * 2.2, 250f + i * 25f, false);
                    TURTLES[3 + i] = tt.getId();
                }
                // a nest hatching: cracked eggs, and hatchlings scrambling for the sea
                for (int i = 0; i < 3; i++) {
                    level.setBlock(new BlockPos(x0 - 13 + i, Y, z0 + 8), Blocks.TURTLE_EGG.defaultBlockState()
                            .setValue(TurtleEggBlock.EGGS, 4 - i).setValue(TurtleEggBlock.HATCH, 2), Block.UPDATE_CLIENTS);
                }
                for (int i = 0; i < 5; i++) {
                    Turtle b = turtle(level, x0 - 12.4 + i * 0.7, Y, z0 + 6.9 - (i % 2) * 0.6, 265f + i * 8f, true);
                    b.setNoAi(i % 2 == 0);
                }
            });
        });
        at(t += 70, () -> {
            Entity b = Minecraft.getInstance().level.getEntity(TURTLES[0]);
            if (b != null) {
                look(b.getX() + 2.4, b.getY() + 2.6, b.getZ() - 2.4, b.getX() - 1.2, b.getY() - 0.4, b.getZ() + 1.0);
            }
        });
        at(t += 40, () -> shot("turtles_basking"));
        at(t += 2, () -> look(x0 - 10.2, Y + 1.9, z0 + 4.4, x0 - 11.9, Y - 0.2, z0 + 7.4));
        at(t += 40, () -> shot("turtles_hatching"));
        t = underwaterShot(t + 2, "turtles_swimming", () -> trackLook(TURTLES[3], 2.4, 2.4, 0.5));
        t = underwaterShot(t + 20, "turtles_swimming_2", () -> trackLook(TURTLES[5], 1.4, -3.0, 0.2));
        at(t, () -> server(level -> TurtleGoals.eagerBask = false));
        return t + 5;
    }

    // --------------------------------------------------------------------------------------- builders

    /** A roofed deepslate box of still water, `r` blocks out from the centre and `h` high, with a rough seafloor. */
    private static void tank(ServerLevel level, int x0, int z0, int r, int h) {
        RandomSource rnd = level.random;
        BlockState wall = Blocks.DEEPSLATE_TILES.defaultBlockState();
        for (BlockPos p : BlockPos.betweenClosed(x0 - r - 1, Y - 2, z0 - r - 1, x0 + r + 1, Y + h + 1, z0 + r + 1)) {
            boolean shell = p.getX() == x0 - r - 1 || p.getX() == x0 + r + 1 || p.getZ() == z0 - r - 1 || p.getZ() == z0 + r + 1
                    || p.getY() == Y + h + 1 || p.getY() < Y;
            BlockState s;
            if (shell) {
                s = p.getY() < Y ? Blocks.DEEPSLATE.defaultBlockState() : wall;
            } else if (p.getY() == Y) {
                int k = rnd.nextInt(10);
                s = k < 4 ? Blocks.GRAVEL.defaultBlockState() : k < 7 ? Blocks.SAND.defaultBlockState()
                        : k < 9 ? Blocks.TUFF.defaultBlockState() : Blocks.DEEPSLATE.defaultBlockState();
            } else {
                s = Blocks.WATER.defaultBlockState();
            }
            level.setBlock(p, s, Block.UPDATE_CLIENTS);
        }
        for (int i = 0; i < 26; i++) {   // rocks
            int x = x0 - r + 2 + rnd.nextInt(2 * r - 3), z = z0 - r + 2 + rnd.nextInt(2 * r - 3);
            if (Math.abs(x - x0) < 5 && Math.abs(z - z0) < 6) {
                continue;
            }
            int hh = 1 + rnd.nextInt(3);
            for (int y = 1; y <= hh; y++) {
                level.setBlock(new BlockPos(x, Y + y, z), (y == hh ? Blocks.TUFF : Blocks.DEEPSLATE).defaultBlockState(), Block.UPDATE_CLIENTS);
                if (y == 1 && rnd.nextBoolean()) {
                    level.setBlock(new BlockPos(x + 1, Y + 1, z), Blocks.COBBLED_DEEPSLATE.defaultBlockState(), Block.UPDATE_CLIENTS);
                }
            }
        }
    }

    /** An open-topped pool walled with `wall`, floored with `floor`, `r` out and `depth` deep. */
    private static void pool(ServerLevel level, int x0, int z0, int r, int depth, BlockState floor, BlockState wall) {
        for (BlockPos p : BlockPos.betweenClosed(x0 - r - 1, Y - 2, z0 - r - 1, x0 + r + 1, Y + depth + 4, z0 + r + 1)) {
            boolean edge = p.getX() == x0 - r - 1 || p.getX() == x0 + r + 1 || p.getZ() == z0 - r - 1 || p.getZ() == z0 + r + 1;
            BlockState s;
            if (p.getY() < Y) {
                s = wall;
            } else if (p.getY() > Y + depth) {
                s = Blocks.AIR.defaultBlockState();
            } else if (edge) {
                s = wall;
            } else if (p.getY() == Y) {
                s = floor;
            } else {
                s = Blocks.WATER.defaultBlockState();
            }
            level.setBlock(p, s, Block.UPDATE_CLIENTS);
        }
    }

    private static void corals(ServerLevel level, int x0, int z0, int r, RandomSource rnd) {
        Block[] blocks = {Blocks.BRAIN_CORAL_BLOCK, Blocks.TUBE_CORAL_BLOCK, Blocks.FIRE_CORAL_BLOCK, Blocks.HORN_CORAL_BLOCK, Blocks.BUBBLE_CORAL_BLOCK};
        Block[] plants = {Blocks.BRAIN_CORAL, Blocks.TUBE_CORAL, Blocks.FIRE_CORAL, Blocks.HORN_CORAL, Blocks.BUBBLE_CORAL,
                Blocks.BRAIN_CORAL_FAN, Blocks.TUBE_CORAL_FAN, Blocks.FIRE_CORAL_FAN, Blocks.HORN_CORAL_FAN, Blocks.BUBBLE_CORAL_FAN};
        Block[] wallFans = {Blocks.BRAIN_CORAL_WALL_FAN, Blocks.TUBE_CORAL_WALL_FAN, Blocks.FIRE_CORAL_WALL_FAN, Blocks.HORN_CORAL_WALL_FAN,
                Blocks.BUBBLE_CORAL_WALL_FAN};
        for (int i = 0; i < 150; i++) {   // coral heads, clustered
            int x = x0 - r + rnd.nextInt(2 * r + 1), z = z0 - r + rnd.nextInt(2 * r + 1);
            if (Math.abs(x - x0) < 2 && z > z0 - 4 && z < z0 + 2) {
                continue;   // room for the camera
            }
            Block b = blocks[rnd.nextInt(blocks.length)];
            int h = 1 + rnd.nextInt(4);
            for (int y = 1; y <= h; y++) {
                level.setBlock(new BlockPos(x, Y + y, z), b.defaultBlockState(), Block.UPDATE_CLIENTS);
                if (y == h && rnd.nextInt(3) > 0) {
                    level.setBlock(new BlockPos(x, Y + y + 1, z), plants[rnd.nextInt(plants.length)].defaultBlockState(), Block.UPDATE_CLIENTS);
                }
                for (Direction d : Direction.Plane.HORIZONTAL) {
                    BlockPos side = new BlockPos(x, Y + y, z).relative(d);
                    if (rnd.nextInt(4) == 0 && level.getBlockState(side).is(Blocks.WATER)) {
                        level.setBlock(side, wallFans[rnd.nextInt(wallFans.length)].defaultBlockState().setValue(BaseCoralWallFanBlock.FACING, d),
                                Block.UPDATE_CLIENTS);
                    }
                }
            }
        }
        for (int i = 0; i < 500; i++) {   // seagrass, corals and sea pickles on the sand
            int x = x0 - r + rnd.nextInt(2 * r + 1), z = z0 - r + rnd.nextInt(2 * r + 1);
            BlockPos p = new BlockPos(x, Y + 1, z);
            if (!level.getBlockState(p).is(Blocks.WATER)) {
                continue;
            }
            int k = rnd.nextInt(10);
            BlockState s = k < 5 ? Blocks.SEAGRASS.defaultBlockState() : k < 8 ? plants[rnd.nextInt(plants.length)].defaultBlockState()
                    : Blocks.SEA_PICKLE.defaultBlockState().setValue(SeaPickleBlock.PICKLES, 1 + rnd.nextInt(4));
            level.setBlock(p, s, Block.UPDATE_CLIENTS);
        }
    }

    /** Sand from x0-30 to x0, sloping down under warm water out to x0+40 (walled), the seafloor scattered with seagrass. */
    private static void beach(ServerLevel level, int x0, int z0) {
        RandomSource rnd = level.random;
        for (BlockPos p : BlockPos.betweenClosed(x0 - 30, Y - 10, z0 - 30, x0 + 41, Y + 6, z0 + 30)) {
            int dx = p.getX() - x0;
            int ground = dx < 0 ? Y - 1 : Y - 1 - Math.min(8, 1 + dx / 2);   // the seabed slopes away
            boolean wall = p.getX() == x0 + 41 || p.getZ() == z0 - 30 || p.getZ() == z0 + 30;
            BlockState s;
            if (p.getY() <= ground) {
                s = p.getY() < ground - 2 ? Blocks.SANDSTONE.defaultBlockState() : Blocks.SAND.defaultBlockState();
            } else if (dx >= 0 && p.getY() < Y) {
                s = wall ? Blocks.SANDSTONE.defaultBlockState() : Blocks.WATER.defaultBlockState();
            } else {
                s = Blocks.AIR.defaultBlockState();
            }
            level.setBlock(p, s, Block.UPDATE_CLIENTS);
        }
        for (int i = 0; i < 220; i++) {
            int x = x0 + 2 + rnd.nextInt(38), z = z0 - 28 + rnd.nextInt(57);
            int ground = Y - 1 - Math.min(8, 1 + (x - x0) / 2);
            BlockPos p = new BlockPos(x, ground + 1, z);
            if (level.getBlockState(p).is(Blocks.WATER) && level.getBlockState(p.above()).is(Blocks.WATER)) {
                int k = rnd.nextInt(8);
                level.setBlock(p, (k == 0 ? Blocks.TUBE_CORAL : k == 1 ? Blocks.BRAIN_CORAL_BLOCK : Blocks.SEAGRASS).defaultBlockState(),
                        Block.UPDATE_CLIENTS);
            }
        }
    }

    // --------------------------------------------------------------------------------------- spawning

    private static Anglerfish angler(ServerLevel level, double x, double y, double z, float yaw, boolean female) {
        Anglerfish a = OceanEntities.ANGLERFISH.create(level);
        a.setFemale(female);
        a.moveTo(x, y, z, yaw, 0f);
        a.setYBodyRot(yaw);
        a.setYHeadRot(yaw);
        a.setPersistenceRequired();
        level.addFreshEntity(a);
        return a;
    }

    private static Lionfish lionfish(ServerLevel level, double x, double y, double z, float yaw) {
        Lionfish l = OceanEntities.LIONFISH.create(level);
        l.moveTo(x, y, z, yaw, 0f);
        l.setYBodyRot(yaw);
        l.setYHeadRot(yaw);
        l.setPersistenceRequired();
        level.addFreshEntity(l);
        return l;
    }

    private static Turtle turtle(ServerLevel level, double x, double y, double z, float yaw, boolean baby) {
        Turtle tt = EntityType.TURTLE.create(level);
        tt.moveTo(x, y, z, yaw, 0f);
        tt.setYBodyRot(yaw);
        tt.setYHeadRot(yaw);
        if (baby) {
            tt.setAge(-24000);
        }
        tt.setPersistenceRequired();
        level.addFreshEntity(tt);
        return tt;
    }

    // --------------------------------------------------------------------------------------- cameras

    /**
     * An underwater shot with fresh eyes: the player leaves the water (so its underwater vision resets), then from `t+60`
     * waits in place at the view `place` sets for 50 ticks (a newly submerged player's murky look) and shoots.
     */
    private static int underwaterShot(int t, String name, Runnable place) {
        return underwaterShot(t, name, place, null);
    }

    /** As above, with a `cue` (a clip to catch) 8 ticks before the shot. */
    private static int underwaterShot(int t, String name, Runnable place, Runnable cue) {
        at(t, () -> server(level -> {
            ServerPlayer p = player(level);
            p.connection.teleport(p.getX(), Y + 40, p.getZ(), p.getYRot(), p.getXRot());
        }));
        at(t += 60, place);
        at(t += 15, place);   // re-aimed: the subject may swim
        at(t += 15, place);
        if (cue != null) {
            at(t += 12, cue);
            at(t += 8, () -> shot(name));
        } else {
            at(t += 20, () -> shot(name));
        }
        return t + 2;
    }

    /** The player (creative, flying, first person) at the given eye point, looking at the target. */
    private static void look(double x, double y, double z, double tx, double ty, double tz) {
        double dx = tx - x, dy = ty - y, dz = tz - z;
        float yaw = (float) (Mth.atan2(dz, dx) * Mth.RAD_TO_DEG) - 90f;
        float pitch = (float) -(Mth.atan2(dy, Math.sqrt(dx * dx + dz * dz)) * Mth.RAD_TO_DEG);
        Minecraft mc = Minecraft.getInstance();
        mc.setCameraEntity(mc.player);
        mc.options.setCameraType(CameraType.FIRST_PERSON);
        server(level -> {
            ServerPlayer p = player(level);
            p.getAbilities().flying = true;
            p.onUpdateAbilities();
            p.connection.teleport(x, y - p.getEyeHeight(), z, yaw, pitch);
        });
    }

    /** The player looking at a (client-side) entity from `dist` out, `side` to its left (negative: right), `up` above it. */
    private static void trackLook(int id, double dist, double side, double up) {
        Entity e = Minecraft.getInstance().level.getEntity(id);
        if (!(e instanceof LivingEntity le)) {
            return;
        }
        Vec3 f = Vec3.directionFromRotation(0f, le.yBodyRot), left = new Vec3(f.z, 0, -f.x);
        Vec3 c = e.position().add(0, e.getBbHeight() * 0.5, 0);
        Vec3 eye = c.add(f.scale(dist)).add(left.scale(side)).add(0, up, 0);
        look(eye.x, eye.y, eye.z, c.x, c.y, c.z);
    }

    /**
     * The player's own third-person camera (the local player is only drawn when it is the camera entity), placed about 4
     * blocks out at `offset` from the held player's eyes, given in the fish's frame (x to her left, y up, z ahead).
     */
    private static void grabView(int fishId, Vec3 offset) {
        Minecraft mc = Minecraft.getInstance();
        if (!(mc.level.getEntity(fishId) instanceof Anglerfish f)) {
            return;
        }
        Vec3 fwd = Vec3.directionFromRotation(0f, f.yBodyRot), left = new Vec3(fwd.z, 0, -fwd.x);
        Vec3 out = left.scale(offset.x).add(0, offset.y, 0).add(fwd.scale(offset.z));
        Vec3 look = out.scale(-1).normalize();   // the camera sits behind the look direction
        float yaw = (float) (Mth.atan2(look.z, look.x) * Mth.RAD_TO_DEG) - 90f;
        float pitch = (float) -(Mth.atan2(look.y, Math.sqrt(look.x * look.x + look.z * look.z)) * Mth.RAD_TO_DEG);
        riderView(yaw, pitch, CameraType.THIRD_PERSON_BACK);
    }

    private static void riderView(float yaw, float pitch, CameraType type) {
        Minecraft mc = Minecraft.getInstance();
        mc.setCameraEntity(mc.player);
        mc.options.setCameraType(type);
        mc.options.fov().set(80);
        setLook(yaw, pitch);
    }

    private static void setLook(float yaw, float pitch) {
        Minecraft mc = Minecraft.getInstance();
        mc.player.setYRot(yaw);
        mc.player.yRotO = yaw;
        mc.player.setXRot(pitch);
        mc.player.xRotO = pitch;
    }

    private static boolean holding(int id) {
        Minecraft mc = Minecraft.getInstance();
        return mc.level != null && mc.level.getEntity(id) instanceof Anglerfish f && f.isHolding() && mc.player.getVehicle() == f;
    }

    // --------------------------------------------------------------------------------------- plumbing

    private static ServerPlayer player(ServerLevel level) {
        return level.getServer().getPlayerList().getPlayers().get(0);
    }

    private static void at(int tick, Runnable r) {
        PLAN.add(new Step(tick, r, null, 0));
    }

    private static void when(int tick, BooleanSupplier until, int timeout, Runnable job) {
        PLAN.add(new Step(tick, job, until, timeout));
    }

    private static void cmd(String c) {
        Minecraft.getInstance().player.connection.sendCommand(c);
    }

    private static void tp(double x, double y, double z) {
        cmd(String.format(Locale.ROOT, "tp @s %.2f %.2f %.2f", x, y, z));
    }

    private static void server(Consumer<ServerLevel> job) {
        var srv = Minecraft.getInstance().getSingleplayerServer();
        if (srv != null) {
            srv.execute(() -> job.accept(srv.overworld()));
        }
    }

    private static void shot(String name) {
        Minecraft mc = Minecraft.getInstance();
        Screenshot.grab(mc.gameDirectory, "winterworks_oceanmob_" + name + ".png", mc.getMainRenderTarget(), msg -> {});
        Winterworks.LOG.info("oceanmobshots: {}", name);
    }

    private static void tick(Minecraft mc) {
        if (!created && mc.level == null && mc.screen != null && mc.getOverlay() == null) {
            mc.options.onboardAccessibility = false;
            mc.getTutorial().setStep(net.minecraft.client.tutorial.TutorialSteps.NONE);
            created = true;
            LevelSettings settings = new LevelSettings("winterworks_oceanmobshots", GameType.CREATIVE, false, Difficulty.NORMAL,
                    true, new GameRules(), WorldDataConfiguration.DEFAULT);
            mc.createWorldOpenFlows().createFreshLevel("winterworks_oceanmobshots_" + System.currentTimeMillis(), settings,
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
        while (step < PLAN.size() && ticks >= PLAN.get(step).tick()) {
            Step s = PLAN.get(step);
            if (s.until() != null) {
                if (waitStart < 0) {
                    waitStart = ticks;
                }
                boolean ok = s.until().getAsBoolean();
                if (!ok && ticks - waitStart < s.timeout()) {
                    for (int i = step; i < PLAN.size(); i++) {
                        Step q = PLAN.get(i);
                        PLAN.set(i, new Step(q.tick() + 1, q.job(), q.until(), q.timeout()));
                    }
                    return;
                }
                if (!ok) {
                    Winterworks.LOG.warn("oceanmobshots: gave up waiting at step {}", step);
                }
                waitStart = -1;
            }
            s.job().run();
            step++;
        }
    }
}
