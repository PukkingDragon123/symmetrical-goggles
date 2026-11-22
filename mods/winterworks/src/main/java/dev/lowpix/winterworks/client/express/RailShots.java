package dev.lowpix.winterworks.client.express;

import com.mojang.brigadier.exceptions.CommandSyntaxException;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.registry.WWItems;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.commands.arguments.blocks.BlockStateParser;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.Difficulty;
import net.minecraft.world.entity.vehicle.Minecart;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;

/**
 * Dev-only screenshots of every rail as 3D track (docs/FIXES_0_4.md "Every rail is 3D track"): with
 * -Dwinterworks.railshots=true (in JAVA_TOOL_OPTIONS for ./gradlew runClient under xvfb-run) the client makes a flat
 * world, lays out a hump of every rail type (unpowered, then powered), a rail oval with carts, switch junctions,
 * rails on glass and a floating coaster section, saves screenshots/winterworks_rails_*.png and quits.
 * Blocks are set twice without neighbour updates, so every rail keeps exactly the shape and power state given.
 */
final class RailShots {
    private static final boolean ENABLED = Boolean.getBoolean("winterworks.railshots");
    private static final List<Runnable> PLAN = new ArrayList<>();
    private static final List<Integer> DELAY = new ArrayList<>();
    private static final List<Object[]> BLOCKS = new ArrayList<>();
    private static boolean created;
    private static int step, waited;

    private RailShots() {}

    static void init() {
        if (!ENABLED) {
            return;
        }
        layout();
        ClientTickEvents.END_CLIENT_TICK.register(RailShots::tick);
        then(40, () -> {
            Minecraft mc = Minecraft.getInstance();
            mc.options.hideGui = true;
            mc.options.renderDistance().set(8);
            mc.getWindow().setWindowed(1280, 720);
            for (String c : new String[]{"gamerule doDaylightCycle false", "gamerule doMobSpawning false",
                    "gamerule doWeatherCycle false", "time set 4000", "weather clear", "gamemode spectator"}) {
                cmd(c);
            }
        });
        then(10, () -> server(RailShots::place));
        then(5, () -> server(RailShots::place));     // the second pass: same blocks, so no rail re-shapes itself
        then(5, () -> server(level -> {
            cart(level, 6.5, -59.9, 6.5);      // holds the detector down (lit)
            cart(level, 6.5, -59.9, 18.5);     // clamped by the powered trap rail
            cart(level, 0.5, -59.9, 42.5);     // on the oval
            cart(level, 4.5, -59.9, 40.5);
        }));
        shot(60, "overview", "tp @s 14.5 -50 -6.5 facing 5 -60 12");
        String[] rows = {"rail", "powered_rail", "detector_rail", "activator_rail", "booster_rail", "lift_rail", "trap_rail",
                "drop_rail"};
        for (int k = 0; k < rows.length; k++) {   // one row at a time, from the north: unpowered hump left, powered right
            int z = 3 * k;
            shot(25, "row_" + rows[k], "tp @s 5.5 -56.8 " + (z - 3.4) + " facing 5.2 -59.7 " + (z + 0.6));
        }
        shot(25, "rows_low", "tp @s 11.5 -58.6 1.5 facing 3 -59.6 8");
        shot(25, "switches", "tp @s 0.5 -56.6 30.5 facing 4 -60 25.5");
        shot(25, "oval_carts", "tp @s 4.5 -56 49 facing 4 -60 43");
        shot(25, "rails_on_glass", "tp @s 5.5 -55.2 46.2 facing 5 -57.2 50.5");
        shot(25, "floating_coaster", "tp @s 7.5 -52.6 58.5 facing 6.5 -55 54.5");
        shot(25, "floating_below", "tp @s 7.5 -58.5 57.5 facing 6.5 -55.3 54.5");
        shot(25, "drop_open", "tp @s 8.6 -57.4 19.6 facing 6.3 -60.6 21.5");
        // the 3D icons in the hotbar, and one in hand
        then(5, () -> {
            cmd("gamemode survival");
            Minecraft.getInstance().options.hideGui = false;
            server(level -> {
                ServerPlayer p = level.getServer().getPlayerList().getPlayers().get(0);
                p.getInventory().clearContent();
                ItemStack[] bar = {new ItemStack(Items.RAIL), new ItemStack(Items.POWERED_RAIL), new ItemStack(Items.DETECTOR_RAIL),
                        new ItemStack(Items.ACTIVATOR_RAIL), new ItemStack(WWItems.BOOSTER_RAIL), new ItemStack(WWItems.LIFT_RAIL),
                        new ItemStack(WWItems.TRAP_RAIL), new ItemStack(WWItems.DROP_RAIL), new ItemStack(WWItems.SWITCH_RAIL)};
                for (int i = 0; i < bar.length; i++) {
                    p.getInventory().setItem(i, bar[i]);
                }
                p.getInventory().setItem(9, new ItemStack(WWItems.COASTER_RAIL));
                p.teleportTo(12.5, -60, 3.5);
                p.setYRot(120f);
                p.setXRot(25f);
            });
        });
        then(30, () -> Minecraft.getInstance().player.getInventory().selected = 0);
        then(15, () -> grab("hotbar_icons"));
        then(2, () -> Minecraft.getInstance().player.getInventory().selected = 4);
        then(15, () -> grab("hotbar_held_booster"));
        then(5, () -> Minecraft.getInstance().stop());
    }

    /** Every block of the scene, in order (ground first, rails after their supports). */
    private static void layout() {
        String[] types = {"minecraft:rail", "minecraft:powered_rail", "minecraft:detector_rail", "minecraft:activator_rail",
                "winterworks:booster_rail", "winterworks:lift_rail", "winterworks:trap_rail"};
        // rows z = 0, 3, ... : x 0 rail, 1-4 a hump unpowered, 5 rail, 6-9 a hump powered (redstone blocks under it), 10 rail
        fill(-2, -61, -2, 13, -61, 30, "minecraft:smooth_stone");
        for (int k = 0; k < types.length; k++) {
            int z = 3 * k;
            String t = types[k];
            boolean plain = t.equals("minecraft:rail");
            String[] shapes = {"east_west", "ascending_east", "east_west", "ascending_west"};
            int[] ys = {-60, -60, -59, -60};
            set(3, -60, z, "minecraft:smooth_stone");
            set(8, -60, z, plain ? "minecraft:smooth_stone" : "minecraft:redstone_block");
            for (int i = 6; i <= 9; i++) {
                if (i != 8 && !plain) {
                    set(i, -61, z, "minecraft:redstone_block");
                }
            }
            for (int x : new int[]{0, 5, 10}) {
                set(x, -60, z, "minecraft:rail[shape=east_west]");
            }
            for (int i = 0; i < 4; i++) {
                set(1 + i, ys[i], z, t + "[shape=" + shapes[i] + (plain ? "" : ",powered=false") + "]");
                set(6 + i, ys[i], z, t + "[shape=" + shapes[i] + (plain ? "" : ",powered=true") + "]");
            }
        }
        // the Drop Rail: a hump, then one open over a pit, between closed ones
        int z = 21;
        set(3, -60, z, "minecraft:smooth_stone");
        String[] shapes = {"east_west", "ascending_east", "east_west", "ascending_west"};
        int[] ys = {-60, -60, -59, -60};
        for (int i = 0; i < 4; i++) {
            set(1 + i, ys[i], z, "winterworks:drop_rail[shape=" + shapes[i] + ",powered=false]");
        }
        fill(6, -63, z, 6, -61, z, "minecraft:air");
        set(0, -60, z, "minecraft:rail[shape=east_west]");
        set(5, -60, z, "winterworks:drop_rail[shape=east_west,powered=false]");
        set(6, -60, z, "winterworks:drop_rail_open[along_x=true]");
        set(7, -60, z, "winterworks:drop_rail[shape=east_west,powered=false]");
        set(8, -60, z, "minecraft:rail[shape=east_west]");
        // Switch Rails: one set straight on, one (a redstone block under it) set to the branch, both hands
        for (int[] s : new int[][]{{24, 0}, {27, 1}}) {
            int sz = s[0];
            boolean on = s[1] == 1;
            for (int x = 0; x <= 9; x++) {
                if (x != 2 && x != 6) {
                    set(x, -60, sz, "minecraft:rail[shape=east_west]");
                }
            }
            if (on) {
                set(2, -61, sz, "minecraft:redstone_block");
                set(6, -61, sz, "minecraft:redstone_block");
            }
            // facing east (toe west): branch left = north, right = south
            set(2, -60, sz, "winterworks:switch_rail[facing=east,branch=left,powered=" + on + ",shape=" + (on ? "north_west" : "east_west") + "]");
            set(2, -60, sz - 1, "minecraft:rail[shape=north_south]");
            set(6, -60, sz, "winterworks:switch_rail[facing=west,branch=left,powered=" + on + ",shape=" + (on ? "south_east" : "east_west") + "]");
            set(6, -60, sz + 1, "minecraft:rail[shape=north_south]");
        }
        // a rail oval with an activator, powered rails and a detector on it
        fill(-2, -61, 38, 12, -61, 46, "minecraft:smooth_stone");
        set(0, -60, 40, "minecraft:rail[shape=south_east]");
        set(8, -60, 40, "minecraft:rail[shape=south_west]");
        set(0, -60, 44, "minecraft:rail[shape=north_east]");
        set(8, -60, 44, "minecraft:rail[shape=north_west]");
        for (int x = 1; x <= 7; x++) {
            set(x, -60, 40, "minecraft:rail[shape=east_west]");
            set(x, -60, 44, "minecraft:rail[shape=east_west]");
        }
        for (int zz = 41; zz <= 43; zz++) {
            set(0, -60, zz, "minecraft:rail[shape=north_south]");
            set(8, -60, zz, "minecraft:rail[shape=north_south]");
        }
        set(4, -61, 44, "minecraft:redstone_block");
        for (int x = 3; x <= 5; x++) {
            set(x, -60, 44, "minecraft:powered_rail[shape=east_west,powered=true]");
        }
        set(6, -60, 44, "minecraft:detector_rail[shape=east_west,powered=false]");
        set(2, -60, 40, "minecraft:activator_rail[shape=east_west,powered=false]");
        // vanilla rails on glass (the girder shows), and a floating coaster section with a drop and boosters
        fill(0, -58, 50, 10, -58, 50, "minecraft:glass");
        set(5, -57, 50, "minecraft:glass");
        String[] onGlass = {"minecraft:rail[shape=east_west]", "minecraft:powered_rail[shape=east_west,powered=false]",
                "minecraft:detector_rail[shape=east_west,powered=false]", "minecraft:activator_rail[shape=east_west,powered=false]",
                "minecraft:rail[shape=ascending_east]", "minecraft:rail[shape=east_west]", "minecraft:rail[shape=ascending_west]",
                "minecraft:rail[shape=east_west]", "minecraft:powered_rail[shape=east_west,powered=false]",
                "minecraft:detector_rail[shape=east_west,powered=false]", "minecraft:activator_rail[shape=east_west,powered=false]"};
        for (int x = 0; x < onGlass.length; x++) {
            set(x, x == 5 ? -56 : -57, 50, onGlass[x]);
        }
        for (int x = 0; x <= 12; x++) {
            set(x, -55, 54, "winterworks:coaster_rail[shape=east_west]");
        }
        set(3, -55, 54, "winterworks:drop_rail[shape=east_west,powered=false]");
        set(4, -55, 54, "winterworks:drop_rail_open[along_x=true]");
        set(5, -55, 54, "winterworks:drop_rail[shape=east_west,powered=false]");
        set(8, -56, 54, "minecraft:redstone_block");
        set(9, -56, 54, "minecraft:redstone_block");
        set(8, -55, 54, "winterworks:booster_rail[shape=east_west,powered=true]");
        set(9, -55, 54, "winterworks:booster_rail[shape=east_west,powered=true]");
        set(11, -56, 54, "minecraft:glass");
        set(12, -56, 54, "minecraft:glass");
        set(11, -55, 54, "winterworks:lift_rail[shape=east_west,powered=false,color=12]");
        set(12, -55, 54, "winterworks:trap_rail[shape=east_west,powered=false,color=15]");
    }

    private static void set(int x, int y, int z, String state) {
        BLOCKS.add(new Object[]{new BlockPos(x, y, z), state});
    }

    private static void fill(int x0, int y0, int z0, int x1, int y1, int z1, String state) {
        for (int x = x0; x <= x1; x++) {
            for (int y = y0; y <= y1; y++) {
                for (int z = z0; z <= z1; z++) {
                    set(x, y, z, state);
                }
            }
        }
    }

    private static void place(ServerLevel level) {
        for (Object[] b : BLOCKS) {
            BlockState s;
            try {
                s = BlockStateParser.parseForBlock(level.registryAccess().lookupOrThrow(Registries.BLOCK), (String) b[1], false).blockState();
            } catch (CommandSyntaxException e) {
                Winterworks.LOG.warn("railshots: bad state {}: {}", b[1], e.getMessage());
                continue;
            }
            level.setBlock((BlockPos) b[0], s, Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE);
        }
        Winterworks.LOG.info("railshots: placed {} blocks ({} rails)", BLOCKS.size(),
                BLOCKS.stream().filter(b -> ((String) b[1]).contains("rail")).count());
    }

    private static void cart(ServerLevel level, double x, double y, double z) {
        Minecart c = new Minecart(level, x, y, z);
        level.addFreshEntity(c);
    }

    private static void shot(int delay, String name, String tp) {
        then(2, () -> cmd(tp));
        then(delay, () -> grab(name));
    }

    private static void grab(String name) {
        Minecraft mc = Minecraft.getInstance();
        Screenshot.grab(mc.gameDirectory, "winterworks_rails_" + name + ".png", mc.getMainRenderTarget(), msg -> {});
        Winterworks.LOG.info("railshots: {}", name);
    }

    private static void then(int delay, Runnable r) {
        DELAY.add(delay);
        PLAN.add(r);
    }

    private static void cmd(String c) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.player != null) {
            mc.player.connection.sendCommand(c);
        }
    }

    private static void server(Consumer<ServerLevel> job) {
        var srv = Minecraft.getInstance().getSingleplayerServer();
        if (srv != null) {
            srv.execute(() -> job.accept(srv.overworld()));
        }
    }

    private static void tick(Minecraft mc) {
        if (!created && mc.level == null && mc.screen != null && mc.getOverlay() == null) {
            mc.options.onboardAccessibility = false;
            mc.getTutorial().setStep(net.minecraft.client.tutorial.TutorialSteps.NONE);
            created = true;
            LevelSettings settings = new LevelSettings("winterworks_railshots", GameType.CREATIVE, false, Difficulty.PEACEFUL,
                    true, new GameRules(), WorldDataConfiguration.DEFAULT);
            mc.createWorldOpenFlows().createFreshLevel("winterworks_railshots_" + System.currentTimeMillis(), settings,
                    new WorldOptions(7L, false, false),
                    reg -> reg.registryOrThrow(Registries.WORLD_PRESET).getHolderOrThrow(WorldPresets.FLAT).value().createWorldDimensions(),
                    mc.screen);
            return;
        }
        if (mc.player == null || mc.level == null || step >= PLAN.size()) {
            return;
        }
        mc.gui.getChat().clearMessages(false);
        mc.getToasts().clear();
        if (++waited < DELAY.get(step)) {
            return;
        }
        waited = 0;
        PLAN.get(step++).run();
    }
}
