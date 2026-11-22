package dev.lowpix.winterworks.end;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.registry.EndBlocks;
import dev.lowpix.winterworks.registry.EndSounds;
import java.util.Map;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.BaseFireBlock;
import net.minecraft.world.level.chunk.ChunkAccess;
import net.minecraft.world.level.chunk.status.ChunkStatus;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructurePiece;
import net.minecraft.world.level.levelgen.structure.StructureStart;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * What a falling meteorite does when it lands (docs/END_UPDATE.md section 16): a bright flash (client), the impact sound,
 * a shockwave that knocks back everything within {@link #SHOCK_RADIUS} blocks and burns the living (damage type
 * {@code winterworks:meteorite}), and a fresh smoking crater of meteorite round a glowing core (end.Meteorite's crater;
 * the core is a meteorite_core one time in three, {@link #hasCore}) with fires on its floor. In a safe zone (the main
 * island, within {@link #SAFE_RADIUS} blocks of the End's centre, or in or by a structure) it only flashes and booms:
 * no blocks change, nothing is hurt or pushed.
 */
public final class MeteorImpact {
    /** Blocks from (0, 0) in the End where meteors never hurt anything or dig craters. */
    public static final int SAFE_RADIUS = 1000;
    /** How far from a structure's pieces a crater keeps away. */
    public static final int STRUCTURE_MARGIN = 14;
    public static final double SHOCK_RADIUS = 10.0;
    /** Damage at the heart of the shockwave (falling off to nothing at its edge); it also sets the living on fire. */
    public static final float SHOCK_DAMAGE = 10f;
    public static final int MAX_BURN_SECONDS = 8;
    public static final ResourceKey<DamageType> DAMAGE = ResourceKey.create(Registries.DAMAGE_TYPE, Winterworks.id("meteorite"));

    private MeteorImpact() {}

    /** One time in three a crater's heart is a meteorite_core (else plain meteorite), by the meteor's seed. */
    public static boolean hasCore(long seed) {
        return Math.floorMod(EndGen.mix(seed ^ 0x5DEECE66DL), 3L) == 0;
    }

    /** The End's main island: no meteor harm within SAFE_RADIUS blocks of (0, 0) there. */
    public static boolean mainIsland(Level level, double x, double z) {
        return level.dimension() == Level.END && x * x + z * z < (double) SAFE_RADIUS * SAFE_RADIUS;
    }

    /** Whether a meteor landing on `pos` must leave the world alone: the main island, or in or near a structure. */
    public static boolean safe(ServerLevel level, BlockPos pos) {
        return mainIsland(level, pos.getX() + 0.5, pos.getZ() + 0.5) || nearStructure(level, pos, STRUCTURE_MARGIN);
    }

    /** Is any piece of a generated structure within `margin` blocks of `pos`? (Only loaded chunks are looked at.) */
    public static boolean nearStructure(ServerLevel level, BlockPos pos, int margin) {
        BoundingBox box = new BoundingBox(pos.getX() - margin, pos.getY() - margin, pos.getZ() - margin, pos.getX() + margin,
                pos.getY() + margin, pos.getZ() + margin);
        for (int cx = box.minX() >> 4; cx <= box.maxX() >> 4; cx++) {
            for (int cz = box.minZ() >> 4; cz <= box.maxZ() >> 4; cz++) {
                ChunkAccess chunk = level.getChunk(cx, cz, ChunkStatus.STRUCTURE_REFERENCES, false);
                if (chunk == null || !chunk.hasAnyStructureReferences()) {
                    continue;
                }
                ChunkPos at = new ChunkPos(cx, cz);
                for (Map.Entry<Structure, ?> e : chunk.getAllReferences().entrySet()) {
                    for (StructureStart start : level.structureManager().startsForStructure(at, s -> s == e.getKey())) {
                        for (StructurePiece piece : start.getPieces()) {
                            if (piece.getBoundingBox().intersects(box)) {
                                return true;
                            }
                        }
                    }
                }
            }
        }
        return false;
    }

    /**
     * The landing at `at` (on the block `hit`): sound, and unless `safe` the shockwave and the crater. Returns the crater's
     * heart (a meteorite_core or meteorite), or null when safe.
     */
    @Nullable
    public static BlockPos impact(ServerLevel level, Vec3 at, BlockPos hit, long seed, boolean safe, @Nullable Entity meteor) {
        level.playSound(null, at.x, at.y, at.z, EndSounds.METEOR_IMPACT, SoundSource.WEATHER, 8f, 0.85f + level.random.nextFloat() * 0.15f);
        level.playSound(null, at.x, at.y, at.z, SoundEvents.GENERIC_EXPLODE.value(), SoundSource.WEATHER, 6f, 0.55f);
        if (safe) {
            return null;
        }
        shockwave(level, at, meteor);
        return crater(level, hit, seed);
    }

    /** Knocks back everything within SHOCK_RADIUS of `at` (not flying creative players) and hurts and burns the living. */
    public static void shockwave(ServerLevel level, Vec3 at, @Nullable Entity meteor) {
        DamageSource damage = new DamageSource(level.registryAccess().registryOrThrow(Registries.DAMAGE_TYPE).getHolderOrThrow(DAMAGE), meteor);
        AABB box = new AABB(at, at).inflate(SHOCK_RADIUS);
        for (Entity e : level.getEntities(meteor, box, e -> e.isAlive() && !e.isSpectator())) {
            Vec3 c = e.getBoundingBox().getCenter();
            double d = c.distanceTo(at);
            if (d > SHOCK_RADIUS) {
                continue;
            }
            double k = 1.0 - d / SHOCK_RADIUS;
            Vec3 out = new Vec3(c.x - at.x, 0, c.z - at.z);
            out = out.lengthSqr() < 1e-4 ? new Vec3(level.random.nextDouble() - 0.5, 0, level.random.nextDouble() - 0.5).normalize() : out.normalize();
            if (e instanceof LivingEntity living) {
                living.hurt(damage, (float) (SHOCK_DAMAGE * k));
                boolean invulnerable = e instanceof Player p && p.getAbilities().invulnerable;
                if (!invulnerable && !e.fireImmune()) {
                    e.igniteForSeconds((float) Math.max(2.0, MAX_BURN_SECONDS * k));
                }
            }
            if (!(e instanceof Player p && p.getAbilities().flying)) {
                e.push(out.x * (0.5 + 1.6 * k), 0.3 + 0.6 * k, out.z * (0.5 + 1.6 * k));
                e.hurtMarked = true;
            }
        }
    }

    /**
     * A fresh crater where the meteor struck `hit` (end.Meteorite's, shaped by `seed`): a bowl with a thrown-up rim, a
     * half-buried cluster of meteorite round its heart, fragments flung about, and fires on the floor. The heart is a
     * meteorite_core only if {@link #hasCore}. Returns the heart.
     */
    public static BlockPos crater(ServerLevel level, BlockPos hit, long seed) {
        EndWriter w = EndWriter.unclipped(level);
        int ground = Meteorite.surface(w, hit.getX(), hit.getY(), hit.getZ());
        if (ground == Integer.MIN_VALUE) {
            ground = hit.getY();
        }
        BlockPos heart = Meteorite.crater(w, hit.getX(), ground + 1, hit.getZ(), seed);
        if (!hasCore(seed)) {
            level.setBlock(heart, EndBlocks.METEORITE.defaultBlockState(), 3);
        }
        // fresh: fires licking the floor of the bowl
        var r = level.random;
        for (int i = 0; i < 14; i++) {
            double a = r.nextDouble() * Math.PI * 2, d = 2.5 + r.nextDouble() * 6.5;
            int x = heart.getX() + (int) Math.round(Math.cos(a) * d), z = heart.getZ() + (int) Math.round(Math.sin(a) * d);
            int y = Meteorite.surface(w, x, heart.getY() + 3, z);
            if (y == Integer.MIN_VALUE) {
                continue;
            }
            BlockPos above = new BlockPos(x, y + 1, z);
            if (level.getBlockState(above).isAir()) {
                level.setBlock(above, BaseFireBlock.getState(level, above), 11);
            }
        }
        return heart;
    }
}
