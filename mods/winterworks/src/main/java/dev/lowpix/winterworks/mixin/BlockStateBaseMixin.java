package dev.lowpix.winterworks.mixin;

import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import dev.lowpix.winterworks.amber.AmberBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.BlockState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;

/**
 * Only amber with an inclusion has a block entity (docs/HEXES_UPDATE.md section 10): plain amber states report no
 * block entity, so the chunk and world generation never create (or warn about) one for them.
 */
@Mixin(BlockBehaviour.BlockStateBase.class)
public abstract class BlockStateBaseMixin {
    @Shadow
    public abstract Block getBlock();

    @ModifyReturnValue(method = "hasBlockEntity", at = @At("RETURN"))
    private boolean ww$amberInclusionOnly(boolean has) {
        return has && (!(getBlock() instanceof AmberBlock) || AmberBlock.hasInclusion((BlockState) (Object) this));
    }
}
