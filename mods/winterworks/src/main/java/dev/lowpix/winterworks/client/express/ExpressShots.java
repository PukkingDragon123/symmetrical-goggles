package dev.lowpix.winterworks.client.express;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.express.CoasterLoop;
import dev.lowpix.winterworks.express.Couplings;
import dev.lowpix.winterworks.express.LocomotiveCart;
import dev.lowpix.winterworks.express.LoopMotion;
import dev.lowpix.winterworks.registry.WWItems;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.Difficulty;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.npc.Villager;
import net.minecraft.world.entity.npc.VillagerProfession;
import net.minecraft.world.entity.npc.VillagerType;
import net.minecraft.world.entity.vehicle.Minecart;
import net.minecraft.world.entity.vehicle.AbstractMinecart;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Dev-only screenshots of the Winter Express 0.4 fixes: with -Dwinterworks.expressshots=true (in JAVA_TOOL_OPTIONS for
 * ./gradlew runClient under xvfb-run) the client makes a flat world and saves screenshots/winterworks_express_*.png:
 * a floating coaster with a Coaster Loop, a cart with a rider upside down at the top of it (and the view from a seat
 * at the top), Switch Rail junctions set straight and to the branch, a locomotive pulling a train of vanilla
 * minecarts on a furnace cart's fire, and the 3D icons in the hotbar. Then it quits.
 */
final class ExpressShots {
    private static final boolean ENABLED = Boolean.getBoolean("winterworks.expressshots");
    private static final List<Step> PLAN = new ArrayList<>();
    private static boolean created;
    private static int step, waited;

    /** Waits `delay` ticks, then until `ready` holds (at most `timeout` more ticks), then runs `action`. */
    private record Step(int delay, BooleanSupplier ready, int timeout, Runnable action) {}

    private ExpressShots() {}

    static void init() {
        if (!ENABLED) {
            return;
        }
        ClientTickEvents.END_CLIENT_TICK.register(ExpressShots::tick);
        then(40, () -> {
            Minecraft mc = Minecraft.getInstance();
            mc.options.hideGui = true;
            mc.options.renderDistance().set(10);
            mc.getWindow().setWindowed(1280, 720);
            for (String c : new String[]{"gamerule doDaylightCycle false", "gamerule doMobSpawning false", "gamerule doWeatherCycle false",
                    "time set 5000", "weather clear", "gamemode spectator"}) {
                cmd(c);
            }
        });
        // ---- a floating coaster: boosters, a loop, a sloped curve, brakes at the end, all six blocks up in the air
        then(10, () -> {
            cmd("fill -12 -54 0 40 -54 0 winterworks:coaster_rail[shape=east_west]");
            cmd("fill -7 -55 0 -2 -55 0 minecraft:redstone_block");
            cmd("fill -7 -54 0 -2 -54 0 winterworks:booster_rail[shape=east_west]");
            cmd("setblock 12 -54 0 winterworks:coaster_loop[shape=east_west]");
            cmd("fill 34 -55 0 40 -55 0 minecraft:smooth_stone");
            cmd("fill 34 -54 0 40 -54 0 winterworks:booster_rail[shape=east_west]");
            for (int x = -4; x <= 1; x++) {   // a decorative run that climbs and turns, hanging free
                cmd("setblock " + x + " -54 6 winterworks:coaster_rail");
            }
            for (int x = 2; x <= 6; x++) {
                cmd("setblock " + x + " -53 6 winterworks:coaster_rail");
            }
            for (int z = 7; z <= 11; z++) {
                cmd("setblock 6 -53 " + z + " winterworks:coaster_rail");
            }
            cmd("tp @s 4.5 -49 -11.5 facing 12.5 -51 1.5");
        });
        then(80, () -> shot("coaster_loop"));
        // a cart with a villager in it, launched off the boosters: freeze it upside down at the top of the loop
        then(2, () -> server(level -> {
            Minecart cart = new Minecart(level, -10.5, -53.9375, 0.5);
            level.addFreshEntity(cart);
            Villager v = EntityType.VILLAGER.create(level);
            v.moveTo(-10.5, -53.8, 0.5);
            v.setNoAi(true);
            v.setVillagerData(v.getVillagerData().setType(VillagerType.SNOW).setProfession(VillagerProfession.LIBRARIAN));
            level.addFreshEntity(v);
            v.startRiding(cart, true);
            cart.setDeltaMovement(0.5, 0, 0);
        }));
        until(() -> atTop(0.03), 200, () -> cmd("tick freeze"));
        then(2, () -> cmd("tp @s 6.5 -48.5 -6.5 facing 12.5 -49.5 0.5"));
        then(25, () -> shot("loop_rider_upside_down"));
        then(2, () -> cmd("tp @s 12.5 -51.5 -7.5 facing 12.5 -49 0.5"));
        then(20, () -> shot("loop_rider_side"));
        then(2, () -> cmd("tick unfreeze"));
        // the view from the seat: ride a cart round yourself, frozen at the top
        then(80, () -> {
            cmd("kill @e[type=minecraft:minecart]");
            cmd("kill @e[type=minecraft:villager]");
            cmd("gamemode creative");
            cmd("summon minecraft:minecart -10.5 -53.9 0.5");
        });
        then(5, () -> server(level -> {
            ServerPlayer p = level.getServer().getPlayerList().getPlayers().get(0);
            carts(level, new AABB(-14, -56, -1, -8, -50, 2)).forEach(c -> {
                p.teleportTo(c.getX(), c.getY(), c.getZ());
                p.startRiding(c, true);
                p.setYRot(-90f);
                p.setXRot(10f);
                c.setDeltaMovement(0.5, 0, 0);
            });
        }));
        then(2, () -> {   // the player's view is the client's: face along the track
            Minecraft mc = Minecraft.getInstance();
            mc.player.setYRot(-90f);
            mc.player.setXRot(8f);
        });
        // (a cart with a player in it never freezes: shoot on the fly)
        until(() -> atTop(-1.2), 200, () -> shot("loop_seat_climbing"));
        until(() -> atTop(0.0), 60, () -> shot("loop_seat_top"));
        until(() -> atTop(1.0), 60, () -> shot("loop_seat_coming_down"));
        then(80, () -> {
            cmd("kill @e[type=minecraft:minecart]");
            cmd("gamemode spectator");
        });
        // ---- Switch Rails on the ground: one unpowered (straight on), one powered by a lever (onto the branch)
        then(5, () -> {
            cmd("fill -10 -61 20 30 -61 50 minecraft:smooth_stone");
            for (int z : new int[]{30, 40}) {
                cmd("fill -6 -60 " + z + " 20 -60 " + z + " minecraft:rail[shape=east_west]");
                cmd("setblock 5 -60 " + z + " winterworks:switch_rail[facing=east,branch=left,shape=east_west]");
                cmd("fill 5 -60 " + (z - 1) + " 5 -60 " + (z - 7) + " minecraft:rail[shape=north_south]");
            }
            cmd("setblock 5 -61 40 minecraft:redstone_block");   // powers the second switch from underneath
            cmd("tp @s 9.5 -57.8 33.5 facing 5.5 -60 30.5");
        });
        then(30, () -> shot("switch_unpowered_close"));
        then(2, () -> cmd("tp @s 9.5 -57.8 43.5 facing 5.5 -60 40.5"));
        then(20, () -> shot("switch_powered_close"));
        then(2, () -> server(level -> {
            for (int z : new int[]{30, 40}) {
                Minecart cart = new Minecart(level, -4.5, -59.9375, z + 0.5);
                level.addFreshEntity(cart);
                cart.setDeltaMovement(0.8, 0, 0);
            }
        }));
        then(2, () -> cmd("tp @s -3.5 -54.5 47.5 facing 6.5 -60 35.5"));
        then(50, () -> shot("switch_junctions"));
        then(2, () -> cmd("tp @s 5.5 -55 30.5 180 90"));
        then(20, () -> shot("switch_unpowered_above"));
        then(2, () -> cmd("tp @s 5.5 -55 40.5 180 90"));
        then(20, () -> shot("switch_powered_above"));
        // ---- a locomotive on a furnace minecart's fire, pulling a train of vanilla minecarts
        then(5, () -> {
            cmd("kill @e[type=#minecraft:boats]");
            cmd("fill 40 -61 -8 110 -61 8 minecraft:snow_block");
            cmd("fill 40 -60 0 110 -60 0 winterworks:coaster_rail[shape=east_west]");
            cmd("summon winterworks:locomotive 60.5 -60 0.5");
            cmd("summon minecraft:furnace_minecart 58.95 -60 0.5 {Fuel:6000s}");
            cmd("summon minecraft:chest_minecart 57.4 -60 0.5");
            cmd("summon minecraft:hopper_minecart 55.85 -60 0.5");
            cmd("summon minecraft:minecart 54.3 -60 0.5");
            cmd("summon minecraft:tnt_minecart 52.75 -60 0.5");
        });
        then(10, () -> server(level -> {
            List<AbstractMinecart> train = carts(level, new AABB(50, -62, 0, 62, -58, 1));
            train.sort(Comparator.comparingDouble((AbstractMinecart c) -> c.getX()).reversed());
            for (int i = 0; i + 1 < train.size(); i++) {
                Couplings.couple(train.get(i), train.get(i + 1));
            }
            for (AbstractMinecart c : train) {
                if (c instanceof LocomotiveCart loco) {
                    loco.setHeading(new Vec3(1, 0, 0));
                    loco.setThrottle(1);
                }
            }
        }));
        then(70, () -> server(level -> {
            AbstractMinecart lead = carts(level, new AABB(40, -62, -1, 110, -58, 2)).stream()
                    .filter(c -> c instanceof LocomotiveCart).findFirst().orElse(null);
            if (lead != null) {
                cmd(String.format("tp @s %.1f -57.2 -5.5 facing %.1f -59.6 0.5", lead.getX() - 3.5, lead.getX() - 4.0));
            }
        }));
        then(3, () -> shot("minecart_train"));
        then(2, () -> cmd("tick freeze"));
        then(10, () -> shot("minecart_train_still"));
        then(2, () -> cmd("tick unfreeze"));
        // ---- the 3D icons in the hotbar
        then(5, () -> {
            cmd("gamemode survival");
            Minecraft.getInstance().options.hideGui = false;
            server(level -> {
                ServerPlayer p = level.getServer().getPlayerList().getPlayers().get(0);
                p.getInventory().clearContent();
                ItemStack[] bar = {new ItemStack(WWItems.LOCOMOTIVE), new ItemStack(WWItems.DRAGON_LOCOMOTIVE), new ItemStack(WWItems.FOX_CART),
                        new ItemStack(WWItems.ZOMBIE_CART), new ItemStack(WWItems.SNOW_GLOBE), new ItemStack(WWItems.COASTER_LOOP),
                        new ItemStack(WWItems.SWITCH_RAIL), new ItemStack(WWItems.COASTER_RAIL), new ItemStack(WWItems.BOOSTER_RAIL)};
                for (int i = 0; i < bar.length; i++) {
                    p.getInventory().setItem(i, bar[i]);
                }
                p.getInventory().selected = 0;
                p.teleportTo(30.5, -60, -6.5);
                p.setYRot(20f);
                p.setXRot(15f);
            });
        });
        then(30, () -> shot("hotbar_icons"));
        then(2, () -> cmd("gamemode creative"));
        then(2, () -> Minecraft.getInstance().player.getInventory().selected = 5);   // the selected slot is the client's
        then(15, () -> shot("hotbar_held_loop"));
        then(5, () -> Minecraft.getInstance().stop());
    }

    /** A cart (client) is going round the loop at angle pi + offset (up to 0.8 rad past it). */
    private static boolean atTop(double offset) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null) {
            return false;
        }
        for (Entity e : mc.level.entitiesForRendering()) {
            LoopMotion m = CoasterLoop.motion(e);
            if (m != null && m.full && m.theta >= Math.PI + offset && m.theta <= Math.PI + offset + 0.8) {
                return true;
            }
        }
        return false;
    }

    private static List<AbstractMinecart> carts(ServerLevel level, AABB box) {
        return new ArrayList<>(level.getEntitiesOfClass(AbstractMinecart.class, box));
    }

    private static void then(int delay, Runnable r) {
        PLAN.add(new Step(delay, () -> true, 0, r));
    }

    private static void until(BooleanSupplier ready, int timeout, Runnable r) {
        PLAN.add(new Step(0, ready, timeout, r));
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

    private static void shot(String name) {
        Minecraft mc = Minecraft.getInstance();
        Screenshot.grab(mc.gameDirectory, "winterworks_express_" + name + ".png", mc.getMainRenderTarget(), msg -> {});
        Winterworks.LOG.info("expressshots: {}", name);
    }

    private static void tick(Minecraft mc) {
        if (!created && mc.level == null && mc.screen != null && mc.getOverlay() == null) {
            mc.options.onboardAccessibility = false;
            mc.getTutorial().setStep(net.minecraft.client.tutorial.TutorialSteps.NONE);
            created = true;
            LevelSettings settings = new LevelSettings("winterworks_expressshots", GameType.CREATIVE, false, Difficulty.PEACEFUL,
                    true, new GameRules(), WorldDataConfiguration.DEFAULT);
            mc.createWorldOpenFlows().createFreshLevel("winterworks_expressshots_" + System.currentTimeMillis(), settings,
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
        Step s = PLAN.get(step);
        waited++;
        if (waited < s.delay()) {
            return;
        }
        if (!s.ready().getAsBoolean() && waited < s.delay() + s.timeout()) {
            return;
        }
        if (waited >= s.delay() + s.timeout() && s.timeout() > 0 && !s.ready().getAsBoolean()) {
            Winterworks.LOG.warn("expressshots: step {} timed out", step);
        }
        step++;
        waited = 0;
        s.action().run();
    }
}
