package dev.lowpix.winterworks.oceangear;

import java.util.List;
import net.minecraft.ChatFormatting;
import net.minecraft.core.Direction;
import net.minecraft.core.Position;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.stats.Stats;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.AbstractArrow;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.item.ArrowItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

/**
 * Lionfish darts: in the {@code #minecraft:arrows} tag, so bows and crossbows pick them as ammunition (and fire
 * {@link LionfishDart}s through {@link #createArrow}); dispensers shoot them too. Used on their own they are thrown by
 * hand: slower and weaker than from a bow, but still poisoned.
 */
public class LionfishDartItem extends ArrowItem {
    public static final float THROW_SPEED = 1.6f;
    public static final int THROW_COOLDOWN = 8;

    public LionfishDartItem(Properties p) {
        super(p);
    }

    @Override
    public AbstractArrow createArrow(Level level, ItemStack ammo, LivingEntity shooter, @Nullable ItemStack weapon) {
        return new LionfishDart(level, shooter, ammo.copyWithCount(1), weapon);
    }

    @Override
    public Projectile asProjectile(Level level, Position pos, ItemStack stack, Direction dir) {
        LionfishDart d = new LionfishDart(level, pos.x(), pos.y(), pos.z(), stack.copyWithCount(1), null);
        d.pickup = AbstractArrow.Pickup.ALLOWED;
        return d;
    }

    /** Thrown by hand. */
    @Override
    public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.TRIDENT_THROW, SoundSource.PLAYERS, 0.6f,
                1.5f + level.getRandom().nextFloat() * 0.2f);
        if (!level.isClientSide) {
            throwDart(level, player, stack);
        }
        player.getCooldowns().addCooldown(this, THROW_COOLDOWN);
        player.awardStat(Stats.ITEM_USED.get(this));
        stack.consume(1, player);
        return InteractionResultHolder.sidedSuccess(stack, level.isClientSide());
    }

    /** The dart a hand throw makes (also the test hook). */
    public static LionfishDart throwDart(Level level, LivingEntity thrower, ItemStack stack) {
        LionfishDart d = new LionfishDart(level, thrower, stack.copyWithCount(1), null);
        d.setBaseDamage(LionfishDart.THROWN_DAMAGE);
        d.shootFromRotation(thrower, thrower.getXRot(), thrower.getYRot(), 0f, THROW_SPEED, 1.0f);
        d.pickup = thrower instanceof Player p && p.hasInfiniteMaterials() ? AbstractArrow.Pickup.CREATIVE_ONLY : AbstractArrow.Pickup.ALLOWED;
        level.addFreshEntity(d);
        return d;
    }

    @Override
    public void appendHoverText(ItemStack stack, TooltipContext ctx, List<Component> lines, TooltipFlag flag) {
        lines.add(Component.translatable("item.winterworks.lionfish_dart.tip").withStyle(ChatFormatting.GRAY));
    }
}
