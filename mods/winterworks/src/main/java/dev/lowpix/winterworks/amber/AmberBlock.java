package dev.lowpix.winterworks.amber;

import com.mojang.serialization.MapCodec;
import net.minecraft.util.StringRepresentable;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.HalfTransparentBlock;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.EnumProperty;

/** Amber (docs/AMBER_UPDATE.md section 4): you can see what's trapped inside. */
public class AmberBlock extends HalfTransparentBlock {
    public enum Inclusion implements StringRepresentable {
        NONE, SEED, MOSQUITO;

        @Override
        public String getSerializedName() {
            return name().toLowerCase(java.util.Locale.ROOT);
        }
    }

    public static final EnumProperty<Inclusion> INCLUSION = EnumProperty.create("inclusion", Inclusion.class);
    public static final MapCodec<AmberBlock> CODEC = simpleCodec(AmberBlock::new);

    public AmberBlock(Properties properties) {
        super(properties);
        registerDefaultState(stateDefinition.any().setValue(INCLUSION, Inclusion.NONE));
    }

    @Override
    protected MapCodec<? extends HalfTransparentBlock> codec() {
        return CODEC;
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, net.minecraft.world.level.block.state.BlockState> b) {
        b.add(INCLUSION);
    }
}
