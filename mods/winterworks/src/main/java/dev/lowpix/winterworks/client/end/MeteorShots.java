package dev.lowpix.winterworks.client.end;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.end.EndGen;
import dev.lowpix.winterworks.end.EndWorldgen;
import dev.lowpix.winterworks.end.FallingMeteorite;
import dev.lowpix.winterworks.end.FloatingIsland;
import dev.lowpix.winterworks.end.MeteorImpact;
import dev.lowpix.winterworks.endgear.MonolithWandItem;
import dev.lowpix.winterworks.registry.EndBlocks;
import dev.lowpix.winterworks.registry.EndItems;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents;
import net.minecraft.client.CameraType;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.protocol.game.ServerboundSetCarriedItemPacket;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.Difficulty;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.monster.EnderMan;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.chunk.status.ChunkStatus;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import net.minecraft.world.phys.Vec3;

/**
 * Dev-only screenshots of falling meteorites and the Monolith Wand (docs/END_UPDATE.md section 16): with
 * -Dwinterworks.meteorshots=true (e.g. in JAVA_TOOL_OPTIONS for ./gradlew runClient under xvfb-run) the client makes a
 * fresh normal world, goes to the End, finds flat open ground in the Dead End and, with the game frozen and stepped
 * (/tick), shoots a meteor streaking down onto it, the impact flash, the shockwave, the smoking crater from afar and up
 * close, then a meteor dropped with /winterworks meteor, and the wand in hand firing at an Enderman (first and third
 * person); saves screenshots/winterworks_meteor_*.png and quits. -Dwinterworks.meteorshots.seed=N picks the world seed.
 */
final class MeteorShots {
    private static final boolean ENABLED = Boolean.getBoolean("winterworks.meteorshots");
    private static final long SEED = Long.getLong("winterworks.meteorshots.seed", 20261122L);

    private interface Step {
        boolean tick(Minecraft mc);
    }

    private static final List<Step> PLAN = new ArrayList<>();
    private static boolean created;
    private static int step, waited, stable, frames, framesAtStep;
    private static CompletableFuture<?> job;
    private static volatile BlockPos site;
    private static volatile Vec3 eye, look, dir;
    private static volatile int meteorId = -1;
    private static volatile Vec3 wandTip = Vec3.ZERO;

    private MeteorShots() {}

    static void init() {
        if (!ENABLED) {
            return;
        }
        ClientTickEvents.END_CLIENT_TICK.register(MeteorShots::tick);
        WorldRenderEvents.LAST.register(ctx -> frames++);
        wait(40);
        add(mc -> {
            for (String c : new String[]{"gamerule doDaylightCycle false", "gamerule doWeatherCycle false", "gamerule doMobSpawning false",
                    "gamerule randomTickSpeed 0", "gamerule sendCommandFeedback false", "gamemode spectator"}) {
                cmd(c);
            }
            mc.options.hideGui = true;
            mc.options.renderDistance().set(10);
            return true;
        });
        add(mc -> {
            cmd("execute in minecraft:the_end run tp @s 0 120 0");
            return true;
        });
        wait(160);
        server(MeteorShots::findSite);
        add(mc -> {
            if (site == null) {   // nothing to shoot
                mc.stop();
            }
            return true;
        });
        // ---- a meteor streaks down across the sky onto the Dead End, seen from 40 blocks off
        view(() -> site == null ? null : new Vec3[]{eye, look});
        add(mc -> {
            cmd("tick freeze");
            return true;
        });
        wait(5);
        server(level -> {
            if (site == null) {
                return;
            }
            Vec3 target = Vec3.atBottomCenterOf(site);
            long seed = 11;
            while (!MeteorImpact.hasCore(seed)) {
                seed++;
            }
            FallingMeteorite m = FallingMeteorite.launch(level, target.add(side().scale(55)).add(dir.scale(25)).add(0, 100, 0), target, seed);
            meteorId = m.getId();
            Winterworks.LOG.info("meteorshots: meteor {} from {} to {}", m.getId(), m.position(), target);
        });
        wait(4);
        stepTicks(12);
        shot("streak_high");
        stepTicks(12);
        shot("streak_low");
        // closer and higher over the site for the crash
        view(() -> site == null ? null : new Vec3[]{centre().add(dir.scale(-30)).add(side().scale(-9)).add(0, 15, 0), centre().add(0, 5, 0)});
        add(mc -> {
            FallingMeteorite m = meteor(mc);
            if (m == null || !m.flying() || waited > 400) {
                return true;
            }
            if (m.position().y - site.getY() < 22) {
                return true;
            }
            if (waited % 4 == 0) {
                cmd("tick step 1");
            }
            waited++;
            return false;
        });
        shot("about_to_hit");
        // a tick at a time until it lands
        add(mc -> {
            FallingMeteorite m = meteor(mc);
            if (m == null || !m.flying() || waited > 400) {
                return true;
            }
            if (waited % 4 == 0) {
                cmd("tick step 1");
            }
            waited++;
            return false;
        });
        wait(3);
        shot("impact_flash");
        stepTicks(3);
        shot("impact_shockwave");
        stepTicks(2);
        add(mc -> {
            mc.options.hideGui = false;
            return true;
        });
        wait(3);
        shot("impact_screen_flash");
        add(mc -> {
            mc.options.hideGui = true;
            cmd("tick unfreeze");
            return true;
        });
        wait(70);
        shot("crater_smoking");
        server(level -> {
            if (site == null) {
                return;
            }
            int met = 0, cores = 0;
            for (BlockPos p : BlockPos.betweenClosed(site.offset(-8, -8, -8), site.offset(8, 4, 8))) {
                met += level.getBlockState(p).is(EndBlocks.METEORITE) ? 1 : 0;
                cores += level.getBlockState(p).is(EndBlocks.METEORITE_CORE) ? 1 : 0;
            }
            Winterworks.LOG.info("meteorshots: crater at {}: {} meteorite, {} core", site, met, cores);
        });
        view(() -> site == null ? null : new Vec3[]{centre().add(dir.scale(-11)).add(side().scale(4)).add(0, 7, 0), centre().add(0, -1.5, 0)});
        shot("crater_close");
        // ---- /winterworks meteor: one lands ahead
        add(mc -> {
            if (site != null) {
                Vec3 at = centre().add(side().scale(-16)).add(dir.scale(-16));
                cmd(String.format(Locale.ROOT, "tp @s %.1f %.1f %.1f facing %.1f %.1f %.1f", at.x, at.y + 3, at.z,
                        at.x + dir.x * 30, at.y + 6, at.z + dir.z * 30));
            }
            return true;
        });
        wait(60);
        add(mc -> {
            cmd("gamemode creative");
            cmd("winterworks meteor 30");
            return true;
        });
        wait(22);
        shot("command_meteor");
        wait(60);
        shot("command_meteor_landed");
        // ---- the Monolith Wand in hand, firing at an Enderman across the crater
        add(mc -> {
            cmd("gamemode creative");
            return true;
        });
        server(level -> {
            if (site == null) {
                return;
            }
            ServerPlayer p = level.getServer().getPlayerList().getPlayers().get(0);
            Vec3 at = centre().add(side().scale(16)).add(dir.scale(-7));
            int y = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, (int) Math.floor(at.x), (int) Math.floor(at.z));
            float yaw = (float) Math.toDegrees(Math.atan2(-dir.x, dir.z));
            p.getAbilities().flying = false;
            p.teleportTo(level, at.x, y, at.z, yaw, 4f);
            p.getInventory().clearContent();
            p.getInventory().setItem(0, new ItemStack(EndItems.MONOLITH_WAND));
            p.getInventory().setItem(1, new ItemStack(EndBlocks.METEORITE));
            p.getInventory().setItem(2, new ItemStack(EndBlocks.METEORITE_CORE));
            EnderMan e = EntityType.ENDERMAN.create(level);
            Vec3 ep = at.add(dir.scale(12));
            int ey = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, (int) Math.floor(ep.x), (int) Math.floor(ep.z));
            e.moveTo(ep.x, ey, ep.z, yaw + 180f, 0f);
            e.setNoAi(true);
            level.addFreshEntity(e);
        });
        add(mc -> {
            select(0);
            mc.options.hideGui = false;
            mc.options.setCameraType(CameraType.FIRST_PERSON);
            return true;
        });
        wait(40);
        add(mc -> {
            lookAtEnderman(mc);
            return true;
        });
        wait(10);
        shot("wand_held");
        fire();
        stepTicks(2);
        shot("wand_firing_first_person");
        // ---- the same in third person: from behind while it fires, then a three-quarter view from the front
        add(mc -> {
            cmd("tick unfreeze");
            mc.options.setCameraType(CameraType.THIRD_PERSON_BACK);
            return true;
        });
        wait(30);
        add(mc -> {
            lookAtEnderman(mc);
            return true;
        });
        wait(10);
        shot("wand_held_back");
        fire();
        stepTicks(2);
        shot("wand_firing_third_person");
        // ---- held in a raised hand (an invisible armour stand's), seen from the side, firing
        add(mc -> {
            cmd("tick unfreeze");
            mc.options.setCameraType(CameraType.FIRST_PERSON);
            mc.options.hideGui = true;
            cmd("gamemode spectator");
            return true;
        });
        server(level -> {
            ServerPlayer p = level.getServer().getPlayerList().getPlayers().get(0);
            Vec3 at = centre().add(side().scale(16)).add(dir.scale(-4));
            int y = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, (int) Math.floor(at.x), (int) Math.floor(at.z));
            float yaw = (float) Math.toDegrees(Math.atan2(-dir.x, dir.z));
            net.minecraft.world.entity.decoration.ArmorStand stand = EntityType.ARMOR_STAND.create(level);
            stand.moveTo(at.x, y, at.z, yaw, 0f);
            stand.setInvisible(true);
            stand.setShowArms(true);
            stand.setNoBasePlate(true);
            stand.setRightArmPose(new net.minecraft.core.Rotations(-70f, 0f, 0f));
            stand.setItemSlot(net.minecraft.world.entity.EquipmentSlot.MAINHAND, new ItemStack(EndItems.MONOLITH_WAND));
            level.addFreshEntity(stand);
            Vec3 hand = new Vec3(at.x, y + 1.45, at.z).add(side().scale(0.33)).add(dir.scale(0.45));
            Vec3 eyeAt = hand.add(side().scale(1.5)).add(dir.scale(1.0)).add(0, 0.2, 0);
            Vec3 d = hand.add(dir.scale(0.25)).subtract(eyeAt);
            p.teleportTo(level, eyeAt.x, eyeAt.y - p.getEyeHeight(), eyeAt.z, (float) Math.toDegrees(Math.atan2(-d.x, d.z)),
                    (float) -Math.toDegrees(Math.atan2(d.y, d.horizontalDistance())));
            wandTip = hand.add(dir.scale(0.32)).add(0, 0.12, 0);
        });
        wait(30);
        shot("wand_raised_side");
        add(mc -> {
            cmd("tick freeze");
            return true;
        });
        wait(3);
        server(level -> {
            ServerPlayer p = level.getServer().getPlayerList().getPlayers().get(0);
            for (EnderMan e : level.getEntitiesOfClass(EnderMan.class, p.getBoundingBox().inflate(30))) {
                Vec3 to = e.getBoundingBox().getCenter();
                dev.lowpix.winterworks.end.Petrify.freeze(e, 200, true);
                net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking.send(p,
                        new dev.lowpix.winterworks.endgear.EndGearPayloads.WandBeam(wandTip, to, false));
            }
        });
        stepTicks(2);
        shot("wand_raised_firing");
        stepTicks(3);
        shot("wand_raised_firing_late");
        add(mc -> {
            cmd("tick unfreeze");
            return true;
        });
        wait(5);
        add(mc -> {
            mc.stop();
            return true;
        });
    }

    // ------------------------------------------------------------------------------------------ the place

    private static ServerLevel end() {
        var srv = Minecraft.getInstance().getSingleplayerServer();
        return srv == null ? null : srv.getLevel(Level.END);
    }

    private static int ground(ServerLevel level, int x, int z) {
        var gen = level.getChunkSource().getGenerator();
        return gen.getBaseHeight(x, z, Heightmap.Types.WORLD_SURFACE_WG, level, level.getChunkSource().randomState());
    }

    /** Flat open Dead End ground (no island overhead, no structure near), and a viewpoint 45 blocks off it. */
    private static void findSite(ServerLevel ignored) {
        ServerLevel level = end();
        int[][] starts = {{2000, 0}, {0, 2000}, {-2000, 0}, {0, -2000}, {1600, 1600}, {-1600, 1600}, {2600, -900}, {-1600, -1600}};
        BlockPos near = null;
        for (int i = 0; i < starts.length && site == null; i++) {
            var found = level.findClosestBiome3d(b -> b.is(EndWorldgen.DEAD_END), new BlockPos(starts[i][0], 64, starts[i][1]), 3000, 32, 64);
            if (found == null) {
                continue;
            }
            near = found.getFirst();
            site = flat(level, near);
            Winterworks.LOG.info("meteorshots: Dead End at {} -> site {}", near, site);
        }
        if (site == null) {
            Winterworks.LOG.warn("meteorshots: no flat Dead End ground");
            return;
        }
        for (int cx = -3; cx <= 3; cx++) {
            for (int cz = -3; cz <= 3; cz++) {
                level.getChunk((site.getX() >> 4) + cx, (site.getZ() >> 4) + cz);
            }
        }
        int y = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, site.getX(), site.getZ());
        site = new BlockPos(site.getX(), y, site.getZ());
        Vec3 s = Vec3.atBottomCenterOf(site);
        eye = s.add(dir.scale(-34)).add(side().scale(-10)).add(0, 14, 0);
        look = s.add(side().scale(20)).add(0, 48, 0);
        Winterworks.LOG.info("meteorshots: site {} (Dead End near {}), looking along {}, eye {}", site, near, dir, eye);
    }

    /** The nearest flat, open, structure-free Dead End ground to `near` (checked on the generated blocks), or null. */
    private static BlockPos flat(ServerLevel level, BlockPos near) {
        int tries = 0;
        for (int r = 0; r <= 900 && tries < 120; r += 8) {
            for (int dx = -r; dx <= r && tries < 120; dx += 8) {
                for (int dz = -r; dz <= r && tries < 120; dz += 8) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) != r) {
                        continue;
                    }
                    int x = near.getX() + dx, z = near.getZ() + dz;
                    if (EndGen.nearMainIsland(x, z) || !level.getBiome(new BlockPos(x, 64, z)).is(EndWorldgen.DEAD_END) || !clearSky(level, x, z)) {
                        continue;
                    }
                    int h = ground(level, x, z), lo = h, hi = h;
                    boolean ok = h > 45;
                    for (int ax = -1; ax <= 1 && ok; ax++) {
                        for (int az = -1; az <= 1 && ok; az++) {
                            int hh = ground(level, x + ax * 12, z + az * 12);
                            ok = hh > 45;
                            lo = Math.min(lo, hh);
                            hi = Math.max(hi, hh);
                        }
                    }
                    if (ok && hi - lo <= 7 && clearOfStructures(level, x, z)) {
                        tries++;
                        if (levelBlocks(level, x, z)) {
                            return new BlockPos(x, h, z);
                        }
                    }
                }
            }
        }
        return null;
    }

    /**
     * On the generated blocks (rocks, pillars, formations and all): level ground within 12 blocks of (x, z), mostly level
     * out to 20, and a direction from which the shots' viewpoints see the site and the wand scene has open ground. Sets
     * `dir`; false if there's none.
     */
    private static boolean levelBlocks(ServerLevel level, int x, int z) {
        for (int cx = -3; cx <= 3; cx++) {
            for (int cz = -3; cz <= 3; cz++) {
                level.getChunk((x >> 4) + cx, (z >> 4) + cz);
            }
        }
        int base = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, x, z);
        int near = 0, nearOk = 0, far = 0, farOk = 0;
        for (int dx = -20; dx <= 20; dx += 2) {
            for (int dz = -20; dz <= 20; dz += 2) {
                int d2 = dx * dx + dz * dz;
                if (d2 > 400) {
                    continue;
                }
                int h = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, x + dx, z + dz);
                boolean ok = h >= base - 3 && h <= base + 3;
                if (d2 <= 144) {
                    near++;
                    nearOk += ok ? 1 : 0;
                } else {
                    far++;
                    farOk += ok ? 1 : 0;
                }
            }
        }
        if (nearOk < near || farOk < far * 0.8) {
            return false;
        }
        Vec3 c = new Vec3(x + 0.5, base, z + 0.5);
        for (int k = 0; k < 8; k++) {
            double a = k * Math.PI / 4;
            Vec3 d = new Vec3(Math.cos(a), 0, Math.sin(a)), sd = new Vec3(-d.z, 0, d.x);
            boolean open = clear(level, c.add(d.scale(-40)).add(0, 12, 0), c.add(0, 2, 0))
                    && clear(level, c.add(d.scale(-30)).add(sd.scale(-9)).add(0, 15, 0), c.add(0, 2, 0));
            Vec3 w0 = c.add(sd.scale(16)).add(d.scale(-7)), w1 = c.add(sd.scale(16)).add(d.scale(5));
            for (Vec3 w : new Vec3[]{w0, w1, w0.lerp(w1, 0.5)}) {
                int h = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, (int) Math.floor(w.x), (int) Math.floor(w.z));
                open &= Math.abs(h - base) <= 2;
            }
            if (open) {
                dir = d;
                Winterworks.LOG.info("meteorshots: site {} {} at {} looks along {}", x, z, base, d);
                return true;
            }
        }
        return false;
    }

    /** No block between `a` and `b` (the ground under the line stays below it). */
    private static boolean clear(ServerLevel level, Vec3 a, Vec3 b) {
        double len = a.distanceTo(b);
        for (double t = 0; t < len - 3; t += 1.0) {
            Vec3 p = a.lerp(b, t / len);
            if (level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, (int) Math.floor(p.x), (int) Math.floor(p.z)) > p.y - 0.5) {
                return false;
            }
        }
        return true;
    }

    private static Vec3 centre() {
        return Vec3.atBottomCenterOf(site);
    }

    private static Vec3 side() {
        return new Vec3(-dir.z, 0, dir.x);
    }

    private static boolean clearSky(ServerLevel level, int x, int z) {
        long seed = level.getSeed();
        for (int cx = (x >> 4) - 3; cx <= (x >> 4) + 3; cx++) {
            for (int cz = (z >> 4) - 3; cz <= (z >> 4) + 3; cz++) {
                FloatingIsland.Plan p = FloatingIsland.plan(seed, cx, cz);
                if (p != null && Math.hypot(p.x() - x, p.z() - z) < p.radius() + 18) {
                    return false;
                }
            }
        }
        return true;
    }

    private static boolean clearOfStructures(ServerLevel level, int x, int z) {
        for (int cx = (x >> 4) - 3; cx <= (x >> 4) + 3; cx++) {
            for (int cz = (z >> 4) - 3; cz <= (z >> 4) + 3; cz++) {
                if (level.getChunk(cx, cz, ChunkStatus.STRUCTURE_REFERENCES, true).hasAnyStructureReferences()) {
                    return false;
                }
            }
        }
        return true;
    }

    // ------------------------------------------------------------------------------------------ steps

    private static FallingMeteorite meteor(Minecraft mc) {
        return mc.level != null && mc.level.getEntity(meteorId) instanceof FallingMeteorite m ? m : null;
    }

    private static void lookAtEnderman(Minecraft mc) {
        var p = mc.player;
        for (var e : mc.level.entitiesForRendering()) {
            if (e instanceof EnderMan) {
                Vec3 d = e.position().add(0, 1.6, 0).subtract(p.getEyePosition());
                float yaw = (float) Math.toDegrees(Math.atan2(-d.x, d.z)), pitch = (float) -Math.toDegrees(Math.atan2(d.y, d.horizontalDistance()));
                p.setYRot(yaw);
                p.setXRot(pitch);
                p.setYHeadRot(yaw);
                p.yRotO = yaw;
                p.xRotO = pitch;
                p.yBodyRot = p.yBodyRotO = yaw;
                p.yHeadRotO = yaw;
            }
        }
    }

    /** Freezes the game and fires the wand at what the player looks at. */
    private static void fire() {
        add(mc -> {
            cmd("tick freeze");
            return true;
        });
        wait(3);
        server(level -> {
            ServerPlayer p = level.getServer().getPlayerList().getPlayers().get(0);
            p.getCooldowns().removeCooldown(EndItems.MONOLITH_WAND);
            var target = MonolithWandItem.target(p);
            Winterworks.LOG.info("meteorshots: wand target {}", target);
            if (target != null) {
                MonolithWandItem.fire(p.serverLevel(), p, InteractionHand.MAIN_HAND, target);
            }
        });
    }

    private static void stepTicks(int n) {
        add(mc -> {
            cmd("tick step " + n);
            return true;
        });
        wait(n + 2);
    }

    private static void add(Step s) {
        PLAN.add(s);
    }

    private static void wait(int ticks) {
        add(mc -> ++waited >= ticks);
    }

    private static void cmd(String c) {
        Minecraft.getInstance().player.connection.sendCommand(c);
    }

    private static void select(int slot) {
        var p = Minecraft.getInstance().player;
        p.getInventory().selected = slot;
        p.connection.send(new ServerboundSetCarriedItemPacket(slot));
    }

    /** Runs `work` on the server thread with the End and waits for it. */
    private static void server(Consumer<ServerLevel> work) {
        add(mc -> {
            if (job == null) {
                var srv = mc.getSingleplayerServer();
                if (srv == null) {
                    return true;
                }
                job = srv.submit(() -> {
                    try {
                        work.accept(end());
                    } catch (RuntimeException e) {
                        Winterworks.LOG.error("meteorshots: server job failed", e);
                    }
                });
                return false;
            }
            if (job.isDone()) {
                job = null;
                return true;
            }
            return false;
        });
    }

    /** Flies the camera to a view and waits for the world round it to load and draw. */
    private static void view(java.util.function.Supplier<Vec3[]> v) {
        Vec3[] holder = new Vec3[2];
        add(mc -> {
            Vec3[] e = v.get();
            holder[0] = e == null ? null : e[0];
            if (e != null) {
                cmd(String.format(Locale.ROOT, "tp @s %.2f %.2f %.2f facing %.2f %.2f %.2f", e[0].x, e[0].y, e[0].z, e[1].x, e[1].y, e[1].z));
            }
            return true;
        });
        add(mc -> {
            if (holder[0] == null) {
                return true;
            }
            waited++;
            stable = mc.levelRenderer.hasRenderedAllSections() ? stable + 1 : 0;
            return waited > 100 && stable > 30 || waited > 1200;
        });
    }

    private static void shot(String name) {
        add(mc -> {
            Screenshot.grab(mc.gameDirectory, "winterworks_meteor_" + name + ".png", mc.getMainRenderTarget(), msg -> {});
            Winterworks.LOG.info("meteorshots: {}", name);
            return true;
        });
    }

    private static void tick(Minecraft mc) {
        if (!created && mc.level == null && mc.screen != null && mc.getOverlay() == null) {
            mc.options.onboardAccessibility = false;
            mc.getTutorial().setStep(net.minecraft.client.tutorial.TutorialSteps.NONE);
            mc.getWindow().setWindowed(1280, 720);
            created = true;
            LevelSettings settings = new LevelSettings("winterworks_meteorshots", GameType.CREATIVE, false, Difficulty.NORMAL,
                    true, new GameRules(), WorldDataConfiguration.DEFAULT);
            mc.createWorldOpenFlows().createFreshLevel("winterworks_meteorshots_" + System.currentTimeMillis(), settings,
                    new WorldOptions(SEED, true, false),
                    reg -> reg.registryOrThrow(Registries.WORLD_PRESET).getHolderOrThrow(WorldPresets.NORMAL).value().createWorldDimensions(),
                    mc.screen);
            return;
        }
        if (mc.player == null || mc.level == null || step >= PLAN.size()) {
            return;
        }
        mc.gui.getChat().clearMessages(false);
        mc.getToasts().clear();
        // software rendering can be slower than the ticks: every step also waits for a few drawn frames
        if (frames - framesAtStep < 3) {
            return;
        }
        if (PLAN.get(step).tick(mc)) {
            step++;
            waited = 0;
            stable = 0;
            framesAtStep = frames;
        }
    }
}
