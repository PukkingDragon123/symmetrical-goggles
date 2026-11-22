package dev.lowpix.winterworks.client.ocean;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.ocean.MonumentRework;
import dev.lowpix.winterworks.ocean.OceanDepths;
import dev.lowpix.winterworks.ocean.OceanStructure;
import dev.lowpix.winterworks.ocean.OceanStructurePiece;
import dev.lowpix.winterworks.ocean.OceanWorldFeature;
import dev.lowpix.winterworks.ocean.OceanWorldgen;
import dev.lowpix.winterworks.registry.OceanBlocks;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;
import java.util.function.Predicate;
import java.util.function.Supplier;
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
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import net.minecraft.world.level.levelgen.structure.BuiltinStructures;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructurePiece;
import net.minecraft.world.level.levelgen.structure.StructureStart;
import net.minecraft.world.level.levelgen.structure.structures.OceanMonumentPieces;
import net.minecraft.world.phys.Vec3;

/**
 * Dev-only screenshots of the Tides & Treasures world: with -Dwinterworks.oceanshots=true (in JAVA_TOOL_OPTIONS for
 * ./gradlew runClient under xvfb-run, with -Dwinterworks.ocean=true) the client makes a fresh normal world, finds the
 * abyssal trench, the volcanic depths, a warm reef and a monument with findClosestBiome3d and the structure locator,
 * flies a spectator camera (with Night Vision) to the shelf cliffs, a trench, rock formations, a vent field, sponges,
 * the three structures (built with the dev command, and natural ones) and the monument's reworked interior, saves
 * screenshots/winterworks_ocean_*.png and quits. -Dwinterworks.oceanshots.seed=N picks the world seed;
 * -Dwinterworks.oceanshots.only=a,b limits the shots by name prefix.
 */
final class OceanShots {
    private static final boolean ENABLED = Boolean.getBoolean("winterworks.oceanshots");
    private static final long SEED = Long.getLong("winterworks.oceanshots.seed", 20261122L);
    private static final String ONLY = System.getProperty("winterworks.oceanshots.only", "");

    private interface Step {
        boolean tick(Minecraft mc);
    }

    private static final List<Step> PLAN = new ArrayList<>();
    private static boolean created;
    private static int step, waited, stable;
    private static CompletableFuture<?> job;
    private static final Map<String, Vec3[]> VIEWS = new HashMap<>();
    private static final Map<String, BlockPos> PLACES = new HashMap<>();
    private static volatile Vec3 eye, look;

    private OceanShots() {}

    static void init() {
        if (!ENABLED) {
            return;
        }
        ClientTickEvents.END_CLIENT_TICK.register(OceanShots::tick);
        // stand-in (invisible) renderers for the sea's new mobs: their own client code, registered after this, replaces them
        for (var type : List.of(dev.lowpix.winterworks.registry.OceanEntities.ANGLERFISH, dev.lowpix.winterworks.registry.OceanEntities.LIONFISH,
                dev.lowpix.winterworks.registry.OceanEntities.NAUTILUS, dev.lowpix.winterworks.registry.OceanEntities.WHALE)) {
            net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry.register(type, net.minecraft.client.renderer.entity.NoopRenderer::new);
        }
        wait(40);
        add(mc -> {
            for (String c : new String[]{"gamerule doDaylightCycle false", "gamerule doWeatherCycle false", "gamerule doMobSpawning false",
                    "gamerule randomTickSpeed 0", "gamerule sendCommandFeedback false", "time set 6000", "weather clear", "gamemode spectator",
                    "effect give @s minecraft:night_vision infinite 0 true"}) {
                cmd(c);
            }
            mc.options.hideGui = true;
            mc.options.renderDistance().set(6);
            mc.getWindow().setWindowed(1280, 720);
            return true;
        });
        server(OceanShots::findPlaces);
        // ---- the deep: shelf cliffs, a trench, rock formations
        if (wanted("cliffs")) {
            go(() -> PLACES.get("cliff"), 200);
            visit("cliff", 160);
            shot("cliffs");
        }
        if (wanted("trench")) {
            go(() -> PLACES.get("trench"), 200);
            server(OceanShots::trenchView);
            visit("trench", 160);
            shot("trench");
            visit("trench_down", 60);
            shot("trench_down");
        }
        if (wanted("formation")) {
            visit("formation", 260);
            shot("formation");
        }
        // ---- a volcanic vent field with tube worms
        if (wanted("vent")) {
            go(() -> PLACES.get("volcanic"), 300);
            server(level -> pickNear(level, "vents", PLACES.get("volcanic"), 64, -50, 15, s -> s.is(OceanBlocks.HYDROTHERMAL_VENT),
                    s -> s.is(OceanBlocks.TUBE_WORMS) ? 2 : s.is(OceanBlocks.HYDROTHERMAL_VENT) ? 3 : s.is(Blocks.RAW_GOLD_BLOCK) || s.is(Blocks.RAW_IRON_BLOCK) ? 1 : 0,
                    new Vec3(6.5, 3.5, 5.5), new Vec3(0, 1.5, 0)));
            visit("vents", 160);
            shot("vent_field");
            server(level -> closer("vents", "vents_close", 0.55));
            visit("vents_close", 80);
            shot("vent_close");
        }
        // ---- a warm reef with sponges
        if (wanted("reef")) {
            server(OceanShots::reef);
            go(() -> PLACES.get("reef"), 300);
            server(level -> pickNear(level, "reef", PLACES.get("reef"), 64, 30, 62, s -> s.is(Blocks.WET_SPONGE),
                    s -> s.is(Blocks.WET_SPONGE) ? 3 : s.is(net.minecraft.tags.BlockTags.CORAL_BLOCKS) || s.is(Blocks.SEA_PICKLE) ? 1 : 0,
                    new Vec3(4.5, 2.5, 3.5), new Vec3(0, 0.5, 0)));
            visit("reef", 160);
            shot("reef_sponges");
        }
        // ---- the structures, built on the deep floor with the dev command
        for (OceanStructure.Kind kind : OceanStructure.Kind.values()) {
            if (wanted(kind.id)) {
                build(kind);
                visit(kind.id, 200);
                shot(kind.id);
                if (kind == OceanStructure.Kind.DEEP_SHIPWRECK) {
                    visit("deep_shipwreck_deck", 60);
                    shot("deep_shipwreck_deck");
                }
            }
        }
        // ---- natural ones
        for (OceanStructure.Kind kind : OceanStructure.Kind.values()) {
            if (wanted("natural_" + kind.id)) {
                server(level -> natural(level, kind));
                go(() -> PLACES.get("natural_" + kind.id), 300);
                server(level -> viewNatural(level, kind));
                visit("natural_" + kind.id, 160);
                shot("natural_" + kind.id);
            }
        }
        // ---- an ocean monument: outside on its legs, the boss arena, a wing and a treasure room
        if (wanted("monument")) {
            go(() -> PLACES.get("monument"), 400);
            server(OceanShots::monumentViews);
            visit("monument", 200);
            shot("monument");
            visit("monument_core", 120);
            shot("monument_core");
            visit("monument_wing", 120);
            shot("monument_wing");
            visit("monument_treasure", 120);
            shot("monument_treasure");
        }
        add(mc -> {
            mc.stop();
            return true;
        });
    }

    // ------------------------------------------------------------------------------------------ finding places

    private static ServerLevel overworld() {
        var srv = Minecraft.getInstance().getSingleplayerServer();
        return srv == null ? null : srv.overworld();
    }

    private static OceanDepths.ClimateField climate(ServerLevel level) {
        return new OceanDepths.Sampled(level.getChunkSource().randomState().sampler());
    }

    private static BlockPos nearestBiome(ServerLevel level, ResourceKey<Biome> b, BlockPos from) {
        var found = level.findClosestBiome3d(x -> x.is(b), from, 6400, 32, 64);
        Winterworks.LOG.info("oceanshots: nearest {} to {}: {}", b.location(), from, found == null ? null : found.getFirst());
        return found == null ? null : found.getFirst();
    }

    private static void findPlaces(ServerLevel ignored) {
        ServerLevel level = overworld();
        long seed = level.getSeed();
        BlockPos spawn = level.getSharedSpawnPos();
        BlockPos abyss = nearestBiome(level, OceanWorldgen.ABYSSAL_TRENCH, spawn);
        BlockPos volcanic = nearestBiome(level, OceanWorldgen.VOLCANIC_DEPTHS, spawn);
        BlockPos reef = nearestBiome(level, Biomes.WARM_OCEAN, spawn);
        if (volcanic != null) {
            PLACES.put("volcanic", volcanic.atY(-12));
        }
        if (reef != null) {
            PLACES.put("reef", reef.atY(52));
        }
        if (abyss != null) {
            trench(level, seed, abyss);
            formation(level, seed, abyss);
            cliff(level, seed, abyss);
            flatSpots(level, seed, abyss);
        }
        var reg = level.registryAccess().registryOrThrow(Registries.STRUCTURE);
        var monument = level.getChunkSource().getGenerator().findNearestMapStructure(level,
                HolderSet.direct(reg.getHolderOrThrow(BuiltinStructures.OCEAN_MONUMENT)), abyss != null ? abyss : spawn, 100, false);
        if (monument != null) {
            PLACES.put("monument", monument.getFirst().atY(50));
        }
        Winterworks.LOG.info("oceanshots: places {}", PLACES);
    }

    /** A shallow warm reef: warm ocean at the surface where the shelf keeps its vanilla floor. */
    private static void reef(ServerLevel level) {
        BlockPos c = PLACES.get("reef");
        if (c == null) {
            return;
        }
        var source = level.getChunkSource().getGenerator().getBiomeSource();
        var sampler = level.getChunkSource().randomState().sampler();
        OceanDepths.ClimateField cf = climate(level);
        for (int r = 0; r <= 800; r += 16) {
            for (int dx = -r; dx <= r; dx += 16) {
                for (int dz = -r; dz <= r; dz += 16) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) != r) {
                        continue;
                    }
                    int x = c.getX() + dx, z = c.getZ() + dz;
                    double cont = cf.continentalness(x, z);
                    if (cont < -0.4 || cont > -0.22) {
                        continue;   // not the middle of the shelf
                    }
                    if (source.getNoiseBiome(x >> 2, 15, z >> 2, sampler).is(Biomes.WARM_OCEAN)) {
                        PLACES.put("reef", new BlockPos(x, 52, z));
                        Winterworks.LOG.info("oceanshots: shallow reef at {}, {} (continentalness {})", x, z, cont);
                        return;
                    }
                }
            }
        }
    }

    /** The deepest trench point near `c`, and views along and down it. */
    private static void trench(ServerLevel level, long seed, BlockPos c) {
        BlockPos best = null;
        double bestF = 0;
        for (int r = 0; r <= 700 && best == null; r += 16) {
            OceanDepths.ClimateField cf = climate(level);
            for (int dx = -r; dx <= r; dx += 16) {
                for (int dz = -r; dz <= r; dz += 16) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) != r) {
                        continue;
                    }
                    double f = OceanDepths.floor(seed, cf, c.getX() + dx, c.getZ() + dz);
                    if (f <= -53 && f < bestF) {
                        bestF = f;
                        best = new BlockPos(c.getX() + dx, (int) f, c.getZ() + dz);
                    }
                }
            }
        }
        if (best == null) {
            return;
        }
        OceanDepths.ClimateField cf = climate(level);
        double along = 0;
        int longest = -1;
        for (int k = 0; k < 16; k++) {
            double a = k * Math.PI / 8;
            int run = 0;
            for (int s = 4; s <= 60; s += 4) {
                if (OceanDepths.floor(seed, cf, best.getX() + (int) (Math.cos(a) * s), best.getZ() + (int) (Math.sin(a) * s)) > -45) {
                    break;
                }
                run++;
            }
            if (run > longest) {
                longest = run;
                along = a;
            }
        }
        double ax = Math.cos(along), az = Math.sin(along);
        trenchAlong = along;
        Vec3 t = Vec3.atBottomCenterOf(best);
        VIEWS.put("trench", new Vec3[]{t.add(-ax * 18, 24, -az * 18), t.add(ax * 26, 2, az * 26)});
        VIEWS.put("trench_down", new Vec3[]{t.add(-az * 4, 40, ax * 4), t.add(ax * 3, 0, az * 3)});
        PLACES.put("trench", best);
    }

    private static double trenchAlong;

    /** A view along the trench from inside it, checked against the generated world: in open water, seeing down it. */
    private static void trenchView(ServerLevel level) {
        BlockPos t0 = PLACES.get("trench");
        if (t0 == null) {
            return;
        }
        double ax = Math.cos(trenchAlong), az = Math.sin(trenchAlong);
        Vec3 t = Vec3.atBottomCenterOf(t0);
        for (int back : new int[]{16, 22, 12, 28, 8}) {
            for (int up : new int[]{20, 26, 16, 30, 12}) {
                for (int side : new int[]{0, -3, 3, -6, 6}) {
                    Vec3 eye = t.add(-ax * back - az * side, up, -az * back + ax * side);
                    Vec3 look = t.add(ax * 26, 4, az * 26);
                    if (clearView(level, eye, look)) {
                        VIEWS.put("trench", new Vec3[]{eye, look});
                        Winterworks.LOG.info("oceanshots: trench view back {} up {} side {}", back, up, side);
                        return;
                    }
                }
            }
        }
        Winterworks.LOG.warn("oceanshots: no clear trench view");
    }

    /** Whether there's monument (prismarine) over `p` within 8 blocks: inside, not out in the open. */
    private static boolean roofed(ServerLevel level, Vec3 p) {
        for (int dy = 1; dy <= 8; dy++) {
            BlockState s = level.getBlockState(BlockPos.containing(p).above(dy));
            if (s.is(Blocks.PRISMARINE) || s.is(Blocks.PRISMARINE_BRICKS) || s.is(Blocks.DARK_PRISMARINE) || s.is(Blocks.SEA_LANTERN)) {
                return true;
            }
        }
        return false;
    }

    private static boolean water(ServerLevel level, Vec3 p) {
        return level.getBlockState(BlockPos.containing(p)).is(Blocks.WATER);
    }

    /** Whether `eye` is in open water and most of the way to `look` is water too. */
    private static boolean clearView(ServerLevel level, Vec3 eye, Vec3 look) {
        for (int dx = -1; dx <= 1; dx++) {
            for (int dy = -1; dy <= 1; dy++) {
                for (int dz = -1; dz <= 1; dz++) {
                    if (!water(level, eye.add(dx, dy, dz))) {
                        return false;
                    }
                }
            }
        }
        int n = 30, wet = 0;
        for (int i = 1; i <= n; i++) {
            wet += water(level, eye.add(look.subtract(eye).scale(i / (n + 1.0)))) ? 1 : 0;
        }
        return wet >= n * 0.85;
    }

    /** A rock formation (an arch if there is one) near `c`. */
    private static void formation(ServerLevel level, long seed, BlockPos c) {
        List<OceanDepths.Formation> fs = OceanDepths.formations(seed, climate(level), c.getX() - 400, c.getZ() - 400, c.getX() + 400, c.getZ() + 400);
        OceanDepths.Formation pick = null;
        for (OceanDepths.Formation f : fs) {
            double d = Math.hypot(f.cx() - c.getX(), f.cz() - c.getZ());
            if (pick == null || f.kind() == OceanDepths.Formation.ARCH && (pick.kind() != OceanDepths.Formation.ARCH
                    || d < Math.hypot(pick.cx() - c.getX(), pick.cz() - c.getZ()))) {
                pick = f;
            }
        }
        if (pick == null) {
            return;
        }
        double a = pick.kind() == OceanDepths.Formation.ARCH ? pick.angle() + Math.PI / 2 : 0.7;
        double dist = pick.reach() + 13;
        Vec3 ctr = new Vec3(pick.cx(), pick.base() + (pick.top() - pick.base()) * 0.45, pick.cz());
        VIEWS.put("formation", new Vec3[]{ctr.add(Math.cos(a) * dist, 3, Math.sin(a) * dist), ctr});
        PLACES.put("formation", BlockPos.containing(ctr));
    }

    /** A shelf cliff: the shelf's vanilla floor next to the carved deep. */
    private static void cliff(ServerLevel level, long seed, BlockPos c) {
        for (int r = 0; r <= 1400; r += 16) {
            OceanDepths.ClimateField cf = climate(level);
            for (int dx = -r; dx <= r; dx += 16) {
                for (int dz = -r; dz <= r; dz += 16) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) != r) {
                        continue;
                    }
                    int x = c.getX() + dx, z = c.getZ() + dz;
                    if (OceanDepths.floor(seed, cf, x, z) < OceanDepths.TOP) {
                        continue;
                    }
                    for (int k = 0; k < 8; k++) {
                        double a = k * Math.PI / 4;
                        int px = x + (int) (Math.cos(a) * 24), pz = z + (int) (Math.sin(a) * 24);
                        if (OceanDepths.floor(seed, cf, px, pz) < -5) {
                            Vec3 edge = new Vec3(x + Math.cos(a) * 10, 22, z + Math.sin(a) * 10);
                            VIEWS.put("cliff", new Vec3[]{edge.add(Math.cos(a) * 26 + Math.sin(a) * 9, -6, Math.sin(a) * 26 - Math.cos(a) * 9),
                                    edge.add(0, 2, 0)});
                            PLACES.put("cliff", BlockPos.containing(edge));
                            return;
                        }
                    }
                }
            }
        }
    }

    /** Flat bits of deep floor for building the structures on. */
    private static void flatSpots(ServerLevel level, long seed, BlockPos c) {
        OceanDepths.ClimateField cf = climate(level);
        List<BlockPos> found = new ArrayList<>();
        for (int r = 0; r <= 900 && found.size() < 3; r += 24) {
            for (int dx = -r; dx <= r && found.size() < 3; dx += 24) {
                for (int dz = -r; dz <= r && found.size() < 3; dz += 24) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) != r) {
                        continue;
                    }
                    int x = c.getX() + dx, z = c.getZ() + dz;
                    double f = OceanDepths.floor(seed, cf, x, z);
                    if (f > -12 || f < -28) {
                        continue;
                    }
                    double lo = f, hi = f;
                    for (int k = 0; k < 8; k++) {
                        double a = k * Math.PI / 4, g = OceanDepths.floor(seed, cf, x + (int) (Math.cos(a) * 24), z + (int) (Math.sin(a) * 24));
                        lo = Math.min(lo, g);
                        hi = Math.max(hi, g);
                    }
                    boolean apart = found.stream().allMatch(p -> Math.hypot(p.getX() - x, p.getZ() - z) > 90);
                    if (hi - lo < 7 && apart && OceanDepths.formations(seed, cf, x - 30, z - 30, x + 30, z + 30).isEmpty()) {
                        found.add(new BlockPos(x, (int) Math.floor(f) + 1, z));
                    }
                }
            }
        }
        for (int i = 0; i < found.size(); i++) {
            PLACES.put("flat_" + i, found.get(i));
        }
    }

    /** The best-scoring block matching `target` within `r` of `c` (in y lo..hi), and a view of it from `offset`. */
    private static void pickNear(ServerLevel level, String name, BlockPos c, int r, int lo, int hi, Predicate<BlockState> target,
                                 java.util.function.ToIntFunction<BlockState> score, Vec3 offset, Vec3 lookOffset) {
        if (c == null) {
            return;
        }
        BlockPos best = null;
        int bestScore = -1;
        for (int cx = (c.getX() - r - 6) >> 4; cx <= (c.getX() + r + 6) >> 4; cx++) {
            for (int cz = (c.getZ() - r - 6) >> 4; cz <= (c.getZ() + r + 6) >> 4; cz++) {
                level.getChunk(cx, cz);   // generate it all first
            }
        }
        BlockPos.MutableBlockPos m = new BlockPos.MutableBlockPos(), q = new BlockPos.MutableBlockPos();
        for (int x = c.getX() - r; x <= c.getX() + r; x++) {
            for (int z = c.getZ() - r; z <= c.getZ() + r; z++) {
                for (int y = lo; y <= hi; y++) {
                    if (!target.test(level.getBlockState(m.set(x, y, z)))) {
                        continue;
                    }
                    int s = 0;
                    for (int dx = -5; dx <= 5; dx++) {
                        for (int dy = -3; dy <= 3; dy++) {
                            for (int dz = -5; dz <= 5; dz++) {
                                s += score.applyAsInt(level.getBlockState(q.set(x + dx, y + dy, z + dz)));
                            }
                        }
                    }
                    if (s > bestScore) {
                        bestScore = s;
                        best = m.immutable();
                    }
                }
            }
        }
        Winterworks.LOG.info("oceanshots: best {} at {} (score {})", name, best, bestScore);
        if (best != null) {
            Vec3 b = Vec3.atBottomCenterOf(best);
            VIEWS.put(name, new Vec3[]{b.add(offset), b.add(lookOffset)});
            PLACES.put(name, best);
        }
    }

    /** A view `t` of the way from `from`'s eye to what it looks at. */
    private static void closer(String from, String to, double t) {
        Vec3[] v = VIEWS.get(from);
        if (v != null) {
            VIEWS.put(to, new Vec3[]{v[0].add(v[1].subtract(v[0]).scale(t)), v[1]});
        }
    }

    // ------------------------------------------------------------------------------------------ structures

    private static void build(OceanStructure.Kind kind) {
        String spot = "flat_" + kind.ordinal();
        go(() -> PLACES.get(spot), 200);
        server(level -> {
            BlockPos at = PLACES.get(spot);
            if (at == null) {
                return;
            }
            for (int dx = -3; dx <= 3; dx++) {
                for (int dz = -3; dz <= 3; dz++) {
                    level.getChunk((at.getX() >> 4) + dx, (at.getZ() >> 4) + dz);
                }
            }
            BlockPos floor = OceanWorldFeature.floorUnder(level, at.getX(), at.getZ() - 15, 40);
            Vec3 stand = new Vec3(at.getX() + 0.5, (floor == null ? at.getY() : floor.getY()) + 6, at.getZ() + 0.5);
            BlockPos origin = OceanWorldFeature.buildInFront(level, kind, stand, 180f, 1234L + kind.ordinal());
            Winterworks.LOG.info("oceanshots: built {} at {}", kind.id, origin);
            if (origin == null) {
                return;
            }
            Vec3 o = Vec3.atBottomCenterOf(origin);
            switch (kind) {
                case DEEP_SHIPWRECK -> {
                    VIEWS.put(kind.id, new Vec3[]{o.add(-22, 13, 27), o.add(0, 4, 0)});
                    VIEWS.put("deep_shipwreck_deck", new Vec3[]{o.add(-6, 12, 7), o.add(6, 3, -4)});
                }
                case SUNKEN_TREASURE -> VIEWS.put(kind.id, new Vec3[]{o.add(4.5, 3.2, 5.5), o.add(0.5, -0.3, 0)});
                case WHALE_SKELETON -> VIEWS.put(kind.id, new Vec3[]{o.add(-24, 14, 22), o.add(2, 2, -1)});
            }
        });
    }

    private static void natural(ServerLevel level, OceanStructure.Kind kind) {
        var reg = level.registryAccess().registryOrThrow(Registries.STRUCTURE);
        ResourceKey<Structure> key = switch (kind) {
            case DEEP_SHIPWRECK -> OceanWorldgen.DEEP_SHIPWRECK;
            case SUNKEN_TREASURE -> OceanWorldgen.SUNKEN_TREASURE;
            case WHALE_SKELETON -> OceanWorldgen.WHALE_SKELETON;
        };
        BlockPos from = PLACES.getOrDefault("trench", level.getSharedSpawnPos());
        var found = level.getChunkSource().getGenerator().findNearestMapStructure(level, HolderSet.direct(reg.getHolderOrThrow(key)), from, 80, false);
        Winterworks.LOG.info("oceanshots: nearest natural {}: {}", kind.id, found == null ? null : found.getFirst());
        if (found != null) {
            PLACES.put("natural_" + kind.id, found.getFirst().atY(0));
        }
    }

    private static void viewNatural(ServerLevel level, OceanStructure.Kind kind) {
        BlockPos at = PLACES.get("natural_" + kind.id);
        if (at == null) {
            return;
        }
        var reg = level.registryAccess().registryOrThrow(Registries.STRUCTURE);
        Structure s = reg.get(switch (kind) {
            case DEEP_SHIPWRECK -> OceanWorldgen.DEEP_SHIPWRECK;
            case SUNKEN_TREASURE -> OceanWorldgen.SUNKEN_TREASURE;
            case WHALE_SKELETON -> OceanWorldgen.WHALE_SKELETON;
        });
        StructureStart start = level.getChunk(at).getStartForStructure(s);
        if (start == null || start.getPieces().isEmpty() || !(start.getPieces().get(0) instanceof OceanStructurePiece piece)) {
            Winterworks.LOG.warn("oceanshots: no natural {} start at {}", kind.id, at);
            return;
        }
        Vec3 o = Vec3.atBottomCenterOf(piece.origin());
        Vec3[] v = switch (kind) {
            case DEEP_SHIPWRECK -> new Vec3[]{o.add(20, 14, 24), o.add(0, 4, 0)};
            case SUNKEN_TREASURE -> new Vec3[]{o.add(4.5, 3.2, 4.5), o.add(0.5, -0.3, 0)};
            case WHALE_SKELETON -> new Vec3[]{o.add(22, 15, 20), o.add(0, 2, 0)};
        };
        VIEWS.put("natural_" + kind.id, v);
    }

    private static void monumentViews(ServerLevel level) {
        BlockPos at = PLACES.get("monument");
        if (at == null) {
            return;
        }
        var reg = level.registryAccess().registryOrThrow(Registries.STRUCTURE);
        StructureStart start = level.getChunk(at).getStartForStructure(reg.get(BuiltinStructures.OCEAN_MONUMENT));
        if (start == null || start.getPieces().isEmpty() || !(start.getPieces().get(0) instanceof MonumentRework.Building building)) {
            Winterworks.LOG.warn("oceanshots: no monument start at {}", at);
            return;
        }
        StructurePiece main = start.getPieces().get(0);
        var box = main.getBoundingBox();
        for (int dx = -5; dx <= 5; dx++) {
            for (int dz = -5; dz <= 5; dz++) {
                level.getChunk((box.getCenter().getX() >> 4) + dx, (box.getCenter().getZ() >> 4) + dz);
            }
        }
        Vec3 c = Vec3.atCenterOf(box.getCenter());
        // outside: a clear view of a wall and its legs from the open water
        boolean found = false;
        for (int dist : new int[]{44, 52, 36, 60}) {
            for (int k = 0; k < 16 && !found; k++) {
                double a = Math.PI / 4 + k * Math.PI / 8;
                for (int up : new int[]{-4, 0, 4, -8}) {
                    Vec3 eye = c.add(Math.cos(a) * dist, up, Math.sin(a) * dist);
                    Vec3 look = c.add(Math.cos(a) * 18, -4, Math.sin(a) * 18);
                    if (!found && clearView(level, eye, look)) {
                        VIEWS.put("monument", new Vec3[]{eye, c.add(0, -5, 0)});
                        found = true;
                    }
                }
            }
        }
        List<StructurePiece> treasure = MonumentRework.treasureRooms(main, building.ww$rooms());
        for (StructurePiece p : building.ww$rooms()) {
            if (p instanceof OceanMonumentPieces.OceanMonumentCoreRoom) {
                VIEWS.put("monument_core", new Vec3[]{MonumentRework.worldVec(p, 4.5, 6.2, 1.3), MonumentRework.worldVec(p, 11.5, 1.5, 11.5)});
            } else if (p instanceof OceanMonumentPieces.OceanMonumentWingRoom && !VIEWS.containsKey("monument_wing")) {
                for (double[] e : new double[][]{{11.5, 3.5, 9.5}, {11.5, 4.5, 6.5}, {8.5, 3.5, 10.5}, {11.5, 2.5, 12.5}}) {
                    Vec3 eye = MonumentRework.worldVec(p, e[0], e[1], e[2]);
                    if (water(level, eye) && roofed(level, eye) && !VIEWS.containsKey("monument_wing")) {
                        VIEWS.put("monument_wing", new Vec3[]{eye, MonumentRework.worldVec(p, 11.5, 1, 15)});
                    }
                }
            }
        }
        if (!treasure.isEmpty()) {
            StructurePiece t = treasure.get(0);
            VIEWS.put("monument_treasure", new Vec3[]{MonumentRework.worldVec(t, 5.6, 2.6, 2.4), MonumentRework.worldVec(t, 1.5, 1.2, 5.5)});
        }
        Winterworks.LOG.info("oceanshots: monument at {}, views {}", box, VIEWS.keySet());
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

    private static void server(Consumer<ServerLevel> work) {
        add(mc -> {
            if (job == null) {
                var srv = mc.getSingleplayerServer();
                if (srv == null) {
                    return true;
                }
                job = srv.submit(() -> {
                    try {
                        work.accept(srv.overworld());
                    } catch (RuntimeException e) {
                        Winterworks.LOG.error("oceanshots: server job failed", e);
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

    private static boolean wanted(String name) {
        if (ONLY.isEmpty()) {
            return true;
        }
        for (String s : ONLY.split(",")) {
            if (name.startsWith(s.trim())) {
                return true;
            }
        }
        return false;
    }

    /** Teleports to a place (to load and generate it) and waits `ticks`. */
    private static void go(Supplier<BlockPos> at, int ticks) {
        add(mc -> {
            BlockPos p = at.get();
            waited = p == null ? ticks : 0;
            if (p != null) {
                cmd(String.format(Locale.ROOT, "tp @s %d %d %d", p.getX(), p.getY(), p.getZ()));
            }
            return true;
        });
        add(mc -> ++waited >= ticks);
    }

    /** Flies the camera to view `name` (skipped if there's none) and waits for the world round it to draw. */
    private static void visit(String name, int minTicks) {
        add(mc -> {
            Vec3[] v = VIEWS.get(name);
            eye = v == null ? null : v[0];
            look = v == null ? null : v[1];
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
            boolean loaded = loaded(mc, eye) && loaded(mc, look);
            stable = loaded && mc.levelRenderer.hasRenderedAllSections() ? stable + 1 : 0;
            return waited > minTicks && stable > 40 || waited > 2400;
        });
    }

    /** Whether the client has the chunks round `at` (radius 2). */
    private static boolean loaded(Minecraft mc, Vec3 at) {
        int cx = (int) Math.floor(at.x) >> 4, cz = (int) Math.floor(at.z) >> 4;
        for (int dx = -2; dx <= 2; dx++) {
            for (int dz = -2; dz <= 2; dz++) {
                if (!mc.level.getChunkSource().hasChunk(cx + dx, cz + dz)) {
                    return false;
                }
            }
        }
        return true;
    }

    private static void shot(String name) {
        add(mc -> {
            if (eye == null) {
                Winterworks.LOG.warn("oceanshots: no view for {}", name);
                return true;
            }
            Screenshot.grab(mc.gameDirectory, "winterworks_ocean_" + name + ".png", mc.getMainRenderTarget(), msg -> {});
            Winterworks.LOG.info("oceanshots: camera in {} (client sees {})", mc.level.getBlockState(BlockPos.containing(eye)),
                    mc.gameRenderer.getMainCamera().getFluidInCamera());
            Winterworks.LOG.info("oceanshots: {} at {} looking at {}", name, eye, look);
            return true;
        });
    }

    private static void tick(Minecraft mc) {
        if (!created && mc.level == null && mc.screen != null && mc.getOverlay() == null) {
            mc.options.onboardAccessibility = false;
            mc.getTutorial().setStep(net.minecraft.client.tutorial.TutorialSteps.NONE);
            created = true;
            LevelSettings settings = new LevelSettings("winterworks_oceanshots", GameType.CREATIVE, false, Difficulty.PEACEFUL,
                    true, new GameRules(), WorldDataConfiguration.DEFAULT);
            mc.createWorldOpenFlows().createFreshLevel("winterworks_oceanshots_" + System.currentTimeMillis(), settings,
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
