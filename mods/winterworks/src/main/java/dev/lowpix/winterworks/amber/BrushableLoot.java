package dev.lowpix.winterworks.amber;

import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.storage.loot.LootTable;
import org.jetbrains.annotations.Nullable;

/** Read access to a BrushableBlockEntity's hidden loot (mixin.BrushableBlockEntityMixin), for sniffer excavations. */
public interface BrushableLoot {
    @Nullable
    ResourceKey<LootTable> ww$lootTable();

    long ww$lootTableSeed();

    ItemStack ww$item();
}
