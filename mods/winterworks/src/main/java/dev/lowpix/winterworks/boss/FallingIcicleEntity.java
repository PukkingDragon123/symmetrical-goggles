package dev.lowpix.winterworks.boss;

import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWDamage;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWParticles;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.registries.Registries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.MoverType;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * A falling icicle (docs/COLD_UPDATE.md section 6): drops like a stone, skewers whatever it hits for 6 damage and
 * shatters into ice shards when it hits anything (an entity or a block). It never lands as a block.
 * The Frost Mauler also hurls them ({@link #throwAt}): a thrown icicle flies point-first in a flat arc and never hits
 * the one who threw it. A raised shield facing it blocks it.
 */
public class FallingIcicleEntity extends Entity {
    private static final EntityDataAccessor<Boolean> TIP = SynchedEntityData.defineId(FallingIcicleEntity.class, EntityDataSerializers.BOOLEAN);
    private static final EntityDataAccessor<Boolean> THROWN = SynchedEntityData.defineId(FallingIcicleEntity.class, EntityDataSerializers.BOOLEAN);
    public static final float DAMAGE = 6.0f;
    public static final double GRAVITY = 0.06, THROWN_GRAVITY = 0.03, THROW_SPEED = 1.1;
    private final Set<Integer> hit = new HashSet<>();
    private int time;
    @Nullable
    private UUID ownerId;
    @Nullable
    private Entity owner;

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

    /**
     * Hurls an icicle from `from` so that it arrives at `target` (lead for the target's motion included by the
     * caller). Flat arc, {@link #THROW_SPEED} blocks a tick.
     */
    public static FallingIcicleEntity throwAt(Level level, Vec3 from, Vec3 target, @Nullable Entity owner) {
        FallingIcicleEntity e = new FallingIcicleEntity(WWEntities.FALLING_ICICLE, level);
        e.setTip(true);
        e.entityData.set(THROWN, true);
        e.owner = owner;
        e.ownerId = owner == null ? null : owner.getUUID();
        Vec3 d = target.subtract(from);
        double horiz = Math.sqrt(d.x * d.x + d.z * d.z);
        int t = Math.max(1, (int) Math.ceil(Math.max(horiz, Math.abs(d.y)) / THROW_SPEED));
        // no drag on a thrown icicle; gravity is applied before each move: y(t) = vy*t - g*t(t+1)/2
        double vy = (d.y + THROWN_GRAVITY * t * (t + 1) / 2.0) / t;
        e.setDeltaMovement(d.x / t, vy, d.z / t);
        e.setPos(from.x, from.y - 0.45, from.z);   // the bounding box is centred on the throw point
        e.xo = e.getX();
        e.yo = e.getY();
        e.zo = e.getZ();
        level.addFreshEntity(e);
        return e;
    }

    public boolean isTip() {
        return entityData.get(TIP);
    }

    public void setTip(boolean tip) {
        entityData.set(TIP, tip);
    }

    /** Thrown point-first (drawn along its flight), not just dropped. */
    public boolean isThrown() {
        return entityData.get(THROWN);
    }

    /** What it looks like: the icicle block it broke off from. */
    public BlockState blockState() {
        return WWBlocks.ICICLE.defaultBlockState().setValue(IcicleBlock.TIP, isTip());
    }

    @Nullable
    public Entity owner() {
        if (owner == null && ownerId != null && level() instanceof ServerLevel sl) {
            owner = sl.getEntity(ownerId);
        }
        return owner;
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        builder.define(TIP, true);
        builder.define(THROWN, false);
    }

    @Override
    protected double getDefaultGravity() {
        return isThrown() ? THROWN_GRAVITY : GRAVITY;
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
        if (!isThrown()) {
            setDeltaMovement(getDeltaMovement().scale(0.98));
        }
        if (level().isClientSide) {
            if (time % 2 == 0 || isThrown()) {
                level().addParticle(ParticleTypes.SNOWFLAKE, getX(), getY() + 0.5, getZ(), 0, 0.02, 0);
            }
            return;
        }
        ServerLevel sl = (ServerLevel) level();
        Entity thrower = owner();
        boolean struck = false;
        // everything along the path it travelled this tick (fast thrown icicles must not pass through things)
        var swept = getBoundingBox().expandTowards(xo - getX(), yo - getY(), zo - getZ()).expandTowards(getDeltaMovement().scale(0.5));
        for (Entity e : sl.getEntities(this, swept, e -> e instanceof LivingEntity le
                && le.isAlive() && e != thrower && !(e instanceof Player p && (p.isSpectator() || p.isCreative())))) {
            if (hit.add(e.getId())) {
                e.hurt(damageSource(sl, thrower), DAMAGE);
                struck = true;
            }
        }
        if (struck || onGround() || horizontalCollision || verticalCollision || isInWater() || isInLava()) {
            shatter(sl);
        } else if (time > 600 || getY() < level().getMinBuildHeight() - 16) {
            discard();
        }
    }

    /** A dropped icicle hurts like a falling block; a thrown one comes from (and credits) its thrower. */
    private DamageSource damageSource(ServerLevel sl, @Nullable Entity thrower) {
        if (!isThrown()) {
            return WWDamage.source(sl, WWDamage.FALLING_ICICLE);
        }
        return new DamageSource(sl.registryAccess().registryOrThrow(Registries.DAMAGE_TYPE).getHolderOrThrow(WWDamage.FALLING_ICICLE),
                this, thrower);
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
        entityData.set(THROWN, tag.getBoolean("Thrown"));
        time = tag.getInt("Time");
        ownerId = tag.hasUUID("Owner") ? tag.getUUID("Owner") : null;
    }

    @Override
    protected void addAdditionalSaveData(CompoundTag tag) {
        tag.putBoolean("Tip", isTip());
        tag.putBoolean("Thrown", isThrown());
        tag.putInt("Time", time);
        if (ownerId != null) {
            tag.putUUID("Owner", ownerId);
        }
    }
}
