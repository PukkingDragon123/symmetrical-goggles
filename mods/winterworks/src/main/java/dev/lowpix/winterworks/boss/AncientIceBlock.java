package dev.lowpix.winterworks.boss;

import com.mojang.serialization.MapCodec;
import net.minecraft.world.level.block.HalfTransparentBlock;

/** Ancient ice (docs/COLD_UPDATE.md section 6). */
public class AncientIceBlock extends HalfTransparentBlock {
    public static final MapCodec<AncientIceBlock> CODEC = simpleCodec(AncientIceBlock::new);

    public AncientIceBlock(Properties properties) {
        super(properties);
    }

    @Override
    protected MapCodec<? extends HalfTransparentBlock> codec() {
        return CODEC;
    }
}
