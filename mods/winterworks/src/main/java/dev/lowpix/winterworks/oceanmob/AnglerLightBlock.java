package dev.lowpix.winterworks.oceanmob;

import com.mojang.serialization.MapCodec;
import dev.lowpix.winterworks.registry.OceanBlocks;
import dev.lowpix.winterworks.registry.OceanSounds;
import net.minecraft.core.BlockPos;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.BaseEntityBlock;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.BlockEntityTicker;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockState;
import org.jetbrains.annotations.Nullable;

/**
 * The Angler Light (docs/OCEAN_UPDATE.md sections 2-3): a female anglerfish's glowing lure as a block. Light 15, softly
 * pulsing (its texture is animated), and players within 8 blocks get Night Vision for 30 s, refreshed every 2 s by
 * {@link AnglerLightBlockEntity}. It hums now and then (client side only).
 */
public class AnglerLightBlock extends BaseEntityBlock {
    public static final MapCodec<AnglerLightBlock> CODEC = simpleCodec(AnglerLightBlock::new);

    public AnglerLightBlock(Properties p) {
        super(p);
    }

    @Override
    protected MapCodec<? extends BaseEntityBlock> codec() {
        return CODEC;
    }

    @Override
    protected RenderShape getRenderShape(BlockState state) {
        return RenderShape.MODEL;
    }

    @Override
    public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
        return new AnglerLightBlockEntity(pos, state);
    }

    @Nullable
    @Override
    public <T extends BlockEntity> BlockEntityTicker<T> getTicker(Level level, BlockState state, BlockEntityType<T> type) {
        return level.isClientSide ? null : createTickerHelper(type, OceanBlocks.ANGLER_LIGHT_BE, AnglerLightBlockEntity::serverTick);
    }

    @Override
    public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
        if (random.nextInt(120) == 0) {
            level.playLocalSound(pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5, OceanSounds.ANGLER_LIGHT_HUM, SoundSource.BLOCKS,
                    0.35f, 0.85f + random.nextFloat() * 0.3f, false);
        }
    }
}
