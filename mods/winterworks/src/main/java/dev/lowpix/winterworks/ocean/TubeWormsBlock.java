package dev.lowpix.winterworks.ocean;

import com.mojang.serialization.MapCodec;
import dev.lowpix.winterworks.registry.OceanBlocks;
import dev.lowpix.winterworks.registry.OceanParticles;
import dev.lowpix.winterworks.registry.OceanSounds;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.SectionPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.FluidTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.SimpleWaterloggedBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.BooleanProperty;
import net.minecraft.world.level.chunk.LevelChunk;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.level.material.Fluids;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * Tube worms (docs/OCEAN_UPDATE.md section 2): a waterlogged cluster of red-plumed worms on the sea floor. They pull
 * into their tubes when a player comes within {@link #RADIUS} blocks and come out again a few seconds after the last
 * one leaves. Only Silk Touch collects them (loot table). Retracting is driven from the players' side
 * ({@link #watch}, every few ticks, only in sections that hold tube worms), so the worms themselves never tick.
 */
public class TubeWormsBlock extends Block implements SimpleWaterloggedBlock {
    public static final MapCodec<TubeWormsBlock> CODEC = simpleCodec(TubeWormsBlock::new);
    public static final BooleanProperty EXTENDED = BooleanProperty.create("extended");
    public static final BooleanProperty WATERLOGGED = BlockStateProperties.WATERLOGGED;
    /** How close a player must come to make them hide. */
    public static final double RADIUS = 4;
    /** They stay in at least this long (ticks), plus up to HIDE_RANDOM. */
    public static final int HIDE = 50, HIDE_RANDOM = 50;
    private static final VoxelShape OUT = box(2, 0, 2, 14, 13, 14), IN = box(3, 0, 3, 13, 9, 13);

    public TubeWormsBlock(Properties p) {
        super(p);
        registerDefaultState(stateDefinition.any().setValue(EXTENDED, true).setValue(WATERLOGGED, true));
    }

    @Override
    protected MapCodec<? extends Block> codec() {
        return CODEC;
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> b) {
        b.add(EXTENDED, WATERLOGGED);
    }

    @Override
    public BlockState getStateForPlacement(BlockPlaceContext ctx) {
        return defaultBlockState().setValue(WATERLOGGED, ctx.getLevel().getFluidState(ctx.getClickedPos()).getType() == Fluids.WATER);
    }

    @Override
    protected FluidState getFluidState(BlockState state) {
        return state.getValue(WATERLOGGED) ? Fluids.WATER.getSource(false) : super.getFluidState(state);
    }

    @Override
    protected boolean canSurvive(BlockState state, LevelReader level, BlockPos pos) {
        BlockPos below = pos.below();
        return level.getBlockState(below).isFaceSturdy(level, below, Direction.UP);
    }

    @Override
    protected BlockState updateShape(BlockState state, Direction dir, BlockState other, LevelAccessor level, BlockPos pos, BlockPos otherPos) {
        if (!state.canSurvive(level, pos)) {
            return state.getValue(WATERLOGGED) ? Blocks.WATER.defaultBlockState() : Blocks.AIR.defaultBlockState();
        }
        if (state.getValue(WATERLOGGED)) {
            level.scheduleTick(pos, Fluids.WATER, Fluids.WATER.getTickDelay(level));
        }
        return super.updateShape(state, dir, other, level, pos, otherPos);
    }

    @Override
    protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext ctx) {
        return state.getValue(EXTENDED) ? OUT : IN;
    }

    /** Out again once nobody is near (scheduled when they hid). */
    @Override
    protected void tick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
        if (state.getValue(EXTENDED)) {
            return;
        }
        if (playerNear(level, pos)) {
            level.scheduleTick(pos, this, 20);
            return;
        }
        level.setBlock(pos, state.setValue(EXTENDED, true), Block.UPDATE_ALL);
        if (random.nextInt(3) == 0) {
            level.playSound(null, pos, OceanSounds.TUBE_WORMS_EXTEND, SoundSource.BLOCKS, 0.5f, 0.9f + random.nextFloat() * 0.25f);
        }
    }

    @Override
    public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource r) {
        if (state.getValue(EXTENDED) && r.nextInt(14) == 0 && level.getFluidState(pos).is(FluidTags.WATER)) {
            level.addParticle(OceanParticles.BIOLUMINESCENCE, pos.getX() + 0.2 + r.nextDouble() * 0.6, pos.getY() + 0.6 + r.nextDouble() * 0.5,
                    pos.getZ() + 0.2 + r.nextDouble() * 0.6, 0, 0.004, 0);
        }
    }

    private static Vec3 body(Player p) {
        return p.position().add(0, p.getBbHeight() * 0.5, 0);
    }

    /** Whether a (non-spectator) player is within RADIUS of the worms at `pos`. */
    public static boolean playerNear(Level level, BlockPos pos) {
        Vec3 c = Vec3.atCenterOf(pos);
        double rr = RADIUS * RADIUS;
        for (Player p : level.players()) {
            if (!p.isSpectator() && p.isAlive() && body(p).distanceToSqr(c) <= rr) {
                return true;
            }
        }
        return false;
    }

    /** Makes the tube worms round every player hide. Runs every 4 ticks; skips sections without tube worms. */
    public static void watch(ServerLevel level) {
        if (level.getGameTime() % 4 != 0) {
            return;
        }
        for (ServerPlayer p : level.players()) {
            if (!p.isSpectator() && p.isAlive()) {
                hideFrom(level, body(p));
            }
        }
    }

    /** Hides the extended tube worms within RADIUS of `at`; returns how many. */
    public static int hideFrom(ServerLevel level, Vec3 at) {
        int r = (int) Math.ceil(RADIUS);
        BlockPos c = BlockPos.containing(at);
        boolean any = false;
        for (int sx = SectionPos.blockToSectionCoord(c.getX() - r); sx <= SectionPos.blockToSectionCoord(c.getX() + r) && !any; sx++) {
            for (int sz = SectionPos.blockToSectionCoord(c.getZ() - r); sz <= SectionPos.blockToSectionCoord(c.getZ() + r) && !any; sz++) {
                LevelChunk chunk = level.getChunkSource().getChunkNow(sx, sz);
                if (chunk == null) {
                    continue;
                }
                for (int sy = SectionPos.blockToSectionCoord(c.getY() - r); sy <= SectionPos.blockToSectionCoord(c.getY() + r) && !any; sy++) {
                    int i = level.getSectionIndexFromSectionY(sy);
                    any = i >= 0 && i < chunk.getSectionsCount() && chunk.getSection(i).maybeHas(s -> s.is(OceanBlocks.TUBE_WORMS));
                }
            }
        }
        if (!any) {
            return 0;
        }
        int n = 0;
        double rr = RADIUS * RADIUS;
        BlockPos.MutableBlockPos m = new BlockPos.MutableBlockPos();
        BlockPos first = null;
        for (int dx = -r; dx <= r; dx++) {
            for (int dy = -r; dy <= r; dy++) {
                for (int dz = -r; dz <= r; dz++) {
                    m.set(c.getX() + dx, c.getY() + dy, c.getZ() + dz);
                    BlockState s = level.getBlockState(m);
                    if (!s.is(OceanBlocks.TUBE_WORMS) || !s.getValue(EXTENDED) || Vec3.atCenterOf(m).distanceToSqr(at) > rr) {
                        continue;
                    }
                    level.setBlock(m, s.setValue(EXTENDED, false), Block.UPDATE_ALL);
                    level.scheduleTick(m.immutable(), s.getBlock(), HIDE + level.random.nextInt(HIDE_RANDOM));
                    if (first == null) {
                        first = m.immutable();
                    }
                    n++;
                }
            }
        }
        if (first != null) {
            level.playSound(null, first, OceanSounds.TUBE_WORMS_RETRACT, SoundSource.BLOCKS, 0.7f, 0.9f + level.random.nextFloat() * 0.25f);
        }
        return n;
    }
}
