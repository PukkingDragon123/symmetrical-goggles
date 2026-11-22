package dev.lowpix.winterworks.end;

import com.mojang.serialization.MapCodec;
import dev.lowpix.winterworks.Winterworks;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.BonemealableBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.feature.ConfiguredFeature;

/**
 * End Moss (docs/END_UPDATE.md section 2): alien moss. Bone meal spreads it over end stone and End Grass round it,
 * with moss carpets and end grass on top, like vanilla moss: the configured feature winterworks:end_moss_patch_bonemeal
 * (a vegetation patch over #winterworks:end_moss_replaceable; data from tools/data_end_world.py).
 */
public class EndMossBlock extends Block implements BonemealableBlock {
    public static final MapCodec<EndMossBlock> CODEC = simpleCodec(EndMossBlock::new);
    public static final ResourceKey<ConfiguredFeature<?, ?>> PATCH_BONEMEAL = ResourceKey.create(Registries.CONFIGURED_FEATURE,
            Winterworks.id("end_moss_patch_bonemeal"));

    public EndMossBlock(Properties p) {
        super(p);
    }

    @Override
    protected MapCodec<? extends Block> codec() {
        return CODEC;
    }

    @Override
    public boolean isValidBonemealTarget(LevelReader level, BlockPos pos, BlockState state) {
        return level.getBlockState(pos.above()).isAir();
    }

    @Override
    public boolean isBonemealSuccess(Level level, RandomSource random, BlockPos pos, BlockState state) {
        return true;
    }

    @Override
    public void performBonemeal(ServerLevel level, RandomSource random, BlockPos pos, BlockState state) {
        level.registryAccess().registry(Registries.CONFIGURED_FEATURE).flatMap(r -> r.getHolder(PATCH_BONEMEAL))
                .ifPresent(f -> f.value().place(level, level.getChunkSource().getGenerator(), random, pos.above()));
    }

    @Override
    public Type getType() {
        return Type.NEIGHBOR_SPREADER;
    }
}
