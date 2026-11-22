package dev.lowpix.winterworks.nether;

import dev.lowpix.winterworks.hex.ElixirJarBlockEntity;
import dev.lowpix.winterworks.hex.ElixirType;
import dev.lowpix.winterworks.hex.SoulTankBlockEntity;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.soulbull.SoulBull;
import dev.lowpix.winterworks.soulbull.SoulBullSkullBlock;
import java.util.ArrayList;
import java.util.List;
import java.util.function.BiConsumer;
import java.util.function.Consumer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NbtUtils;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.RandomizableContainer;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.monster.hoglin.Hoglin;
import net.minecraft.world.entity.monster.piglin.Piglin;
import net.minecraft.world.entity.monster.piglin.PiglinBrute;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.StructureManager;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CampfireBlock;
import net.minecraft.world.level.block.CandleBlock;
import net.minecraft.world.level.block.ChainBlock;
import net.minecraft.world.level.block.ChestBlock;
import net.minecraft.world.level.block.CrossCollisionBlock;
import net.minecraft.world.level.block.FenceGateBlock;
import net.minecraft.world.level.block.LanternBlock;
import net.minecraft.world.level.block.LayeredCauldronBlock;
import net.minecraft.world.level.block.LecternBlock;
import net.minecraft.world.level.block.NetherPortalBlock;
import net.minecraft.world.level.block.NetherWartBlock;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.SkullBlock;
import net.minecraft.world.level.block.SlabBlock;
import net.minecraft.world.level.block.StairBlock;
import net.minecraft.world.level.block.WallTorchBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.Half;
import net.minecraft.world.level.block.state.properties.SlabType;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.StructurePiece;
import net.minecraft.world.level.levelgen.structure.pieces.StructurePieceSerializationContext;
import net.minecraft.world.level.storage.loot.LootTable;

/**
 * One piece of a Hex Fortress (see HexFortress; docs/FIXES_0_4.md "The Hex Fortress, reworked"). The fortress is drawn
 * in one canonical frame (x east, z south, the main gate on +z, standing level y=0, the floor at y=-1, centred on the
 * courtyard) and turned as a whole; each piece is one part of it:
 * <pre>
 *   z -20..-9  BASTION    a block of bastion masonry (blackstone, gilded blackstone, basalt) with three rooms:
 *                         the witch's quarters (west), the Nether Portal hall (middle), her experiments (east)
 *   z  -8..5   WEST       the brewing room, a nether-brick hall with fence windows
 *              COURTYARD  the wart farm round the central path, a footbridge on piers across it
 *              EAST       the storeroom
 *   z   6..14  PEN        the hoglin pen          YARD  the Soul Bull pen between the inner and outer gates
 *              TOWER      the stair tower (a spiral stair to a lookout with a brazier)
 *   z  15..20  BRIDGE     the gate bridge on piers, out to a bridgehead
 * </pre>
 * About 39 x 41 blocks. postProcess is called once for every chunk the piece reaches into, with that chunk's box:
 * every block write, block entity and spawned mob is clipped to it, so a piece writes only inside the chunk being
 * decorated (and its mobs are spawned exactly once, by the chunk they stand in). All randomness is hashed from the
 * fortress seed and the canonical position, never from the per-chunk random, so pieces agree across chunk borders.
 * Everything it spawns is the witch's crew (WitchCrew).
 */
public class HexFortressPiece extends StructurePiece {
    /** How deep the foundations may reach to find solid ground (or the bottom of the lava sea). */
    static final int FOUNDATION = 40;
    /**
     * Send to clients, but no neighbour shape updates: built live (the command, the tests) a half-built portal frame
     * or door would otherwise pop as the next block goes in. World generation never updates neighbours anyway.
     */
    private static final int FLAGS = Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE;

    public enum Kind {
        BASTION(-19, 19, -20, -9, 10),
        WEST(-19, -9, -8, 5, 8),
        COURTYARD(-8, 8, -8, 5, 8),
        EAST(9, 19, -8, 5, 8),
        PEN(-19, -7, 6, 14, 3),
        YARD(-6, 6, 6, 14, 6),
        TOWER(7, 15, 6, 14, 20),
        BRIDGE(-3, 3, 15, 20, 3);

        final int x0, x1, z0, z1, top;

        Kind(int x0, int x1, int z0, int z1, int top) {
            this.x0 = x0;
            this.x1 = x1;
            this.z0 = z0;
            this.z1 = z1;
            this.top = top;
        }
    }

    /** The whole fortress's extent in the canonical frame. */
    public static final int MIN_X = -19, MAX_X = 19, MIN_Z = -20, MAX_Z = 20;

    private final Kind kind;
    private final BlockPos origin;
    private final Rotation rot;
    private final long seed;

    HexFortressPiece(Kind kind, BlockPos origin, Rotation rot, long seed) {
        super(NetherFeature.HEX_FORTRESS_PIECE, 0, box(kind, origin, rot));
        this.kind = kind;
        this.origin = origin.immutable();
        this.rot = rot;
        this.seed = seed;
    }

    public HexFortressPiece(CompoundTag tag) {
        super(NetherFeature.HEX_FORTRESS_PIECE, tag);
        Kind[] kinds = Kind.values();
        this.kind = kinds[Mth.clamp(tag.getInt("Kind"), 0, kinds.length - 1)];
        this.origin = NbtUtils.readBlockPos(tag, "Origin").orElse(getBoundingBox().getCenter());
        this.rot = Rotation.values()[Mth.clamp(tag.getInt("Rot"), 0, 3)];
        this.seed = tag.getLong("Seed");
    }

    @Override
    protected void addAdditionalSaveData(StructurePieceSerializationContext ctx, CompoundTag tag) {
        tag.putInt("Kind", kind.ordinal());
        tag.put("Origin", NbtUtils.writeBlockPos(origin));
        tag.putInt("Rot", rot.ordinal());
        tag.putLong("Seed", seed);
    }

    public Kind kind() {
        return kind;
    }

    /** The pieces of a fortress centred on `origin` (the courtyard floor), in build order. */
    public static List<HexFortressPiece> layout(BlockPos origin, Rotation rot, long seed) {
        List<HexFortressPiece> out = new ArrayList<>();
        for (Kind k : Kind.values()) {
            out.add(new HexFortressPiece(k, origin, rot, seed));
        }
        return out;
    }

    /** A canonical position in the world. */
    public static BlockPos at(BlockPos origin, Rotation rot, int x, int y, int z) {
        return origin.offset(new BlockPos(x, y, z).rotate(rot));
    }

    private static BoundingBox box(Kind k, BlockPos origin, Rotation rot) {
        return BoundingBox.fromCorners(at(origin, rot, k.x0, -2 - FOUNDATION, k.z0), at(origin, rot, k.x1, k.top, k.z1));
    }

    // ============================================================================================ jobs

    /** A worker's job: where it stands, what it works at, and the sound of the work. */
    public record Job(BlockPos stand, BlockPos look, SoundEvent sound) {}

    /** The jobs of a fortress's piglins: the wart farm (two beds), the storeroom (chests, barrels), the brewing room. */
    public static List<Job> jobs(BlockPos origin, Rotation rot) {
        List<Job> out = new ArrayList<>();
        out.add(job(origin, rot, -2, -4, -4, -4, 0, SoundEvents.NETHER_WART_PLANTED));
        out.add(job(origin, rot, 2, 0, 4, 0, 0, SoundEvents.NETHER_WART_PLANTED));
        out.add(job(origin, rot, 16, -4, 18, -4, 0, SoundEvents.BUNDLE_INSERT));
        out.add(job(origin, rot, 12, 2, 12, 4, 0, SoundEvents.BUNDLE_REMOVE_ONE));
        out.add(job(origin, rot, -16, -3, -18, -3, 0, SoundEvents.BREWING_STAND_BREW));
        out.add(job(origin, rot, -12, 0, -14, 0, 1, SoundEvents.BOTTLE_FILL));
        return out;
    }

    private static Job job(BlockPos origin, Rotation rot, int sx, int sz, int lx, int lz, int ly, SoundEvent sound) {
        return new Job(at(origin, rot, sx, 0, sz), at(origin, rot, lx, ly, lz), sound);
    }

    /** Where the job kinds are, by name (tests and the screenshots): wart, store, brew. */
    public static BlockPos wartFarm(BlockPos origin, Rotation rot) {
        return at(origin, rot, -5, 0, -2);
    }

    public static BlockPos quarters(BlockPos origin, Rotation rot) {
        return at(origin, rot, -13, 0, -14);
    }

    public static BlockPos portal(BlockPos origin, Rotation rot) {
        return at(origin, rot, 0, 3, -18);
    }

    public static BlockPos bullYard(BlockPos origin, Rotation rot) {
        return at(origin, rot, 0, 0, 10);
    }

    public static BlockPos hoglinPen(BlockPos origin, Rotation rot) {
        return at(origin, rot, -13, 0, 10);
    }

    public static BlockPos lab(BlockPos origin, Rotation rot) {
        return at(origin, rot, 13, 0, -14);
    }

    // ============================================================================================ building

    @Override
    public void postProcess(WorldGenLevel level, StructureManager structures, ChunkGenerator generator, RandomSource random,
                            BoundingBox chunkBox, ChunkPos chunkPos, BlockPos pivot) {
        W w = new W(level, chunkBox);
        switch (kind) {
            case BASTION -> bastion(w);
            case WEST -> brewingWing(w);
            case COURTYARD -> courtyard(w);
            case EAST -> storeWing(w);
            case PEN -> hoglinPen(w);
            case YARD -> bullYard(w);
            case TOWER -> stairTower(w);
            case BRIDGE -> gateBridge(w);
        }
    }

    /** Writes in the canonical frame, clipped to one chunk's box. */
    private final class W {
        final WorldGenLevel level;
        final BoundingBox clip;

        W(WorldGenLevel level, BoundingBox clip) {
            this.level = level;
            this.clip = clip;
        }

        BlockPos at(int x, int y, int z) {
            return HexFortressPiece.at(origin, rot, x, y, z);
        }

        boolean in(BlockPos p) {
            return clip.isInside(p) && !level.isOutsideBuildHeight(p);
        }

        void set(int x, int y, int z, BlockState s) {
            BlockPos p = at(x, y, z);
            if (in(p)) {
                level.setBlock(p, s.rotate(rot), FLAGS);
            }
        }

        void fill(int x0, int y0, int z0, int x1, int y1, int z1, BlockState s) {
            for (int x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
                for (int y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
                    for (int z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
                        set(x, y, z, s);
                    }
                }
            }
        }

        /** A foundation column from `top` down to solid ground (through air, lava and loose stuff), at most FOUNDATION deep. */
        void pillar(int x, int z, int top, boolean bastion) {
            for (int y = top; y > top - FOUNDATION; y--) {
                BlockPos p = at(x, y, z);
                if (!in(p)) {
                    return;
                }
                BlockState old = level.getBlockState(p);
                if (!old.isAir() && old.getFluidState().isEmpty() && !old.canBeReplaced()) {
                    return;
                }
                level.setBlock(p, bastion ? bastionStone(x, y, z) : brick(x, y, z), FLAGS);
            }
        }

        /** 0..1, the same for a position whatever chunk is being built. */
        float rnd(int x, int y, int z, int salt) {
            long h = seed ^ 0x9E3779B97F4A7C15L ^ x * 0x632BE59BD9B4E019L ^ y * 0x85157AF5L ^ z * 0x2545F4914F6CDD1DL ^ salt * 0x27D4EB2FL;
            return (mix(h) >>> 40) / (float) (1 << 24);
        }

        BlockState brick(int x, int y, int z) {
            return rnd(x, y, z, 1) < 0.1f ? CRACKED : BRICKS;
        }

        /** Bastion masonry: polished blackstone bricks, cracked, plain blackstone, now and then a gilded block. */
        BlockState bastionStone(int x, int y, int z) {
            float r = rnd(x, y, z, 2);
            return r < 0.6f ? PBB : r < 0.75f ? CRACKED_PBB : r < 0.96f ? BLACKSTONE : GILDED;
        }

        void be(int x, int y, int z, Consumer<BlockEntity> setup) {
            BlockPos p = at(x, y, z);
            if (in(p)) {
                BlockEntity e = level.getBlockEntity(p);
                if (e != null) {
                    setup.accept(e);
                }
            }
        }

        void loot(int x, int y, int z, BlockState container, ResourceKey<LootTable> table) {
            BlockPos p = at(x, y, z);
            if (in(p)) {
                level.setBlock(p, container.rotate(rot), FLAGS);
                if (level.getBlockEntity(p) instanceof RandomizableContainer rc) {
                    rc.setLootTable(table, mix(seed ^ p.asLong()));
                }
            }
        }

        void chest(int x, int y, int z, Direction facing) {
            loot(x, y, z, Blocks.CHEST.defaultBlockState().setValue(ChestBlock.FACING, facing), NetherFeature.FORTRESS_CHEST);
        }

        void barrel(int x, int y, int z) {
            loot(x, y, z, Blocks.BARREL.defaultBlockState(), NetherFeature.FORTRESS_CHEST);
        }

        /** Spawns a mob standing on (x, y, z), once: only from the chunk it stands in. It joins the crew. */
        <T extends Mob> void spawn(EntityType<T> type, double x, int y, double z, float yaw, boolean finalize, int role,
                                   BiConsumer<T, BlockPos> setup) {
            BlockPos p = at(Mth.floor(x), y, Mth.floor(z));
            if (!in(p)) {
                return;
            }
            T mob = type.create(level.getLevel());
            if (mob == null) {
                return;
            }
            place(mob, x, y, z, yaw);
            if (finalize) {
                mob.finalizeSpawn(level, level.getCurrentDifficultyAt(p), MobSpawnType.STRUCTURE, null);
            }
            mob.setPersistenceRequired();
            WitchCrew.enlist(mob, origin, rot, role);
            setup.accept(mob, p);
            level.addFreshEntityWithPassengers(mob);
        }

        void place(Mob mob, double x, int y, double z, float yaw) {
            BlockPos p = at(Mth.floor(x), y, Mth.floor(z));
            double fx = x - Mth.floor(x), fz = z - Mth.floor(z);   // the fraction of a block, turned with the fortress
            double ox = switch (rot) {
                case CLOCKWISE_90 -> 1 - fz;
                case CLOCKWISE_180 -> 1 - fx;
                case COUNTERCLOCKWISE_90 -> fz;
                default -> fx;
            };
            double oz = switch (rot) {
                case CLOCKWISE_90 -> fx;
                case CLOCKWISE_180 -> 1 - fz;
                case COUNTERCLOCKWISE_90 -> 1 - fx;
                default -> fz;
            };
            float y2 = yaw + rot.ordinal() * 90f;
            mob.moveTo(p.getX() + ox, p.getY(), p.getZ() + oz, y2, 0f);
            mob.setYHeadRot(y2);
            mob.setYBodyRot(y2);
        }

        /** An armoured or plain Soul Bull for a pen (SoulBull.createPenBull), once, crew. */
        void bull(double x, double z, float yaw, boolean armored) {
            BlockPos p = at(Mth.floor(x), 0, Mth.floor(z));
            if (!in(p)) {
                return;
            }
            SoulBull b = SoulBull.createPenBull(level, p.getX() + 0.5, p.getY(), p.getZ() + 0.5, yaw + rot.ordinal() * 90f, armored);
            WitchCrew.enlist(b, origin, rot, WitchCrew.PEN);
            level.addFreshEntityWithPassengers(b);
        }

        // ---- small builds

        void brazier(int x, int y, int z, BlockState base) {
            set(x, y, z, base);
            set(x, y + 1, z, Blocks.SOUL_SOIL.defaultBlockState());
            set(x, y + 2, z, Blocks.SOUL_FIRE.defaultBlockState());
        }

        /** An Elixir Jar hanging on a chain from the ceiling (the block at `ceiling`) over a soul fire in the floor. */
        void jarOverSoulFire(int x, int z, int ceiling, ElixirType contents, int doses) {
            set(x, -1, z, Blocks.SOUL_SOIL.defaultBlockState());
            set(x, 0, z, Blocks.SOUL_FIRE.defaultBlockState());
            set(x, 1, z, WWBlocks.ELIXIR_JAR.defaultBlockState());
            for (int y = 2; y < ceiling; y++) {
                set(x, y, z, Blocks.CHAIN.defaultBlockState());
            }
            if (contents != ElixirType.NONE) {
                be(x, 1, z, e -> {
                    if (e instanceof ElixirJarBlockEntity jar) {
                        jar.setContents(contents, doses);
                    }
                });
            }
        }

        void lantern(int x, int y, int z) {
            set(x, y, z, Blocks.SOUL_LANTERN.defaultBlockState().setValue(LanternBlock.HANGING, true));
        }

        /** A ring of fences or bars (x0..x1, z0..z1) at height y, each joined to its neighbours on the ring. */
        void ring(int x0, int z0, int x1, int z1, int y, Block block, java.util.function.BiPredicate<Integer, Integer> gap) {
            for (int x = x0; x <= x1; x++) {
                for (int z = z0; z <= z1; z++) {
                    boolean onRing = x == x0 || x == x1 || z == z0 || z == z1;
                    if (!onRing || gap.test(x, z)) {
                        continue;
                    }
                    set(x, y, z, cross(block, on(x, z - 1, x0, z0, x1, z1, gap), on(x + 1, z, x0, z0, x1, z1, gap),
                            on(x, z + 1, x0, z0, x1, z1, gap), on(x - 1, z, x0, z0, x1, z1, gap)));
                }
            }
        }

        private boolean on(int x, int z, int x0, int z0, int x1, int z1, java.util.function.BiPredicate<Integer, Integer> gap) {
            boolean inside = x >= x0 && x <= x1 && z >= z0 && z <= z1;
            return inside && (x == x0 || x == x1 || z == z0 || z == z1) && !gap.test(x, z);
        }

        /** A 3 x 3 cage of iron bars round (cx, cz), 3 high, roofed with a slab. */
        void cage(int cx, int cz) {
            for (int y = 0; y <= 2; y++) {
                ring(cx - 1, cz - 1, cx + 1, cz + 1, y, Blocks.IRON_BARS, (a, b) -> false);
            }
            fill(cx - 1, 3, cz - 1, cx + 1, 3, cz + 1, Blocks.POLISHED_BLACKSTONE_SLAB.defaultBlockState());
            set(cx, -1, cz, Blocks.GOLD_BLOCK.defaultBlockState());
            set(cx, 0, cz, AIR);
            set(cx, 1, cz, AIR);
            set(cx, 2, cz, AIR);
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
    private static final BlockState PBB = Blocks.POLISHED_BLACKSTONE_BRICKS.defaultBlockState();
    private static final BlockState CRACKED_PBB = Blocks.CRACKED_POLISHED_BLACKSTONE_BRICKS.defaultBlockState();
    private static final BlockState BLACKSTONE = Blocks.BLACKSTONE.defaultBlockState();
    private static final BlockState PB = Blocks.POLISHED_BLACKSTONE.defaultBlockState();
    private static final BlockState GILDED = Blocks.GILDED_BLACKSTONE.defaultBlockState();
    private static final BlockState CHISELED_PB = Blocks.CHISELED_POLISHED_BLACKSTONE.defaultBlockState();
    private static final BlockState BASALT = Blocks.POLISHED_BASALT.defaultBlockState();
    private static final BlockState SOUL_SOIL = Blocks.SOUL_SOIL.defaultBlockState();
    private static final BlockState SOUL_SAND = Blocks.SOUL_SAND.defaultBlockState();

    private static BlockState cross(Block block, boolean north, boolean east, boolean south, boolean west) {
        return block.defaultBlockState().setValue(CrossCollisionBlock.NORTH, north).setValue(CrossCollisionBlock.EAST, east)
                .setValue(CrossCollisionBlock.SOUTH, south).setValue(CrossCollisionBlock.WEST, west);
    }

    private static final BlockState FENCE_X = cross(Blocks.NETHER_BRICK_FENCE, false, true, false, true),
            FENCE_Z = cross(Blocks.NETHER_BRICK_FENCE, true, false, true, false), POST = cross(Blocks.NETHER_BRICK_FENCE, false, false, false, false),
            BARS_X = cross(Blocks.IRON_BARS, false, true, false, true), BARS_Z = cross(Blocks.IRON_BARS, true, false, true, false);

    private static BlockState stairs(Block block, Direction facing, boolean top) {
        return block.defaultBlockState().setValue(StairBlock.FACING, facing).setValue(StairBlock.HALF, top ? Half.TOP : Half.BOTTOM);
    }

    private static BlockState slab(Block block, boolean top) {
        return block.defaultBlockState().setValue(SlabBlock.TYPE, top ? SlabType.TOP : SlabType.BOTTOM);
    }

    private static BlockState chain(Direction.Axis axis) {
        return Blocks.CHAIN.defaultBlockState().setValue(ChainBlock.AXIS, axis);
    }

    // ============================================================================================ the bastion block

    /**
     * The block of bastion masonry at the back (x -19..19, z -20..-9; rooms y 0..7, roof 8, battlements 9), standing on a
     * solid plinth of blackstone to the ground. Inner walls at x = +-7 split it into the witch's quarters (west), the
     * portal hall (middle) and her experiments (east); doors join the three, and open onto the brewing room, the
     * courtyard and the storeroom in front.
     */
    private void bastion(W w) {
        for (int x = -19; x <= 19; x++) {
            for (int z = -20; z <= -9; z++) {
                boolean edge = x == -19 || x == 19 || z == -20 || z == -9;
                boolean divider = x == -7 || x == 7;
                w.pillar(x, z, -2, true);
                w.set(x, -1, z, edge || divider ? PBB : bastionFloor(w, x, z));
                for (int y = 0; y <= 7; y++) {
                    w.set(x, y, z, edge || divider ? w.bastionStone(x, y, z) : AIR);
                }
                w.set(x, 8, z, edge ? PBB : w.rnd(x, 8, z, 3) < 0.15f ? BLACKSTONE : PB);
                w.set(x, 9, z, edge && ((x + z) & 1) == 0 ? Blocks.POLISHED_BLACKSTONE_BRICK_WALL.defaultBlockState() : AIR);
                w.set(x, 10, z, AIR);
            }
        }
        // basalt pillars up the faces, chiseled caps; gilded lintels over the doors
        for (int x : new int[]{-19, -13, -7, 7, 13, 19}) {
            for (int z : new int[]{-20, -9}) {
                for (int y = -1; y <= 8; y++) {
                    w.set(x, y, z, BASALT);
                }
                w.set(x, 9, z, CHISELED_PB);
            }
        }
        for (int z : new int[]{-15}) {
            for (int x : new int[]{-19, 19}) {
                for (int y = -1; y <= 8; y++) {
                    w.set(x, y, z, BASALT);
                }
                w.set(x, 9, z, CHISELED_PB);
            }
        }
        // doors: quarters <-> hall, lab <-> hall, and out to the brewing room, the courtyard and the storeroom
        w.fill(-7, 0, -13, -7, 2, -12, AIR);
        w.fill(7, 0, -13, 7, 2, -12, AIR);
        w.fill(-1, 0, -9, 1, 3, -9, AIR);
        w.set(-1, 4, -9, GILDED);
        w.set(0, 4, -9, CHISELED_PB);
        w.set(1, 4, -9, GILDED);
        w.fill(-14, 0, -9, -13, 2, -9, AIR);
        w.fill(13, 0, -9, 14, 2, -9, AIR);
        // window slits with iron bars, back and sides
        for (int x : new int[]{-16, -10, -3, 3, 10, 16}) {
            w.set(x, 2, -20, BARS_X);
            w.set(x, 3, -20, BARS_X);
        }
        for (int x : new int[]{-19, 19}) {
            for (int z : new int[]{-18, -12}) {
                w.set(x, 2, z, BARS_Z);
                w.set(x, 3, z, BARS_Z);
            }
        }
        quarters(w);
        portalHall(w);
        laboratory(w);
    }

    private static BlockState bastionFloor(W w, int x, int z) {
        if (x < -7) {   // her quarters: polished blackstone, worn
            return w.rnd(x, -1, z, 4) < 0.2f ? BLACKSTONE : PB;
        }
        if (x > 7) {   // the lab: polished blackstone and smooth basalt
            return w.rnd(x, -1, z, 4) < 0.25f ? Blocks.SMOOTH_BASALT.defaultBlockState() : PB;
        }
        return Math.floorMod(x * 3 + z * 5, 7) == 0 ? GILDED : PBB;   // the portal hall: bricks studded with gold
    }

    /** The witch's quarters (x -18..-8, z -19..-10): her nest, her stash, a desk, a brew on soul fire; a brute on guard. */
    private void quarters(W w) {
        BlockState wool = Blocks.BROWN_WOOL.defaultBlockState();
        for (int[] c : new int[][]{{-18, -19}, {-17, -19}, {-16, -19}, {-18, -18}, {-17, -18}}) {
            w.set(c[0], 0, c[1], wool);
        }
        w.set(-18, 1, -19, Blocks.RED_CARPET.defaultBlockState());
        w.set(-17, 1, -19, Blocks.RED_CARPET.defaultBlockState());
        w.set(-18, 1, -18, Blocks.RED_CARPET.defaultBlockState());
        w.set(-16, 0, -18, Blocks.RED_CARPET.defaultBlockState());
        w.set(-18, 7, -19, Blocks.COBWEB.defaultBlockState());
        w.set(-8, 7, -10, Blocks.COBWEB.defaultBlockState());
        // her stash
        w.chest(-18, 0, -14, Direction.EAST);
        w.chest(-18, 0, -12, Direction.EAST);
        w.barrel(-18, 0, -16);
        w.barrel(-18, 0, -10);
        w.set(-18, 1, -10, Blocks.CANDLE.defaultBlockState().setValue(CandleBlock.CANDLES, 3).setValue(CandleBlock.LIT, true));
        // her desk and brewing
        w.set(-12, 0, -19, Blocks.LECTERN.defaultBlockState().setValue(LecternBlock.FACING, Direction.SOUTH));
        for (int x = -11; x <= -9; x++) {
            w.set(x, 0, -19, Blocks.BOOKSHELF.defaultBlockState());
            w.set(x, 1, -19, Blocks.BOOKSHELF.defaultBlockState());
        }
        w.set(-11, 2, -19, Blocks.CANDLE.defaultBlockState().setValue(CandleBlock.CANDLES, 2).setValue(CandleBlock.LIT, true));
        w.set(-9, 2, -19, Blocks.POTTED_CRIMSON_FUNGUS.defaultBlockState());
        w.set(-14, 0, -19, Blocks.BREWING_STAND.defaultBlockState());
        w.set(-15, 0, -19, Blocks.LAVA_CAULDRON.defaultBlockState());
        w.jarOverSoulFire(-10, -15, 8, ElixirType.GREED, 2);
        w.set(-8, 0, -18, Blocks.BONE_BLOCK.defaultBlockState());
        w.set(-8, 1, -18, Blocks.SKELETON_SKULL.defaultBlockState().setValue(SkullBlock.ROTATION, (int) (w.rnd(0, 0, 0, 9) * 15.99f)));
        w.lantern(-13, 7, -14);
        w.lantern(-10, 7, -11);
        w.spawn(WWEntities.PIGLIN_WITCH, -12.5, 0, -13.5, 90f, true, WitchCrew.WITCH, (witch, pos) -> witch.setHome(pos));
        w.spawn(EntityType.PIGLIN_BRUTE, -10.5, 0, -11.5, 0f, true, WitchCrew.QUARTERS_GUARD, (b, pos) -> { });
    }

    /** The portal hall (x -6..6, z -19..-10): a lit Nether Portal on a dais, soul-fire braziers, basalt columns. */
    private void portalHall(W w) {
        w.fill(-4, 0, -19, 4, 0, -16, PBB);
        for (int x : new int[]{-4, 4}) {
            w.set(x, 0, -16, CHISELED_PB);
            w.set(x, 0, -19, CHISELED_PB);
        }
        for (int x = -2; x <= 2; x++) {
            w.set(x, 0, -15, stairs(Blocks.POLISHED_BLACKSTONE_BRICK_STAIRS, Direction.NORTH, false));
        }
        BlockState portal = Blocks.NETHER_PORTAL.defaultBlockState().setValue(NetherPortalBlock.AXIS, Direction.Axis.X);
        for (int x = -2; x <= 2; x++) {
            for (int y = 1; y <= 5; y++) {
                boolean frame = x == -2 || x == 2 || y == 1 || y == 5;
                w.set(x, y, -18, frame ? Blocks.OBSIDIAN.defaultBlockState() : portal);
            }
        }
        w.set(-4, 1, -19, Blocks.CRYING_OBSIDIAN.defaultBlockState());
        w.set(4, 1, -19, Blocks.CRYING_OBSIDIAN.defaultBlockState());
        w.set(-3, 1, -17, Blocks.CRYING_OBSIDIAN.defaultBlockState());
        w.brazier(-6, 0, -17, CHISELED_PB);
        w.brazier(6, 0, -17, CHISELED_PB);
        for (int x : new int[]{-5, 5}) {
            for (int y = 0; y <= 7; y++) {
                w.set(x, y, -11, BASALT);
            }
        }
        w.lantern(-3, 7, -12);
        w.lantern(3, 7, -12);
        w.lantern(0, 7, -15);
    }

    /**
     * Her experiments (x 8..18, z -19..-10): three cages (a Golden Piglin; a piglin and a brute caught half-turned),
     * soul tanks chained to them, bubbling cauldrons and Elixir Jars over soul fire, a table with bones and a Soul Bull
     * skull, potion stains, and a chest of the experiments' loot. A Golden Piglin shuffles about.
     */
    private void laboratory(W w) {
        int[] cages = {10, 13, 16};
        for (int cx : cages) {
            w.cage(cx, -18);
            w.set(cx, 0, -15, WWBlocks.SOUL_TANK.defaultBlockState());
            int souls = 250 + (int) (w.rnd(cx, 0, -15, 5) * 600);
            w.be(cx, 0, -15, e -> {
                if (e instanceof SoulTankBlockEntity tank) {
                    tank.setSouls(souls);
                }
            });
            for (int y = 1; y <= 6; y++) {
                w.set(cx, y, -15, chain(Direction.Axis.Y));
            }
            for (int z = -18; z <= -15; z++) {
                w.set(cx, 7, z, chain(Direction.Axis.Z));
            }
            for (int y = 4; y <= 6; y++) {
                w.set(cx, y, -18, chain(Direction.Axis.Y));
            }
        }
        w.spawn(WWEntities.GOLDEN_PIGLIN, 10.5, 0, -17.5, 0f, false, WitchCrew.EXPERIMENT, (g, pos) -> { });
        w.spawn(EntityType.PIGLIN, 13.5, 0, -17.5, 0f, false, WitchCrew.EXPERIMENT,
                (p, pos) -> PiglinGreed.setGilding(p, PiglinGreed.GILD_TICKS / 2, true));
        w.spawn(EntityType.PIGLIN_BRUTE, 16.5, 0, -17.5, 0f, false, WitchCrew.EXPERIMENT, (b, pos) -> {
            b.setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(Items.GOLDEN_AXE));
            PiglinGreed.setGilding(b, PiglinGreed.GILD_TICKS * 3 / 4, true);
        });
        // bubbling cauldrons on soul campfires, and Elixir Jars over soul fire
        BlockState campfire = Blocks.SOUL_CAMPFIRE.defaultBlockState().setValue(CampfireBlock.LIT, true);
        w.set(9, -1, -12, campfire);
        w.set(9, 0, -12, Blocks.WATER_CAULDRON.defaultBlockState().setValue(LayeredCauldronBlock.LEVEL, 3));
        w.set(13, -1, -12, campfire);
        w.set(13, 0, -12, Blocks.WATER_CAULDRON.defaultBlockState().setValue(LayeredCauldronBlock.LEVEL, 2));
        w.set(18, 0, -19, Blocks.LAVA_CAULDRON.defaultBlockState());
        w.jarOverSoulFire(11, -12, 8, ElixirType.CURSED, 3);
        w.jarOverSoulFire(15, -14, 8, ElixirType.CURSED, 1);
        // the table: bones and a Soul Bull skull
        for (int x = 15; x <= 17; x++) {
            w.set(x, 0, -11, slab(Blocks.POLISHED_BLACKSTONE_SLAB, true));
        }
        w.set(16, 1, -11, WWBlocks.SOUL_BULL_SKULL.defaultBlockState().setValue(SoulBullSkullBlock.FACING, rot.rotate(Direction.NORTH)));   // it doesn't turn itself
        w.set(15, 1, -11, Blocks.SKELETON_SKULL.defaultBlockState().setValue(SkullBlock.ROTATION, 6));
        w.set(17, 1, -11, Blocks.CANDLE.defaultBlockState().setValue(CandleBlock.CANDLES, 4).setValue(CandleBlock.LIT, true));
        w.set(18, 0, -10, Blocks.BONE_BLOCK.defaultBlockState());
        w.set(18, 0, -11, Blocks.BONE_BLOCK.defaultBlockState().setValue(RotatedPillarBlock.AXIS, Direction.Axis.X));
        w.set(18, 1, -10, Blocks.BONE_BLOCK.defaultBlockState().setValue(RotatedPillarBlock.AXIS, Direction.Axis.Z));
        // potion stains
        w.set(12, 0, -16, Blocks.LIME_CARPET.defaultBlockState());
        w.set(9, 0, -14, Blocks.PURPLE_CARPET.defaultBlockState());
        w.set(10, 0, -14, Blocks.PURPLE_CARPET.defaultBlockState());
        w.set(16, 0, -13, Blocks.MAGENTA_CARPET.defaultBlockState());
        w.set(11, 0, -10, Blocks.LIME_CARPET.defaultBlockState());
        // the experiments' loot; a brewing stand
        w.loot(18, 0, -13, Blocks.CHEST.defaultBlockState().setValue(ChestBlock.FACING, Direction.WEST), NetherFeature.EXPERIMENTS_CHEST);
        w.loot(18, 0, -14, Blocks.BARREL.defaultBlockState(), NetherFeature.EXPERIMENTS_CHEST);
        w.set(8, 0, -10, Blocks.BREWING_STAND.defaultBlockState());
        w.lantern(12, 7, -13);
        w.lantern(16, 7, -12);
        w.spawn(WWEntities.GOLDEN_PIGLIN, 12.5, 0, -13.5, 200f, false, WitchCrew.EXPERIMENT, (g, pos) -> { });
    }

    // ============================================================================================ the middle

    /**
     * A nether-brick hall of the fortress (x0..x1, z -8..5; rooms y 0..5, roof 6, battlements and a railing at 7) with
     * fence windows, standing on piers; doors to the courtyard (on the inner side) and to the bastion (north).
     */
    private void hall(W w, int x0, int x1, int innerX, int northDoor) {
        int outerX = innerX == x0 ? x1 : x0;
        for (int x = x0; x <= x1; x++) {
            for (int z = -8; z <= 5; z++) {
                boolean edge = x == x0 || x == x1 || z == -8 || z == 5;
                w.set(x, -2, z, BRICKS);
                w.set(x, -1, z, edge ? BRICKS : ((x + z) & 1) == 0 ? RED : w.brick(x, -1, z));
                for (int y = 0; y <= 5; y++) {
                    w.set(x, y, z, edge ? w.brick(x, y, z) : AIR);
                }
                w.set(x, 6, z, edge ? RED : BRICKS);
                if (x == innerX) {   // the railing over the courtyard, open where the footbridge comes in
                    w.set(x, 7, z, z >= -2 && z <= 0 ? AIR : z == -8 || z == 5 ? POST : FENCE_Z);
                } else if (edge) {
                    w.set(x, 7, z, ((x + z) & 1) == 0 ? w.brick(x, 7, z) : AIR);
                } else {
                    w.set(x, 7, z, AIR);
                }
                w.set(x, 8, z, AIR);
            }
        }
        for (int[] c : new int[][]{{x0, -8}, {x1, -8}, {x0, 5}, {x1, 5}, {(x0 + x1) / 2, -8}, {(x0 + x1) / 2, 5}}) {
            for (int y = 0; y <= 5; y++) {
                w.set(c[0], y, c[1], CHISELED);
            }
        }
        for (int z = -8; z <= 5; z += 3) {
            w.pillar(x0, z, -3, false);
            w.pillar(x1, z, -3, false);
        }
        w.pillar(x0, 5, -3, false);
        w.pillar(x1, 5, -3, false);
        // doors: to the courtyard and to the bastion
        w.fill(innerX, 0, 0, innerX, 2, 1, AIR);
        w.set(innerX, 3, 0, CHISELED);
        w.set(innerX, 3, 1, CHISELED);
        w.fill(northDoor, 0, -8, northDoor + 1, 2, -8, AIR);
        // fence windows, outward and onto the pens below
        for (int z : new int[]{-5, -1, 3}) {
            w.set(outerX, 2, z, FENCE_Z);
            w.set(outerX, 3, z, FENCE_Z);
        }
        for (int z : new int[]{-5, 3}) {
            w.set(innerX, 2, z, FENCE_Z);
            w.set(innerX, 3, z, FENCE_Z);
        }
    }

    /** The brewing room (x -19..-9): brewing stands and cauldrons along the wall, Elixir Jars hanging over soul fire. */
    private void brewingWing(W w) {
        hall(w, -19, -9, -9, -14);
        for (int x : new int[]{-16, -12}) {
            w.set(x, 2, 5, FENCE_X);
            w.set(x, 3, 5, FENCE_X);
        }
        w.set(-18, 0, -6, Blocks.BREWING_STAND.defaultBlockState());
        w.set(-18, 0, -5, Blocks.WATER_CAULDRON.defaultBlockState().setValue(LayeredCauldronBlock.LEVEL, 3));
        w.set(-18, 0, -3, Blocks.BREWING_STAND.defaultBlockState());
        w.set(-18, 0, -2, Blocks.LAVA_CAULDRON.defaultBlockState());
        w.barrel(-18, 0, 0);
        w.set(-18, 0, 2, Blocks.BREWING_STAND.defaultBlockState());
        w.set(-18, 0, 3, Blocks.WATER_CAULDRON.defaultBlockState().setValue(LayeredCauldronBlock.LEVEL, 2));
        w.barrel(-18, 0, 4);
        w.jarOverSoulFire(-14, -5, 6, ElixirType.SOUL, 3);
        w.jarOverSoulFire(-14, 0, 6, ElixirType.GREED, 3);
        w.jarOverSoulFire(-14, 4, 6, ElixirType.SOUL, 1);
        for (int z : new int[]{-7, -6}) {
            w.set(-10, 0, z, Blocks.BOOKSHELF.defaultBlockState());
            w.set(-10, 1, z, Blocks.BOOKSHELF.defaultBlockState());
        }
        w.set(-10, 2, -7, Blocks.POTTED_CRIMSON_FUNGUS.defaultBlockState());
        w.set(-10, 2, -6, Blocks.POTTED_WARPED_FUNGUS.defaultBlockState());
        w.chest(-10, 0, -4, Direction.WEST);
        w.set(-10, 0, 4, Blocks.BREWING_STAND.defaultBlockState());
        w.lantern(-16, 5, -3);
        w.lantern(-12, 5, 2);
        w.spawn(EntityType.PIGLIN, -15.5, 0, 0.5, 270f, true, WitchCrew.WORKER, HexFortressPiece::worker);
    }

    /** The storeroom (x 9..19): chests and barrels, soul sand, gold, crates; doors to the lab and the stair tower. */
    private void storeWing(W w) {
        hall(w, 9, 19, 9, 13);
        w.set(16, 2, 5, FENCE_X);
        w.set(16, 3, 5, FENCE_X);
        w.fill(11, 0, 5, 11, 2, 5, AIR);   // to the stair tower
        for (int z : new int[]{-6, -4, 0, 2}) {
            w.chest(18, 0, z, Direction.WEST);
        }
        w.barrel(18, 0, -7);
        w.barrel(18, 1, -7);
        w.barrel(17, 0, -7);
        w.barrel(18, 0, 4);
        w.barrel(17, 0, 4);
        w.barrel(12, 0, 4);
        w.barrel(10, 0, -7);
        w.barrel(10, 0, -6);
        w.barrel(10, 1, -7);
        w.set(14, 0, -7, SOUL_SAND);
        w.set(15, 0, -7, SOUL_SAND);
        w.set(14, 1, -7, SOUL_SAND);
        w.set(16, 0, -7, Blocks.NETHER_WART_BLOCK.defaultBlockState());
        w.set(13, 0, 4, Blocks.GOLD_BLOCK.defaultBlockState());
        w.set(14, 0, 4, Blocks.RAW_GOLD_BLOCK.defaultBlockState());
        w.barrel(14, 0, -2);
        w.barrel(14, 0, -1);
        w.barrel(14, 1, -2);
        w.lantern(12, 5, -3);
        w.lantern(16, 5, 1);
        w.spawn(EntityType.PIGLIN, 15.5, 0, -3.5, 90f, true, WitchCrew.WORKER, HexFortressPiece::worker);
    }

    private static void worker(Piglin p, BlockPos pos) {
        boolean crossbow = (pos.asLong() & 3) == 0;
        p.setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(crossbow ? Items.CROSSBOW : Items.GOLDEN_SWORD));
    }

    /**
     * The courtyard (x -8..8, z -8..5), open to the sky: two long beds of Nether Wart on soul sand either side of the
     * path from the portal hall to the inner gate, soul-fire braziers, and a footbridge on two piers across it,
     * joining the roofs of the brewing room and the storeroom.
     */
    private void courtyard(W w) {
        for (int x = -8; x <= 8; x++) {
            for (int z = -8; z <= 5; z++) {
                w.set(x, -2, z, BRICKS);
                w.set(x, -1, z, Math.abs(x) <= 1 ? RED : w.brick(x, -1, z));
                for (int y = 0; y <= 8; y++) {
                    w.set(x, y, z, AIR);
                }
            }
        }
        for (int x = -8; x <= 8; x += 4) {
            for (int z = -8; z <= 5; z += 4) {
                w.pillar(x, z, -3, false);
            }
        }
        for (int s = -1; s <= 1; s += 2) {
            wartBed(w, 3 * s, 7 * s, -7, 4);
            w.brazier(2 * s, 0, -7, CHISELED);
            w.brazier(2 * s, 0, 4, CHISELED);
        }
        // the footbridge: a deck at y=6 (z -2..0) on piers at x = +-2, arched over the path and the beds
        for (int x = -8; x <= 8; x++) {
            for (int z = -2; z <= 0; z++) {
                w.set(x, 6, z, z == -1 ? RED : BRICKS);
            }
            w.set(x, 7, -2, FENCE_X);
            w.set(x, 7, 0, FENCE_X);
        }
        for (int s = -1; s <= 1; s += 2) {
            for (int y = 0; y <= 5; y++) {
                w.set(2 * s, y, -1, CHISELED);
            }
            w.set(2 * s, -1, -1, CHISELED);
            for (int z = -2; z <= 0; z += 2) {
                for (int y = 0; y <= 5; y++) {
                    w.set(2 * s, y, z, y >= 4 ? BRICKS : AIR);
                }
            }
            for (int z = -2; z <= 0; z++) {
                w.set(s, 5, z, stairs(Blocks.NETHER_BRICK_STAIRS, s < 0 ? Direction.EAST : Direction.WEST, true));
                w.set(3 * s, 5, z, stairs(Blocks.NETHER_BRICK_STAIRS, s < 0 ? Direction.EAST : Direction.WEST, true));
                w.set(8 * s, 5, z, stairs(Blocks.NETHER_BRICK_STAIRS, s < 0 ? Direction.WEST : Direction.EAST, true));
            }
        }
        // the crew at work, and a brute at the inner gate
        w.spawn(EntityType.PIGLIN, -1.5, 0, -3.5, 270f, true, WitchCrew.WORKER, HexFortressPiece::worker);
        w.spawn(EntityType.PIGLIN, 1.5, 0, 1.5, 90f, true, WitchCrew.WORKER, HexFortressPiece::worker);
        w.spawn(EntityType.PIGLIN_BRUTE, 0.5, 0, 4.5, 0f, true, WitchCrew.GATE_GUARD, (b, pos) -> { });
    }

    /** A long bed of Nether Wart on soul sand (x from xa to xb, z0..z1) inside a kerb of slabs with fence posts at the corners. */
    private static void wartBed(W w, int xa, int xb, int z0, int z1) {
        int x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
        for (int x = x0; x <= x1; x++) {
            for (int z = z0; z <= z1; z++) {
                boolean kerbX = x == x0 || x == x1, kerbZ = z == z0 || z == z1;
                if (kerbX && kerbZ) {
                    w.set(x, 0, z, POST);
                } else if (kerbX || kerbZ) {
                    w.set(x, 0, z, Blocks.NETHER_BRICK_SLAB.defaultBlockState());
                } else {
                    w.set(x, -1, z, SOUL_SAND);
                    int age = 1 + (int) (w.rnd(x, 0, z, 3) * 2.999f);
                    w.set(x, 0, z, Blocks.NETHER_WART.defaultBlockState().setValue(NetherWartBlock.AGE, age));
                }
            }
        }
    }

    // ============================================================================================ the front

    /** The hoglin pen (x -19..-7, z 6..14): crimson nylium inside a fence on a low brick wall; three hoglins, kept. */
    private void hoglinPen(W w) {
        for (int x = -19; x <= -7; x++) {
            for (int z = 6; z <= 14; z++) {
                boolean edge = x == -19 || x == -7 || z == 6 || z == 14;
                w.set(x, -2, z, edge ? BRICKS : Blocks.NETHERRACK.defaultBlockState());
                w.set(x, -1, z, edge ? BRICKS : w.rnd(x, -1, z, 6) < 0.85f ? Blocks.CRIMSON_NYLIUM.defaultBlockState()
                        : Blocks.NETHER_WART_BLOCK.defaultBlockState());
                w.set(x, 0, z, edge ? BRICKS : AIR);
                for (int y = 1; y <= 3; y++) {
                    w.set(x, y, z, AIR);
                }
                if (!edge) {
                    float r = w.rnd(x, 0, z, 7);
                    if (r < 0.08f) {
                        w.set(x, 0, z, Blocks.CRIMSON_ROOTS.defaultBlockState());
                    } else if (r < 0.11f) {
                        w.set(x, 0, z, Blocks.CRIMSON_FUNGUS.defaultBlockState());
                    }
                }
            }
        }
        w.ring(-19, 6, -7, 14, 1, Blocks.NETHER_BRICK_FENCE, (x, z) -> x == -13 && z == 14);
        w.set(-13, 0, 14, Blocks.CRIMSON_FENCE_GATE.defaultBlockState().setValue(FenceGateBlock.FACING, Direction.SOUTH));
        w.set(-13, 1, 14, AIR);
        for (int x = -19; x <= -7; x += 4) {
            w.pillar(x, 6, -3, false);
            w.pillar(x, 14, -3, false);
        }
        w.pillar(-7, 6, -3, false);
        w.pillar(-7, 14, -3, false);
        for (double[] h : new double[][]{{-16.5, 9.5, 30}, {-12.5, 11.5, 200}, {-9.5, 8.5, 120}}) {
            w.spawn(EntityType.HOGLIN, h[0], 0, h[1], (float) h[2], false, WitchCrew.PEN, (hog, pos) -> hog.setAge(0));
        }
    }

    /**
     * The bull yard (x -6..6, z 6..14): a soul-sand pen lit with soul-fire braziers between the inner gate (to the
     * courtyard) and the outer gate (to the bridge). Both gates are narrow posterns, too narrow for a bull: 2-3 hostile
     * Soul Bulls (some armoured) live here, and you must get past them.
     */
    private void bullYard(W w) {
        for (int x = -6; x <= 6; x++) {
            for (int z = 6; z <= 14; z++) {
                boolean edge = x == -6 || x == 6 || z == 6 || z == 14;
                w.set(x, -2, z, BRICKS);
                w.set(x, -1, z, edge ? BRICKS : w.rnd(x, -1, z, 8) < 0.6f ? SOUL_SAND : SOUL_SOIL);
                for (int y = 0; y <= 4; y++) {
                    w.set(x, y, z, edge ? w.brick(x, y, z) : AIR);
                }
                w.set(x, 5, z, edge ? (x == -6 || x == 6 ? FENCE_Z : FENCE_X) : AIR);
                w.set(x, 6, z, AIR);
            }
        }
        for (int[] c : new int[][]{{-6, 6}, {6, 6}, {-6, 14}, {6, 14}}) {
            for (int y = 0; y <= 4; y++) {
                w.set(c[0], y, c[1], CHISELED);
            }
            w.set(c[0], 5, c[1], POST);
            w.pillar(c[0], c[1], -3, false);
        }
        for (int x = -3; x <= 3; x += 3) {
            w.pillar(x, 6, -3, false);
            w.pillar(x, 14, -3, false);
        }
        // the posterns: one block wide, two high, under a portcullis of bars
        for (int z : new int[]{6, 14}) {
            w.set(0, 0, z, AIR);
            w.set(0, 1, z, AIR);
            w.set(-1, 2, z, BARS_X);
            w.set(0, 2, z, BARS_X);
            w.set(1, 2, z, BARS_X);
            w.set(0, 3, z, CHISELED);
        }
        for (int z : new int[]{9, 11}) {
            w.set(-6, 2, z, FENCE_Z);
            w.set(-6, 3, z, FENCE_Z);
            w.set(6, 2, z, FENCE_Z);
            w.set(6, 3, z, FENCE_Z);
        }
        for (int[] c : new int[][]{{-5, 7}, {5, 7}, {-5, 13}, {5, 13}}) {
            w.brazier(c[0], 0, c[1], CHISELED);
        }
        w.set(-4, 0, 11, Blocks.BONE_BLOCK.defaultBlockState().setValue(RotatedPillarBlock.AXIS, Direction.Axis.X));
        w.set(4, 0, 9, Blocks.SKELETON_SKULL.defaultBlockState().setValue(SkullBlock.ROTATION, 3));
        // the bulls: two or three, now and then armoured
        int n = 2 + (w.rnd(0, 0, 0, 11) < 0.5f ? 1 : 0);
        double[][] at = {{-2.5, 9.5, 160}, {2.5, 11.5, 220}, {0.5, 9.0, 180}};
        for (int i = 0; i < n; i++) {
            w.bull(at[i][0], at[i][1], (float) at[i][2], w.rnd(i, 0, 0, 12) < 0.4f || i == 0);
        }
    }

    /**
     * The stair tower (x 7..15, z 6..14; walls up to 15, roof 16, battlements 17): a spiral stair round a solid newel
     * from the storeroom's door up to the roof, fence windows, a soul-fire brazier on top.
     */
    private void stairTower(W w) {
        for (int x = 7; x <= 15; x++) {
            for (int z = 6; z <= 14; z++) {
                boolean edge = x == 7 || x == 15 || z == 6 || z == 14;
                boolean core = x >= 9 && x <= 13 && z >= 8 && z <= 12;
                boolean corner = (x == 7 || x == 15) && (z == 6 || z == 14);
                w.set(x, -2, z, BRICKS);
                w.set(x, -1, z, edge ? BRICKS : RED);
                for (int y = 0; y <= 15; y++) {
                    w.set(x, y, z, corner ? CHISELED : edge || core ? w.brick(x, y, z) : AIR);
                }
                w.set(x, 16, z, edge ? RED : BRICKS);
                w.set(x, 17, z, edge && ((x + z) & 1) == 0 ? w.brick(x, 17, z) : AIR);
                for (int y = 18; y <= 20; y++) {
                    w.set(x, y, z, AIR);
                }
            }
        }
        for (int[] c : new int[][]{{7, 6}, {15, 6}, {7, 14}, {15, 14}, {11, 6}, {11, 14}, {7, 10}, {15, 10}}) {
            w.pillar(c[0], c[1], -3, false);
        }
        // the spiral: round the ring of cells about the newel, one block up per step, the steps filled in beneath
        List<int[]> ring = new ArrayList<>();
        for (int x = 11; x <= 14; x++) {
            ring.add(new int[]{x, 7});
        }
        for (int z = 8; z <= 13; z++) {
            ring.add(new int[]{14, z});
        }
        for (int x = 13; x >= 8; x--) {
            ring.add(new int[]{x, 13});
        }
        for (int z = 12; z >= 7; z--) {
            ring.add(new int[]{8, z});
        }
        for (int x = 9; x <= 10; x++) {
            ring.add(new int[]{x, 7});
        }
        int steps = 17;
        for (int i = 0; i < steps; i++) {
            int[] c = ring.get(i), next = ring.get(i + 1);
            Direction facing = Direction.fromDelta(next[0] - c[0], 0, next[1] - c[1]);
            for (int y = 0; y < i; y++) {
                w.set(c[0], y, c[1], BRICKS);
            }
            w.set(c[0], i, c[1], stairs(Blocks.NETHER_BRICK_STAIRS, facing == null ? Direction.EAST : facing, false));
            if (i >= 13 && i < 16) {
                w.set(c[0], 16, c[1], AIR);   // headroom under the roof for the last steps
                w.set(c[0], 17, c[1], AIR);
            }
        }
        // in from the storeroom
        w.fill(11, 0, 6, 11, 2, 6, AIR);
        // fence windows on every face, three storeys
        for (int y : new int[]{3, 8, 12}) {
            w.set(11, y, 6, FENCE_X);
            w.set(11, y + 1, 6, FENCE_X);
            w.set(11, y, 14, FENCE_X);
            w.set(11, y + 1, 14, FENCE_X);
            w.set(7, y, 10, FENCE_Z);
            w.set(7, y + 1, 10, FENCE_Z);
            w.set(15, y, 10, FENCE_Z);
            w.set(15, y + 1, 10, FENCE_Z);
        }
        // soul torches on the newel
        w.set(11, 4, 7, Blocks.SOUL_WALL_TORCH.defaultBlockState().setValue(WallTorchBlock.FACING, Direction.NORTH));
        w.set(14, 9, 10, Blocks.SOUL_WALL_TORCH.defaultBlockState().setValue(WallTorchBlock.FACING, Direction.EAST));
        w.set(11, 14, 13, Blocks.SOUL_WALL_TORCH.defaultBlockState().setValue(WallTorchBlock.FACING, Direction.SOUTH));
        w.brazier(11, 17, 10, CHISELED);
    }

    /** The gate bridge (x -3..3, z 15..20): a railed deck on piers from the outer gate to a bridgehead with braziers. */
    private void gateBridge(W w) {
        for (int z = 15; z <= 17; z++) {
            for (int x = -2; x <= 2; x++) {
                boolean side = Math.abs(x) == 2;
                w.set(x, -1, z, side ? BRICKS : (z & 1) == 0 ? RED : w.brick(x, -1, z));
                w.set(x, -2, z, side || z == 16 ? BRICKS : AIR);
                for (int y = 0; y <= 3; y++) {
                    w.set(x, y, z, side && y == 0 ? FENCE_Z : AIR);
                }
            }
        }
        w.set(-1, -3, 16, stairs(Blocks.NETHER_BRICK_STAIRS, Direction.EAST, true));
        w.set(1, -3, 16, stairs(Blocks.NETHER_BRICK_STAIRS, Direction.WEST, true));
        w.pillar(-2, 16, -3, false);
        w.pillar(2, 16, -3, false);
        // the bridgehead
        for (int z = 18; z <= 20; z++) {
            for (int x = -3; x <= 3; x++) {
                boolean rimX = Math.abs(x) == 3, rimZ = z == 20, joint = z == 18 && Math.abs(x) <= 1;
                w.set(x, -2, z, BRICKS);
                w.set(x, -1, z, rimX || rimZ ? CHISELED : RED);
                for (int y = 0; y <= 3; y++) {
                    w.set(x, y, z, AIR);
                }
                if (joint) {
                    continue;
                }
                if (rimX && (rimZ || z == 18)) {
                    w.set(x, 0, z, POST);
                } else if (rimX) {
                    w.set(x, 0, z, FENCE_Z);
                } else if (rimZ) {
                    w.set(x, 0, z, FENCE_X);
                } else if (z == 18) {
                    w.set(x, 0, z, FENCE_X);
                }
            }
        }
        w.brazier(-2, 0, 20, CHISELED);
        w.brazier(2, 0, 20, CHISELED);
        for (int[] c : new int[][]{{-3, 18}, {3, 18}, {-3, 20}, {3, 20}, {0, 20}}) {
            w.pillar(c[0], c[1], -3, false);
        }
        // a brute at the outer gate, and a hoglin jockey on patrol
        w.spawn(EntityType.PIGLIN_BRUTE, 1.5, 0, 15.5, 0f, true, WitchCrew.GATE_GUARD, (b, pos) -> { });
        w.spawn(EntityType.HOGLIN, 0.5, 0, 18.8, 180f, false, WitchCrew.PEN, (hog, pos) -> {
            hog.setAge(0);
            Piglin rider = HoglinJockeys.mount(w.level, hog);
            if (rider != null) {
                WitchCrew.enlist(rider, origin, rot, WitchCrew.GATE_GUARD);
            }
        });
    }
}
