package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.golem.GolemFeature;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.BaseEntityBlock;
import net.minecraft.world.level.block.DecoratedPotBlock;
import net.minecraft.world.level.block.state.BlockState;
import org.jetbrains.annotations.Nullable;
import org.spongepowered.asm.mixin.Mixin;

/**
 * Placing a decorated pot on an amber T builds a Pot Golem (docs/AMBER_UPDATE.md section 9).
 *
 * <p>Hooked at {@code setPlacedBy} (DecoratedPotBlock doesn't declare it, so the mixin adds the override): by then
 * BlockItem#place has applied the pot's sherds and contents to its block entity, which {@code onPlace} hasn't.
 */
@Mixin(DecoratedPotBlock.class)
public abstract class DecoratedPotBlockMixin extends BaseEntityBlock {
    protected DecoratedPotBlockMixin(Properties properties) {
        super(properties);
    }

    @Override
    public void setPlacedBy(Level level, BlockPos pos, BlockState state, @Nullable LivingEntity placer, ItemStack stack) {
        super.setPlacedBy(level, pos, state, placer, stack);
        if (!level.isClientSide) {
            GolemFeature.trySpawnGolem(level, pos, placer);
        }
    }
}
