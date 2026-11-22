package dev.lowpix.winterworks.nether;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.Optional;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.stats.Stats;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.EquipmentSlotGroup;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.ProjectileUtil;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.UseAnim;
import net.minecraft.world.item.component.ItemAttributeModifiers;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * The Netherite Spear (docs/FIXES_0_4.md "The Withered Commander"): the commander's weapon, a long-reach melee weapon.
 * Held, it hits hard and slowly and reaches {@link #EXTRA_REACH} blocks further (the entity interaction range
 * attribute). Hold use to draw it back (like a trident), let go for a thrust: a short spring forward and a stab that
 * reaches {@link #THRUST_REACH} blocks, {@link #THRUST_MULTIPLIER} times its blow, with heavy knockback; then a short
 * cooldown. Drawn in 3D from the lowpix model in hand and in slots (client.nether.NetheriteSpearRenderer).
 */
public class NetheriteSpearItem extends Item {
    public static final double DAMAGE = 9.0, SPEED = -2.9, EXTRA_REACH = 1.5, THRUST_REACH = 6.0;
    public static final float THRUST_MULTIPLIER = 1.5f;
    public static final int CHARGE_TICKS = 8, COOLDOWN = 24;
    private static final ResourceLocation REACH_ID = Winterworks.id("netherite_spear_reach");

    public NetheriteSpearItem(Properties properties) {
        super(properties);
    }

    public static ItemAttributeModifiers createAttributes() {
        return ItemAttributeModifiers.builder()
                .add(Attributes.ATTACK_DAMAGE, new AttributeModifier(BASE_ATTACK_DAMAGE_ID, DAMAGE, AttributeModifier.Operation.ADD_VALUE),
                        EquipmentSlotGroup.MAINHAND)
                .add(Attributes.ATTACK_SPEED, new AttributeModifier(BASE_ATTACK_SPEED_ID, SPEED, AttributeModifier.Operation.ADD_VALUE),
                        EquipmentSlotGroup.MAINHAND)
                .add(Attributes.ENTITY_INTERACTION_RANGE, new AttributeModifier(REACH_ID, EXTRA_REACH, AttributeModifier.Operation.ADD_VALUE),
                        EquipmentSlotGroup.MAINHAND)
                .build();
    }

    @Override
    public boolean hurtEnemy(ItemStack stack, LivingEntity target, LivingEntity attacker) {
        return true;
    }

    @Override
    public void postHurtEnemy(ItemStack stack, LivingEntity target, LivingEntity attacker) {
        stack.hurtAndBreak(1, attacker, EquipmentSlot.MAINHAND);
    }

    @Override
    public boolean canAttackBlock(net.minecraft.world.level.block.state.BlockState state, Level level, net.minecraft.core.BlockPos pos,
                                  Player player) {
        return !player.isCreative();
    }

    @Override
    public int getEnchantmentValue() {
        return 15;
    }

    @Override
    public boolean isValidRepairItem(ItemStack stack, ItemStack repair) {
        return repair.is(Items.NETHERITE_INGOT);
    }

    @Override
    public UseAnim getUseAnimation(ItemStack stack) {
        return UseAnim.SPEAR;
    }

    @Override
    public int getUseDuration(ItemStack stack, LivingEntity entity) {
        return 72000;
    }

    @Override
    public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if (hand != InteractionHand.MAIN_HAND || player.getCooldowns().isOnCooldown(this)) {
            return InteractionResultHolder.fail(stack);
        }
        player.startUsingItem(hand);
        return InteractionResultHolder.consume(stack);
    }

    @Override
    public void releaseUsing(ItemStack stack, Level level, LivingEntity user, int left) {
        if (!(user instanceof Player player) || getUseDuration(stack, user) - left < CHARGE_TICKS) {
            return;
        }
        thrust(stack, level, player);
    }

    /** The thrust: spring forward a little and stab the first thing along the line of sight within reach. */
    public static void thrust(ItemStack stack, Level level, Player player) {
        Vec3 look = player.getLookAngle();
        player.getCooldowns().addCooldown(stack.getItem(), COOLDOWN);
        player.swing(InteractionHand.MAIN_HAND, true);
        if (player.onGround()) {
            player.push(look.x * 0.45, 0.05, look.z * 0.45);
            player.hurtMarked = true;
        }
        level.playSound(null, player.getX(), player.getY(), player.getZ(), WWSounds.WITHERED_COMMANDER_LUNGE, SoundSource.PLAYERS, 0.8f, 1.3f);
        level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.TRIDENT_THROW.value(), SoundSource.PLAYERS, 1f, 0.7f);
        if (level.isClientSide) {
            return;
        }
        Vec3 eye = player.getEyePosition(), end = eye.add(look.scale(THRUST_REACH));
        AABB box = player.getBoundingBox().expandTowards(look.scale(THRUST_REACH)).inflate(1.0);
        EntityHitResult hit = ProjectileUtil.getEntityHitResult(level, player, eye, end, box,
                e -> e instanceof LivingEntity le && le.isAlive() && !e.isSpectator() && e.isPickable() && e != player.getVehicle(), 0.3f);
        Optional<Entity> target = Optional.ofNullable(hit).map(EntityHitResult::getEntity);
        if (target.isPresent() && target.get() instanceof LivingEntity victim) {
            float dmg = (float) player.getAttributeValue(Attributes.ATTACK_DAMAGE) * THRUST_MULTIPLIER;
            if (victim.hurt(player.damageSources().playerAttack(player), dmg)) {
                victim.knockback(1.2, -look.x, -look.z);
                victim.hurtMarked = true;
                stack.hurtAndBreak(1, player, EquipmentSlot.MAINHAND);
                player.awardStat(Stats.ITEM_USED.get(stack.getItem()));
                player.setLastHurtMob(victim);
                if (level instanceof ServerLevel sl) {
                    sl.sendParticles(ParticleTypes.CRIT, victim.getX(), victim.getY(0.6), victim.getZ(), 12, 0.3, 0.3, 0.3, 0.2);
                    sl.playSound(null, victim.getX(), victim.getY(), victim.getZ(), SoundEvents.TRIDENT_HIT, SoundSource.PLAYERS, 1f, 0.8f);
                }
            }
        } else if (level instanceof ServerLevel sl) {
            Vec3 p = eye.add(look.scale(3.0));
            sl.sendParticles(ParticleTypes.SWEEP_ATTACK, p.x, p.y - 0.2, p.z, 1, 0, 0, 0, 0);
        }
    }
}
