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
import java.util.Set;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.CameraType;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.Difficulty;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.animal.TropicalFish;
import net.minecraft.world.entity.animal.Turtle;
import net.minecraft.world.entity.decoration.ArmorStand;
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
import net.minecraft.world.phys.Vec3;

/**
 * Dev-only screenshots of the Tides & Treasures creatures: with -Dwinterworks.oceanmobshots=all (e.g. in JAVA_TOOL_OPTIONS
 * for ./gradlew runClient under xvfb-run) the client makes a flat world, builds the scenes and saves
 * screenshots/winterworks_oceanmob_*.png, then quits: a female anglerfish's lure lighting a dark, roofed tank (no night
 * vision), a male beside it, the female grabbing the player, lionfish on a coral reef (one sheared), riding a nautilus
 * (swimming and dashing), and the new turtles swimming, basking on a beach and hatching. A comma list instead of all
 * (angler,grab,lionfish,nautilus,turtles) runs only those scenes. Views come from a client-side armour stand set as the
 * camera, or the player's own third-person camera where the player must be in the picture.
 */
final class OceanMobShots {
    private static final String MODE = System.getProperty("winterworks.oceanmobshots", "");
    private static final Set<String> SCENES = Set.copyOf(Arrays.asList(MODE.split(",")));
    private static final List<Step> PLAN = new ArrayList<>();
    private static final int Y = -60;   // standing height in the flat world
    private static boolean created;
    private static int ticks, step, waitStart = -1;
    private static volatile int femaleId = -1, maleId = -1, mountId = -1;
    private static ArmorStand camera;

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

    private static final int TANK_X = 0, TANK_Z = 80;

    /** A roofed deepslate tank full of dark water: the female's lure lights it (the player waits on the roof, no night vision). */
    private static int angler(int t) {
        int x0 = TANK_X, z0 = TANK_Z;
        at(t, () -> tp(x0 + 0.5, Y + 20, z0 + 0.5));
        at(t += 40, () -> {
            cmd("time set 18000");
            server(level -> {
                tank(level, x0, z0, 13, 15);
                Anglerfish f = angler(level, x0 + 0.5, Y + 5.2, z0 + 3.5, 160f, true);
                f.setNoAi(true);
                femaleId = f.getId();
                Anglerfish m = angler(level, x0 - 4.5, Y + 9.0, z0 - 1.5, 220f, false);
                m.setNoAi(true);
                maleId = m.getId();
                player(level).teleportTo(x0 + 0.5, Y + 17, z0 + 0.5);
            });
        });
        at(t += 60, () -> cam(x0 - 2.0, Y + 6.8, z0 - 7.5, x0 + 0.5, Y + 6.2, z0 + 2.5));
        at(t += 40, () -> shot("angler_lure"));
        at(t += 2, () -> cam(x0 + 8.5, Y + 5.0, z0 + 1.0, x0 + 0.5, Y + 4.5, z0 + 3.0));
        at(t += 30, () -> shot("angler_lure_side"));
        at(t += 2, () -> {
            Entity m = Minecraft.getInstance().level.getEntity(maleId);
            if (m != null) {
                cam(m.getX() - 1.1, m.getY() + 0.35, m.getZ() - 0.9, m.getX(), m.getY() + 0.15, m.getZ());
            }
        });
        at(t += 30, () -> shot("angler_male"));
        // with the female hunting (lure flaring), from the front
        at(t += 2, () -> server(level -> {
            if (level.getEntity(femaleId) instanceof Anglerfish f) {
                f.setNoAi(false);
            }
        }));
        return t + 5;
    }

    /** The female lures, lunges and grabs the player (in survival, swimming in front of her), seen in third person. */
    private static int grab(int t) {
        int x0 = TANK_X, z0 = TANK_Z;
        if (!on("angler")) {
            at(t, () -> tp(x0 + 0.5, Y + 20, z0 + 0.5));
            at(t += 40, () -> {
                cmd("time set 18000");
                server(level -> {
                    tank(level, x0, z0, 13, 15);
                    Anglerfish f = angler(level, x0 + 0.5, Y + 5.2, z0 + 3.5, 160f, true);
                    femaleId = f.getId();
                });
            });
            t += 40;
        }
        at(t, () -> server(level -> {
            Anglerfish.eager = true;
            if (level.getEntity(maleId) instanceof Anglerfish m) {
                m.discard();
            }
            if (level.getEntity(femaleId) instanceof Anglerfish f) {
                f.setNoAi(false);
                f.moveTo(x0 + 0.5, Y + 5.2, z0 + 3.5, 180f, 0f);
            }
            ServerPlayer p = player(level);
            p.setGameMode(GameType.SURVIVAL);
            p.setHealth(p.getMaxHealth());
            p.teleportTo(x0 + 0.5, Y + 5.5, z0 - 3.0);
        }));
        t += 2;
        when(t, () -> holding(femaleId), 400, () -> {});
        at(t += 8, () -> grabView(femaleId, 95f, 8f));
        at(t += 4, () -> shot("angler_grab"));
        at(t += 3, () -> grabView(femaleId, 140f, 18f));
        at(t += 4, () -> shot("angler_grab_front"));
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
                p.setGameMode(GameType.CREATIVE);
                p.setHealth(p.getMaxHealth());
                p.teleportTo(x0 + 0.5, Y + 20, z0 + 0.5);
            });
        });
        return t + 10;
    }

    /** A coral reef in warm water (fill biome warm ocean), lionfish hunting over it, one of them sheared. */
    private static int reef(int t) {
        int x0 = 120, z0 = 80;
        at(t, () -> {
            cmd("time set 6000");
            tp(x0 + 0.5, Y + 16, z0 + 0.5);
        });
        at(t += 40, () -> {
            cmd(String.format("fillbiome %d %d %d %d %d %d minecraft:warm_ocean", x0 - 16, Y - 4, z0 - 16, x0 + 16, Y + 16, z0 + 16));
            server(level -> {
                pool(level, x0, z0, 15, 11, Blocks.SAND.defaultBlockState(), Blocks.SANDSTONE.defaultBlockState());
                corals(level, x0, z0, 13, level.random);
                Lionfish a = lionfish(level, x0 + 0.5, Y + 3.2, z0 + 2.0, 200f);
                Lionfish b = lionfish(level, x0 - 2.2, Y + 4.4, z0 + 4.0, 140f);
                Lionfish c = lionfish(level, x0 + 3.0, Y + 2.6, z0 + 5.5, 240f);
                c.setRegrowTicks(Lionfish.REGROW_TICKS);   // freshly sheared: stubby spines
                for (int i = 0; i < 6; i++) {
                    TropicalFish f = EntityType.TROPICAL_FISH.create(level);
                    f.moveTo(x0 - 4 + level.random.nextInt(9), Y + 3 + level.random.nextInt(4), z0 + 3 + level.random.nextInt(6), 0, 0);
                    level.addFreshEntity(f);
                }
                player(level).teleportTo(x0 + 0.5, Y + 13, z0 - 14.5);
            });
        });
        at(t += 60, () -> cam(x0 - 1.0, Y + 4.4, z0 - 3.2, x0 + 0.5, Y + 3.5, z0 + 3.0));
        at(t += 30, () -> shot("lionfish_reef"));
        at(t += 2, () -> cam(x0 + 3.5, Y + 3.4, z0 + 2.6, x0 + 3.0, Y + 2.8, z0 + 5.5));
        at(t += 20, () -> shot("lionfish_sheared"));
        return t + 5;
    }

    /** A deep pool: the player rides a tamed, saddled nautilus, swimming where they look, then dashes. */
    private static int nautilus(int t) {
        int x0 = 240, z0 = 80;
        at(t, () -> {
            cmd("time set 6000");
            tp(x0 + 0.5, Y + 20, z0 + 0.5);
        });
        at(t += 40, () -> {
            cmd(String.format("fillbiome %d %d %d %d %d %d minecraft:deep_ocean", x0 - 26, Y - 4, z0 - 26, x0 + 26, Y + 20, z0 + 26));
            server(level -> {
                pool(level, x0, z0, 24, 15, Blocks.GRAVEL.defaultBlockState(), Blocks.PRISMARINE.defaultBlockState());
                RandomSource r = level.random;
                for (int i = 0; i < 70; i++) {   // kelp forest
                    int x = x0 - 22 + r.nextInt(45), z = z0 - 22 + r.nextInt(45);
                    int h = 3 + r.nextInt(9);
                    for (int y = 0; y < h; y++) {
                        level.setBlock(new BlockPos(x, Y + y, z), y == h - 1 ? Blocks.KELP.defaultBlockState() : Blocks.KELP_PLANT.defaultBlockState(),
                                Block.UPDATE_CLIENTS);
                    }
                }
                Nautilus n = OceanEntities.NAUTILUS.create(level);
                n.moveTo(x0 + 0.5, Y + 6, z0 - 14.5, 0f, 0f);
                n.tame(player(level));
                n.equipSaddle(new ItemStack(Items.SADDLE), null);
                level.addFreshEntity(n);
                mountId = n.getId();
                ServerPlayer p = player(level);
                p.setGameMode(GameType.SURVIVAL);
                p.teleportTo(x0 + 0.5, Y + 8, z0 - 14.5);
                p.startRiding(n, true);
            });
        });
        at(t += 30, () -> riderView(0f, 8f, CameraType.THIRD_PERSON_BACK));
        at(t += 2, () -> Minecraft.getInstance().options.keyUp.setDown(true));
        at(t += 30, () -> shot("nautilus_ride"));
        at(t += 2, () -> riderView(0f, -6f, CameraType.THIRD_PERSON_FRONT));
        at(t += 12, () -> shot("nautilus_ride_front"));
        at(t += 2, () -> Minecraft.getInstance().options.keyJump.setDown(true));
        at(t += 2, () -> Minecraft.getInstance().options.keyJump.setDown(false));
        at(t += 5, () -> shot("nautilus_dash"));
        at(t += 2, () -> riderView(-90f, 10f, CameraType.THIRD_PERSON_BACK));
        at(t += 25, () -> shot("nautilus_turn"));
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
                p.teleportTo(x0 + 0.5, Y + 20, z0 + 0.5);
            });
        });
        return t + 10;
    }

    /** A beach into warm water: turtles swimming, basking on the sand, and a nest hatching. */
    private static int turtles(int t) {
        int x0 = 360, z0 = 80;
        at(t, () -> {
            cmd("time set 6000");
            tp(x0 + 0.5, Y + 16, z0 + 0.5);
        });
        at(t += 40, () -> {
            cmd(String.format("fillbiome %d %d %d %d %d %d minecraft:beach", x0 - 20, Y - 4, z0 - 20, x0 - 1, Y + 16, z0 + 20));
            cmd(String.format("fillbiome %d %d %d %d %d %d minecraft:warm_ocean", x0, Y - 4, z0 - 20, x0 + 30, Y + 16, z0 + 20));
            server(level -> {
                beach(level, x0, z0);
                TurtleGoals.eagerBask = true;
                for (int i = 0; i < 3; i++) {
                    Turtle tt = turtle(level, x0 - 8.5 - i * 3.2, Y + 0.0, z0 - 2.5 + i * 2.6, 60f + i * 40f, false);
                    tt.setHomePos(tt.blockPosition());
                }
                for (int i = 0; i < 4; i++) {
                    turtle(level, x0 + 9.5 + i * 3.0, Y - 4.0 + (i % 2), z0 - 3.5 + i * 2.2, 250f + i * 25f, false);
                }
                // a nest hatching: cracked eggs, and hatchlings scrambling for the sea
                for (int i = 0; i < 3; i++) {
                    level.setBlock(new BlockPos(x0 - 14 + i, Y, z0 + 8), Blocks.TURTLE_EGG.defaultBlockState()
                            .setValue(TurtleEggBlock.EGGS, 4 - i).setValue(TurtleEggBlock.HATCH, 2), Block.UPDATE_CLIENTS);
                }
                for (int i = 0; i < 5; i++) {
                    Turtle b = turtle(level, x0 - 12.0 + i * 0.9, Y, z0 + 6.6 - (i % 2) * 0.8, 260f + i * 9f, true);
                    b.setNoAi(i % 2 == 0);
                }
                player(level).teleportTo(x0 - 4.5, Y + 12, z0 - 16.5);
            });
        });
        at(t += 80, () -> cam(x0 - 3.5, Y + 2.2, z0 - 9.0, x0 - 11.5, Y + 0.2, z0 + 0.5));
        at(t += 30, () -> shot("turtles_basking"));
        at(t += 2, () -> cam(x0 - 9.5, Y + 1.3, z0 + 4.5, x0 - 12.5, Y + 0.1, z0 + 7.6));
        at(t += 20, () -> shot("turtles_hatching"));
        at(t += 2, () -> cam(x0 + 6.5, Y - 3.0, z0 - 7.0, x0 + 13.5, Y - 3.5, z0 + 0.5));
        at(t += 40, () -> shot("turtles_swimming"));
        at(t += 60, () -> cam(x0 + 6.0, Y - 2.0, z0 + 8.0, x0 + 13.5, Y - 3.5, z0 + 0.5));
        at(t += 2, () -> shot("turtles_swimming_2"));
        at(t += 2, () -> server(level -> TurtleGoals.eagerBask = false));
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
        for (int i = 0; i < 9; i++) {   // rocks
            int x = x0 - r + 2 + rnd.nextInt(2 * r - 3), z = z0 - r + 2 + rnd.nextInt(2 * r - 3);
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
        for (int i = 0; i < 42; i++) {   // coral heads
            int x = x0 - r + rnd.nextInt(2 * r + 1), z = z0 - r + rnd.nextInt(2 * r + 1);
            Block b = blocks[rnd.nextInt(blocks.length)];
            int h = 1 + rnd.nextInt(3);
            for (int y = 1; y <= h; y++) {
                level.setBlock(new BlockPos(x, Y + y, z), b.defaultBlockState(), Block.UPDATE_CLIENTS);
                if (y == h && rnd.nextInt(3) > 0) {
                    level.setBlock(new BlockPos(x, Y + y + 1, z), plants[rnd.nextInt(plants.length)].defaultBlockState(), Block.UPDATE_CLIENTS);
                }
                for (net.minecraft.core.Direction d : net.minecraft.core.Direction.Plane.HORIZONTAL) {
                    BlockPos side = new BlockPos(x, Y + y, z).relative(d);
                    if (rnd.nextInt(5) == 0 && level.getBlockState(side).is(Blocks.WATER)) {
                        level.setBlock(side, wallFans[rnd.nextInt(wallFans.length)].defaultBlockState().setValue(BaseCoralWallFanBlock.FACING, d),
                                Block.UPDATE_CLIENTS);
                    }
                }
            }
        }
        for (int i = 0; i < 90; i++) {   // seagrass, corals and sea pickles on the sand
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

    /** Sand from x0-20 to x0, sloping down under warm water out to x0+30 (walled), the seafloor scattered with seagrass. */
    private static void beach(ServerLevel level, int x0, int z0) {
        RandomSource rnd = level.random;
        for (BlockPos p : BlockPos.betweenClosed(x0 - 20, Y - 8, z0 - 20, x0 + 31, Y + 6, z0 + 20)) {
            int dx = p.getX() - x0;
            int ground = dx < 0 ? Y - 1 : Y - 1 - Math.min(7, 1 + dx / 2);   // the seabed slopes away
            boolean wall = p.getX() == x0 + 31 || p.getZ() == z0 - 20 || p.getZ() == z0 + 20;
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
        for (int i = 0; i < 60; i++) {
            int x = x0 + 2 + rnd.nextInt(28), z = z0 - 18 + rnd.nextInt(37);
            int ground = Y - 1 - Math.min(7, 1 + (x - x0) / 2);
            BlockPos p = new BlockPos(x, ground + 1, z);
            if (level.getBlockState(p).is(Blocks.WATER) && level.getBlockState(p.above()).is(Blocks.WATER)) {
                level.setBlock(p, (rnd.nextInt(4) == 0 ? Blocks.TUBE_CORAL : Blocks.SEAGRASS).defaultBlockState(), Block.UPDATE_CLIENTS);
            }
        }
        for (int i = 0; i < 8; i++) {   // a little dune grass
            BlockPos p = new BlockPos(x0 - 19 + rnd.nextInt(12), Y, z0 - 18 + rnd.nextInt(36));
            if (level.getBlockState(p).isAir()) {
                level.setBlock(p, Blocks.DEAD_BUSH.defaultBlockState(), Block.UPDATE_CLIENTS);
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

    // --------------------------------------------------------------------------------------- cameras, plumbing

    /** Puts the camera (a client-side armour stand) at the given point, looking at the target. */
    private static void cam(double x, double y, double z, double tx, double ty, double tz) {
        Minecraft mc = Minecraft.getInstance();
        if (camera == null || camera.level() != mc.level) {
            camera = new ArmorStand(EntityType.ARMOR_STAND, mc.level);
            camera.setInvisible(true);
        }
        double dx = tx - x, dy = ty - y, dz = tz - z;
        float yaw = (float) (Mth.atan2(dz, dx) * Mth.RAD_TO_DEG) - 90f;
        float pitch = (float) -(Mth.atan2(dy, Math.sqrt(dx * dx + dz * dz)) * Mth.RAD_TO_DEG);
        camera.moveTo(x, y - camera.getEyeHeight(), z, yaw, pitch);
        camera.setYHeadRot(yaw);
        camera.yHeadRotO = yaw;
        camera.yBodyRot = yaw;
        mc.options.setCameraType(CameraType.FIRST_PERSON);
        mc.setCameraEntity(camera);
    }

    /** The player's own third-person camera, looking along `yaw` (relative to the grabbing fish) and `pitch`. */
    private static void grabView(int fishId, float relYaw, float pitch) {
        Minecraft mc = Minecraft.getInstance();
        float yaw = mc.level.getEntity(fishId) instanceof Anglerfish f ? f.yBodyRot + relYaw : relYaw;
        riderView(yaw, pitch, CameraType.THIRD_PERSON_BACK);
    }

    private static void riderView(float yaw, float pitch, CameraType type) {
        Minecraft mc = Minecraft.getInstance();
        mc.setCameraEntity(mc.player);
        mc.options.setCameraType(type);
        mc.options.fov().set(80);
        mc.player.setYRot(yaw);
        mc.player.yRotO = yaw;
        mc.player.setXRot(pitch);
        mc.player.xRotO = pitch;
    }

    private static boolean holding(int id) {
        Minecraft mc = Minecraft.getInstance();
        return mc.level != null && mc.level.getEntity(id) instanceof Anglerfish f && f.isHolding() && mc.player.getVehicle() == f;
    }

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
        cmd(String.format(java.util.Locale.ROOT, "tp @s %.2f %.2f %.2f", x, y, z));
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
