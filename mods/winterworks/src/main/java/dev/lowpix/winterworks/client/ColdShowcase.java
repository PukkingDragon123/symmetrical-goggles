package dev.lowpix.winterworks.client;

import static dev.lowpix.winterworks.client.ShowcaseDirector.at;
import static dev.lowpix.winterworks.client.ShowcaseDirector.cmd;
import static dev.lowpix.winterworks.client.ShowcaseDirector.server;
import static dev.lowpix.winterworks.client.ShowcaseDirector.shot;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.world.WWWorldgen;
import java.util.Locale;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.core.HolderSet;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.StructureStart;
import net.minecraft.world.phys.Vec3;

/**
 * Dev-only (./gradlew runShowcaseCold): in a real generated world, find the nearest Ice Caves and the nearest frozen
 * tomb, fly a spectator camera into them and take screenshots. Proves the worldgen end to end.
 */
final class ColdShowcase {
    private static BlockPos biomeAt, tombAt;
    private static Vec3 eye, look;

    private ColdShowcase() {}

    private static void tpFacing(Vec3 from, Vec3 to) {
        cmd(String.format(Locale.ROOT, "tp @s %.2f %.2f %.2f facing %.2f %.2f %.2f", from.x, from.y, from.z, to.x, to.y, to.z));
    }

    static void plan() {
        int t = 40;
        at(t, () -> {
            cmd("gamerule doDaylightCycle false");
            cmd("gamerule doWeatherCycle false");
            cmd("gamerule doMobSpawning false");
            cmd("time set 6000");
            cmd("weather clear");
            cmd("gamemode spectator");
            cmd("effect give @s minecraft:night_vision infinite 0 true");
        });
        // 1. the nearest Ice Caves, and the nearest frozen tomb (tombs only generate in the Ice Caves)
        at(t += 5, () -> server(level -> {
            var found = level.findClosestBiome3d(b -> b.is(WWWorldgen.ICE_CAVES), level.getSharedSpawnPos(), 6400, 32, 64);
            biomeAt = found == null ? null : found.getFirst();
            Winterworks.LOG.info("showcase: nearest ice caves {}", biomeAt);
            var reg = level.registryAccess().registryOrThrow(Registries.STRUCTURE);
            var tomb = reg.getHolderOrThrow(WWWorldgen.FROZEN_TOMB);
            BlockPos from = biomeAt != null ? biomeAt : level.getSharedSpawnPos();
            var r = level.getChunkSource().getGenerator().findNearestMapStructure(level, HolderSet.direct(tomb), from, 100, false);
            tombAt = r == null ? null : r.getFirst();
            Winterworks.LOG.info("showcase: nearest frozen tomb {}", tombAt);
        }));
        at(t += 20, () -> {
            if (tombAt != null) {
                cmd("tp @s " + tombAt.getX() + " 0 " + tombAt.getZ());
            }
        });
        // 2. the caves round the tomb
        at(t += 260, () -> server(level -> {
            BlockPos c = tombCentre(level);
            pickCaveView(level, c == null ? biomeAt : c, c);
        }));
        at(t += 5, () -> {
            if (eye != null) {
                tpFacing(eye, look);
            }
        });
        at(t += 160, () -> shot("ice_caves"));
        // 3. inside the tomb
        at(t += 5, () -> server(ColdShowcase::pickTombView));
        at(t += 5, () -> {
            if (eye != null) {
                tpFacing(eye, look);
            }
        });
        at(t += 160, () -> shot("frozen_tomb_natural"));
        // 4. the nearest Dead Caves, and a Dig Site
        at(t += 5, () -> server(level -> {
            var found = level.findClosestBiome3d(b -> b.is(WWWorldgen.DEAD_CAVES), level.getSharedSpawnPos(), 6400, 32, 64);
            biomeAt = found == null ? null : found.getFirst();
            Winterworks.LOG.info("showcase: nearest dead caves {}", biomeAt);
            var dig = level.registryAccess().registryOrThrow(Registries.STRUCTURE).getHolderOrThrow(WWWorldgen.DIG_SITE);
            var r = biomeAt == null ? null : level.getChunkSource().getGenerator().findNearestMapStructure(level,
                    HolderSet.direct(dig), biomeAt, 100, false);
            tombAt = r == null ? null : r.getFirst();
            Winterworks.LOG.info("showcase: nearest dig site {}", tombAt);
        }));
        at(t += 20, () -> {
            if (biomeAt != null) {
                cmd("tp @s " + biomeAt.getX() + " " + biomeAt.getY() + " " + biomeAt.getZ());
            }
        });
        at(t += 260, () -> server(level -> pickView(level, biomeAt, null, WWWorldgen.DEAD_CAVES, ColdShowcase::dusty)));
        at(t += 5, () -> {
            if (eye != null) {
                tpFacing(eye, look);
            }
        });
        at(t += 160, () -> shot("dead_caves"));
        at(t += 5, () -> {
            if (tombAt != null) {
                cmd("tp @s " + tombAt.getX() + " 0 " + tombAt.getZ());
            }
        });
        at(t += 260, () -> server(level -> {
            eye = look = null;
            BlockPos c = structureCentre(level, tombAt, WWWorldgen.DIG_SITE);
            if (c != null) {
                BlockPos floor = c;   // the box is centred on the floor centre
                look = Vec3.atCenterOf(floor.above(1));
                eye = Vec3.atCenterOf(floor.offset(0, 4, -8));
            }
        }));
        at(t += 5, () -> {
            if (eye != null) {
                tpFacing(eye, look);
            }
        });
        at(t += 160, () -> shot("dig_site_natural"));
        at(t += 5, () -> Minecraft.getInstance().stop());
    }

    private static boolean icy(BlockState s) {
        return s.is(Blocks.PACKED_ICE) || s.is(Blocks.BLUE_ICE) || s.is(Blocks.SNOW_BLOCK) || s.is(Blocks.SNOW)
                || s.is(Blocks.POWDER_SNOW) || s.is(Blocks.ICE) || s.is(WWBlocks.ICICLE) || s.is(WWBlocks.ANCIENT_ICE);
    }

    /** The roomiest, iciest air pocket near `centre` (outside the tomb chamber), and a look at the middle of its ice. */
    private static void pickCaveView(ServerLevel level, BlockPos centre, BlockPos avoid) {
        pickView(level, centre, avoid, WWWorldgen.ICE_CAVES, ColdShowcase::icy);
    }

    private static boolean dusty(BlockState s) {
        return s.is(Blocks.SAND) || s.is(Blocks.SANDSTONE) || s.is(Blocks.SMOOTH_SANDSTONE) || s.is(Blocks.TERRACOTTA)
                || s.is(Blocks.BROWN_TERRACOTTA) || s.is(Blocks.SUSPICIOUS_SAND) || s.is(Blocks.SUSPICIOUS_GRAVEL)
                || s.is(WWBlocks.PETRIFIED_LOG) || s.is(WWBlocks.AMBER_BLOCK) || s.is(Blocks.DEAD_BUSH);
    }

    private static void pickView(ServerLevel level, BlockPos centre, BlockPos avoid,
                                 net.minecraft.resources.ResourceKey<net.minecraft.world.level.biome.Biome> biome,
                                 java.util.function.Predicate<BlockState> interesting) {
        eye = look = null;
        if (centre == null) {
            return;
        }
        double best = -1;
        int candidates = 0, maxIce = 0, maxAir = 0;
        BlockPos.MutableBlockPos q = new BlockPos.MutableBlockPos();
        for (int dx = -40; dx <= 40; dx += 3) {
            for (int dz = -40; dz <= 40; dz += 3) {
                for (int dy = -24; dy <= 24; dy += 2) {
                    BlockPos p = centre.offset(dx, dy, dz);
                    if (avoid != null && p.distSqr(avoid) < 16 * 16) {
                        continue;
                    }
                    if (!level.getBlockState(p).isAir() || !level.getBiome(p).is(biome)) {
                        continue;
                    }
                    candidates++;
                    int air = 0, ice = 0;
                    double sx = 0, sy = 0, sz = 0;
                    for (int ax = -4; ax <= 4; ax++) {
                        for (int ay = -3; ay <= 3; ay++) {
                            for (int az = -4; az <= 4; az++) {
                                BlockState s = level.getBlockState(q.set(p.getX() + ax, p.getY() + ay, p.getZ() + az));
                                if (s.isAir()) {
                                    air++;
                                } else if (interesting.test(s)) {
                                    ice++;
                                    sx += ax;
                                    sy += ay;
                                    sz += az;
                                }
                            }
                        }
                    }
                    maxIce = Math.max(maxIce, ice);
                    maxAir = Math.max(maxAir, air);
                    double score = Math.min(air, 200) + ice * 2.5;
                    if (ice > 12 && air > 60 && score > best) {
                        best = score;
                        eye = Vec3.atCenterOf(p);
                        look = eye.add(sx / ice * 3, sy / ice * 3, sz / ice * 3);
                    }
                }
            }
        }
        Winterworks.LOG.info("showcase: ice cave view {} -> {} (score {}, {} candidates, max ice {}, max air {})", eye, look,
                best, candidates, maxIce, maxAir);
    }

    private static BlockPos tombCentre(ServerLevel level) {
        return structureCentre(level, tombAt, WWWorldgen.FROZEN_TOMB);
    }

    private static BlockPos structureCentre(ServerLevel level, BlockPos at,
                                            net.minecraft.resources.ResourceKey<net.minecraft.world.level.levelgen.structure.Structure> key) {
        if (at == null) {
            return null;
        }
        var structure = level.registryAccess().registryOrThrow(Registries.STRUCTURE).get(key);
        StructureStart start = level.getChunk(at).getStartForStructure(structure);
        if (start == null || !start.isValid()) {
            Winterworks.LOG.warn("showcase: no {} start at {}", key.location(), at);
            return null;
        }
        BoundingBox box = start.getBoundingBox();
        return box.getCenter();
    }

    /** Inside the tomb's chamber, looking at the ancient-ice block in the middle. */
    private static void pickTombView(ServerLevel level) {
        eye = look = null;
        BlockPos c = tombCentre(level);
        if (c == null) {
            return;
        }
        look = Vec3.atCenterOf(c);
        // walk out from the centre until we're in the chamber's air, a few blocks from the ice
        for (int r = 4; r <= 11; r++) {
            for (var d : net.minecraft.core.Direction.Plane.HORIZONTAL) {
                BlockPos p = c.relative(d, r).above(2);
                if (level.getBlockState(p).isAir() && level.getBlockState(p.relative(d)).isAir()) {
                    eye = Vec3.atCenterOf(p.relative(d, 2).above(1));
                    Winterworks.LOG.info("showcase: tomb view {} -> {}", eye, look);
                    return;
                }
            }
        }
        eye = look.add(-7, 3, -7);
        Winterworks.LOG.info("showcase: tomb view (fallback) {} -> {}", eye, look);
    }
}
