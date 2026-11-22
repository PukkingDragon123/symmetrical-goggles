package dev.lowpix.winterworks.ocean;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.RandomizableContainer;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.monster.Guardian;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ChestBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.StructurePiece;
import net.minecraft.world.level.levelgen.structure.structures.OceanMonumentPieces;
import net.minecraft.world.level.storage.loot.LootTable;

/**
 * The ocean monument rework (docs/OCEAN_UPDATE.md section 6), run over each chunk of a vanilla monument right after
 * vanilla builds it (mixin.ocean.MonumentBuildingMixin), clipped to that chunk and decided only from the building's
 * position and its rooms, so the chunks agree:
 * <ul>
 * <li>The core chamber becomes the boss arena: cleared, a floor-to-ceiling core column round the old gold (kept), four
 * pillars to hide behind from the Elder Guardian's stare, a ringed floor and sea-lantern lighting, two chests
 * (chests/monument_core), and the monument's one Elder Guardian.</li>
 * <li>The wings are lit (sea lanterns set in their floors and walls) and trimmed in dark prismarine, with a pair of
 * chests each (chests/monument_wing).</li>
 * <li>Two of the small rooms become treasure rooms: gold, lanterns and chests (chests/monument_treasure).</li>
 * <li>Every other room gets a lantern in its ceiling.</li>
 * <li>Of vanilla's three Elder Guardians, the two in the wings become guardians and the penthouse one is the boss in
 * the core (mixin.ocean.MonumentPieceMixin).</li>
 * </ul>
 */
public final class MonumentRework {
    private static final BlockState LANTERN = Blocks.SEA_LANTERN.defaultBlockState();
    private static final BlockState DARK = Blocks.DARK_PRISMARINE.defaultBlockState();
    private static final BlockState BRICKS = Blocks.PRISMARINE_BRICKS.defaultBlockState();
    private static final BlockState GRAY = Blocks.PRISMARINE.defaultBlockState();
    private static final BlockState WATER = Blocks.WATER.defaultBlockState();
    /** Where the Elder Guardian floats in the core (core-room local). */
    public static final int ELDER_X = 7, ELDER_Y = 3, ELDER_Z = 12;

    private MonumentRework() {}

    /** A monument's building piece (mixin.ocean.MonumentBuildingMixin): its rooms. */
    public interface Building {
        List<? extends StructurePiece> ww$rooms();
    }

    /** Reworks the part of `building` in `clip` (after vanilla has placed it). */
    public static void apply(StructurePiece building, List<? extends StructurePiece> children, WorldGenLevel level, BoundingBox clip) {
        List<StructurePiece> treasure = treasureRooms(building, children);
        for (StructurePiece p : children) {
            if (!p.getBoundingBox().inflatedBy(1).intersects(clip)) {
                continue;
            }
            P w = new P(p, level, clip);
            if (p instanceof OceanMonumentPieces.OceanMonumentCoreRoom) {
                arena(w);
            } else if (p instanceof OceanMonumentPieces.OceanMonumentWingRoom) {
                wing(w, ((dev.lowpix.winterworks.mixin.ocean.WingRoomAccessor) p).ww$mainDesign());
            } else if (p instanceof OceanMonumentPieces.OceanMonumentPenthouse || p instanceof OceanMonumentPieces.OceanMonumentEntryRoom) {
                continue;
            } else if (treasure.contains(p)) {
                treasure(w);
            } else {
                ceilingLight(w);
            }
        }
    }

    /** The two small rooms of `building` that are treasure rooms (picked from its position, so every chunk agrees). */
    public static List<StructurePiece> treasureRooms(StructurePiece building, List<? extends StructurePiece> children) {
        BoundingBox bb = building.getBoundingBox();
        long seed = OceanGen.hash(0x4D0E1F, bb.minX(), bb.minY(), bb.minZ(), 1);
        List<StructurePiece> small = new ArrayList<>();
        for (StructurePiece p : children) {
            if (p instanceof OceanMonumentPieces.OceanMonumentSimpleRoom) {
                small.add(p);
            }
        }
        List<StructurePiece> out = new ArrayList<>();
        if (!small.isEmpty()) {
            int t1 = (int) Math.floorMod(seed, small.size());
            out.add(small.get(t1));
            if (small.size() > 1) {
                out.add(small.get((t1 + 1 + (int) Math.floorMod(seed >>> 20, small.size() - 1)) % small.size()));
            }
        }
        return out;
    }

    /** A point in a monument piece's own frame, in the world (for cameras). */
    public static net.minecraft.world.phys.Vec3 worldVec(StructurePiece piece, double x, double y, double z) {
        BlockPos a = new P(piece, null, null).at((int) Math.floor(x), (int) Math.floor(y), (int) Math.floor(z));
        Direction o = piece.getOrientation();
        double fx = x - Math.floor(x), fz = z - Math.floor(z);
        double wx = o == Direction.WEST ? 1 - fz : o == Direction.EAST ? fz : fx;
        double wz = o == Direction.NORTH ? 1 - fz : o == Direction.SOUTH ? fz : fx;
        return new net.minecraft.world.phys.Vec3(a.getX() + wx, a.getY() + (y - Math.floor(y)), a.getZ() + wz);
    }

    // ============================================================================================ the rooms

    /** The core chamber (16 x 8 x 16, ceiling at y 8) as the boss arena. */
    private static void arena(P w) {
        // clear it, keeping the old gold core
        for (int x = 1; x <= 14; x++) {
            for (int z = 1; z <= 14; z++) {
                boolean core = x >= 6 && x <= 9 && z >= 6 && z <= 9;
                for (int y = 1; y <= 7; y++) {
                    if (core && y >= 3 && y <= 6) {
                        continue;   // vanilla's dark prismarine core round the gold, with its lamps
                    }
                    if (core) {
                        w.set(x, y, z, DARK);
                    } else {
                        w.clear(x, y, z);
                    }
                }
            }
        }
        // the core column runs floor to ceiling, lamps in its foot
        for (int x = 6; x <= 9; x++) {
            for (int z = 6; z <= 9; z++) {
                boolean edge = x == 6 || x == 9 || z == 6 || z == 9;
                boolean corner = (x == 6 || x == 9) && (z == 6 || z == 9);
                w.set(x, 1, z, edge && !corner && (x + z) % 2 == 0 ? LANTERN : DARK);
            }
        }
        // four pillars to hide behind
        int[][] at = {{2, 2}, {12, 2}, {2, 12}, {12, 12}};
        for (int[] a : at) {
            for (int x = a[0]; x <= a[0] + 1; x++) {
                for (int z = a[1]; z <= a[1] + 1; z++) {
                    for (int y = 1; y <= 7; y++) {
                        w.set(x, y, z, y == 1 || y == 7 ? DARK : y == 4 ? LANTERN : BRICKS);
                    }
                }
            }
        }
        // the floor in rings round the core, lanterns in the ceiling
        for (int x = 1; x <= 14; x++) {
            for (int z = 1; z <= 14; z++) {
                double ring = Math.max(Math.abs(x - 7.5), Math.abs(z - 7.5));
                if (prismarine(w.get(x, 0, z))) {
                    BlockState f = ring == 2.5 || ring == 6.5 ? DARK : ring == 4.5 ? (Math.abs(x - 7.5) < 1 || Math.abs(z - 7.5) < 1 ? LANTERN : BRICKS) : GRAY;
                    w.set(x, 0, z, f);
                }
                boolean light = (x >= 3 && x <= 4 || x >= 11 && x <= 12) && z >= 7 && z <= 8 || (z >= 3 && z <= 4 || z >= 11 && z <= 12) && x >= 7 && x <= 8;
                if (light && prismarine(w.get(x, 8, z))) {
                    w.set(x, 8, z, LANTERN);
                }
            }
        }
        w.chest(7, 1, 5, OceanLoot.MONUMENT_CORE);
        w.chest(8, 1, 10, OceanLoot.MONUMENT_CORE);
        w.elder(ELDER_X, ELDER_Y, ELDER_Z);
    }

    /** A wing room: lanterns set in the floor and walls, dark trim, two chests where the elder was. */
    private static void wing(P w, int design) {
        int floor = design == 0 ? 0 : -1;
        for (int x = 0; x <= 22; x++) {
            for (int z = 0; z <= 20; z++) {
                BlockState s = w.get(x, floor, z);
                if (!prismarine(s)) {
                    continue;
                }
                if (Math.floorMod(x, 4) == 3 && Math.floorMod(z, 4) == 1) {
                    w.set(x, floor, z, LANTERN);
                } else if (prismarine(w.get(x, floor, z)) && open(w.get(x, floor + 1, z)) && (prismarine(w.get(x + 1, floor + 1, z))
                        || prismarine(w.get(x - 1, floor + 1, z)) || prismarine(w.get(x, floor + 1, z + 1)) || prismarine(w.get(x, floor + 1, z - 1)))) {
                    w.set(x, floor, z, DARK);   // a dark trim along the walls
                }
            }
        }
        for (int z = 2; z <= 18; z += 4) {
            for (int x : new int[]{0, 22}) {
                if (prismarine(w.get(x, 2, z))) {
                    w.set(x, 2, z, LANTERN);
                }
            }
        }
        if (design == 0) {
            w.chest(10, 1, 14, OceanLoot.MONUMENT_WING);
            w.chest(12, 1, 14, OceanLoot.MONUMENT_WING);
        } else {
            w.chest(11, 0, 16, OceanLoot.MONUMENT_WING);
            w.chest(11, 4, 11, OceanLoot.MONUMENT_WING);
        }
    }

    /** A small room (8 x 4 x 8) turned treasure room: cleared, a dark floor, lanterns, gold and two chests in the corners. */
    private static void treasure(P w) {
        for (int x = 1; x <= 6; x++) {
            for (int z = 1; z <= 6; z++) {
                for (int y = 1; y <= 3; y++) {
                    w.clear(x, y, z);
                }
                boolean centre = x >= 3 && x <= 4 && z >= 3 && z <= 4;
                if (!centre && prismarine(w.get(x, 0, z))) {
                    boolean corner = (x == 1 || x == 6) && (z == 1 || z == 6);
                    w.set(x, 0, z, corner ? LANTERN : DARK);
                }
            }
        }
        w.chest(1, 1, 1, OceanLoot.MONUMENT_TREASURE);
        w.chest(6, 1, 6, OceanLoot.MONUMENT_TREASURE);
        w.set(6, 1, 1, Blocks.GOLD_BLOCK.defaultBlockState());
        w.set(1, 1, 6, Blocks.GOLD_BLOCK.defaultBlockState());
        w.set(6, 2, 1, Blocks.RAW_GOLD_BLOCK.defaultBlockState());
        for (int[] c : new int[][]{{1, 1}, {6, 1}, {1, 6}, {6, 6}}) {
            w.set(c[0], 3, c[1], LANTERN);
        }
    }

    /** A lantern in the middle of a room's ceiling, if it's solid there. */
    private static void ceilingLight(P w) {
        int sx = w.sizeX(), sy = w.p.getBoundingBox().getYSpan(), sz = w.sizeZ();
        int x = sx / 2 - (sx > 8 ? 4 : 1), z = sz / 2 - (sz > 8 ? 4 : 1);
        for (int dx = 0; dx <= (sx > 8 ? 8 : 0); dx += 8) {
            for (int dz = 0; dz <= (sz > 8 ? 8 : 0); dz += 8) {
                if (prismarine(w.get(x + dx, sy, z + dz))) {
                    w.set(x + dx, sy, z + dz, LANTERN);
                }
            }
        }
    }

    private static boolean prismarine(BlockState s) {
        return s.is(Blocks.PRISMARINE) || s.is(Blocks.PRISMARINE_BRICKS) || s.is(Blocks.DARK_PRISMARINE);
    }

    private static boolean open(BlockState s) {
        return s.is(Blocks.WATER) || s.isAir();
    }

    // ============================================================================================ the elders

    /**
     * Vanilla's elder spawns: in the wings a guardian comes instead, the penthouse's is moved to the core (spawned by
     * the arena). Returns true if vanilla's spawn is to be skipped.
     */
    public static boolean replaceElder(StructurePiece piece, WorldGenLevel level, BoundingBox clip, int x, int y, int z) {
        if (piece instanceof OceanMonumentPieces.OceanMonumentPenthouse) {
            return true;
        }
        if (!(piece instanceof OceanMonumentPieces.OceanMonumentWingRoom)) {
            return false;
        }
        P w = new P(piece, level, clip);
        BlockPos p = w.at(x, y, z);
        if (clip.isInside(p)) {
            Guardian g = EntityType.GUARDIAN.create(level.getLevel());
            if (g != null) {
                g.heal(g.getMaxHealth());
                g.moveTo(p.getX() + 0.5, p.getY(), p.getZ() + 0.5, 0f, 0f);
                g.finalizeSpawn(level, level.getCurrentDifficultyAt(p), MobSpawnType.STRUCTURE, null);
                g.setPersistenceRequired();
                level.addFreshEntityWithPassengers(g);
            }
        }
        return true;
    }

    // ============================================================================================ the writer

    /** Writes in a monument piece's own frame (as StructurePiece does), clipped to the chunk. */
    static final class P {
        final StructurePiece p;
        final WorldGenLevel level;
        final BoundingBox clip;
        private final Direction o;
        private final BoundingBox b;

        P(StructurePiece p, WorldGenLevel level, BoundingBox clip) {
            this.p = p;
            this.level = level;
            this.clip = clip;
            this.o = p.getOrientation();
            this.b = p.getBoundingBox();
        }

        int sizeX() {
            return o == Direction.WEST || o == Direction.EAST ? b.getZSpan() : b.getXSpan();
        }

        int sizeZ() {
            return o == Direction.WEST || o == Direction.EAST ? b.getXSpan() : b.getZSpan();
        }

        BlockPos at(int x, int y, int z) {
            if (o == null) {
                return new BlockPos(x, y, z);
            }
            int wx = switch (o) {
                case WEST -> b.maxX() - z;
                case EAST -> b.minX() + z;
                default -> b.minX() + x;
            };
            int wz = switch (o) {
                case NORTH -> b.maxZ() - z;
                case SOUTH -> b.minZ() + z;
                default -> b.minZ() + x;
            };
            return new BlockPos(wx, y + b.minY(), wz);
        }

        BlockState get(int x, int y, int z) {
            BlockPos q = at(x, y, z);
            return clip.isInside(q) ? level.getBlockState(q) : Blocks.AIR.defaultBlockState();
        }

        void set(int x, int y, int z, BlockState s) {
            BlockPos q = at(x, y, z);
            if (clip.isInside(q) && !level.getBlockState(q).hasBlockEntity()) {
                level.setBlock(q, s, OceanGen.FLAGS);
            }
        }

        /** Water below the sea, air above it (as vanilla's monument water boxes). */
        void clear(int x, int y, int z) {
            BlockPos q = at(x, y, z);
            set(x, y, z, q.getY() < level.getSeaLevel() ? WATER : Blocks.AIR.defaultBlockState());
        }

        /** A waterlogged chest facing the middle of the piece. */
        void chest(int x, int y, int z, ResourceKey<LootTable> loot) {
            BlockPos q = at(x, y, z);
            if (!clip.isInside(q)) {
                return;
            }
            BlockPos mid = b.getCenter();
            int dx = mid.getX() - q.getX(), dz = mid.getZ() - q.getZ();
            Direction facing = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? Direction.EAST : Direction.WEST) : (dz > 0 ? Direction.SOUTH : Direction.NORTH);
            level.setBlock(q, Blocks.CHEST.defaultBlockState().setValue(ChestBlock.FACING, facing).setValue(ChestBlock.WATERLOGGED,
                    level.getFluidState(q).isSource() || q.getY() < level.getSeaLevel()), OceanGen.FLAGS);
            if (level.getBlockEntity(q) instanceof RandomizableContainer rc) {
                rc.setLootTable(loot, OceanGen.mix(q.asLong() ^ 0x0CEA2));
            }
        }

        /** The monument's Elder Guardian (from the chunk it is in). */
        void elder(int x, int y, int z) {
            BlockPos q = at(x, y, z);
            if (!clip.isInside(q)) {
                return;
            }
            var elder = EntityType.ELDER_GUARDIAN.create(level.getLevel());
            if (elder != null) {
                elder.heal(elder.getMaxHealth());
                elder.moveTo(q.getX() + 0.5, q.getY(), q.getZ() + 0.5, 0f, 0f);
                elder.finalizeSpawn(level, level.getCurrentDifficultyAt(q), MobSpawnType.STRUCTURE, null);
                elder.setPersistenceRequired();
                level.addFreshEntityWithPassengers(elder);
            }
        }
    }
}
