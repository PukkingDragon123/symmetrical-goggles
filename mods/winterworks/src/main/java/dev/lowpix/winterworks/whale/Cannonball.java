package dev.lowpix.winterworks.whale;

import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.projectile.ThrowableProjectile;
import net.minecraft.world.level.Level;

/** Stub: the whale agent owns this (docs/OCEAN_UPDATE.md section 9). */
public class Cannonball extends ThrowableProjectile {
    public Cannonball(EntityType<? extends ThrowableProjectile> type, Level level) {
        super(type, level);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {}
}
