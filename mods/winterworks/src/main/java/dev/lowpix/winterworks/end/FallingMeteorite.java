package dev.lowpix.winterworks.end;

import dev.lowpix.winterworks.registry.EndEntities;
import java.util.List;
import java.util.function.Consumer;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.protocol.game.ClientboundAddEntityPacket;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.CollisionContext;
import org.joml.Vector3f;

/**
 * A falling meteorite (docs/END_UPDATE.md section 16): a flaming rock that streaks down through the End sky in a straight
 * line, speeding up, and crashes where it first meets a block (MeteorImpact: a flash, a shockwave and a fresh crater, or
 * only the flash in a safe zone). After the crash it lingers, invisible, for {@link #SMOULDER} ticks as the smoking
 * crater's source of smoke, then goes. Its {@code seed} picks the crater's shape and whether it has a core. Made by
 * {@link #launch} (MeteorShower, {@code /winterworks meteor}). Drawn by client.end.FallingMeteoriteRenderer; its trail,
 * whistle, flash and smoke are client.end.MeteorClient's.
 */
public class FallingMeteorite extends Entity {
    /** Blocks a tick as it enters the sky, and its top speed (it speeds up 1.5% a tick). */
    public static final double SPEED = 2.0, MAX_SPEED = 3.2;
    /** Ticks before a meteor that never met anything burns out. */
    public static final int MAX_FLIGHT = 400;
    /** Ticks the crater smokes after the crash. */
    public static final int SMOULDER = 600;
    public static final byte FLYING = 0, CRASHED = 1, BURST = 2;

    private static final EntityDataAccessor<Byte> STATE = SynchedEntityData.defineId(FallingMeteorite.class, EntityDataSerializers.BYTE);
    /** Where it hit (so every client flashes at the same spot). */
    private static final EntityDataAccessor<Vector3f> IMPACT = SynchedEntityData.defineId(FallingMeteorite.class, EntityDataSerializers.VECTOR3);

    /** Client hooks (client.end.MeteorClient): every client tick, and once when it crashes. */
    public static Consumer<FallingMeteorite> clientTick = m -> {}, clientImpact = m -> {};

    private long seed;
    /** Ticks since the crash (server and client). */
    private int sinceImpact;
    /** Client: it was seen in flight (so a late-loaded smouldering one doesn't flash), and its crash was seen. */
    private boolean seenFlying, crashSeen;

    public FallingMeteorite(EntityType<?> type, Level level) {
        super(type, level);
        noPhysics = true;
        noCulling = true;
        seed = level.random.nextLong();
    }

    /**
     * Sends a meteor from `from` toward `target`, at {@link #SPEED}. `seed` picks its crater (and whether it has a
     * core, MeteorImpact.hasCore). Returns it, in the level.
     */
    public static FallingMeteorite launch(ServerLevel level, Vec3 from, Vec3 target, long seed) {
        FallingMeteorite m = new FallingMeteorite(EndEntities.FALLING_METEORITE, level);
        Vec3 dir = target.subtract(from);
        dir = dir.lengthSqr() < 1e-6 ? new Vec3(0, -1, 0) : dir.normalize();
        m.seed = seed;
        m.moveTo(from.x, from.y, from.z, (float) (Mth.atan2(dir.x, dir.z) * Mth.RAD_TO_DEG), (float) (Mth.atan2(dir.y, dir.horizontalDistance()) * Mth.RAD_TO_DEG));
        m.setDeltaMovement(dir.scale(SPEED));
        level.addFreshEntity(m);
        return m;
    }

    /**
     * Where a meteor aimed at `target` starts: high over it (110-150 blocks up) and off to one side (30-50 blocks), on the
     * side that keeps it near `viewer` (if given) so they see it come down.
     */
    public static Vec3 skyStart(Vec3 target, Vec3 viewer, RandomSource r) {
        double a = r.nextDouble() * Math.PI * 2, d = 30 + r.nextDouble() * 20;
        Vec3 off = new Vec3(Math.cos(a) * d, 110 + r.nextDouble() * 40, Math.sin(a) * d);
        if (viewer != null && target.add(off).subtract(viewer).horizontalDistance() > 110) {
            off = new Vec3(-off.x, off.y, -off.z);
        }
        return target.add(off);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        builder.define(STATE, FLYING);
        builder.define(IMPACT, new Vector3f());
    }

    public byte state() {
        return entityData.get(STATE);
    }

    public boolean flying() {
        return state() == FLYING;
    }

    public long seed() {
        return seed;
    }

    public Vec3 impact() {
        Vector3f v = entityData.get(IMPACT);
        return new Vec3(v.x, v.y, v.z);
    }

    public int sinceImpact() {
        return sinceImpact;
    }

    @Override
    public void tick() {
        super.tick();
        if (flying()) {
            Vec3 from = position(), vel = getDeltaMovement();
            if (level() instanceof ServerLevel sl) {
                BlockHitResult hit = sl.clip(new ClipContext(from, from.add(vel), ClipContext.Block.COLLIDER, ClipContext.Fluid.ANY,
                        CollisionContext.empty()));
                if (hit.getType() != HitResult.Type.MISS) {
                    crash(sl, hit.getLocation(), hit.getBlockPos());
                    return;
                }
                if (tickCount > MAX_FLIGHT || getY() < sl.getMinBuildHeight() - 32) {
                    discard();
                    return;
                }
            } else {
                seenFlying = true;
            }
            setPos(from.add(vel));
            double sp = vel.length();
            if (sp > 1e-6 && sp < MAX_SPEED) {
                setDeltaMovement(vel.scale(Math.min(MAX_SPEED, sp * 1.015) / sp));
            }
        } else {
            sinceImpact++;
            if (!level().isClientSide && sinceImpact > SMOULDER) {
                discard();
            }
        }
        if (level().isClientSide) {
            clientTick.accept(this);
        }
    }

    /** Crashes at `at`, having hit the block `hit`: the flash, shockwave and crater (MeteorImpact), then it smoulders. */
    public void crash(ServerLevel level, Vec3 at, BlockPos hit) {
        boolean safe = MeteorImpact.safe(level, hit);
        setPos(at);
        setDeltaMovement(Vec3.ZERO);
        entityData.set(IMPACT, new Vector3f((float) at.x, (float) at.y, (float) at.z));
        entityData.set(STATE, safe ? BURST : CRASHED);
        sinceImpact = 0;
        MeteorImpact.impact(level, at, hit, seed, safe, this);
    }

    /** Client: the crash arrives with its impact point (both values are set before this runs). */
    @Override
    public void onSyncedDataUpdated(List<SynchedEntityData.DataValue<?>> values) {
        super.onSyncedDataUpdated(values);
        if (level().isClientSide && !flying() && !crashSeen) {
            crashSeen = true;
            sinceImpact = 0;
            Vec3 at = impact();
            setPos(at.x, at.y, at.z);
            setOldPosAndRot();
            setDeltaMovement(Vec3.ZERO);
            if (seenFlying) {
                clientImpact.accept(this);
            }
        }
    }

    @Override
    public void recreateFromPacket(ClientboundAddEntityPacket packet) {
        super.recreateFromPacket(packet);
        setDeltaMovement(packet.getXa(), packet.getYa(), packet.getZa());
    }

    /** In flight the client flies it itself (straight and smooth); only big corrections from the server are taken. */
    @Override
    public void lerpTo(double x, double y, double z, float yRot, float xRot, int steps) {
        if (!flying() || distanceToSqr(x, y, z) > 16.0) {
            super.lerpTo(x, y, z, yRot, xRot, steps);
        }
    }

    @Override
    public boolean shouldRenderAtSqrDistance(double d) {
        return d < 384.0 * 384.0;
    }

    @Override
    public boolean isPickable() {
        return false;
    }

    @Override
    public boolean hurt(DamageSource source, float amount) {
        return false;
    }

    @Override
    protected void readAdditionalSaveData(CompoundTag tag) {
        seed = tag.getLong("seed");
        entityData.set(STATE, tag.getByte("state"));
        sinceImpact = tag.getInt("since_impact");
        entityData.set(IMPACT, new Vector3f(tag.getFloat("impact_x"), tag.getFloat("impact_y"), tag.getFloat("impact_z")));
    }

    @Override
    protected void addAdditionalSaveData(CompoundTag tag) {
        tag.putLong("seed", seed);
        tag.putByte("state", state());
        tag.putInt("since_impact", sinceImpact);
        Vec3 at = impact();
        tag.putFloat("impact_x", (float) at.x);
        tag.putFloat("impact_y", (float) at.y);
        tag.putFloat("impact_z", (float) at.z);
    }
}
