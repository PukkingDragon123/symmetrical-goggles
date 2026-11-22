package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.amber.BrushableLoot;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWItems;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.entity.BrushableBlockEntity;
import net.minecraft.world.level.storage.loot.LootTable;
import org.jetbrains.annotations.Nullable;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Amber fossils hold a petrified Amberwood seed: brushing one gives an amberwood_seed (docs/AMBER_UPDATE.md section 4).
 * Also lets tamed sniffers read a suspicious block's loot (amber.BrushableLoot).
 */
@Mixin(BrushableBlockEntity.class)
public abstract class BrushableBlockEntityMixin implements BrushableLoot {
    @Shadow
    @Nullable
    private ResourceKey<LootTable> lootTable;
    @Shadow
    private long lootTableSeed;
    @Shadow
    private ItemStack item;

    @Override
    @Nullable
    public ResourceKey<LootTable> ww$lootTable() {
        return lootTable;
    }

    @Override
    public long ww$lootTableSeed() {
        return lootTableSeed;
    }

    @Override
    public ItemStack ww$item() {
        return item;
    }

    @Inject(method = "unpackLootTable", at = @At("TAIL"))
    private void ww$fossilSeed(Player player, CallbackInfo ci) {
        BrushableBlockEntity self = (BrushableBlockEntity) (Object) this;
        if (lootTable == null && self.getLevel() != null && !self.getLevel().isClientSide()
                && self.getBlockState().is(WWBlocks.AMBER_FOSSIL) && !item.is(WWItems.AMBERWOOD_SEED)) {
            item = new ItemStack(WWItems.AMBERWOOD_SEED);
            self.setChanged();
        }
    }
}
