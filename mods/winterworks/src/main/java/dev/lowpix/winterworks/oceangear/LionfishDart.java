package dev.lowpix.winterworks.oceangear;

import dev.lowpix.winterworks.registry.OceanItems;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.projectile.AbstractArrow;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;

/** Stub: the gear agent owns this (docs/OCEAN_UPDATE.md section 4). */
public class LionfishDart extends AbstractArrow {
    public LionfishDart(EntityType<? extends AbstractArrow> type, Level level) {
        super(type, level);
    }

    @Override
    protected ItemStack getDefaultPickupItem() {
        return new ItemStack(OceanItems.LIONFISH_DART);
    }
}
