package dev.lowpix.winterworks.nether;

import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEntities;
import java.util.ArrayList;
import java.util.List;
import java.util.function.BiConsumer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.nbt.NbtUtils;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.util.Mth;
import net.minecraft.world.RandomizableContainer;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.StructureManager;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ButtonBlock;
import net.minecraft.world.level.block.CandleBlock;
import net.minecraft.world.level.block.ChestBlock;
import net.minecraft.world.level.block.DoorBlock;
import net.minecraft.world.level.block.FenceBlock;
import net.minecraft.world.level.block.LadderBlock;
import net.minecraft.world.level.block.LanternBlock;
import net.minecraft.world.level.block.LayeredCauldronBlock;
import net.minecraft.world.level.block.LecternBlock;
import net.minecraft.world.level.block.NetherPortalBlock;
import net.minecraft.world.level.block.NetherWartBlock;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.SkullBlock;
import net.minecraft.world.level.block.StairBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.AttachFace;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.StructurePiece;
import net.minecraft.world.level.levelgen.structure.pieces.StructurePieceSerializationContext;

/**
 * One piece of a Hex Fortress (see HexFortress): the courtyard, one of the four halls (brewing rooms, storerooms and
 * the vault, the gatehouse with the portal, the witch's quarters), a corner tower or a bridge. Each is drawn in its own
 * canonical frame (halls run along x with the courtyard on +z; towers have doors on -x and +z; bridges run to -z),
 * turned into place round the fortress centre, then turned with the whole fortress.
 * <p>
 * postProcess is called once for every chunk the piece reaches into, with that chunk's box: every block write, block
 * entity and spawned mob is clipped to it, so a piece writes only inside the chunk being decorated (and its mobs are
 * spawned exactly once, by the chunk they stand in). All randomness is hashed from the fortress seed and the local
 * position, never from the per-chunk random, so pieces agree across chunk borders.
 */
public class HexFortressPiece extends StructurePiece {
    /** How deep the foundation pillars may reach to find solid ground (or the bottom of the lava sea). */
    static final int FOUNDATION = 40;
    /**
     * Send to clients, but no neighbour shape updates: built live (the command, the tests) a half-built portal frame
     * or door would otherwise pop as the next block goes in. World generation never updates neighbours anyway.
     */
    private static final int FLAGS = net.minecraft.world.level.block.Block.UPDATE_CLIENTS
            | net.minecraft.world.level.block.Block.UPDATE_KNOWN_SHAPE;

    public enum Kind {
        COURTYARD(-10, 10, -10, 10, 16),
        BREWING(-9, 9, -3, 3, 8),
        STORE(-9, 9, -3, 3, 8),
        GATE(-9, 9, -3, 3, 8),
        QUARTERS(-9, 9, -3, 3, 8),
        TOWER(-4, 4, -4, 4, 23),
        BRIDGE(-3, 3, -18, 0, 4);

        final int x0, x1, z0, z1, top;

        Kind(int x0, int x1, int z0, int z1, int top) {
            this.x0 = x0;
            this.x1 = x1;
            this.z0 = z0;
            this.z1 = z1;
            this.top = top;
        }
    }

    /** Tower flags: its ground-floor doors on the canonical -x and +z sides. */
    static final int DOOR_A = 1, DOOR_B = 2;

    private final Kind kind;
    private final BlockPos origin;
    private final Rotation fortressRot, localRot;
    private final int dx, dz, flags;
    private final long seed;

    HexFortressPiece(Kind kind, BlockPos origin, Rotation fortressRot, int dx, int dz, Rotation localRot, long seed, int flags) {
        super(NetherFeature.HEX_FORTRESS_PIECE, 0, box(kind, origin, fortressRot, dx, dz, localRot));
        this.kind = kind;
        this.origin = origin;
        this.fortressRot = fortressRot;
        this.localRot = localRot;
        this.dx = dx;
        this.dz = dz;
        this.seed = seed;
        this.flags = flags;
    }

    public HexFortressPiece(CompoundTag tag) {
        super(NetherFeature.HEX_FORTRESS_PIECE, tag);
        Kind[] kinds = Kind.values();
        this.kind = kinds[Mth.clamp(tag.getInt("Kind"), 0, kinds.length - 1)];
        this.origin = NbtUtils.readBlockPos(tag, "Origin").orElse(getBoundingBox().getCenter());
        Rotation[] rots = Rotation.values();
        this.fortressRot = rots[Mth.clamp(tag.getInt("FRot"), 0, 3)];
        this.localRot = rots[Mth.clamp(tag.getInt("LRot"), 0, 3)];
        this.dx = tag.getInt("Dx");
        this.dz = tag.getInt("Dz");
        this.seed = tag.getLong("Seed");
        this.flags = tag.getInt("Flags");
    }

    @Override
    protected void addAdditionalSaveData(StructurePieceSerializationContext ctx, CompoundTag tag) {
        tag.putInt("Kind", kind.ordinal());
        tag.put("Origin", NbtUtils.writeBlockPos(origin));
        tag.putInt("FRot", fortressRot.ordinal());
        tag.putInt("LRot", localRot.ordinal());
        tag.putInt("Dx", dx);
        tag.putInt("Dz", dz);
        tag.putLong("Seed", seed);
        tag.putInt("Flags", flags);
    }

    public Kind kind() {
        return kind;
    }

    /** The twelve pieces of a fortress centred on `origin` (the courtyard floor), in build order. */
    public static List<HexFortressPiece> layout(BlockPos origin, Rotation rot, long seed) {
        List<HexFortressPiece> out = new ArrayList<>();
        out.add(new HexFortressPiece(Kind.COURTYARD, origin, rot, 0, 0, Rotation.NONE, seed, 0));
        out.add(new HexFortressPiece(Kind.BREWING, origin, rot, 0, -14, Rotation.NONE, seed, 0));
        out.add(new HexFortressPiece(Kind.STORE, origin, rot, 14, 0, Rotation.CLOCKWISE_90, seed, 0));
        out.add(new HexFortressPiece(Kind.GATE, origin, rot, 0, 14, Rotation.CLOCKWISE_180, seed, 0));
        out.add(new HexFortressPiece(Kind.QUARTERS, origin, rot, -14, 0, Rotation.COUNTERCLOCKWISE_90, seed, 0));
        // corner towers: door A leads to the hall on their canonical -x side, door B to the one on +z. The south-east
        // tower's door A would open into the Golden Piglin's vault, so it stays walled up.
        out.add(new HexFortressPiece(Kind.TOWER, origin, rot, 14, -14, Rotation.NONE, seed, DOOR_A | DOOR_B));
        out.add(new HexFortressPiece(Kind.TOWER, origin, rot, 14, 14, Rotation.CLOCKWISE_90, seed, DOOR_B));
        out.add(new HexFortressPiece(Kind.TOWER, origin, rot, -14, 14, Rotation.CLOCKWISE_180, seed, DOOR_A | DOOR_B));
        out.add(new HexFortressPiece(Kind.TOWER, origin, rot, -14, -14, Rotation.COUNTERCLOCKWISE_90, seed, DOOR_A | DOOR_B));
        out.add(new HexFortressPiece(Kind.BRIDGE, origin, rot, 0, -18, Rotation.NONE, seed, 0));
        out.add(new HexFortressPiece(Kind.BRIDGE, origin, rot, 18, 0, Rotation.CLOCKWISE_90, seed, 0));
        out.add(new HexFortressPiece(Kind.BRIDGE, origin, rot, 0, 18, Rotation.CLOCKWISE_180, seed, 0));
        return out;
    }

    private static BlockPos transform(BlockPos origin, Rotation fortressRot, int dx, int dz, Rotation localRot, int x, int y, int z) {
        BlockPos l = new BlockPos(x, y, z).rotate(localRot);
        return origin.offset(new BlockPos(l.getX() + dx, y, l.getZ() + dz).rotate(fortressRot));
    }

    private static BoundingBox box(Kind k, BlockPos origin, Rotation fortressRot, int dx, int dz, Rotation localRot) {
        return BoundingBox.fromCorners(transform(origin, fortressRot, dx, dz, localRot, k.x0, -2 - FOUNDATION, k.z0),
                transform(origin, fortressRot, dx, dz, localRot, k.x1, k.top, k.z1));
    }

    @Override
    public void postProcess(WorldGenLevel level, StructureManager structures, ChunkGenerator generator, RandomSource random,
                            BoundingBox chunkBox, ChunkPos chunkPos, BlockPos pivot) {
        W w = new W(level, chunkBox);
        switch (kind) {
            case COURTYARD -> courtyard(w);
            case TOWER -> tower(w);
            case BRIDGE -> bridge(w);
            default -> hall(w);
        }
    }

    // ============================================================================================ the writer

    /** Writes in the piece's canonical frame, clipped to one chunk's box. */
    private final class W {
        final WorldGenLevel level;
        final BoundingBox clip;
        final Rotation stateRot = localRot.getRotated(fortressRot);

        W(WorldGenLevel level, BoundingBox clip) {
            this.level = level;
            this.clip = clip;
        }

        BlockPos at(int x, int y, int z) {
            return transform(origin, fortressRot, dx, dz, localRot, x, y, z);
        }

        boolean in(BlockPos p) {
            return clip.isInside(p) && !level.isOutsideBuildHeight(p);
        }

        void set(int x, int y, int z, BlockState s) {
            BlockPos p = at(x, y, z);
            if (in(p)) {
                level.setBlock(p, s.rotate(stateRot), FLAGS);
            }
        }

        void fill(int x0, int y0, int z0, int x1, int y1, int z1, BlockState s) {
            for (int x = x0; x <= x1; x++) {
                for (int y = y0; y <= y1; y++) {
                    for (int z = z0; z <= z1; z++) {
                        set(x, y, z, s);
                    }
                }
            }
        }

        /** A foundation pillar from `top` down to solid ground (through air, lava and loose stuff), at most FOUNDATION deep. */
        void pillar(int x, int z, int top) {
            for (int y = top; y > top - FOUNDATION; y--) {
                BlockPos p = at(x, y, z);
                if (!in(p)) {
                    return;
                }
                BlockState old = level.getBlockState(p);
                if (!old.isAir() && old.getFluidState().isEmpty() && !old.canBeReplaced()) {
                    return;
                }
                level.setBlock(p, brick(x, y, z), FLAGS);
            }
        }

        /** 0..1, the same for a position whatever chunk is being built. */
        float rnd(int x, int y, int z, int salt) {
            long h = seed ^ (kind.ordinal() + 1L) * 0x9E3779B97F4A7C15L ^ dx * 341873128712L ^ dz * 132897987541L;
            h ^= x * 0x632BE59BD9B4E019L ^ y * 0x85157AF5L ^ z * 0x2545F4914F6CDD1DL ^ salt * 0x27D4EB2FL;
            return (mix(h) >>> 40) / (float) (1 << 24);
        }

        BlockState brick(int x, int y, int z) {
            float r = rnd(x, y, z, 1);
            return r < 0.1f ? CRACKED : BRICKS;
        }

        void loot(int x, int y, int z, BlockState container) {
            BlockPos p = at(x, y, z);
            if (in(p)) {
                level.setBlock(p, container.rotate(stateRot), FLAGS);
                if (level.getBlockEntity(p) instanceof RandomizableContainer rc) {
                    rc.setLootTable(NetherFeature.FORTRESS_CHEST, mix(seed ^ p.asLong()));
                }
            }
        }

        void chest(int x, int y, int z, Direction facing) {
            loot(x, y, z, Blocks.CHEST.defaultBlockState().setValue(ChestBlock.FACING, facing));
        }

        void barrel(int x, int y, int z) {
            loot(x, y, z, Blocks.BARREL.defaultBlockState());
        }

        /** Spawns a mob standing on (x, y, z), once: only from the chunk it stands in. */
        <T extends Mob> void spawn(EntityType<T> type, int x, int y, int z, float yaw, BiConsumer<T, BlockPos> setup) {
            BlockPos p = at(x, y, z);
            if (!in(p)) {
                return;
            }
            T mob = type.create(level.getLevel());
            if (mob == null) {
                return;
            }
            mob.moveTo(p.getX() + 0.5, p.getY(), p.getZ() + 0.5, yaw + stateRot.ordinal() * 90f, 0f);
            mob.finalizeSpawn(level, level.getCurrentDifficultyAt(p), MobSpawnType.STRUCTURE, null);
            mob.setPersistenceRequired();
            setup.accept(mob, p);
            level.addFreshEntityWithPassengers(mob);
        }

        // ---- small builds

        void brazier(int x, int y, int z) {
            set(x, y, z, Blocks.CHISELED_NETHER_BRICKS.defaultBlockState());
            set(x, y + 1, z, Blocks.SOUL_SOIL.defaultBlockState());
            set(x, y + 2, z, Blocks.SOUL_FIRE.defaultBlockState());
        }

        /** An Elixir Jar hanging on a chain from the ceiling (y=6) over a soul fire in the floor. */
        void jarOverSoulFire(int x, int z) {
            set(x, -1, z, Blocks.SOUL_SOIL.defaultBlockState());
            set(x, 0, z, Blocks.SOUL_FIRE.defaultBlockState());
            set(x, 1, z, WWBlocks.ELIXIR_JAR.defaultBlockState());
            for (int y = 2; y <= 5; y++) {
                set(x, y, z, Blocks.CHAIN.defaultBlockState());
            }
        }

        void lantern(int x, int y, int z) {
            set(x, y, z, Blocks.SOUL_LANTERN.defaultBlockState().setValue(LanternBlock.HANGING, true));
        }
    }

    private static long mix(long z) {
        z = (z ^ (z >>> 33)) * 0xff51afd7ed558ccdL;
        z = (z ^ (z >>> 33)) * 0xc4ceb9fe1a85ec53L;
        return z ^ (z >>> 33);
    }

    // ============================================================================================ blocks

    private static final BlockState AIR = Blocks.AIR.defaultBlockState();
    private static final BlockState BRICKS = Blocks.NETHER_BRICKS.defaultBlockState();
    private static final BlockState CRACKED = Blocks.CRACKED_NETHER_BRICKS.defaultBlockState();
    private static final BlockState RED = Blocks.RED_NETHER_BRICKS.defaultBlockState();
    private static final BlockState CHISELED = Blocks.CHISELED_NETHER_BRICKS.defaultBlockState();

    private static BlockState fence(boolean north, boolean east, boolean south, boolean west) {
        return Blocks.NETHER_BRICK_FENCE.defaultBlockState().setValue(FenceBlock.NORTH, north).setValue(FenceBlock.EAST, east)
                .setValue(FenceBlock.SOUTH, south).setValue(FenceBlock.WEST, west);
    }

    private static final BlockState FENCE_X = fence(false, true, false, true), FENCE_Z = fence(true, false, true, false),
            POST = fence(false, false, false, false);

    private static BlockState stairs(Direction facing) {
        return Blocks.NETHER_BRICK_STAIRS.defaultBlockState().setValue(StairBlock.FACING, facing);
    }

    // ============================================================================================ courtyard

    /** The open courtyard: a red-paved cross, a great soul-fire brazier, four Nether Wart beds, braziers, piglins. */
    private void courtyard(W w) {
        for (int x = -10; x <= 10; x++) {
            for (int z = -10; z <= 10; z++) {
                w.set(x, -2, z, BRICKS);
                boolean path = Math.abs(x) <= 1 || Math.abs(z) <= 1;
                boolean rim = Math.max(Math.abs(x), Math.abs(z)) == 10;
                w.set(x, -1, z, path ? RED : rim ? CHISELED : w.brick(x, -1, z));
                for (int y = 0; y <= 15; y++) {
                    w.set(x, y, z, AIR);
                }
            }
        }
        for (int x = -10; x <= 10; x += 5) {
            for (int z = -10; z <= 10; z += 5) {
                w.pillar(x, z, -3);
            }
        }
        // the great brazier, with steps up to it
        w.brazier(0, 0, 0);
        w.set(1, 0, 0, stairs(Direction.WEST));
        w.set(-1, 0, 0, stairs(Direction.EAST));
        w.set(0, 0, 1, stairs(Direction.NORTH));
        w.set(0, 0, -1, stairs(Direction.SOUTH));
        for (int sx = -1; sx <= 1; sx += 2) {
            for (int sz = -1; sz <= 1; sz += 2) {
                w.set(sx, 0, sz, POST);
                w.set(sx, 1, sz, POST);
                w.brazier(3 * sx, 0, 3 * sz);
                wartBed(w, 6 * sx, 6 * sz);
            }
        }
        // a few piglins at home (the fortress's own)
        int[][] at = {{5, 0}, {-5, 1}, {0, -6}};
        for (int i = 0; i < at.length; i++) {
            int n = i;
            w.spawn(EntityType.PIGLIN, at[i][0], 0, at[i][1], w.rnd(n, 0, 0, 7) * 360f, (p, pos) ->
                    p.setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(w.rnd(n, 0, 0, 8) < 0.7f ? Items.GOLDEN_SWORD : Items.CROSSBOW)));
        }
    }

    /** A 5 x 3 bed of Nether Wart on soul sand, with a brick kerb and fence posts at the corners. */
    private void wartBed(W w, int cx, int cz) {
        for (int x = cx - 3; x <= cx + 3; x++) {
            for (int z = cz - 2; z <= cz + 2; z++) {
                boolean kerb = Math.abs(x - cx) == 3 || Math.abs(z - cz) == 2;
                boolean corner = Math.abs(x - cx) == 3 && Math.abs(z - cz) == 2;
                if (corner) {
                    w.set(x, 0, z, POST);
                } else if (kerb) {
                    w.set(x, 0, z, Blocks.NETHER_BRICK_SLAB.defaultBlockState());
                } else {
                    w.set(x, -1, z, Blocks.SOUL_SAND.defaultBlockState());
                    int age = 1 + (int) (w.rnd(x, 0, z, 3) * 2.999f);
                    w.set(x, 0, z, Blocks.NETHER_WART.defaultBlockState().setValue(NetherWartBlock.AGE, age));
                }
            }
        }
    }

    // ============================================================================================ halls

    /**
     * A hall (canonical: along x from -9 to 9, courtyard wall at z=+3, outer wall at z=-3; floor at y=-1, ceiling at 6,
     * a crenellated roof walk at 7). A central vestibule joins the courtyard to the bridge; walls at x=+-2 split it from
     * the two rooms (x 3..8 and -8..-3), except in the gatehouse, which is one long room.
     */
    private void hall(W w) {
        boolean bridge = kind == Kind.BREWING || kind == Kind.STORE || kind == Kind.GATE;
        boolean divided = kind != Kind.GATE;
        boolean vault = kind == Kind.STORE;   // room x 3..8 is the Golden Piglin's vault: no windows, no tower door
        for (int x = -9; x <= 9; x++) {
            for (int z = -3; z <= 3; z++) {
                boolean edge = x == -9 || x == 9 || z == -3 || z == 3;
                w.set(x, -2, z, BRICKS);
                w.set(x, -1, z, edge ? BRICKS : Math.abs(x) <= 1 || (kind == Kind.BREWING && ((x + z) & 1) == 0) ? RED : w.brick(x, -1, z));
                for (int y = 0; y <= 5; y++) {
                    w.set(x, y, z, edge ? w.brick(x, y, z) : AIR);
                }
                w.set(x, 6, z, z == -3 || z == 3 ? RED : BRICKS);
                if (z == -3) {
                    w.set(x, 7, z, (x & 1) == 0 ? w.brick(x, 7, z) : AIR);   // crenellations, outward
                } else if (z == 3) {
                    w.set(x, 7, z, x == -9 || x == 9 ? POST : FENCE_X);     // railing, over the courtyard
                } else {
                    w.set(x, 7, z, AIR);
                }
                w.set(x, 8, z, AIR);
            }
        }
        for (int x : new int[]{-9, -5, 5, 9}) {
            for (int y = 0; y <= 5; y++) {
                w.set(x, y, -3, CHISELED);
                w.set(x, y, 3, CHISELED);
            }
        }
        for (int x = -9; x <= 9; x += 3) {
            w.pillar(x, -3, -3);
            w.pillar(x, 3, -3);
        }
        // doorways: to the courtyard, to the bridge, to the towers at each end
        w.fill(-1, 0, 3, 1, 2, 3, AIR);
        w.set(0, 3, 3, CHISELED);
        if (bridge) {
            w.fill(-1, 0, -3, 1, 2, -3, AIR);
            w.set(0, 3, -3, CHISELED);
        }
        w.fill(-9, 0, 0, -9, 2, 0, AIR);
        if (!vault) {
            w.fill(9, 0, 0, 9, 2, 0, AIR);
        }
        // windows (fortress-style fence bars)
        for (int x : new int[]{-7, 7}) {
            if (vault && x > 0) {
                continue;
            }
            for (int y = 2; y <= 3; y++) {
                w.set(x, y, -3, FENCE_X);
                w.set(x, y, 3, FENCE_X);
            }
        }
        if (divided) {
            for (int x : new int[]{-2, 2}) {
                for (int z = -2; z <= 2; z++) {
                    for (int y = 0; y <= 5; y++) {
                        w.set(x, y, z, w.brick(x, y, z));
                    }
                }
                w.fill(x, 0, 0, x, 1, 0, AIR);
            }
            w.lantern(-5, 5, 0);
            w.lantern(5, 5, 0);
        }
        w.lantern(0, 5, 0);
        switch (kind) {
            case BREWING -> brewing(w);
            case STORE -> store(w);
            case GATE -> gate(w);
            case QUARTERS -> quarters(w);
            default -> {
            }
        }
    }

    /** Two brewing rooms: cauldrons and brewing stands along the outer wall, Elixir Jars hanging over soul fire. */
    private void brewing(W w) {
        for (int s = -1; s <= 1; s += 2) {
            w.set(3 * s, 0, -2, Blocks.WATER_CAULDRON.defaultBlockState().setValue(LayeredCauldronBlock.LEVEL, 3));
            w.set(4 * s, 0, -2, Blocks.BREWING_STAND.defaultBlockState());
            w.set(5 * s, 0, -2, Blocks.BREWING_STAND.defaultBlockState());
            w.set(6 * s, 0, -2, Blocks.LAVA_CAULDRON.defaultBlockState());
            w.barrel(8 * s, 0, -2);
            w.set(8 * s, 0, 2, Blocks.BOOKSHELF.defaultBlockState());
            w.set(8 * s, 1, 2, Blocks.BOOKSHELF.defaultBlockState());
            w.set(8 * s, 2, 2, Blocks.POTTED_CRIMSON_FUNGUS.defaultBlockState());
            w.jarOverSoulFire(4 * s, 2);
            w.jarOverSoulFire(7 * s, 2);
        }
    }

    /** A storeroom of chests, barrels and soul sand; behind an iron door (button outside), the Golden Piglin's vault. */
    private void store(W w) {
        // the storeroom, x -8..-3
        w.chest(-4, 0, -2, Direction.SOUTH);
        w.chest(-6, 0, -2, Direction.SOUTH);
        w.barrel(-3, 0, -2);
        w.barrel(-8, 0, -2);
        w.barrel(-8, 0, 2);
        w.set(-6, 0, 2, Blocks.SOUL_SAND.defaultBlockState());
        w.set(-7, 0, 2, Blocks.SOUL_SAND.defaultBlockState());
        w.set(-7, 1, 2, Blocks.SOUL_SAND.defaultBlockState());
        w.set(-5, 0, 2, Blocks.NETHER_WART_BLOCK.defaultBlockState());
        // the vault, x 3..8: gold on a gilded floor, chests, and its golden prisoner
        for (int x = 3; x <= 8; x++) {
            for (int z = -2; z <= 2; z++) {
                w.set(x, -1, z, ((x + z) & 1) == 0 ? Blocks.GILDED_BLACKSTONE.defaultBlockState()
                        : Blocks.POLISHED_BLACKSTONE_BRICKS.defaultBlockState());
            }
        }
        w.set(8, 0, -2, Blocks.GOLD_BLOCK.defaultBlockState());
        w.set(8, 1, -2, Blocks.GOLD_BLOCK.defaultBlockState());
        w.set(8, 0, 2, Blocks.GOLD_BLOCK.defaultBlockState());
        w.set(7, 0, -2, Blocks.RAW_GOLD_BLOCK.defaultBlockState());
        w.chest(4, 0, -2, Direction.SOUTH);
        w.chest(6, 0, -2, Direction.SOUTH);
        w.chest(5, 0, 2, Direction.NORTH);
        BlockState door = Blocks.IRON_DOOR.defaultBlockState().setValue(DoorBlock.FACING, Direction.WEST);
        w.set(2, 0, 0, door.setValue(DoorBlock.HALF, DoubleBlockHalf.LOWER));
        w.set(2, 1, 0, door.setValue(DoorBlock.HALF, DoubleBlockHalf.UPPER));
        w.set(1, 1, -1, Blocks.POLISHED_BLACKSTONE_BUTTON.defaultBlockState().setValue(ButtonBlock.FACE, AttachFace.WALL)
                .setValue(ButtonBlock.FACING, Direction.WEST));
        w.spawn(WWEntities.GOLDEN_PIGLIN, 5, 0, 0, 90f, (g, pos) -> {
        });
    }

    /** The gatehouse: the main gate through to the courtyard, a lit Nether Portal, soul-fire braziers, a guard. */
    private void gate(W w) {
        BlockState portal = Blocks.NETHER_PORTAL.defaultBlockState().setValue(NetherPortalBlock.AXIS, Direction.Axis.X);
        for (int x = -7; x <= -4; x++) {
            for (int y = 0; y <= 4; y++) {
                boolean frame = x == -7 || x == -4 || y == 0 || y == 4;
                w.set(x, y, 0, frame ? Blocks.OBSIDIAN.defaultBlockState() : portal);
            }
            for (int z = -2; z <= 2; z += 4) {
                w.set(x, -1, z, Blocks.POLISHED_BLACKSTONE.defaultBlockState());
            }
        }
        w.set(-7, -1, 1, Blocks.CRYING_OBSIDIAN.defaultBlockState());
        w.set(-4, -1, -1, Blocks.CRYING_OBSIDIAN.defaultBlockState());
        w.lantern(-5, 5, -2);
        w.lantern(-5, 5, 2);
        w.lantern(5, 5, 0);
        w.brazier(5, 0, -2);
        w.brazier(5, 0, 2);
        w.chest(8, 0, -2, Direction.SOUTH);
        w.spawn(EntityType.PIGLIN, 6, 0, 0, 90f, (p, pos) -> p.setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(Items.GOLDEN_SWORD)));
    }

    /** The Piglin Witch's quarters: her nest and her stash (chests, barrels), and her study with an Elixir Jar. */
    private void quarters(W w) {
        // her den, x -8..-3
        for (int x = -8; x <= -7; x++) {
            for (int z = -2; z <= -1; z++) {
                w.set(x, 0, z, Blocks.BROWN_WOOL.defaultBlockState());
                w.set(x, 1, z, Blocks.RED_CARPET.defaultBlockState());
            }
        }
        w.chest(-3, 0, -2, Direction.SOUTH);
        w.chest(-5, 0, -2, Direction.SOUTH);
        w.barrel(-8, 0, 2);
        w.barrel(-7, 0, 2);
        w.set(-8, 1, 2, Blocks.CANDLE.defaultBlockState().setValue(CandleBlock.CANDLES, 3).setValue(CandleBlock.LIT, true));
        w.set(-7, 1, 2, Blocks.CANDLE.defaultBlockState().setValue(CandleBlock.CANDLES, 2).setValue(CandleBlock.LIT, true));
        w.set(-3, 0, 2, Blocks.LAVA_CAULDRON.defaultBlockState());
        w.set(-4, 0, 2, Blocks.BONE_BLOCK.defaultBlockState());
        w.set(-5, 0, 2, Blocks.SKELETON_SKULL.defaultBlockState().setValue(SkullBlock.ROTATION, (int) (w.rnd(0, 0, 0, 9) * 15.99f)));
        w.set(-8, 5, -2, Blocks.COBWEB.defaultBlockState());
        w.set(-3, 5, 2, Blocks.COBWEB.defaultBlockState());
        // her study, x 3..8
        for (int x = 3; x <= 5; x++) {
            w.set(x, 0, -2, Blocks.BOOKSHELF.defaultBlockState());
            w.set(x, 1, -2, Blocks.BOOKSHELF.defaultBlockState());
        }
        w.set(4, 2, -2, Blocks.POTTED_CRIMSON_FUNGUS.defaultBlockState());
        w.set(3, 2, -2, Blocks.POTTED_WARPED_FUNGUS.defaultBlockState());
        w.set(7, 0, -2, Blocks.LECTERN.defaultBlockState().setValue(LecternBlock.FACING, Direction.SOUTH));
        w.set(8, 0, -2, Blocks.BREWING_STAND.defaultBlockState());
        w.jarOverSoulFire(5, 2);
        w.chest(8, 0, 2, Direction.NORTH);
        // and the witch herself, at home
        w.spawn(WWEntities.PIGLIN_WITCH, -5, 0, 0, 0f, (witch, pos) -> witch.setHome(pos));
    }

    // ============================================================================================ towers

    /** A corner tower: three floors joined by a ladder, doors to the halls and their roofs, a brazier on top. */
    private void tower(W w) {
        for (int x = -4; x <= 4; x++) {
            for (int z = -4; z <= 4; z++) {
                boolean edge = Math.abs(x) == 4 || Math.abs(z) == 4;
                boolean corner = Math.abs(x) == 4 && Math.abs(z) == 4;
                w.set(x, -2, z, BRICKS);
                w.set(x, -1, z, edge ? BRICKS : RED);
                for (int y = 0; y <= 19; y++) {
                    w.set(x, y, z, corner ? RED : edge ? w.brick(x, y, z) : AIR);
                }
                for (int y : new int[]{6, 13, 20}) {
                    w.set(x, y, z, corner ? RED : edge ? w.brick(x, y, z) : BRICKS);
                }
                w.set(x, 21, z, edge && ((x + z) & 1) == 0 ? w.brick(x, 21, z) : AIR);
                w.set(x, 22, z, AIR);
                w.set(x, 23, z, AIR);
            }
        }
        for (int[] p : new int[][]{{-4, -4}, {-4, 4}, {4, -4}, {4, 4}, {0, -4}, {0, 4}, {-4, 0}, {4, 0}}) {
            w.pillar(p[0], p[1], -3);
        }
        BlockState ladder = Blocks.LADDER.defaultBlockState().setValue(LadderBlock.FACING, Direction.NORTH);
        for (int y = 0; y <= 20; y++) {
            w.set(3, y, 3, ladder);
        }
        if ((flags & DOOR_A) != 0) {
            w.fill(-4, 0, 0, -4, 2, 0, AIR);
        }
        if ((flags & DOOR_B) != 0) {
            w.fill(0, 0, 4, 0, 2, 4, AIR);
        }
        w.fill(-4, 7, 0, -4, 8, 0, AIR);   // out onto the hall roofs
        w.fill(0, 7, 4, 0, 8, 4, AIR);
        for (int y : new int[]{3, 4, 10, 11, 16, 17}) {
            w.set(4, y, 0, FENCE_Z);
            w.set(0, y, -4, FENCE_X);
        }
        w.lantern(0, 5, 0);
        w.lantern(0, 12, 0);
        w.lantern(0, 19, 0);
        w.brazier(0, 21, 0);
    }

    // ============================================================================================ bridges

    /** A railed bridge out from a hall (canonical: towards -z) on arches, ending in a round bridgehead with a brazier. */
    private void bridge(W w) {
        for (int z = -13; z <= 0; z++) {
            for (int x = -2; x <= 2; x++) {
                boolean side = Math.abs(x) == 2;
                w.set(x, -1, z, side ? BRICKS : (z & 3) == 0 ? RED : w.brick(x, -1, z));
                w.set(x, -2, z, side ? BRICKS : AIR);
                for (int y = 0; y <= 3; y++) {
                    w.set(x, y, z, side && y == 0 ? FENCE_Z : AIR);
                }
            }
        }
        for (int z : new int[]{-1, -6, -11}) {
            for (int x = -2; x <= 2; x++) {
                w.set(x, -2, z, BRICKS);
            }
            w.set(-1, -3, z, stairs(Direction.EAST).setValue(StairBlock.HALF, net.minecraft.world.level.block.state.properties.Half.TOP));
            w.set(1, -3, z, stairs(Direction.WEST).setValue(StairBlock.HALF, net.minecraft.world.level.block.state.properties.Half.TOP));
            w.pillar(-2, z, -3);
            w.pillar(2, z, -3);
        }
        // the bridgehead
        for (int z = -18; z <= -14; z++) {
            for (int x = -3; x <= 3; x++) {
                boolean edgeX = Math.abs(x) == 3, edgeZ = z == -18 || (z == -14 && Math.abs(x) >= 2);
                w.set(x, -2, z, BRICKS);
                w.set(x, -1, z, edgeX || z == -18 || z == -14 ? CHISELED : RED);
                for (int y = 0; y <= 3; y++) {
                    w.set(x, y, z, AIR);
                }
                if (edgeX && edgeZ) {
                    w.set(x, 0, z, POST);
                } else if (edgeX) {
                    w.set(x, 0, z, FENCE_Z);
                } else if (edgeZ) {
                    w.set(x, 0, z, FENCE_X);
                }
            }
        }
        w.brazier(0, 0, -16);
        for (int[] p : new int[][]{{-3, -14}, {3, -14}, {-3, -18}, {3, -18}, {0, -18}}) {
            w.pillar(p[0], p[1], -3);
        }
    }
}
