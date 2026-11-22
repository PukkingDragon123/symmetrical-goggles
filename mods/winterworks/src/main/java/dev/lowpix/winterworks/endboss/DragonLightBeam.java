package dev.lowpix.winterworks.endboss;

import dev.lowpix.winterworks.registry.EndEntities;
import dev.lowpix.winterworks.registry.EndParticles;
import dev.lowpix.winterworks.registry.EndSounds;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.boss.EnderDragonPart;
import net.minecraft.world.entity.boss.enderdragon.EndCrystal;
import net.minecraft.world.entity.boss.enderdragon.EnderDragon;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.CollisionContext;
import org.jetbrains.annotations.Nullable;
import org.joml.Vector3f;

/**
 * The enraged Ender Dragon's blinding light beam (docs/END_UPDATE.md section 10). It sits where the beam starts (the
 * dragon's jaws) and reaches to {@link #end()}: a {@link #WARNING}-tick warning line, then a {@link #FIRING}-tick beam
 * that deals {@link #DAMAGE} every {@link #HIT_EVERY} ticks to everything in it ({@link #RADIUS}) and blinds it for 6 s.
 * A raised shield facing the dragon blocks it (it is a projectile-like hit). Drawn by client.endboss.DragonLightBeamRenderer.
 */
public class DragonLightBeam extends Entity {
    public static final int WARNING = 30, FIRING = 20, HIT_EVERY = 10, BLIND_TICKS = 120;
    public static final float DAMAGE = 10f;
    public static final double RADIUS = 1.1, MAX_LENGTH = 128;
    /** The far end, relative to the beam's start (its position). */
    private static final EntityDataAccessor<Vector3f> END = SynchedEntityData.defineId(DragonLightBeam.class, EntityDataSerializers.VECTOR3);
    /** The level's game time when it was made (so the client's warning and beam keep the server's time). */
    private static final EntityDataAccessor<Long> BORN = SynchedEntityData.defineId(DragonLightBeam.class, EntityDataSerializers.LONG);

    @Nullable
    private UUID ownerId;
    @Nullable
    private Entity cachedOwner;
    private boolean bornSet;
    /** Last tick each entity was hit (the beam hits each one every HIT_EVERY ticks while it stays in it). */
    private final Map<Integer, Integer> lastHit = new HashMap<>();

    public DragonLightBeam(EntityType<?> type, Level level) {
        super(type, level);
        noPhysics = true;
        noCulling = true;
    }

    /**
     * A beam from `from` towards `towards`, running on to the first block it meets (at most {@link #MAX_LENGTH}).
     * `owner` (the dragon) is credited with the damage; it may be null.
     */
    public static DragonLightBeam fire(ServerLevel level, Vec3 from, Vec3 towards, @Nullable LivingEntity owner) {
        DragonLightBeam beam = new DragonLightBeam(EndEntities.DRAGON_LIGHT_BEAM, level);
        Vec3 dir = towards.subtract(from);
        dir = dir.lengthSqr() < 1.0E-6 ? new Vec3(0, -1, 0) : dir.normalize();
        Vec3 far = from.add(dir.scale(MAX_LENGTH));
        var hit = level.clip(new ClipContext(from, far, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, CollisionContext.empty()));
        Vec3 end = hit.getType() == HitResult.Type.MISS ? far : hit.getLocation();
        beam.moveTo(from.x, from.y, from.z, 0f, 0f);
        beam.setEnd(end.subtract(from));
        beam.setBorn(level.getGameTime());
        if (owner != null) {
            beam.ownerId = owner.getUUID();
            beam.cachedOwner = owner;
        }
        level.addFreshEntity(beam);
        level.playSound(null, from.x, from.y, from.z, EndSounds.DRAGON_BEAM_CHARGE, SoundSource.HOSTILE, 4f, 1f);
        level.playSound(null, end.x, end.y, end.z, EndSounds.DRAGON_BEAM_CHARGE, SoundSource.HOSTILE, 2f, 1.2f);
        return beam;
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        builder.define(END, new Vector3f(0, -16, 0));
        builder.define(BORN, 0L);
    }

    public void setEnd(Vec3 rel) {
        entityData.set(END, new Vector3f((float) rel.x, (float) rel.y, (float) rel.z));
    }

    private void setBorn(long gameTime) {
        entityData.set(BORN, gameTime);
        bornSet = true;
    }

    /** The far end relative to the start. */
    public Vec3 end() {
        Vector3f v = entityData.get(END);
        return new Vec3(v.x, v.y, v.z);
    }

    /** Ticks since it was made (client and server agree). */
    public int age() {
        return (int) Mth.clamp(level().getGameTime() - entityData.get(BORN), 0, 100000);
    }

    public boolean firing() {
        int age = age();
        return age >= WARNING && age < WARNING + FIRING;
    }

    @Nullable
    public Entity owner() {
        if (cachedOwner != null && !cachedOwner.isRemoved()) {
            return cachedOwner;
        }
        if (ownerId != null && level() instanceof ServerLevel sl) {
            cachedOwner = sl.getEntity(ownerId);
        }
        return cachedOwner;
    }

    @Override
    public void tick() {
        super.tick();
        if (level().isClientSide) {
            clientTick();
            return;
        }
        if (!bornSet) {   // made some other way (a summon command): it starts now
            setBorn(level().getGameTime());
        }
        int age = age();
        ServerLevel sl = (ServerLevel) level();
        if (age == WARNING) {
            Vec3 a = position(), b = a.add(end());
            sl.playSound(null, a.x, a.y, a.z, EndSounds.DRAGON_BEAM_FIRE, SoundSource.HOSTILE, 5f, 1f);
            sl.playSound(null, b.x, b.y, b.z, EndSounds.DRAGON_BEAM_FIRE, SoundSource.HOSTILE, 3f, 0.9f);
        }
        if (firing()) {
            hurtInBeam(sl, age);
            if (age % 2 == 0) {
                Vec3 b = position().add(end());
                sl.sendParticles(ParticleTypes.END_ROD, b.x, b.y + 0.2, b.z, 6, 0.6, 0.2, 0.6, 0.12);
                sl.sendParticles(EndParticles.ECLIPSE_MOTE, b.x, b.y + 0.4, b.z, 3, 1.0, 0.3, 1.0, 0.05);
            }
        }
        if (age >= WARNING + FIRING) {
            discard();
        }
    }

    private void clientTick() {
        int age = age();
        if (age < WARNING && age % 3 == 0) {   // the warning: light gathers where it will land
            Vec3 b = position().add(end());
            level().addParticle(ParticleTypes.END_ROD, b.x + (random.nextDouble() - 0.5) * 2, b.y + 0.1, b.z + (random.nextDouble() - 0.5) * 2,
                    0, 0.03 + age * 0.002, 0);
        }
    }

    /** Everything alive within RADIUS of the beam's segment (but the dragon and the crystals) is hit. */
    private void hurtInBeam(ServerLevel sl, int age) {
        Vec3 a = position(), b = a.add(end());
        AABB box = new AABB(a, b).inflate(RADIUS + 1);
        Entity owner = owner();
        LivingEntity ownerLiving = owner instanceof LivingEntity l ? l : null;
        for (Entity e : sl.getEntities(this, box, e -> e instanceof LivingEntity && e.isAlive() && !(e instanceof EnderDragon)
                && !(e instanceof EnderDragonPart) && !(e instanceof EndCrystal) && e != owner)) {
            LivingEntity le = (LivingEntity) e;
            if (!inBeam(le.getBoundingBox(), a, b)) {
                continue;
            }
            Integer last = lastHit.get(le.getId());
            if (last != null && age - last < HIT_EVERY) {
                continue;
            }
            lastHit.put(le.getId(), age);
            DamageSource src = sl.damageSources().mobProjectile(this, ownerLiving);
            le.invulnerableTime = 0;   // every half second, whatever hit it last
            if (le.hurt(src, DAMAGE)) {
                le.addEffect(new MobEffectInstance(MobEffects.BLINDNESS, BLIND_TICKS, 0), owner);
            }
        }
    }

    /** Whether a box touches the beam: the distance from its centre to the segment, less most of its half size, within RADIUS. */
    public static boolean inBeam(AABB box, Vec3 a, Vec3 b) {
        Vec3 c = box.getCenter();
        Vec3 ab = b.subtract(a);
        double t = Mth.clamp(c.subtract(a).dot(ab) / Math.max(1.0E-6, ab.lengthSqr()), 0, 1);
        Vec3 p = a.add(ab.scale(t));
        double half = Math.max(box.getXsize(), Math.max(box.getYsize(), box.getZsize())) * 0.5;
        return p.distanceTo(c) <= RADIUS + half * 0.75;
    }

    @Override
    public boolean shouldRenderAtSqrDistance(double d) {
        return d < 256 * 256;
    }

    @Override
    public boolean isPickable() {
        return false;
    }

    @Override
    public boolean isAttackable() {
        return false;
    }

    @Override
    protected void readAdditionalSaveData(CompoundTag tag) {
        setBorn(level().getGameTime() - tag.getInt("Age"));
        if (tag.hasUUID("Owner")) {
            ownerId = tag.getUUID("Owner");
        }
        setEnd(new Vec3(tag.getFloat("EndX"), tag.getFloat("EndY"), tag.getFloat("EndZ")));
    }

    @Override
    protected void addAdditionalSaveData(CompoundTag tag) {
        tag.putInt("Age", age());
        if (ownerId != null) {
            tag.putUUID("Owner", ownerId);
        }
        Vec3 e = end();
        tag.putFloat("EndX", (float) e.x);
        tag.putFloat("EndY", (float) e.y);
        tag.putFloat("EndZ", (float) e.z);
    }
}
