package dev.lowpix.winterworks.endgear;

import dev.lowpix.winterworks.registry.EndEffects;
import dev.lowpix.winterworks.registry.EndEntities;
import dev.lowpix.winterworks.registry.EndSounds;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.feature.EndPodiumFeature;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * Dragon Egg cracking (docs/END_UPDATE.md section 13): a Dragon Egg item thrown into the End's void comes back (falling
 * onto whoever threw it if they're in the End, else onto the exit portal's pillar) with a crack: {@code egg_cracks} 1,
 * then 2. The third time it comes back ready to hatch ({@code egg_cracks} 3) and hatches into a baby Dragonling where it
 * lands. The item models show the cracks (item/dragon_egg_cracked_1, _2; predicate winterworks:egg_cracks).
 */
public final class DragonEggs {
    public static final int HATCHING = 3;

    private DragonEggs() {}

    public static int cracks(ItemStack stack) {
        return stack.getOrDefault(EndEffects.EGG_CRACKS, 0);
    }

    /** A Dragon Egg item falling out of the End: bring it back with a crack. False if this isn't one (vanilla discards it). */
    public static boolean fromVoid(ItemEntity item) {
        if (!(item.level() instanceof ServerLevel level) || level.dimension() != Level.END || !item.getItem().is(Items.DRAGON_EGG)) {
            return false;
        }
        comeBack(level, item);
        return true;
    }

    /** Cracks the egg once more and drops it back onto its thrower (in this level) or the exit portal. */
    public static void comeBack(ServerLevel level, ItemEntity item) {
        ItemStack egg = item.getItem().copy();
        int cracks = Math.min(HATCHING, cracks(egg) + 1);
        egg.set(EndEffects.EGG_CRACKS, cracks);
        item.setItem(egg);
        Vec3 at = landing(level, item);
        level.getChunkAt(BlockPos.containing(at));
        item.teleportTo(at.x, at.y, at.z);
        item.setDeltaMovement(0, -0.1, 0);
        item.resetFallDistance();
        item.setPickUpDelay(30);
        level.playSound(null, at.x, at.y, at.z, EndSounds.DRAGON_EGG_CRACK, SoundSource.NEUTRAL, 1.2f, 0.8f + 0.1f * cracks);
        level.sendParticles(ParticleTypes.REVERSE_PORTAL, at.x, at.y, at.z, 40, 0.3, 0.3, 0.3, 0.12);
        level.sendParticles(ParticleTypes.DRAGON_BREATH, at.x, at.y, at.z, 16, 0.25, 0.25, 0.25, 0.02);
        level.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.DRAGON_EGG.defaultBlockState()), at.x, at.y, at.z,
                6 * cracks, 0.2, 0.2, 0.2, 0.1);
    }

    /** Above the thrower's head if they're in this level, else above the exit portal's pillar. */
    public static Vec3 landing(ServerLevel level, ItemEntity item) {
        Entity thrower = item.getOwner();
        if (thrower != null && thrower.isAlive() && thrower.level() == level) {
            Vec3 above = thrower.position().add(0, thrower.getBbHeight() + 1.5, 0);
            return level.noCollision(item, item.getBoundingBox().move(above.subtract(item.position()))) ? above
                    : thrower.position().add(0, 0.5, 0);
        }
        BlockPos portal = EndPodiumFeature.getLocation(BlockPos.ZERO);
        level.getChunkAt(portal);
        BlockPos top = level.getHeightmapPos(Heightmap.Types.MOTION_BLOCKING, portal);
        int y = top.getY() > level.getMinBuildHeight() ? top.getY() : portal.getY() + 4;
        return new Vec3(portal.getX() + 0.5, y + 4.0, portal.getZ() + 0.5);
    }

    /** Every tick of an item entity (server): an egg that's ready hatches once it lands. */
    public static void tickItem(ItemEntity item) {
        if (item.isRemoved() || !(item.level() instanceof ServerLevel level) || !item.onGround()) {
            return;
        }
        ItemStack stack = item.getItem();
        if (stack.is(Items.DRAGON_EGG) && cracks(stack) >= HATCHING) {
            hatch(level, item);
        }
    }

    /** The egg bursts and a baby Dragonling climbs out (one per egg in the stack). */
    @Nullable
    public static Dragonling hatch(ServerLevel level, ItemEntity item) {
        Dragonling first = null;
        int n = item.getItem().getCount();
        for (int i = 0; i < n; i++) {
            Dragonling baby = EndEntities.DRAGONLING.create(level);
            if (baby == null) {
                break;
            }
            baby.moveTo(item.getX(), item.getY(), item.getZ(), level.random.nextFloat() * 360f, 0f);
            baby.finalizeSpawn(level, level.getCurrentDifficultyAt(item.blockPosition()), MobSpawnType.TRIGGERED, null);
            baby.setHatching();
            level.addFreshEntity(baby);
            if (first == null) {
                first = baby;
            }
        }
        item.discard();
        double x = item.getX(), y = item.getY() + 0.3, z = item.getZ();
        level.playSound(null, x, y, z, EndSounds.DRAGONLING_HATCH, SoundSource.NEUTRAL, 1.4f, 1.0f);
        level.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.DRAGON_EGG.defaultBlockState()), x, y, z, 40, 0.3, 0.3,
                0.3, 0.15);
        level.sendParticles(ParticleTypes.DRAGON_BREATH, x, y, z, 30, 0.4, 0.3, 0.4, 0.03);
        level.sendParticles(ParticleTypes.REVERSE_PORTAL, x, y, z, 50, 0.4, 0.4, 0.4, 0.1);
        return first;
    }
}
