package dev.lowpix.winterworks.end;

import com.mojang.serialization.MapCodec;
import dev.lowpix.winterworks.registry.EndBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.FluidTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.BonemealableBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.DoublePlantBlock;
import net.minecraft.world.level.block.state.BlockState;

/**
 * End Grass (docs/END_UPDATE.md section 2): purple grass on end stone. It needs no light (the End has no sky light):
 * it spreads to end stone next to it (vanilla grass's 3 x 5 x 3 reach) and turns back to end stone under a full block
 * or water. Bone meal grows end grass, tall end grass and, rarely, End Blooms round it.
 */
public class EndGrassBlock extends Block implements BonemealableBlock {
    public static final MapCodec<EndGrassBlock> CODEC = simpleCodec(EndGrassBlock::new);
    /** 1 in N bone-meal plants is an End Bloom; 1 in M is tall end grass. */
    static final int BLOOM_CHANCE = 48, TALL_CHANCE = 5;

    public EndGrassBlock(Properties p) {
        super(p);
    }

    @Override
    protected MapCodec<? extends Block> codec() {
        return CODEC;
    }

    /** Grass can live at `pos` when the block on top isn't a full block or water. */
    public static boolean canBeGrass(LevelReader level, BlockPos pos) {
        BlockPos up = pos.above();
        BlockState above = level.getBlockState(up);
        if (above.getFluidState().is(FluidTags.WATER)) {
            return false;
        }
        return !above.isCollisionShapeFullBlock(level, up);
    }

    @Override
    protected boolean isRandomlyTicking(BlockState state) {
        return true;
    }

    @Override
    protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource r) {
        if (!canBeGrass(level, pos)) {
            level.setBlockAndUpdate(pos, Blocks.END_STONE.defaultBlockState());
            return;
        }
        for (int i = 0; i < 4; i++) {
            BlockPos q = pos.offset(r.nextInt(3) - 1, r.nextInt(5) - 3, r.nextInt(3) - 1);
            if (level.getBlockState(q).is(Blocks.END_STONE) && canBeGrass(level, q)) {
                level.setBlockAndUpdate(q, defaultBlockState());
            }
        }
    }

    @Override
    public boolean isValidBonemealTarget(LevelReader level, BlockPos pos, BlockState state) {
        return level.getBlockState(pos.above()).isAir();
    }

    @Override
    public boolean isBonemealSuccess(Level level, RandomSource random, BlockPos pos, BlockState state) {
        return true;
    }

    /** Like vanilla grass: 128 short random walks over End Grass from the block above, planting where they end. */
    @Override
    public void performBonemeal(ServerLevel level, RandomSource r, BlockPos pos, BlockState state) {
        BlockPos start = pos.above();
        walks:
        for (int i = 0; i < 128; i++) {
            BlockPos p = start;
            for (int j = 0; j < i / 16; j++) {
                p = p.offset(r.nextInt(3) - 1, (r.nextInt(3) - 1) * r.nextInt(3) / 2, r.nextInt(3) - 1);
                if (!level.getBlockState(p.below()).is(this) || level.getBlockState(p).isCollisionShapeFullBlock(level, p)) {
                    continue walks;
                }
            }
            BlockState here = level.getBlockState(p);
            if (here.is(EndBlocks.END_GRASS) && r.nextInt(10) == 0) {
                ((BonemealableBlock) EndBlocks.END_GRASS).performBonemeal(level, r, p, here);
            }
            if (!here.isAir()) {
                continue;
            }
            BlockState plant = pick(r);
            if (!plant.canSurvive(level, p)) {
                continue;
            }
            if (plant.getBlock() instanceof DoublePlantBlock) {
                if (level.isEmptyBlock(p.above())) {
                    DoublePlantBlock.placeAt(level, plant, p, Block.UPDATE_ALL);
                }
            } else {
                level.setBlock(p, plant, Block.UPDATE_ALL);
            }
        }
    }

    /** What a bone-meal walk plants: mostly end grass, some tall end grass, rarely an End Bloom. */
    static BlockState pick(RandomSource r) {
        if (r.nextInt(BLOOM_CHANCE) == 0) {
            return EndBlocks.END_BLOOM.defaultBlockState();
        }
        return (r.nextInt(TALL_CHANCE) == 0 ? EndBlocks.TALL_END_GRASS : EndBlocks.END_GRASS).defaultBlockState();
    }

    @Override
    public Type getType() {
        return Type.NEIGHBOR_SPREADER;
    }
}
