package dev.lowpix.winterworks.client.end;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.end.EndGen;
import dev.lowpix.winterworks.end.EndStructure;
import dev.lowpix.winterworks.end.EndWorldFeature;
import dev.lowpix.winterworks.end.EndWorldgen;
import dev.lowpix.winterworks.end.EndWriter;
import dev.lowpix.winterworks.end.FloatingIsland;
import dev.lowpix.winterworks.end.Meteorite;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.core.BlockPos;
import net.minecraft.core.HolderSet;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.Difficulty;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.RandomState;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import net.minecraft.world.phys.Vec3;

/**
 * Dev-only screenshots of the Living End's world: with -Dwinterworks.endshots=true (e.g. in JAVA_TOOL_OPTIONS for
 * ./gradlew runClient under xvfb-run) the client makes a fresh normal world, goes to the End, finds Chorus Meadows
 * and the Dead End with findClosestBiome3d, flies a spectator camera over them, a floating island, a meteorite and
 * each structure (built with /winterworks endstructure), saves screenshots/winterworks_end_*.png and quits.
 * -Dwinterworks.endshots.seed=N picks the world seed.
 */
final class EndShots {
    private static final boolean ENABLED = Boolean.getBoolean("winterworks.endshots");
    private static final long SEED = Long.getLong("winterworks.endshots.seed", 20261122L);

    /** A step: called every client tick until it returns true. */
    private interface Step {
        boolean tick(Minecraft mc);
    }

    private static final List<Step> PLAN = new ArrayList<>();
    private static boolean created;
    private static int step, waited;
    private static CompletableFuture<?> job;
    private static int stable;

    // found on the server, used by later steps
    private static volatile BlockPos meadows, deadEnd, island, pillar, formation, crater, ruins, shrine, tower, natural;
    private static volatile BlockPos ruinsSpot, shrineSpot, towerSpot, craterSpot;
    private static volatile int islandRadius;
    private static volatile double meadowsDir, deadEndDir;
    private static volatile Vec3 eye, look;

    private EndShots() {}

    static void init() {
        if (!ENABLED) {
            return;
        }
        ClientTickEvents.END_CLIENT_TICK.register(EndShots::tick);
        // ... and stand-in (invisible) renderers for the End's mobs: the mobs' and bosses' own client code, registered
        // after this, replaces them
        for (var type : java.util.List.of(dev.lowpix.winterworks.registry.EndEntities.MONOLITH, dev.lowpix.winterworks.registry.EndEntities.OBOLISK,
                dev.lowpix.winterworks.registry.EndEntities.ENDLING, dev.lowpix.winterworks.registry.EndEntities.ENDERFLY,
                dev.lowpix.winterworks.registry.EndEntities.GUCKER, dev.lowpix.winterworks.registry.EndEntities.DRAGONLING)) {
            net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry.register(type,
                    net.minecraft.client.renderer.entity.NoopRenderer::new);
        }
        wait(40);
        add(mc -> {
            for (String c : new String[]{"gamerule doDaylightCycle false", "gamerule doWeatherCycle false", "gamerule doMobSpawning false",
                    "gamerule randomTickSpeed 0", "gamerule sendCommandFeedback false", "gamemode spectator"}) {
                cmd(c);
            }
            mc.options.hideGui = true;
            return true;
        });
        add(mc -> {
            cmd("execute in minecraft:the_end run tp @s 0 120 0");
            return true;
        });
        wait(200);
        server(EndShots::findPlaces);
        // ---- Chorus Meadows
        view(() -> meadows == null ? null : vista(meadows, meadowsDir, 15));
        shot("chorus_meadows");
        view(() -> formation == null ? null : over(formation, 16, 10, 20, 0, 5, 0));
        shot("chorus_meadows_formation");
        view(() -> meadows == null ? null : over(meadows, 10, 4, 14, -6, 6, -4));
        shot("chorus_meadows_grove");
        // ---- a floating island, from the side
        view(() -> island == null ? null : new Vec3[]{Vec3.atCenterOf(island).add(-(islandRadius + 16), -2, -(islandRadius + 9)),
                Vec3.atCenterOf(island).add(0, -4, 0)});
        shot("floating_island");
        // ---- the Dead End
        view(() -> deadEnd == null ? null : vista(deadEnd, deadEndDir, 14));
        shot("dead_end");
        view(() -> pillar == null ? null : over(pillar, -26, 22, -19, 0, 22, 0));
        shot("dead_end_pillar");
        // ---- a meteorite, built on the Dead End ground
        server(level -> {
            if (craterSpot == null) {
                return;
            }
            BlockPos at = craterSpot;
            level.getChunk(at);
            int y = ground(level, at.getX(), at.getZ());
            crater = Meteorite.crater(EndWriter.unclipped(level), at.getX(), y, at.getZ(), 77L);
        });
        view(() -> crater == null ? null : over(crater, 9, 13, 8, 0, 0, 0));
        shot("meteorite");
        // ---- the structures, built in front of the camera with the dev command
        build(EndStructure.Kind.OBSIDIAN_RUINS, () -> ruinsSpot, p -> ruins = p);
        view(() -> ruins == null ? null : over(ruins, 12, 11, 17, 0, 0, -1));
        shot("obsidian_ruins");
        build(EndStructure.Kind.END_SHRINE, () -> shrineSpot, p -> shrine = p);
        view(() -> shrine == null ? null : over(shrine, 19, 9, 17, 0, 3, 0));
        shot("end_shrine");
        view(() -> shrine == null ? null : over(shrine, 3, 4, 4, 0, 2, 0));
        shot("end_shrine_inside");
        build(EndStructure.Kind.MONOLITH_TOWER, () -> towerSpot, p -> tower = p);
        view(() -> tower == null ? null : over(tower, 50, 38, 56, 0, 34, 0));
        shot("monolith_tower");
        view(() -> tower == null ? null : over(tower, 12, 75, 15, 0, 65, 0));
        shot("monolith_arena");
        view(() -> tower == null ? null : over(tower, -4, 10, -2, 3, 20, 1));
        shot("monolith_stairs");
        // ---- a natural Obsidian Ruin
        server(level -> {
            if (deadEnd == null) {
                return;
            }
            var reg = level.registryAccess().registryOrThrow(Registries.STRUCTURE);
            var found = level.getChunkSource().getGenerator().findNearestMapStructure(level,
                    HolderSet.direct(reg.getHolderOrThrow(EndWorldgen.OBSIDIAN_RUINS)), deadEnd, 60, false);
            natural = found == null ? null : found.getFirst();
            Winterworks.LOG.info("endshots: nearest natural obsidian ruins {}", natural);
        });
        add(mc -> {
            if (natural != null) {
                cmd(String.format(Locale.ROOT, "tp @s %d 110 %d", natural.getX(), natural.getZ()));
            }
            return true;
        });
        wait(300);
        server(level -> {
            if (natural == null) {
                return;
            }
            level.getChunk(natural);
            int y = ground(level, natural.getX(), natural.getZ());
            natural = natural.atY(y);
        });
        view(() -> natural == null ? null : over(natural, 17, 14, 19, 0, 0, 0));
        shot("obsidian_ruins_natural");
        add(mc -> {
            mc.stop();
            return true;
        });
    }

    // ------------------------------------------------------------------------------------------ finding places

    private static ServerLevel end() {
        var srv = Minecraft.getInstance().getSingleplayerServer();
        return srv == null ? null : srv.getLevel(Level.END);
    }

    /** The air block over the generated ground at (x, z), by the terrain noise. */
    private static int ground(ServerLevel level, int x, int z) {
        ChunkGenerator gen = level.getChunkSource().getGenerator();
        RandomState rs = level.getChunkSource().randomState();
        return gen.getBaseHeight(x, z, Heightmap.Types.WORLD_SURFACE_WG, level, rs);
    }

    /** A spot well inside the biome on wide solid ground, scoring the nearby columns; or null. */
    private static BlockPos goodSpot(ServerLevel level, BlockPos from, ResourceKey<Biome> biome, java.util.function.ToDoubleBiFunction<Integer, Integer> bonus) {
        BlockPos best = null;
        double bestScore = -1e9;
        for (int dx = -800; dx <= 800; dx += 32) {
            for (int dz = -800; dz <= 800; dz += 32) {
                int x = from.getX() + dx, z = from.getZ() + dz;
                if (EndGen.nearMainIsland(x, z) || !level.getBiome(new BlockPos(x, 64, z)).is(biome)) {
                    continue;
                }
                int solid = 0, h = ground(level, x, z), spread = 0;
                for (int k = 0; k < 8; k++) {
                    double a = k * Math.PI / 4;
                    int hx = x + (int) (Math.cos(a) * 40), hz = z + (int) (Math.sin(a) * 40);
                    int hh = ground(level, hx, hz);
                    if (hh > 40 && level.getBiome(new BlockPos(hx, 64, hz)).is(biome)) {
                        solid++;
                        spread += Math.abs(hh - h);
                    }
                }
                if (h < 45 || solid < 6) {
                    continue;
                }
                double score = solid * 10 - spread * 0.5 - Math.hypot(dx, dz) * 0.01 + bonus.applyAsDouble(x, z);
                if (score > bestScore) {
                    bestScore = score;
                    best = new BlockPos(x, h, z);
                }
            }
        }
        return best;
    }

    private static void findPlaces(ServerLevel ignored) {
        ServerLevel level = end();
        if (level == null) {
            return;
        }
        long seed = level.getSeed();
        EndGen.Noises n = EndGen.noises(seed);
        var m = level.findClosestBiome3d(b -> b.is(EndWorldgen.CHORUS_MEADOWS), new BlockPos(1200, 64, 0), 6400, 32, 64);
        var d = level.findClosestBiome3d(b -> b.is(EndWorldgen.DEAD_END), new BlockPos(1200, 64, 0), 6400, 32, 64);
        Winterworks.LOG.info("endshots: closest chorus meadows {}, dead end {}", m == null ? null : m.getFirst(), d == null ? null : d.getFirst());
        if (m != null) {   // a grove: where the chorus-tree noise is high
            meadows = goodSpot(level, m.getFirst(), EndWorldgen.CHORUS_MEADOWS, (x, z) -> n.patch(x + 1234, z - 4321, 0.018) * 40);
        }
        if (d != null) {
            deadEnd = goodSpot(level, d.getFirst(), EndWorldgen.DEAD_END, (x, z) -> 0);
        }
        // try further out, round the End, if the nearest patch is all edges
        int[][] starts = {{0, 1400}, {-1400, 0}, {0, -1400}, {2000, 0}, {1600, 1600}, {-1600, -1600}, {2600, -800}};
        for (int i = 0; deadEnd == null && i < starts.length; i++) {
            var dd = level.findClosestBiome3d(b -> b.is(EndWorldgen.DEAD_END), new BlockPos(starts[i][0], 64, starts[i][1]), 3000, 32, 64);
            if (dd != null) {
                deadEnd = goodSpot(level, dd.getFirst(), EndWorldgen.DEAD_END, (x, z) -> 0);
                Winterworks.LOG.info("endshots: dead end try {} -> {}", dd.getFirst(), deadEnd);
            }
        }
        meadowsDir = landward(level, meadows);
        deadEndDir = landward(level, deadEnd);
        Winterworks.LOG.info("endshots: meadows at {}, dead end at {}", meadows, deadEnd);
        // the biggest floating island near the meadows (or the Dead End)
        BlockPos base = meadows != null ? meadows : deadEnd;
        if (base != null) {
            int best = 0;
            for (int cx = (base.getX() >> 4) - 16; cx <= (base.getX() >> 4) + 16; cx++) {
                for (int cz = (base.getZ() >> 4) - 16; cz <= (base.getZ() >> 4) + 16; cz++) {
                    FloatingIsland.Plan p = FloatingIsland.plan(seed, cx, cz);
                    if (p != null && p.radius() > best && p.y() > 95 && EndGen.style(level, new BlockPos(p.x(), 64, p.z())) != null) {
                        boolean yields = false;
                        for (int ax = -1; ax <= 1; ax++) {
                            for (int az = -1; az <= 1; az++) {
                                FloatingIsland.Plan o = (ax | az) == 0 ? null : FloatingIsland.plan(seed, cx + ax, cz + az);
                                yields |= o != null && Math.hypot(o.x() - p.x(), o.z() - p.z()) < o.radius() + p.radius() + 3;
                            }
                        }
                        if (!yields) {
                            best = p.radius();
                            island = new BlockPos(p.x(), p.y(), p.z());
                            islandRadius = p.radius();
                        }
                    }
                }
            }
        }
        // a pillar chunk in the Dead End, and a formation chunk in the meadows (the features' own rolls)
        pillar = rolled(level, deadEnd, 1, 0.12f, EndWorldgen.DEAD_END);
        formation = rolled(level, meadows, 4, 0.085f, EndWorldgen.CHORUS_MEADOWS);
        // flat building sites near them, clear of each other
        shrineSpot = flatSpot(level, meadows == null ? null : meadows.offset(70, 0, 40), EndWorldgen.CHORUS_MEADOWS, null, true);
        ruinsSpot = flatSpot(level, deadEnd == null ? null : deadEnd.offset(-50, 0, 40), EndWorldgen.DEAD_END, null, true);
        towerSpot = flatSpot(level, deadEnd == null ? null : deadEnd.offset(60, 0, 80), EndWorldgen.DEAD_END, ruinsSpot, true);
        craterSpot = flatSpot(level, deadEnd == null ? null : deadEnd.offset(20, 0, -20), EndWorldgen.DEAD_END, null, false);
        Winterworks.LOG.info("endshots: island {} r{}, pillar {}, formation {}, sites: shrine {} ruins {} tower {} crater {}", island,
                islandRadius, pillar, formation, shrineSpot, ruinsSpot, towerSpot, craterSpot);
    }

    /** The nearest spot to `near` in the biome where the ground 14 blocks round is solid and nearly level. */
    private static BlockPos flatSpot(ServerLevel level, BlockPos near, ResourceKey<Biome> biome, BlockPos avoid, boolean clearSky) {
        if (near == null) {
            return null;
        }
        for (int r = 0; r <= 240; r += 8) {
            for (int dx = -r; dx <= r; dx += 8) {
                for (int dz = -r; dz <= r; dz += 8) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) != r) {
                        continue;
                    }
                    int x = near.getX() + dx, z = near.getZ() + dz;
                    if (avoid != null && Math.hypot(x - avoid.getX(), z - avoid.getZ()) < 70 || EndGen.nearMainIsland(x, z)) {
                        continue;
                    }
                    int lo = Integer.MAX_VALUE, hi = Integer.MIN_VALUE;
                    boolean ok = true;
                    for (int ax = -1; ax <= 1 && ok; ax++) {
                        for (int az = -1; az <= 1 && ok; az++) {
                            int px = x + ax * 14, pz = z + az * 14;
                            int h = ground(level, px, pz);
                            ok = h > 45 && level.getBiome(new BlockPos(px, 64, pz)).is(biome);
                            lo = Math.min(lo, h);
                            hi = Math.max(hi, h);
                        }
                    }
                    if (ok && hi - lo <= 6 && (!clearSky || clearSky(level, x, z))) {
                        return new BlockPos(x, ground(level, x, z), z);
                    }
                }
            }
        }
        return null;
    }

    /** No floating island over (x, z) and no structure (an End City) in the chunks round it. */
    private static boolean clearSky(ServerLevel level, int x, int z) {
        long seed = level.getSeed();
        for (int cx = (x >> 4) - 3; cx <= (x >> 4) + 3; cx++) {
            for (int cz = (z >> 4) - 3; cz <= (z >> 4) + 3; cz++) {
                FloatingIsland.Plan p = FloatingIsland.plan(seed, cx, cz);
                if (p != null && Math.hypot(p.x() - x, p.z() - z) < p.radius() + 20) {
                    return false;
                }
                if (Math.abs(cx - (x >> 4)) <= 2 && Math.abs(cz - (z >> 4)) <= 2 && level.getChunk(cx, cz,
                        net.minecraft.world.level.chunk.status.ChunkStatus.STRUCTURE_REFERENCES, true).hasAnyStructureReferences()) {
                    return false;
                }
            }
        }
        return true;
    }

    /** The nearest chunk whose rock feature `i` rolls under `p` (see EndFeatures#rocks), at its spot. */
    private static BlockPos rolled(ServerLevel level, BlockPos near, int i, float p, ResourceKey<Biome> biome) {
        if (near == null) {
            return null;
        }
        long seed = level.getSeed();
        int c0x = near.getX() >> 4, c0z = near.getZ() >> 4;
        for (int r = 0; r < 24; r++) {
            for (int cx = c0x - r; cx <= c0x + r; cx++) {
                for (int cz = c0z - r; cz <= c0z + r; cz++) {
                    if (Math.max(Math.abs(cx - c0x), Math.abs(cz - c0z)) != r || EndGen.rnd(seed, cx, i, cz, 504) >= p) {
                        continue;
                    }
                    int x = (cx << 4) + 2 + (int) (EndGen.rnd(seed, cx, i, cz, 501) * 12);
                    int z = (cz << 4) + 2 + (int) (EndGen.rnd(seed, cx, i, cz, 502) * 12);
                    int h = ground(level, x, z);
                    if (h > 45 && level.getBiome(new BlockPos(x, 64, z)).is(biome)) {
                        return new BlockPos(x, h, z);
                    }
                }
            }
        }
        return null;
    }

    // ------------------------------------------------------------------------------------------ steps

    private static void add(Step s) {
        PLAN.add(s);
    }

    private static void wait(int ticks) {
        add(mc -> ++waited >= ticks);
    }

    private static void cmd(String c) {
        Minecraft.getInstance().player.connection.sendCommand(c);
    }

    /** Runs `job` on the server thread (in the End) and waits for it. */
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
                        Winterworks.LOG.error("endshots: server job failed", e);
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

    /** The direction (radians) from `p` with the most land in it. */
    private static double landward(ServerLevel level, BlockPos p) {
        if (p == null) {
            return 0;
        }
        double best = 0;
        int most = -1;
        for (int k = 0; k < 16; k++) {
            double a = k * Math.PI / 8;
            int land = 0;
            for (int r = 8; r <= 72; r += 8) {
                land += ground(level, p.getX() + (int) (Math.cos(a) * r), p.getZ() + (int) (Math.sin(a) * r)) > 40 ? 1 : 0;
            }
            if (land > most) {
                most = land;
                best = a;
            }
        }
        return best;
    }

    /** A wide view across the land from behind `p`, looking along `dir`. */
    private static Vec3[] vista(BlockPos p, double dir, double up) {
        double cx = Math.cos(dir), cz = Math.sin(dir);
        return over(p, -cx * 10, up, -cz * 10, cx * 30, 2, cz * 30);
    }

    /** Eye and target `look` offsets from a spot on the ground. */
    private static Vec3[] over(BlockPos p, double ex, double ey, double ez, double lx, double ly, double lz) {
        Vec3 c = Vec3.atBottomCenterOf(p);
        return new Vec3[]{c.add(ex, ey, ez), c.add(lx, ly, lz)};
    }

    /** Flies the camera to a view (skipped if there's none), and waits for the world round it to load and draw. */
    private static void view(java.util.function.Supplier<Vec3[]> v) {
        add(mc -> {
            Vec3[] e = v.get();
            eye = e == null ? null : e[0];
            look = e == null ? null : e[1];
            if (eye != null) {
                cmd(String.format(Locale.ROOT, "tp @s %.2f %.2f %.2f facing %.2f %.2f %.2f", eye.x, eye.y, eye.z, look.x, look.y, look.z));
            }
            return true;
        });
        add(mc -> {
            if (eye == null) {
                return true;
            }
            waited++;
            stable = mc.levelRenderer.hasRenderedAllSections() ? stable + 1 : 0;
            return waited > 160 && stable > 40 || waited > 1400;
        });
    }

    private static void shot(String name) {
        add(mc -> {
            if (eye == null) {
                Winterworks.LOG.warn("endshots: no view for {}", name);
                return true;
            }
            Screenshot.grab(mc.gameDirectory, "winterworks_end_" + name + ".png", mc.getMainRenderTarget(), msg -> {});
            Winterworks.LOG.info("endshots: {} at {} looking at {}", name, eye, look);
            return true;
        });
    }

    /** Goes to `at` (on the server: loads it), stands 20 blocks before it facing north and runs the dev command. */
    private static void build(EndStructure.Kind kind, java.util.function.Supplier<BlockPos> at, Consumer<BlockPos> origin) {
        add(mc -> {
            BlockPos p = at.get();
            if (p != null) {
                cmd(String.format(Locale.ROOT, "tp @s %d %d %d 180 20", p.getX(), p.getY() + 30, p.getZ() + kind.reach + 6));
            }
            return true;
        });
        wait(200);
        server(level -> {
            BlockPos p = at.get();
            if (p == null) {
                return;
            }
            var player = level.getServer().getPlayerList().getPlayers().get(0);
            for (int dx = -2; dx <= 2; dx++) {
                for (int dz = -2; dz <= 2; dz++) {
                    level.getChunk((p.getX() >> 4) + dx, (p.getZ() >> 4) + dz);
                }
            }
            int stand = ground(level, p.getX(), p.getZ() + kind.reach + 6);
            player.teleportTo(level, p.getX() + 0.5, stand, p.getZ() + kind.reach + 6.5, 180f, 0f);
            int ground = EndWorldFeature.groundNear(level, p.getX(), p.getZ(), stand);
            level.getServer().getCommands().performPrefixedCommand(player.createCommandSourceStack().withPermission(4),
                    "winterworks endstructure " + kind.id);
            origin.accept(new BlockPos(p.getX(), switch (kind) {
                case OBSIDIAN_RUINS -> ground - 1;
                case END_SHRINE -> ground + 2;
                case MONOLITH_TOWER -> ground + 1;
            }, p.getZ()));
            Winterworks.LOG.info("endshots: built {} near {}", kind.id, p);
        });
    }

    private static void tick(Minecraft mc) {
        if (!created && mc.level == null && mc.screen != null && mc.getOverlay() == null) {
            mc.options.onboardAccessibility = false;
            mc.getTutorial().setStep(net.minecraft.client.tutorial.TutorialSteps.NONE);
            created = true;
            LevelSettings settings = new LevelSettings("winterworks_endshots", GameType.CREATIVE, false, Difficulty.NORMAL,
                    true, new GameRules(), WorldDataConfiguration.DEFAULT);
            mc.createWorldOpenFlows().createFreshLevel("winterworks_endshots_" + System.currentTimeMillis(), settings,
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
        if (PLAN.get(step).tick(mc)) {
            step++;
            waited = 0;
            stable = 0;
        }
    }
}
