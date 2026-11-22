package dev.lowpix.winterworks.express;

import com.mojang.serialization.MapCodec;
import dev.lowpix.winterworks.registry.WWSounds;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.util.StringRepresentable;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.ItemInteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.vehicle.AbstractMinecart;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.BaseRailBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Mirror;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.BooleanProperty;
import net.minecraft.world.level.block.state.properties.DirectionProperty;
import net.minecraft.world.level.block.state.properties.EnumProperty;
import net.minecraft.world.level.block.state.properties.Property;
import net.minecraft.world.level.block.state.properties.RailShape;
import net.minecraft.world.level.material.Fluids;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * Switch Rail: a Y-junction. FACING points from the toe (the single-track end) toward the fork; BRANCH says which
 * side the branch leaves on (chosen when placed: toward a rail already there, else the half of the block you
 * clicked). Unpowered, carts from the toe run straight on; powered, they take the branch. Carts coming the other way
 * (from the straight leg or the branch) always run through to the toe. The points (SHAPE) are moved by each cart that
 * enters (mixin.AbstractMinecartMixin -> {@link #route}): the first car of a train picks the route and the cars
 * behind it take the same one, whatever the power does meanwhile. Once nothing is on it, the points go back to where
 * the power says.
 */
public class SwitchRailBlock extends BaseRailBlock implements FixedRail {
    public static final MapCodec<SwitchRailBlock> CODEC = simpleCodec(SwitchRailBlock::new);
    public static final EnumProperty<RailShape> SHAPE = EnumProperty.create("shape", RailShape.class, s -> !s.isAscending());
    public static final DirectionProperty FACING = BlockStateProperties.HORIZONTAL_FACING;
    public static final EnumProperty<Branch> BRANCH = EnumProperty.create("branch", Branch.class);
    public static final BooleanProperty POWERED = BlockStateProperties.POWERED;
    /** How long a train's route through a switch is remembered for the cars behind its leader. */
    static final int ROUTE_MEMORY = 600;

    public enum Branch implements StringRepresentable {
        LEFT("left"), RIGHT("right");

        private final String name;

        Branch(String name) {
            this.name = name;
        }

        @Override
        public String getSerializedName() {
            return name;
        }
    }

    public SwitchRailBlock(Properties props) {
        super(false, props);
        registerDefaultState(stateDefinition.any().setValue(SHAPE, RailShape.NORTH_SOUTH).setValue(FACING, Direction.NORTH)
                .setValue(BRANCH, Branch.RIGHT).setValue(POWERED, false).setValue(WATERLOGGED, false).setValue(RailPaint.COLOR, 0));
    }

    @Override
    protected MapCodec<SwitchRailBlock> codec() {
        return CODEC;
    }

    @Override
    public Property<RailShape> getShapeProperty() {
        return SHAPE;
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
        builder.add(SHAPE, FACING, BRANCH, POWERED, WATERLOGGED, RailPaint.COLOR);
    }

    // ------------------------------------------------------------------------------------------------ geometry

    public static Direction branchDir(BlockState s) {
        Direction f = s.getValue(FACING);
        return s.getValue(BRANCH) == Branch.LEFT ? f.getCounterClockWise() : f.getClockWise();
    }

    public static RailShape straight(BlockState s) {
        return s.getValue(FACING).getAxis() == Direction.Axis.Z ? RailShape.NORTH_SOUTH : RailShape.EAST_WEST;
    }

    /** The curve from the toe onto the branch. */
    public static RailShape curve(BlockState s) {
        Direction toe = s.getValue(FACING).getOpposite(), b = branchDir(s);
        boolean n = toe == Direction.NORTH || b == Direction.NORTH, e = toe == Direction.EAST || b == Direction.EAST;
        return n ? (e ? RailShape.NORTH_EAST : RailShape.NORTH_WEST) : (e ? RailShape.SOUTH_EAST : RailShape.SOUTH_WEST);
    }

    /** Where the points rest: on the branch when powered, straight on when not. */
    public static RailShape restingShape(BlockState s) {
        return s.getValue(POWERED) ? curve(s) : straight(s);
    }

    public static boolean thrown(BlockState s) {
        return s.getValue(SHAPE) != straight(s);
    }

    @Override
    public boolean ww$connectsTo(BlockState state, BlockPos self, BlockPos other) {
        int dx = other.getX() - self.getX(), dz = other.getZ() - self.getZ();
        for (Direction d : new Direction[]{state.getValue(FACING), state.getValue(FACING).getOpposite(), branchDir(state)}) {
            if (d.getStepX() == dx && d.getStepZ() == dz) {
                return true;
            }
        }
        return false;
    }

    // ------------------------------------------------------------------------------------------------ placing, power

    @Override
    public BlockState getStateForPlacement(BlockPlaceContext ctx) {
        Level level = ctx.getLevel();
        BlockPos pos = ctx.getClickedPos();
        Direction facing = ctx.getHorizontalDirection();
        Direction left = facing.getCounterClockWise(), right = facing.getClockWise();
        boolean railLeft = hasRail(level, pos.relative(left)), railRight = hasRail(level, pos.relative(right));
        Branch branch;
        if (railLeft != railRight) {
            branch = railLeft ? Branch.LEFT : Branch.RIGHT;
        } else {   // the half of the block you clicked
            Vec3 d = ctx.getClickLocation().subtract(Vec3.atCenterOf(pos));
            branch = d.x * left.getStepX() + d.z * left.getStepZ() > 0 ? Branch.LEFT : Branch.RIGHT;
        }
        BlockState s = defaultBlockState().setValue(FACING, facing).setValue(BRANCH, branch)
                .setValue(POWERED, level.hasNeighborSignal(pos))
                .setValue(WATERLOGGED, level.getFluidState(pos).getType() == Fluids.WATER);
        return s.setValue(SHAPE, restingShape(s));
    }

    private static boolean hasRail(Level level, BlockPos p) {
        return isRail(level, p) || isRail(level, p.below()) || isRail(level, p.above());
    }

    /** Its shape is its own business (see the class doc), never the neighbours'. */
    @Override
    protected BlockState updateDir(Level level, BlockPos pos, BlockState state, boolean placing) {
        return state;
    }

    @Override
    protected void onPlace(BlockState state, Level level, BlockPos pos, BlockState old, boolean moving) {
        super.onPlace(state, level, pos, old, moving);
        if (!old.is(this)) {
            updatePower(level, pos, state);
        }
    }

    /** Called by BaseRailBlock#neighborChanged when the rail survives the change. */
    @Override
    protected void updateState(BlockState state, Level level, BlockPos pos, Block block) {
        updatePower(level, pos, state);
    }

    private void updatePower(Level level, BlockPos pos, BlockState state) {
        if (level.isClientSide) {
            return;
        }
        boolean powered = level.hasNeighborSignal(pos);
        if (powered == state.getValue(POWERED)) {
            return;
        }
        BlockState s = state.setValue(POWERED, powered);
        if (!cartsOn(level, pos)) {
            s = throwPoints(level, pos, s, restingShape(s));
        }
        level.setBlock(pos, s, 3);
        level.scheduleTick(pos, this, 10);
    }

    static boolean cartsOn(Level level, BlockPos pos) {
        return !level.getEntitiesOfClass(AbstractMinecart.class, new AABB(pos).inflate(1.6, 0.5, 1.6)).isEmpty();
    }

    /** Sets the points (with a click when they move). */
    private static BlockState throwPoints(Level level, BlockPos pos, BlockState s, RailShape shape) {
        if (s.getValue(SHAPE) != shape) {
            s = s.setValue(SHAPE, shape);
            level.playSound(null, pos, WWSounds.SWITCH_RAIL_SWITCH, SoundSource.BLOCKS, 0.8f, shape == straight(s) ? 0.9f : 1.1f);
        }
        return s;
    }

    /** The points go back to where the power says once no train is passing. */
    @Override
    protected void tick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
        if (cartsOn(level, pos)) {
            level.scheduleTick(pos, this, 10);
            return;
        }
        BlockState s = throwPoints(level, pos, state, restingShape(state));
        if (s != state) {
            level.setBlock(pos, s, 3);
        }
    }

    // ------------------------------------------------------------------------------------------------ routing

    /**
     * Server, as a minecart starts moving along the rail at `pos`: sets the points for it if that rail is a switch it
     * has just rolled onto, and returns the rail state to move it along.
     */
    public static BlockState route(AbstractMinecart cart, BlockPos pos, BlockState state) {
        CartRide ride = (CartRide) cart;
        if (!(state.getBlock() instanceof SwitchRailBlock)) {
            if (ride.ww$onSwitch() != null) {
                ride.ww$setOnSwitch(null);
            }
            return state;
        }
        Level level = cart.level();
        Vec3 v = cart.getDeltaMovement();
        if (pos.equals(ride.ww$onSwitch()) || v.horizontalDistanceSqr() < 1.0e-6) {
            return state;   // already routed on this pass, or standing still
        }
        ride.ww$setOnSwitch(pos.immutable());
        Direction facing = state.getValue(FACING), toe = facing.getOpposite(), branch = branchDir(state);
        Direction from = cameFrom(cart, pos, v);
        RailShape want;
        if (from == toe) {
            want = trainRoute(cart, pos, level.getGameTime());
            if (want == null) {   // the leader: the power decides
                want = restingShape(state);
            }
            ride.ww$setRoute(pos.immutable(), want, level.getGameTime());
        } else if (from == facing) {
            want = straight(state);
        } else if (from == branch) {
            want = curve(state);
        } else {
            return state;
        }
        BlockState s = throwPoints(level, pos, state, want);
        if (s != state) {
            level.setBlock(pos, s, 3);
        }
        level.scheduleTick(pos, state.getBlock(), 10);
        return s;
    }

    /** The edge the cart came in over: opposite its motion, and the side of the block it is still nearest. */
    private static Direction cameFrom(AbstractMinecart cart, BlockPos pos, Vec3 v) {
        Vec3 d = cart.position().subtract(Vec3.atCenterOf(pos));
        Vec3 h = new Vec3(v.x, 0, v.z).normalize();
        Direction best = Direction.NORTH;
        double score = -1e9;
        for (Direction s : Direction.Plane.HORIZONTAL) {
            double sc = -(h.x * s.getStepX() + h.z * s.getStepZ()) + 1.6 * (d.x * s.getStepX() + d.z * s.getStepZ());
            if (sc > score) {
                score = sc;
                best = s;
            }
        }
        return best;
    }

    /** The route the cars ahead of this one in its train took through this switch, if they just did. */
    @Nullable
    private static RailShape trainRoute(AbstractMinecart cart, BlockPos pos, long now) {
        RailShape shape = null;
        long newest = Long.MIN_VALUE;
        for (AbstractMinecart other : Couplings.train(cart)) {
            CartRide r = (CartRide) other;
            if (other != cart && pos.equals(r.ww$routePos()) && now - r.ww$routeTime() < ROUTE_MEMORY && r.ww$routeTime() > newest) {
                newest = r.ww$routeTime();
                shape = r.ww$routeShape();
            }
        }
        return shape;
    }

    // ------------------------------------------------------------------------------------------------ misc

    @Override
    protected BlockState rotate(BlockState state, Rotation rotation) {
        BlockState s = state.setValue(FACING, rotation.rotate(state.getValue(FACING)));
        return s.setValue(SHAPE, thrown(state) ? curve(s) : straight(s));
    }

    @Override
    protected BlockState mirror(BlockState state, Mirror mirror) {
        if (mirror == Mirror.NONE) {
            return state;
        }
        BlockState s = state.setValue(FACING, mirror.mirror(state.getValue(FACING)))
                .setValue(BRANCH, state.getValue(BRANCH) == Branch.LEFT ? Branch.RIGHT : Branch.LEFT);
        return s.setValue(SHAPE, thrown(state) ? curve(s) : straight(s));
    }

    @Override
    protected ItemInteractionResult useItemOn(ItemStack stack, BlockState state, Level level, BlockPos pos, Player player,
                                              InteractionHand hand, BlockHitResult hit) {
        return RailPaint.use(stack, state, level, pos, player, hand);
    }
}
