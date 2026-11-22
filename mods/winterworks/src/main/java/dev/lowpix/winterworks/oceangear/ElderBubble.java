package dev.lowpix.winterworks.oceangear;

import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.projectile.ThrowableProjectile;
import net.minecraft.world.level.Level;

/** Stub: the gear agent owns this (docs/OCEAN_UPDATE.md section 6). */
public class ElderBubble extends ThrowableProjectile {
    public ElderBubble(EntityType<? extends ThrowableProjectile> type, Level level) {
        super(type, level);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {}
}
