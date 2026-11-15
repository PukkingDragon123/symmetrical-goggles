package dev.lowpix.winterworks.boss;

import com.mojang.serialization.MapCodec;
import net.minecraft.world.level.block.Block;

/** A hanging icicle (docs/COLD_UPDATE.md section 6). */
public class IcicleBlock extends Block {
    public static final MapCodec<IcicleBlock> CODEC = simpleCodec(IcicleBlock::new);

    public IcicleBlock(Properties properties) {
        super(properties);
    }

    @Override
    protected MapCodec<? extends Block> codec() {
        return CODEC;
    }
}
