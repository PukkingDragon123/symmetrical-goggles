package dev.lowpix.winterworks.amber;

import com.mojang.serialization.MapCodec;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWParticles;
import net.minecraft.core.BlockPos;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.BushBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * The flowers crowning an Amberwood (docs/HEXES_UPDATE.md section 10): a glowing, non-colliding flower that only
 * grows on top of an amberwood log (it pops off when the log goes). Mosquitoes sip its nectar.
 */
public class AmberwoodBloomBlock extends BushBlock {
    public static final MapCodec<AmberwoodBloomBlock> CODEC = simpleCodec(AmberwoodBloomBlock::new);
    private static final VoxelShape SHAPE = Block.box(2, 0, 2, 14, 12, 14);

    public AmberwoodBloomBlock(Properties properties) {
        super(properties);
    }

    @Override
    protected MapCodec<? extends BushBlock> codec() {
        return CODEC;
    }

    @Override
    protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext ctx) {
        return SHAPE;
    }

    @Override
    protected boolean mayPlaceOn(BlockState below, BlockGetter level, BlockPos pos) {
        return below.is(WWBlocks.AMBERWOOD_LOG);
    }

    /** A faint golden glint drifting off the petals. */
    @Override
    public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
        if (random.nextInt(8) == 0) {
            level.addParticle(WWParticles.AMBER_GLINT, pos.getX() + 0.2 + random.nextDouble() * 0.6, pos.getY() + 0.5 + random.nextDouble() * 0.3,
                    pos.getZ() + 0.2 + random.nextDouble() * 0.6, 0, 0.01, 0);
        }
    }
}
