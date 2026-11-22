package dev.lowpix.winterworks.client.endgear;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.end.Petrify;
import dev.lowpix.winterworks.endgear.Dragonling;
import dev.lowpix.winterworks.endgear.EndGlider;
import dev.lowpix.winterworks.endgear.MonolithWandItem;
import dev.lowpix.winterworks.registry.EndEffects;
import dev.lowpix.winterworks.registry.EndEntities;
import dev.lowpix.winterworks.registry.EndItems;
import java.util.ArrayList;
import java.util.List;
import java.util.function.BiConsumer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents;
import net.minecraft.network.protocol.game.ServerboundSetCarriedItemPacket;
import net.minecraft.client.CameraType;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.protocol.game.ServerboundPlayerCommandPacket;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.Difficulty;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.monster.Zombie;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import net.minecraft.world.phys.Vec3;

/**
 * Dev-only screenshots of the gear: with -Dwinterworks.endgearshots=true (e.g. in JAVA_TOOL_OPTIONS for ./gradlew
 * runClient under xvfb-run) the client makes a flat world and shoots the 3D items in the hotbar, the Obsidian Shield
 * blocking, the Monolith Wand petrifying a zombie (and a petrified player), the End Glider overhead in flight (cruise and
 * boost, logging the client's and the server's speed every tick so the steering can be checked for smoothness), and a
 * baby and a saddled, armoured teen Dragonling; saves screenshots/winterworks_endgear_*.png and quits.
 */
final class EndGearShots {
    private static final boolean ENABLED = Boolean.getBoolean("winterworks.endgearshots");
    private static final List<Runnable> PLAN = new ArrayList<>();
    private static final List<Integer> AT = new ArrayList<>();
    private static boolean created, logFlight, wantFlight, logRide;
    private static Vec3 mark = Vec3.ZERO;
    private static int ticks, step, frames, framesAtStep, ticksAtStep, lastAt;
    private static Vec3 lastClient, lastServer, lastClientBefore = Vec3.ZERO;

    private EndGearShots() {}

    static void init() {
        if (!ENABLED) {
            return;
        }
        ClientTickEvents.END_CLIENT_TICK.register(EndGearShots::tick);
        WorldRenderEvents.LAST.register(ctx -> frames++);
        int t = 40;
        at(t, () -> {
            for (String c : new String[]{"gamerule doDaylightCycle false", "gamerule doMobSpawning false", "gamerule doWeatherCycle false",
                    "time set 6000", "difficulty easy", "fill -12 -61 -12 12 -61 12 minecraft:end_stone", "fill -12 -61 13 12 -61 30 minecraft:purpur_block",
                    "tp @s 0.5 -60 0.5 0 0"}) {
                cmd(c);
            }
        });
        // ---- the 3D items in the hotbar
        at(t += 10, () -> server((level, p) -> {
            p.getInventory().clearContent();
            p.getInventory().setItem(0, new ItemStack(EndItems.OBSIDIAN_SHIELD));
            p.getInventory().setItem(1, new ItemStack(EndItems.MONOLITH_WAND));
            p.getInventory().setItem(2, new ItemStack(EndItems.END_GLIDER));
            ItemStack e1 = new ItemStack(Items.DRAGON_EGG);
            e1.set(EndEffects.EGG_CRACKS, 1);
            ItemStack e2 = new ItemStack(Items.DRAGON_EGG);
            e2.set(EndEffects.EGG_CRACKS, 2);
            p.getInventory().setItem(3, new ItemStack(Items.DRAGON_EGG));
            p.getInventory().setItem(4, e1);
            p.getInventory().setItem(5, e2);
            p.getInventory().setItem(6, new ItemStack(EndItems.DRAGONLING_SPAWN_EGG));
            p.getInventory().setItem(8, new ItemStack(Items.SHIELD));
        }));
        at(t += 2, () -> select(1));
        at(t += 20, () -> shot("hotbar"));
        at(t += 2, () -> select(0));
        at(t += 10, () -> shot("shield_first_person"));
        at(t += 2, () -> select(2));
        at(t += 10, () -> shot("glider_first_person_carried"));

        // ---- the shield blocking, seen from the front
        // ... next to a vanilla shield, for the pose
        at(t += 5, () -> server((level, p) -> p.setItemInHand(InteractionHand.OFF_HAND, new ItemStack(EndItems.OBSIDIAN_SHIELD))));
        at(t += 2, () -> select(8));
        at(t += 5, () -> {
            camera(CameraType.THIRD_PERSON_FRONT);
            look(180f, 10f);
        });
        at(t += 10, () -> shot("shield_vs_vanilla_front"));
        at(t += 2, () -> camera(CameraType.THIRD_PERSON_BACK));
        at(t += 10, () -> shot("shield_vs_vanilla_back"));
        at(t += 2, () -> Minecraft.getInstance().options.keyUse.setDown(true));
        at(t += 12, () -> shot("shield_vs_vanilla_blocking_back"));
        at(t += 2, () -> Minecraft.getInstance().options.keyUse.setDown(false));
        at(t += 5, () -> server((level, p) -> p.getInventory().setItem(0, new ItemStack(EndItems.MONOLITH_WAND))));
        at(t += 2, () -> select(0));
        at(t += 5, () -> {
            camera(CameraType.THIRD_PERSON_FRONT);
            look(-150f, 10f);
        });
        at(t += 10, () -> shot("shield_held"));
        at(t += 2, () -> Minecraft.getInstance().options.keyUse.setDown(true));
        at(t += 12, () -> shot("shield_blocking_front"));
        at(t += 2, () -> camera(CameraType.FIRST_PERSON));
        at(t += 8, () -> shot("shield_blocking_first_person"));
        at(t += 2, () -> Minecraft.getInstance().options.keyUse.setDown(false));

        // ---- the wand: a beam and a petrified zombie
        at(t += 5, () -> server((level, p) -> {
            p.setItemInHand(InteractionHand.OFF_HAND, ItemStack.EMPTY);
            Zombie z = EntityType.HUSK.create(level);   // a zombie that doesn't burn at noon
            z.moveTo(0.5, -60, 7.5, 180f, 0f);
            z.setNoAi(true);
            z.setYHeadRot(180f);
            level.addFreshEntity(z);
        }));
        at(t += 2, () -> look(0f, 6f));
        at(t += 10, () -> server((level, p) -> {
            var target = MonolithWandItem.target(p);
            Winterworks.LOG.info("endgearshots: wand target {}", target);
            if (target != null) {
                MonolithWandItem.fire(level, p, InteractionHand.MAIN_HAND, target);
            }
        }));
        at(t += 3, () -> shot("wand_beam"));
        at(t += 30, () -> shot("wand_petrified_zombie"));
        at(t += 2, () -> cmd("tp @s 2.5 -60 5.5 35 20"));
        at(t += 10, () -> shot("petrified_zombie_close"));
        // a petrified player: the shell from outside, the crust from inside
        at(t += 5, () -> server((level, p) -> Petrify.freeze(p, 120, false)));
        at(t += 2, () -> {
            camera(CameraType.THIRD_PERSON_FRONT);
            look(-160f, 15f);
        });
        at(t += 10, () -> shot("petrified_player"));
        // frozen: holding forward and jump does nothing
        at(t += 2, () -> {
            mark = Minecraft.getInstance().player.position();
            Minecraft.getInstance().options.keyUp.setDown(true);
            Minecraft.getInstance().options.keyJump.setDown(true);
        });
        at(t += 15, () -> {
            Minecraft.getInstance().options.keyUp.setDown(false);
            Minecraft.getInstance().options.keyJump.setDown(false);
            Winterworks.LOG.info("endgearshots: petrified player moved {} while holding forward + jump",
                    Minecraft.getInstance().player.position().distanceTo(mark));
        });
        at(t += 2, () -> camera(CameraType.FIRST_PERSON));
        at(t += 8, () -> shot("petrified_player_first_person"));
        at(t += 2, () -> server((level, p) -> p.removeEffect(EndEffects.PETRIFIED)));
        at(t += 10, () -> shot("petrify_shattered"));

        // ---- the glider alone: hang-gliding off a height, in survival (no fall damage while gliding)
        at(t += 10, () -> server((level, p) -> {
            p.setGameMode(GameType.SURVIVAL);
            p.getInventory().setItem(0, new ItemStack(EndItems.END_GLIDER));
            p.teleportTo(level, 0.5, -46, -10.5, 0f, 10f);
        }));
        at(t += 2, () -> {
            select(0);
            camera(CameraType.THIRD_PERSON_FRONT);
            look(0f, 10f);
            Minecraft.getInstance().options.keyUse.setDown(true);   // retried until the player is in the air
            logFlight = true;
        });
        at(t += 25, () -> shot("glider_hang_front"));
        at(t += 2, () -> camera(CameraType.THIRD_PERSON_BACK));
        at(t += 10, () -> shot("glider_hang_back"));
        at(t += 2, () -> camera(CameraType.FIRST_PERSON));
        at(t += 10, () -> shot("glider_hang_first_person"));
        at(t += 2, () -> look(70f, 10f));   // steer by looking
        at(t += 150, () -> {
            logFlight = false;
            Minecraft.getInstance().options.keyUse.setDown(false);
            Winterworks.LOG.info("endgearshots: landed hang-gliding (on ground {}), health {}", Minecraft.getInstance().player.onGround(),
                    Minecraft.getInstance().player.getHealth());
        });
        at(t += 30, () -> {
            Winterworks.LOG.info("endgearshots: after landing, health {}", Minecraft.getInstance().player.getHealth());
            cmd("gamemode creative");
        });

        // ---- the glider: overhead in flight, cruise then boost, speeds logged every tick
        at(t += 10, () -> server((level, p) -> {
            p.setItemSlot(EquipmentSlot.CHEST, new ItemStack(Items.ELYTRA));
            p.getInventory().setItem(0, new ItemStack(EndItems.END_GLIDER));
            p.teleportTo(level, 0.5, 60, -40.5, 0f, 0f);
        }));
        at(t += 20, () -> {
            wantFlight = true;
            look(0f, 0f);
            logFlight = true;
        });
        at(t += 30, () -> {
            camera(CameraType.THIRD_PERSON_BACK);
        });
        at(t += 6, () -> shot("glider_cruise_back"));
        at(t += 2, () -> camera(CameraType.THIRD_PERSON_FRONT));
        at(t += 6, () -> shot("glider_cruise_front"));
        at(t += 2, () -> camera(CameraType.FIRST_PERSON));
        at(t += 6, () -> shot("glider_cruise_first_person"));
        at(t += 2, () -> look(0f, -35f));   // climb
        at(t += 20, () -> look(0f, 5f));
        at(t += 2, () -> Minecraft.getInstance().options.keyUse.setDown(true));   // boost
        at(t += 30, () -> shot("glider_boost_first_person"));
        at(t += 2, () -> camera(CameraType.THIRD_PERSON_BACK));
        at(t += 6, () -> shot("glider_boost_back"));
        at(t += 2, () -> look(90f, 5f));   // a hard turn while boosting: heavy
        at(t += 15, () -> Minecraft.getInstance().options.keyUse.setDown(false));
        at(t += 25, () -> {
            logFlight = false;
            camera(CameraType.FIRST_PERSON);
        });

        // ---- Dragonlings: a baby and a saddled, armoured teen
        at(t += 5, () -> server((level, p) -> {
            p.setItemSlot(EquipmentSlot.CHEST, ItemStack.EMPTY);
            p.stopFallFlying();
            p.teleportTo(level, 0.5, -60, 16.5, 180f, 15f);
            Dragonling baby = EndEntities.DRAGONLING.create(level);
            baby.moveTo(-1.5, -60, 12.5, 160f, 0f);
            baby.tame(p);
            baby.setOrderedToSit(true);
            baby.setInSittingPose(false);
            level.addFreshEntity(baby);
            Dragonling teen = EndEntities.DRAGONLING.create(level);
            teen.moveTo(2.5, -60, 11.5, 200f, 0f);
            teen.tame(p);
            teen.growUp();
            teen.setSaddled(true);
            teen.setBodyArmorItem(new ItemStack(Items.GOLDEN_HORSE_ARMOR));
            teen.setOrderedToSit(true);
            teen.setInSittingPose(false);
            level.addFreshEntity(teen);
            Winterworks.LOG.info("endgearshots: baby {} x {}, teen {} x {}", baby.getBbWidth(), baby.getBbHeight(), teen.getBbWidth(),
                    teen.getBbHeight());
        }));
        at(t += 5, () -> Minecraft.getInstance().options.hideGui = true);
        at(t += 25, () -> shot("dragonlings"));
        at(t += 2, () -> cmd("tp @s 6.5 -59 9.5 120 20"));
        at(t += 15, () -> shot("dragonlings_side"));
        at(t += 2, () -> server((level, p) -> {
            for (Dragonling d : level.getEntitiesOfClass(Dragonling.class, p.getBoundingBox().inflate(20))) {
                if (d.isTeen()) {
                    d.setOrderedToSit(false);
                    p.startRiding(d);
                }
            }
        }));
        at(t += 5, () -> camera(CameraType.THIRD_PERSON_BACK));
        at(t += 15, () -> shot("dragonling_ridden"));
        // ridden flight: jump climbs, forward flies where the rider looks; then a breath of fire on the key
        at(t += 2, () -> {
            server((level, p) -> {
                if (p.getVehicle() instanceof Dragonling d) {
                    d.setBreath(12);
                }
            });
            mark = Minecraft.getInstance().player.position();
            logRide = true;
            Minecraft.getInstance().options.keyJump.setDown(true);
        });
        at(t += 25, () -> {
            Minecraft.getInstance().options.keyJump.setDown(false);
            look(180f, 10f);
            Minecraft.getInstance().options.keyUp.setDown(true);
        });
        at(t += 30, () -> shot("dragonling_flying"));
        at(t += 2, () -> KeyMapping.click(EndGearClient.DRAGON_BREATH.getDefaultKey()));
        at(t += 4, () -> shot("dragonling_breath"));
        at(t += 2, () -> {
            Minecraft.getInstance().options.keyUp.setDown(false);
            camera(CameraType.FIRST_PERSON);
        });
        at(t += 10, () -> shot("dragonling_breath_first_person"));
        at(t += 20, () -> logRide = false);
        at(t += 5, () -> Minecraft.getInstance().stop());
    }

    /** Schedules a step at tick `tick` of the plan; steps keep their spacing even when frames lag behind the ticks. */
    private static void at(int tick, Runnable r) {
        AT.add(tick - lastAt);
        lastAt = tick;
        PLAN.add(r);
    }

    private static void cmd(String c) {
        Minecraft.getInstance().player.connection.sendCommand(c);
    }

    private static void camera(CameraType type) {
        Minecraft.getInstance().options.setCameraType(type);
    }

    private static void look(float yaw, float pitch) {
        LocalPlayer p = Minecraft.getInstance().player;
        p.setYRot(yaw);
        p.setXRot(pitch);
        p.setYHeadRot(yaw);
        p.yRotO = yaw;
        p.xRotO = pitch;
    }

    private static void select(int slot) {
        LocalPlayer p = Minecraft.getInstance().player;
        p.getInventory().selected = slot;
        p.connection.send(new ServerboundSetCarriedItemPacket(slot));
    }

    private static void server(BiConsumer<ServerLevel, ServerPlayer> job) {
        var srv = Minecraft.getInstance().getSingleplayerServer();
        if (srv != null) {
            srv.execute(() -> {
                ServerPlayer p = srv.getPlayerList().getPlayers().get(0);
                job.accept(p.serverLevel(), p);
            });
        }
    }

    private static void shot(String name) {
        Minecraft mc = Minecraft.getInstance();
        Screenshot.grab(mc.gameDirectory, "winterworks_endgear_" + name + ".png", mc.getMainRenderTarget(), msg -> {});
        Winterworks.LOG.info("endgearshots: {}", name);
    }

    private static void tick(Minecraft mc) {
        if (!created && mc.level == null && mc.screen != null && mc.getOverlay() == null) {
            mc.options.onboardAccessibility = false;
            mc.getTutorial().setStep(net.minecraft.client.tutorial.TutorialSteps.NONE);
            created = true;
            LevelSettings settings = new LevelSettings("winterworks_endgearshots", GameType.CREATIVE, false, Difficulty.EASY,
                    true, new GameRules(), WorldDataConfiguration.DEFAULT);
            mc.createWorldOpenFlows().createFreshLevel("winterworks_endgearshots_" + System.currentTimeMillis(), settings,
                    new WorldOptions(7L, false, false),
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
        if (logFlight) {
            logFlight(mc);
        }
        if (logRide && ticks % 5 == 0 && mc.player.getVehicle() instanceof Dragonling d) {
            Winterworks.LOG.info(String.format("endgearshots ride: tick %d dragonling at %.2f %.2f %.2f onGround=%s noGravity=%s breath=%d",
                    ticks, d.getX(), d.getY(), d.getZ(), d.onGround(), d.isNoGravity(), d.getBreath()));
        }
        if (wantFlight && mc.player.isFallFlying()) {
            wantFlight = false;
        } else if (wantFlight && !mc.player.onGround() && mc.player.tryToStartFallFlying()) {
            mc.player.connection.send(new ServerboundPlayerCommandPacket(mc.player, ServerboundPlayerCommandPacket.Action.START_FALL_FLYING));
        }
        // software rendering can be slower than the ticks: every step waits its ticks and a few rendered frames
        if (step < PLAN.size() && ticks - ticksAtStep >= AT.get(step) && frames - framesAtStep >= 3) {
            PLAN.get(step++).run();
            framesAtStep = frames;
            ticksAtStep = ticks;
        }
    }

    /** Per tick: the client's speed, the server's speed and how far apart they are (smooth = steady, no snapping). */
    private static void logFlight(Minecraft mc) {
        LocalPlayer lp = mc.player;
        var srv = mc.getSingleplayerServer();
        if (srv == null || srv.getPlayerList().getPlayers().isEmpty()) {
            return;
        }
        ServerPlayer sp = srv.getPlayerList().getPlayers().get(0);
        Vec3 c = lp.position(), s = sp.position();
        double cs = lastClient == null ? 0 : c.distanceTo(lastClient), ss = lastServer == null ? 0 : s.distanceTo(lastServer);
        lastClient = c;
        lastServer = s;
        Vec3 v = lastClient == null ? Vec3.ZERO : c.subtract(lastClientBefore);
        lastClientBefore = c;
        Winterworks.LOG.info(String.format("endgearshots flight: tick %d flight=%s hang=%s boost=%s clientSpeed=%.3f horizontal=%.3f vertical=%.3f serverSpeed=%.3f gap=%.3f y=%.1f pitch=%.0f",
                ticks, EndGlider.freeFlight(lp), EndGlider.hangGliding(lp), EndGlider.boosting(lp), cs, v.horizontalDistance(), v.y, ss,
                c.distanceTo(s), c.y, lp.getXRot()));
    }
}
