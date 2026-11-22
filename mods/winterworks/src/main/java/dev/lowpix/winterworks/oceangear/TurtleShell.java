package dev.lowpix.winterworks.oceangear;

import dev.lowpix.winterworks.registry.OceanItems;
import dev.lowpix.winterworks.registry.OceanSounds;
import java.util.Map;
import java.util.WeakHashMap;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.util.Mth;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.phys.Vec3;

/**
 * Turtle Shell armour (docs/OCEAN_UPDATE.md section 5): +10% swim speed per piece (the vanilla Turtle Shell helmet
 * counts), and the <b>retreat</b>: wearing all four and sneaking pulls you into your shell. Retreated you can't move,
 * jump or attack, knockback is ignored, and damage that comes from somewhere (an attacker, a projectile, a blast, a
 * beam) is cut {@link #FRONT_CUT} from the front and {@link #BACK_CUT} from behind and above; each blocked hit wears the
 * chestplate (the carapace) like a shield. Damage that bypasses shields (falling, magic, drowning) gets through.
 * Hooks: mixin.oceangear.ShellLivingEntityMixin (damage, knockback, movement), OceanGearFeature (attacks, the sound).
 */
public final class TurtleShell {
    public static final float FRONT_CUT = 0.6f, BACK_CUT = 0.9f, SWIM_PER_PIECE = 0.1f;
    private static final Map<Player, Boolean> WAS_RETREATING = new WeakHashMap<>();

    private TurtleShell() {}

    public static int pieces(LivingEntity e) {
        int n = 0;
        if (e.getItemBySlot(EquipmentSlot.HEAD).is(Items.TURTLE_HELMET)) {
            n++;
        }
        if (e.getItemBySlot(EquipmentSlot.CHEST).is(OceanItems.TURTLE_SHELL_CHESTPLATE)) {
            n++;
        }
        if (e.getItemBySlot(EquipmentSlot.LEGS).is(OceanItems.TURTLE_SHELL_LEGGINGS)) {
            n++;
        }
        if (e.getItemBySlot(EquipmentSlot.FEET).is(OceanItems.TURTLE_SHELL_BOOTS)) {
            n++;
        }
        return n;
    }

    public static boolean fullSet(LivingEntity e) {
        return pieces(e) == 4;
    }

    /** Is `e` a player pulled into a full Turtle Shell (sneaking, on foot)? Works on both sides. */
    public static boolean isRetreating(Entity e) {
        return e instanceof Player p && p.isShiftKeyDown() && !p.isSpectator() && !p.isPassenger() && !p.isFallFlying()
                && !p.getAbilities().flying && !p.isSleeping() && p.isAlive() && fullSet(p);
    }

    /** The swim speed multiplier (water only; the mixin applies it to the swim stroke). */
    public static float swimFactor(LivingEntity e) {
        return 1f + SWIM_PER_PIECE * pieces(e);
    }

    /** What's left of `amount` after the shell: unchanged unless retreated and the hit comes from somewhere. */
    public static float shellDamage(LivingEntity e, DamageSource src, float amount) {
        if (amount <= 0 || !isRetreating(e) || src.is(DamageTypeTags.BYPASSES_SHIELD)) {
            return amount;
        }
        Vec3 from = src.getSourcePosition();
        if (from == null) {
            return amount;
        }
        return amount * (1f - cut(e, from));
    }

    /** How much of a hit from `from` the shell stops: {@link #BACK_CUT} from behind or above, else {@link #FRONT_CUT}. */
    public static float cut(LivingEntity e, Vec3 from) {
        Vec3 to = from.subtract(e.position().add(0, e.getBbHeight() * 0.5, 0));
        double len = to.length();
        if (len < 1.0E-3) {
            return FRONT_CUT;
        }
        Vec3 n = to.scale(1 / len);
        if (n.y > 0.55) {
            return BACK_CUT;   // from above: the dome takes it
        }
        Vec3 facing = Vec3.directionFromRotation(0, e.yBodyRot);
        double flat = Math.sqrt(n.x * n.x + n.z * n.z);
        return flat < 1.0E-3 || (n.x * facing.x + n.z * facing.z) / flat >= 0 ? FRONT_CUT : BACK_CUT;
    }

    /** The mixin's hook at the start of LivingEntity.hurt: cuts the damage and wears the shell. */
    public static float onHurt(LivingEntity e, DamageSource src, float amount) {
        float left = shellDamage(e, src, amount);
        if (left < amount && e.level() instanceof ServerLevel level) {
            float blocked = amount - left;
            ItemStack chest = e.getItemBySlot(EquipmentSlot.CHEST);
            chest.hurtAndBreak(1 + Mth.floor(blocked), e, EquipmentSlot.CHEST);
            level.playSound(null, e.getX(), e.getY(), e.getZ(), SoundEvents.SHIELD_BLOCK, SoundSource.PLAYERS, 0.8f,
                    0.6f + level.getRandom().nextFloat() * 0.2f);
            level.sendParticles(new net.minecraft.core.particles.ItemParticleOption(net.minecraft.core.particles.ParticleTypes.ITEM,
                    new ItemStack(Items.TURTLE_SCUTE)), e.getX(), e.getY() + 0.4, e.getZ(), 6, 0.3, 0.15, 0.3, 0.08);
        }
        return left;
    }

    /** Server, every tick for each player: the sound when one pulls in, and no bow drawn or other item in use. */
    public static void tickPlayer(ServerPlayer p) {
        boolean now = isRetreating(p);
        Boolean was = WAS_RETREATING.put(p, now);
        if (now && (was == null || !was)) {
            p.level().playSound(null, p.getX(), p.getY(), p.getZ(), OceanSounds.SHELL_RETREAT, SoundSource.PLAYERS, 1f, 1f);
            if (p.isUsingItem()) {
                p.stopUsingItem();
            }
        }
        if (now) {
            Vec3 v = p.getDeltaMovement();
            if (v.x != 0 || v.z != 0) {
                p.setDeltaMovement(0, v.y, 0);
            }
        }
    }
}
