package dev.lowpix.winterworks.express;

import net.minecraft.core.BlockPos;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.ItemInteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.DyeItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.IntegerProperty;

/** Winter Express rails can be painted: right-click with a dye to colour the sleepers, with a sponge to wash it off. */
public final class RailPaint {
    /** 0 = natural wood, 1..16 = dye id + 1. */
    public static final IntegerProperty COLOR = IntegerProperty.create("color", 0, 16);

    private RailPaint() {}

    public static ItemInteractionResult use(ItemStack stack, BlockState state, Level level, BlockPos pos, Player player, InteractionHand hand) {
        int c;
        if (stack.getItem() instanceof DyeItem dye) {
            c = dye.getDyeColor().getId() + 1;
        } else if (stack.is(Items.SPONGE) || stack.is(Items.WET_SPONGE)) {
            c = 0;
        } else {
            return ItemInteractionResult.PASS_TO_DEFAULT_BLOCK_INTERACTION;
        }
        if (state.getValue(COLOR) == c) {
            return ItemInteractionResult.PASS_TO_DEFAULT_BLOCK_INTERACTION;
        }
        if (!level.isClientSide) {
            level.setBlock(pos, state.setValue(COLOR, c), 3);
            level.playSound(null, pos, c == 0 ? SoundEvents.BUCKET_EMPTY : SoundEvents.DYE_USE, SoundSource.BLOCKS, 1.0f, 1.0f);
            if (c != 0) {
                stack.consume(1, player);
            }
        }
        return ItemInteractionResult.sidedSuccess(level.isClientSide);
    }

    /** Tint for the sleeper layer: the dye's colour, or oak brown when unpainted. */
    public static int tint(BlockState state) {
        int c = state.hasProperty(COLOR) ? state.getValue(COLOR) : 0;
        if (c == 0) {
            return 0x8A6B47;
        }
        return net.minecraft.world.item.DyeColor.byId(c - 1).getTextureDiffuseColor() & 0xFFFFFF;
    }
}
