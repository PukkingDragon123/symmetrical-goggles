package dev.lowpix.winterworks.endgear;

import dev.lowpix.winterworks.registry.EndItems;
import dev.lowpix.winterworks.registry.EndParticles;
import dev.lowpix.winterworks.registry.EndSounds;
import java.util.List;
import net.minecraft.ChatFormatting;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageTypes;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.OwnableEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ShieldItem;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/**
 * The Obsidian Shield (docs/END_UPDATE.md section 9): a vanilla shield (blocking pose, either hand, axes disable it;
 * wear in mixin.endgear.EndGearPlayerMixin) that throws half of every blocked hit back at a living attacker, and when
 * you start blocking while sneaking releases a knockback shockwave (radius 4.5, 4 damage, no block damage; 5 s item
 * cooldown, so the next block waits for it too).
 */
public class ObsidianShieldItem extends ShieldItem {
    public static final double SHOCKWAVE_RADIUS = 4.5;
    public static final float SHOCKWAVE_DAMAGE = 4f;
    public static final int SHOCKWAVE_COOLDOWN = 100;
    public static final float REFLECT = 0.5f;

    public ObsidianShieldItem(Properties p) {
        super(p);
    }

    @Override
    public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {
        InteractionResultHolder<ItemStack> result = super.use(level, player, hand);
        if (level instanceof ServerLevel server && player.isSecondaryUseActive() && !player.getCooldowns().isOnCooldown(this)) {
            shockwave(server, player);
            player.getCooldowns().addCooldown(this, SHOCKWAVE_COOLDOWN);
        }
        return result;
    }

    @Override
    public boolean isValidRepairItem(ItemStack stack, ItemStack repair) {
        return repair.is(EndItems.OBSIDIAN_SHARD);
    }

    @Override
    public void appendHoverText(ItemStack stack, TooltipContext ctx, List<Component> lines, TooltipFlag flag) {
        super.appendHoverText(stack, ctx, lines, flag);
        lines.add(Component.translatable("item.winterworks.obsidian_shield.tip").withStyle(ChatFormatting.GRAY));
        lines.add(Component.translatable("item.winterworks.obsidian_shield.tip2").withStyle(ChatFormatting.GRAY));
    }

    /** Knocks everything round `player` away: 4 damage each, strong knockback, no block damage. Returns how many were hit. */
    public static int shockwave(ServerLevel level, Player player) {
        double r = SHOCKWAVE_RADIUS;
        List<LivingEntity> hit = level.getEntitiesOfClass(LivingEntity.class, player.getBoundingBox().inflate(r, 2.0, r),
                e -> e != player && e.isAlive() && !e.isSpectator() && e.distanceToSqr(player) <= r * r && !e.isAlliedTo(player)
                        && !(e instanceof OwnableEntity pet && player.getUUID().equals(pet.getOwnerUUID())));
        DamageSource src = level.damageSources().playerAttack(player);
        for (LivingEntity e : hit) {
            e.hurt(src, SHOCKWAVE_DAMAGE);
            double dx = e.getX() - player.getX(), dz = e.getZ() - player.getZ();
            double d = Math.max(0.3, Math.sqrt(dx * dx + dz * dz));
            double strength = 1.8 * (1.0 - 0.4 * Math.min(1.0, d / r));
            e.knockback(strength, -dx / d, -dz / d);
            e.setDeltaMovement(e.getDeltaMovement().add(0, 0.35, 0));
            e.hurtMarked = true;
        }
        level.playSound(null, player.getX(), player.getY(), player.getZ(), EndSounds.SHIELD_SHOCKWAVE, SoundSource.PLAYERS, 1.2f,
                0.9f + level.random.nextFloat() * 0.2f);
        // a ring of obsidian chips and dust rolling out along the ground
        BlockParticleOption chips = new BlockParticleOption(ParticleTypes.BLOCK, Blocks.OBSIDIAN.defaultBlockState());
        for (int i = 0; i < 36; i++) {
            double a = i * Mth.TWO_PI / 36;
            double cx = Math.cos(a), cz = Math.sin(a);
            for (double rr = 1.2; rr <= r; rr += 1.65) {
                double x = player.getX() + cx * rr, z = player.getZ() + cz * rr;
                level.sendParticles(chips, x, player.getY() + 0.15, z, 1, 0.1, 0.05, 0.1, 0.05);
            }
            level.sendParticles(EndParticles.OBSIDIAN_CRACK, player.getX() + cx * 1.2, player.getY() + 0.4, player.getZ() + cz * 1.2, 0,
                    cx, 0.15, cz, 0.45);
        }
        level.sendParticles(ParticleTypes.EXPLOSION, player.getX(), player.getY() + 0.5, player.getZ(), 3, 1.0, 0.1, 1.0, 0);
        return hit.size();
    }

    /** A hit blocked with the Obsidian Shield: half of it goes back to a living attacker (as thorns). */
    public static void afterDamage(LivingEntity defender, DamageSource source, float baseDamage, float taken, boolean blocked) {
        if (!blocked || baseDamage <= 0 || !defender.getUseItem().is(EndItems.OBSIDIAN_SHIELD) || source.is(DamageTypes.THORNS)) {
            return;
        }
        if (!(source.getEntity() instanceof LivingEntity attacker) || attacker == defender || !attacker.isAlive()) {
            return;
        }
        attacker.hurt(defender.damageSources().thorns(defender), baseDamage * REFLECT);
        if (defender.level() instanceof ServerLevel level) {
            level.playSound(null, defender.getX(), defender.getY(), defender.getZ(), EndSounds.SHIELD_REFLECT, SoundSource.PLAYERS, 1.0f,
                    0.9f + level.random.nextFloat() * 0.2f);
            Vec3 at = defender.getEyePosition().add(defender.getViewVector(1f).scale(0.6)).add(0, -0.4, 0);
            level.sendParticles(EndParticles.OBSIDIAN_CRACK, at.x, at.y, at.z, 8, 0.25, 0.3, 0.25, 0.12);
            level.sendParticles(ParticleTypes.REVERSE_PORTAL, attacker.getX(), attacker.getY(0.5), attacker.getZ(), 10, 0.3, 0.4, 0.3, 0.05);
        }
    }
}
