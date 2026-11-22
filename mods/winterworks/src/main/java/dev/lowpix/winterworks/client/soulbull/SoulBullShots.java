package dev.lowpix.winterworks.client.soulbull;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.soulbull.SoulBull;
import dev.lowpix.winterworks.soulbull.SoulBullSkullBlock;
import dev.lowpix.winterworks.soulbull.SoulBullSkullBlockEntity;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents;
import net.minecraft.client.CameraType;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.RandomSource;
import net.minecraft.world.Difficulty;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.monster.WitherSkeleton;
import net.minecraft.world.entity.monster.ZombifiedPiglin;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Dev-only screenshots of the Soul Bull: with -Dwinterworks.soulbullshots=true (e.g. in JAVA_TOOL_OPTIONS for
 * ./gradlew runClient under xvfb-run) the client makes a world, builds a soul sand valley room in the Nether, and shoots
 * a herd with an armoured Wither Skeleton jockey, a drain, a wild ram and pin, the skull ritual (lit, the heap, the
 * revive), riding with the soul bar, a charged ram from the saddle, and the bull's inventory; it saves
 * screenshots/winterworks_soulbull_*.png and quits. A shot freezes the game ticks (/tick freeze) and waits for the
 * chunks and a few fresh frames, so a slow software-GL client shoots the moment it was asked for.
 */
final class SoulBullShots {
    private static final boolean ENABLED = Boolean.getBoolean("winterworks.soulbullshots");
    private static final List<Runnable> PLAN = new ArrayList<>();
    private static final List<Integer> AT = new ArrayList<>();
    /** The room: floor blocks at y=89 (stand at y=90), x and z within +-20, ceiling at 111. */
    private static final int FLOOR = 89, R = 20, TOP = 111;
    private static final BlockPos SKULL = new BlockPos(-10, 90, -9);
    private static boolean created;
    private static int ticks, step, frames;
    @org.jetbrains.annotations.Nullable
    private static String pending;
    private static boolean pendingFrozen;
    private static int pendingFrame, pendingWait;
    private static SoulBull herdA, jockey, rammer, ridden;
    private static Mob victim;

    private SoulBullShots() {}

    static void init() {
        if (!ENABLED) {
            return;
        }
        ClientTickEvents.END_CLIENT_TICK.register(SoulBullShots::tick);
        WorldRenderEvents.END.register(ctx -> frames++);
        int t = 40;
        at(t, () -> {
            Minecraft mc = Minecraft.getInstance();
            mc.options.hideGui = true;
            mc.options.renderDistance().set(6);
            mc.options.simulationDistance().set(6);
            mc.options.gamma().set(1.0);
            for (String c : new String[]{"gamerule doDaylightCycle false", "gamerule doMobSpawning false", "gamerule doFireTick false",
                    "gamerule commandModificationBlockLimit 500000", "gamerule sendCommandFeedback false", "difficulty normal",
                    "gamemode spectator", "execute in minecraft:the_nether run tp @s 0.5 95 0.5"}) {
                cmd(c);
            }
        });
        at(t += 80, () -> nether(SoulBullShots::buildRoom));
        at(t += 20, () -> cmd("fillbiome -24 80 -24 24 120 24 minecraft:soul_sand_valley"));
        // 1. the herd: two bulls and an armoured Wither Skeleton jockey, then one drinks a soul lantern dry
        at(t += 20, () -> nether(level -> {
            herdA = bull(level, -3.5, 7.5, 150f);
            bull(level, 1.5, 11.0, 195f);
            jockey = bull(level, 5.0, 5.5, 220f);
            jockey.setArmored(true);
            jockey.setHealth(jockey.getMaxHealth());
            WitherSkeleton ws = EntityType.WITHER_SKELETON.create(level);
            ws.moveTo(jockey.getX(), jockey.getY(), jockey.getZ(), 220f, 0f);
            ws.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.STONE_SWORD));
            ws.setNoAi(true);
            level.addFreshEntity(ws);
            ws.startRiding(jockey, true);
        }));
        at(t += 10, () -> tpFacing(new Vec3(1.2, 92.5, 0.2), new Vec3(1.2, 90.8, 7.5)));
        at(t += 40, () -> shot("valley_herd"));
        at(t += 2, () -> tpFacing(new Vec3(8.4, 92.0, 8.2), new Vec3(5.0, 91.2, 5.5)));
        at(t += 10, () -> shot("armored_jockey"));
        at(t += 2, () -> nether(level -> {
            level.setBlockAndUpdate(new BlockPos(-6, 90, 10), Blocks.SOUL_LANTERN.defaultBlockState());
            herdA.setHealth(14f);   // hurt: it drinks the nearest soul source dry
        }));
        at(t += 2, () -> tpFacing(new Vec3(-0.8, 92.3, 5.0), new Vec3(-5.0, 90.9, 8.8)));
        at(t += 24, () -> shot("drain"));
        // 2. a wild ram: the charge, then a Zombified Piglin caught on the horns
        at(t += 30, () -> nether(level -> {
            rammer = bull(level, 12.5, -13.5, 0f);
            rammer.setNoAi(false);
            ZombifiedPiglin z = EntityType.ZOMBIFIED_PIGLIN.create(level);
            z.moveTo(12.5, 90, -8.0, 180f, 0f);
            z.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.GOLDEN_SWORD));
            z.setNoAi(true);
            level.addFreshEntity(z);
            victim = z;
        }));
        at(t += 2, () -> tpFacing(new Vec3(8.0, 92.0, -11.0), new Vec3(12.5, 90.9, -9.6)));
        at(t += 20, () -> shot("ram_ready"));
        at(t += 2, () -> nether(level -> rammer.startRam(1f, new Vec3(0, 0, 1))));
        at(t += 8, () -> shot("ram_lunge"));
        at(t += 10, () -> shot("ram_pin"));
        at(t += 12, () -> shot("ram_pin_held"));
        at(t += 1, SoulBullShots::log);
        at(t += 40, () -> nether(level -> {
            rammer.discard();
            if (victim != null) {
                victim.discard();
            }
        }));
        // 3. the skull ritual: lit by soul fire on all four sides, the heap of Wither Bones, the revive
        at(t += 4, () -> nether(level -> {
            level.setBlockAndUpdate(SKULL.below(), Blocks.SOUL_SAND.defaultBlockState());
            level.setBlockAndUpdate(SKULL, WWBlocks.SOUL_BULL_SKULL.defaultBlockState().setValue(SoulBullSkullBlock.FACING, Direction.SOUTH));
        }));
        at(t += 1, () -> particles(net.minecraft.client.ParticleStatus.MINIMAL));
        at(t += 2, () -> tpFacing(new Vec3(-10.3, 91.3, -7.3), new Vec3(-10.0, 90.15, -9.0)));
        at(t += 20, () -> shot("skull_cold"));
        at(t += 2, () -> nether(level -> {
            for (Direction d : Direction.Plane.HORIZONTAL) {
                level.setBlockAndUpdate(SKULL.relative(d).below(), Blocks.SOUL_SAND.defaultBlockState());
                level.setBlockAndUpdate(SKULL.relative(d), Blocks.SOUL_FIRE.defaultBlockState());
            }
        }));
        at(t += 2, () -> tpFacing(new Vec3(-10.4, 92.2, -6.9), new Vec3(-10.0, 90.1, -9.0)));
        at(t += 30, () -> shot("ritual_lit"));
        at(t += 2, () -> nether(level -> {
            if (level.getBlockEntity(SKULL) instanceof SoulBullSkullBlockEntity be) {
                ServerPlayer sp = player(level);
                int need = be.rollNeeded(level.random);
                for (int i = 0; i < need / 2; i++) {
                    be.addBone(level, sp);
                }
            }
        }));
        at(t += 2, () -> tpFacing(new Vec3(-11.6, 93.0, -6.6), new Vec3(-10.0, 90.0, -9.2)));
        at(t += 20, () -> shot("ritual_heap"));
        at(t += 2, () -> nether(level -> {
            ServerPlayer sp = player(level);
            while (level.getBlockEntity(SKULL) instanceof SoulBullSkullBlockEntity b && b.bones() < b.needed() - 1) {
                b.addBone(level, sp);
            }
        }));
        at(t += 20, () -> shot("ritual_heap_full"));
        at(t += 2, () -> nether(level -> {
            if (level.getBlockEntity(SKULL) instanceof SoulBullSkullBlockEntity be) {
                be.addBone(level, player(level));
                ridden = level.getEntitiesOfClass(SoulBull.class, new AABB(SKULL).inflate(2)).stream().findFirst().orElse(null);
            }
        }));
        at(t += 1, () -> tpFacing(new Vec3(-12.6, 92.7, -5.0), new Vec3(-10.0, 90.4, -9.4)));
        at(t += 5, () -> shot("revive_1"));
        at(t += 10, () -> shot("revive_2"));
        at(t += 8, () -> shot("revive_3"));
        at(t += 10, () -> shot("revive_4"));
        at(t += 30, () -> shot("revived"));
        at(t += 1, () -> particles(net.minecraft.client.ParticleStatus.ALL));
        // 4. riding with the soul bar; a charged ram from the saddle
        at(t += 4, () -> nether(level -> {
            if (ridden == null) {
                ridden = bull(level, 10.5, -15.5, 0f);
            }
            ServerPlayer sp = player(level);
            ridden.setNoAi(true);   // no strolling off the lane before the rider gets on (the rider steers it all the same)
            ridden.tame(sp);
            ridden.equipSaddle(new ItemStack(Items.SADDLE), null);
            ridden.setBodyArmorItem(new ItemStack(Items.DIAMOND_HORSE_ARMOR));
            ridden.setHealth(ridden.getMaxHealth() * 0.8f);
            ridden.moveTo(10.5, 90, -15.5, 0f, 0f);
            ridden.setYBodyRot(0f);
            ridden.setYHeadRot(0f);
            ZombifiedPiglin z = EntityType.ZOMBIFIED_PIGLIN.create(level);
            z.moveTo(10.5, 90, -6.5, 180f, 0f);
            z.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.GOLDEN_SWORD));
            z.setNoAi(true);
            level.addFreshEntity(z);
            victim = z;
        }));
        at(t += 4, () -> {
            cmd("gamemode creative");
            cmd("tp @s 10.5 90 -17.5 0 10");
            cmd("clear @s");
            cmd("give @s winterworks:soul_bull_skull");
            cmd("give @s winterworks:soul_bull_spawn_egg");
            cmd("give @s winterworks:wither_bone 12");
            cmd("give @s minecraft:soul_lantern 8");
            cmd("give @s winterworks:elixir_bottle 4");
            cmd("give @s minecraft:saddle");
        });
        at(t += 30, () -> nether(level -> player(level).startRiding(ridden, true)));
        at(t += 20, () -> {
            Minecraft mc = Minecraft.getInstance();
            mc.options.hideGui = false;
            mc.options.setCameraType(CameraType.THIRD_PERSON_BACK);
            mc.player.setYRot(0f);
            mc.player.setXRot(38f);
            mc.player.getInventory().selected = 0;
        });
        at(t += 80, () -> shot("riding"));   // after "Press shift to dismount" has faded
        at(t += 2, () -> {
            Minecraft mc = Minecraft.getInstance();
            mc.options.setCameraType(CameraType.THIRD_PERSON_FRONT);
            mc.player.setXRot(20f);
        });
        at(t += 10, () -> shot("riding_front"));
        at(t += 2, () -> {
            Minecraft mc = Minecraft.getInstance();
            mc.options.setCameraType(CameraType.THIRD_PERSON_BACK);
            mc.player.setYRot(0f);
            mc.player.setXRot(20f);
        });
        at(t += 20, () -> Minecraft.getInstance().options.keyJump.setDown(true));
        at(t += 8, () -> shot("riding_charge", false));
        at(t += 1, () -> Minecraft.getInstance().options.keyJump.setDown(false));
        at(t += 7, () -> shot("riding_ram", false));
        at(t += 6, () -> {
            Minecraft mc = Minecraft.getInstance();
            mc.options.setCameraType(CameraType.THIRD_PERSON_FRONT);
            mc.player.setXRot(15f);
            log();
        });
        at(t += 4, () -> shot("riding_pin", false));
        at(t += 1, SoulBullShots::log);
        at(t += 40, () -> {
            Minecraft mc = Minecraft.getInstance();
            mc.options.setCameraType(CameraType.FIRST_PERSON);
            mc.player.setXRot(30f);
        });
        at(t += 10, () -> shot("riding_first_person"));
        at(t += 2, () -> nether(level -> {
            ServerPlayer sp = player(level);
            sp.stopRiding();
            ridden.openCustomInventoryScreen(sp);
        }));
        at(t += 20, () -> shot("inventory"));
        at(t += 5, () -> Minecraft.getInstance().stop());
    }

    private static void particles(net.minecraft.client.ParticleStatus status) {
        Minecraft mc = Minecraft.getInstance();
        mc.options.particles().set(status);
        mc.particleEngine.setLevel(mc.level);   // clears them
    }

    private static void log() {
        nether(level -> {
            for (SoulBull b : level.getEntitiesOfClass(SoulBull.class, new AABB(-R, FLOOR, -R, R, TOP, R))) {
                Winterworks.LOG.info("soulbullshots: bull {} at {} yaw {} body {} mode {} pinned {} hp {}", b.getId(), b.position(),
                        b.getYRot(), b.yBodyRot, b.mode(), b.pinned() == null ? "-" : b.pinned().position(), b.getHealth());
            }
        });
    }

    private static SoulBull bull(ServerLevel level, double x, double z, float yaw) {
        SoulBull b = WWEntities.SOUL_BULL.create(level);
        b.moveTo(x, 90, z, yaw, 0f);
        b.setYHeadRot(yaw);
        b.setYBodyRot(yaw);
        b.setNoAi(true);
        b.setPersistenceRequired();
        level.addFreshEntity(b);
        return b;
    }

    /** A soul sand valley room: soul sand and soil underfoot, basalt walls and pillars, bone fossils and soul fire. */
    private static void buildRoom(ServerLevel level) {
        RandomSource r = RandomSource.create(42L);
        BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos();
        for (int x = -R - 2; x <= R + 2; x++) {
            for (int z = -R - 2; z <= R + 2; z++) {
                for (int y = FLOOR - 3; y <= TOP + 1; y++) {
                    p.set(x, y, z);
                    BlockState s;
                    boolean wall = Math.abs(x) > R || Math.abs(z) > R;
                    if (y <= FLOOR) {
                        s = y < FLOOR ? Blocks.SOUL_SOIL.defaultBlockState()
                                : (r.nextFloat() < 0.62f ? Blocks.SOUL_SAND : Blocks.SOUL_SOIL).defaultBlockState();
                    } else if (y >= TOP) {
                        s = (r.nextFloat() < 0.7f ? Blocks.BASALT : Blocks.BLACKSTONE).defaultBlockState();
                    } else if (wall) {
                        s = (r.nextFloat() < 0.55f ? Blocks.BASALT : Blocks.SOUL_SOIL).defaultBlockState();
                    } else {
                        s = Blocks.AIR.defaultBlockState();
                    }
                    level.setBlock(p, s, 2 | 16);
                }
            }
        }
        int[][] pillars = {{-15, 12, 21}, {16, -18, 8}, {-17, -17, 21}, {14, 15, 6}, {-8, 17, 4}, {18, 2, 12}};
        for (int[] c : pillars) {
            for (int y = FLOOR + 1; y < FLOOR + 1 + c[2]; y++) {
                for (int dx = 0; dx <= 1; dx++) {
                    for (int dz = 0; dz <= 1; dz++) {
                        if (y > FLOOR + c[2] - 3 && (dx + dz) % 2 == 1) {
                            continue;
                        }
                        level.setBlock(p.set(c[0] + dx, y, c[1] + dz), Blocks.BASALT.defaultBlockState(), 2 | 16);
                    }
                }
            }
        }
        for (int i = 0; i < 4; i++) {   // a fossil: bone-block ribs arching out of the soul sand
            int z = 13 + i * 2;
            for (int k = 0; k <= 3; k++) {
                int y = FLOOR + 1 + (k < 3 ? k : 2);
                int x = -12 + (k == 3 ? 1 : 0);
                level.setBlock(p.set(x, y, z), Blocks.BONE_BLOCK.defaultBlockState().setValue(RotatedPillarBlock.AXIS,
                        k == 3 ? Direction.Axis.X : Direction.Axis.Y), 2 | 16);
            }
        }
        int[][] fires = {{-7, 14}, {8, 14}, {-2, 16}, {6, 17}, {-14, 4}, {16, -4}, {-3, -17}, {13, 9}, {-17, -4}};
        for (int[] f : fires) {
            level.setBlock(p.set(f[0], FLOOR, f[1]), Blocks.SOUL_SOIL.defaultBlockState(), 2 | 16);
            level.setBlock(p.set(f[0], FLOOR + 1, f[1]), Blocks.SOUL_FIRE.defaultBlockState(), 2 | 16);
        }
        level.setBlock(p.set(-16, FLOOR + 1, 11), Blocks.SOUL_LANTERN.defaultBlockState(), 2 | 16);
        level.setBlock(p.set(17, FLOOR + 1, -17), Blocks.SOUL_LANTERN.defaultBlockState(), 2 | 16);
    }

    private static void tpFacing(Vec3 from, Vec3 to) {
        cmd(String.format(Locale.ROOT, "tp @s %.2f %.2f %.2f facing %.2f %.2f %.2f", from.x, from.y, from.z, to.x, to.y, to.z));
    }

    private static ServerPlayer player(ServerLevel level) {
        return level.getServer().getPlayerList().getPlayers().get(0);
    }

    private static void at(int tick, Runnable r) {
        AT.add(tick);
        PLAN.add(r);
    }

    private static void cmd(String c) {
        Minecraft.getInstance().player.connection.sendCommand(c);
    }

    private static void nether(Consumer<ServerLevel> job) {
        var srv = Minecraft.getInstance().getSingleplayerServer();
        if (srv != null) {
            srv.execute(() -> {
                try {
                    job.accept(srv.getLevel(Level.NETHER));
                } catch (RuntimeException e) {
                    Winterworks.LOG.error("soulbullshots: a step failed", e);
                }
            });
        }
    }

    private static void shot(String name) {
        shot(name, true);
    }

    /** Asks for a shot: the plan waits until it is taken. `freeze` stops the game ticks meanwhile. */
    private static void shot(String name, boolean freeze) {
        pending = name;
        pendingFrozen = freeze;
        pendingFrame = frames;
        pendingWait = 0;
        if (freeze) {
            cmd("tick freeze");
        }
    }

    private static void takePending(Minecraft mc) {
        pendingWait++;
        boolean chunks = mc.levelRenderer.hasRenderedAllSections();
        boolean ready = pendingFrozen ? chunks && frames - pendingFrame >= 4 && pendingWait >= 3 : frames - pendingFrame >= 1;
        if (!ready && pendingWait < 600) {
            return;
        }
        Screenshot.grab(mc.gameDirectory, "winterworks_soulbull_" + pending + ".png", mc.getMainRenderTarget(), msg -> {});
        Winterworks.LOG.info("soulbullshots: {} ({} fps, waited {} ticks)", pending, mc.getFps(), pendingWait);
        if (pendingFrozen) {
            cmd("tick unfreeze");
        }
        pending = null;
    }

    private static void tick(Minecraft mc) {
        if (!created && mc.level == null && mc.screen != null && mc.getOverlay() == null) {
            mc.options.onboardAccessibility = false;
            mc.getTutorial().setStep(net.minecraft.client.tutorial.TutorialSteps.NONE);
            created = true;
            try {
                mc.getWindow().setWindowed(1280, 720);
            } catch (RuntimeException e) {
                Winterworks.LOG.warn("soulbullshots: can't resize the window", e);
            }
            LevelSettings settings = new LevelSettings("winterworks_soulbullshots", GameType.CREATIVE, false, Difficulty.NORMAL,
                    true, new GameRules(), WorldDataConfiguration.DEFAULT);
            mc.createWorldOpenFlows().createFreshLevel("winterworks_soulbullshots_" + System.currentTimeMillis(), settings,
                    new WorldOptions(11L, false, false),
                    reg -> reg.registryOrThrow(Registries.WORLD_PRESET).getHolderOrThrow(WorldPresets.FLAT).value().createWorldDimensions(),
                    mc.screen);
            return;
        }
        if (mc.player == null || mc.level == null || step >= PLAN.size()) {
            return;
        }
        mc.gui.getChat().clearMessages(false);
        mc.getToasts().clear();
        if (pending != null) {
            takePending(mc);
            return;
        }
        ticks++;
        while (pending == null && step < PLAN.size() && ticks >= AT.get(step)) {
            PLAN.get(step++).run();
        }
    }
}
