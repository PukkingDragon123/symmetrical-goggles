package dev.lowpix.winterworks.amber;

import com.mojang.serialization.MapCodec;
import dev.lowpix.winterworks.registry.WWParticles;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BooleanProperty;

/**
 * Amberwood log (docs/AMBER_UPDATE.md section 5): now and then it oozes resin (resin=true, a dripping amber texture).
 * Mosquitoes drink the resin (the log goes back to resin=false) and become amber-full.
 */
public class AmberwoodLogBlock extends RotatedPillarBlock {
    public static final BooleanProperty RESIN = BooleanProperty.create("resin");
    public static final MapCodec<AmberwoodLogBlock> CODEC = simpleCodec(AmberwoodLogBlock::new);
    /** 1 in N random ticks starts oozing: a few minutes on average. */
    public static final int OOZE_CHANCE = 4;

    public AmberwoodLogBlock(Properties properties) {
        super(properties);
        registerDefaultState(defaultBlockState().setValue(RESIN, false));
    }

    @Override
    public MapCodec<? extends RotatedPillarBlock> codec() {
        return CODEC;
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> b) {
        super.createBlockStateDefinition(b);
        b.add(RESIN);
    }

    @Override
    protected boolean isRandomlyTicking(BlockState state) {
        return !state.getValue(RESIN);
    }

    @Override
    protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
        if (!state.getValue(RESIN) && random.nextInt(OOZE_CHANCE) == 0) {
            level.setBlock(pos, state.setValue(RESIN, true), Block.UPDATE_ALL);
        }
    }

    /** Resin logs drip honey-thick amber from their open sides. */
    @Override
    public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
        if (!state.getValue(RESIN) || random.nextInt(3) != 0) {
            return;
        }
        Direction d = Direction.Plane.HORIZONTAL.getRandomDirection(random);
        BlockPos side = pos.relative(d);
        if (!level.getBlockState(side).getCollisionShape(level, side).isEmpty()) {
            return;
        }
        double along = (random.nextDouble() - 0.5) * 0.7;
        double x = pos.getX() + 0.5 + d.getStepX() * 0.53 + (d.getStepX() == 0 ? along : 0);
        double z = pos.getZ() + 0.5 + d.getStepZ() * 0.53 + (d.getStepZ() == 0 ? along : 0);
        double y = pos.getY() + 0.25 + random.nextDouble() * 0.4;
        level.addParticle(random.nextInt(3) == 0 ? WWParticles.AMBER_GLINT : ParticleTypes.DRIPPING_HONEY, x, y, z, 0, 0, 0);
    }
}
