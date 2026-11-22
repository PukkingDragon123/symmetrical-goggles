package dev.lowpix.winterworks.endmob;

import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.projectile.ThrowableProjectile;
import net.minecraft.world.level.Level;

/** Stub: the mobs agent owns this (docs/END_UPDATE.md section 7). */
public class GuckerSpit extends ThrowableProjectile {
    public GuckerSpit(EntityType<? extends ThrowableProjectile> type, Level level) {
        super(type, level);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {}
}
