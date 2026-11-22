package dev.lowpix.winterworks.boss;

import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWDamage;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWParticles;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.HashSet;
import java.util.Set;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.MoverType;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;

/**
 * A falling icicle (docs/COLD_UPDATE.md section 6): drops like a stone, skewers whatever it hits for 6 damage and
 * shatters into ice shards when it hits anything (an entity or the ground). It never lands as a block.
 */
public class FallingIcicleEntity extends Entity {
    private static final EntityDataAccessor<Boolean> TIP = SynchedEntityData.defineId(FallingIcicleEntity.class, EntityDataSerializers.BOOLEAN);
    public static final float DAMAGE = 6.0f;
    private final Set<Integer> hit = new HashSet<>();
    private int time;

    public FallingIcicleEntity(EntityType<? extends FallingIcicleEntity> type, Level level) {
        super(type, level);
        this.blocksBuilding = true;
    }

    /** Turns an icicle block into a falling icicle. */
    public static FallingIcicleEntity fall(Level level, BlockPos pos, BlockState state) {
        boolean tip = !state.hasProperty(IcicleBlock.TIP) || state.getValue(IcicleBlock.TIP);
        level.setBlock(pos, state.getFluidState().createLegacyBlock(), 3);
        return spawn(level, pos.getX() + 0.5, pos.getY(), pos.getZ() + 0.5, tip);
    }

    /** A loose icicle (shaken off a ceiling by a roar, say). */
    public static FallingIcicleEntity spawn(Level level, double x, double y, double z, boolean tip) {
        FallingIcicleEntity e = new FallingIcicleEntity(WWEntities.FALLING_ICICLE, level);
        e.setTip(tip);
        e.setPos(x, y, z);
        e.xo = x;
        e.yo = y;
        e.zo = z;
        level.addFreshEntity(e);
        return e;
    }

    public boolean isTip() {
        return entityData.get(TIP);
    }

    public void setTip(boolean tip) {
        entityData.set(TIP, tip);
    }

    /** What it looks like: the icicle block it broke off from. */
    public BlockState blockState() {
        return WWBlocks.ICICLE.defaultBlockState().setValue(IcicleBlock.TIP, isTip());
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        builder.define(TIP, true);
    }

    @Override
    protected double getDefaultGravity() {
        return 0.06;
    }

    @Override
    public boolean isAttackable() {
        return false;
    }

    @Override
    public boolean isPickable() {
        return false;
    }

    @Override
    protected MovementEmission getMovementEmission() {
        return MovementEmission.NONE;
    }

    @Override
    public void tick() {
        super.tick();
        time++;
        applyGravity();
        move(MoverType.SELF, getDeltaMovement());
        setDeltaMovement(getDeltaMovement().scale(0.98));
        if (level().isClientSide) {
            if (time % 2 == 0) {
                level().addParticle(ParticleTypes.SNOWFLAKE, getX(), getY() + 0.8, getZ(), 0, 0.02, 0);
            }
            return;
        }
        ServerLevel sl = (ServerLevel) level();
        boolean struck = false;
        for (Entity e : sl.getEntities(this, getBoundingBox().expandTowards(getDeltaMovement()), e -> e instanceof LivingEntity le
                && le.isAlive() && !(e instanceof Player p && (p.isSpectator() || p.isCreative())))) {
            if (hit.add(e.getId())) {
                e.hurt(WWDamage.source(sl, WWDamage.FALLING_ICICLE), DAMAGE);
                struck = true;
            }
        }
        if (struck || onGround() || horizontalCollision || isInWater() || isInLava()) {
            shatter(sl);
        } else if (time > 600 || getY() < level().getMinBuildHeight() - 16) {
            discard();
        }
    }

    private void shatter(ServerLevel sl) {
        sl.playSound(null, getX(), getY(), getZ(), WWSounds.ICICLE_SHATTER, SoundSource.BLOCKS, 1.0f, 0.9f + random.nextFloat() * 0.3f);
        sl.sendParticles(WWParticles.ICE_SHARD, getX(), getY() + 0.2, getZ(), 14, 0.25, 0.1, 0.25, 0.18);
        sl.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, blockState()), getX(), getY() + 0.3, getZ(), 12, 0.2, 0.2, 0.2, 0.1);
        sl.sendParticles(WWParticles.SNOW_PUFF, getX(), getY() + 0.05, getZ(), 2, 0.2, 0.0, 0.2, 0.02);
        discard();
    }

    @Override
    protected void readAdditionalSaveData(CompoundTag tag) {
        setTip(!tag.contains("Tip") || tag.getBoolean("Tip"));
        time = tag.getInt("Time");
    }

    @Override
    protected void addAdditionalSaveData(CompoundTag tag) {
        tag.putBoolean("Tip", isTip());
        tag.putInt("Time", time);
    }
}
