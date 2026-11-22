package dev.lowpix.winterworks.mixin.client.hex;

import java.util.List;
import net.minecraft.client.renderer.block.model.BlockModel;
import net.minecraft.client.renderer.block.model.ItemOverride;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Mutable;
import org.spongepowered.asm.mixin.gen.Accessor;

/** client.hex.CursedBooks adds the cursed-book overrides to vanilla's enchanted book model as it loads. */
@Mixin(BlockModel.class)
public interface BlockModelAccessor {
    @Accessor("overrides")
    List<ItemOverride> ww$overrides();

    @Mutable
    @Accessor("overrides")
    void ww$setOverrides(List<ItemOverride> overrides);
}
