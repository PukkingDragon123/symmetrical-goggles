package dev.lowpix.winterworks.launcher;

import dev.lowpix.winterworks.registry.WWComponents;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;
import net.minecraft.ChatFormatting;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.UseAnim;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

/**
 * The Snowball Launcher: hold use to rapid-fire packed snowballs (they stun), or switch mode (sneak + use) to
 * cobblestone balls, which must charge for a second before they fire and hit hard. Firing builds heat; at 100 the
 * launcher overheats and locks until it cools below 25.
 */
public class SnowballLauncherItem extends Item {
    public static final int MODE_SNOW = 0, MODE_COBBLE = 1;
    public static final int MAX_HEAT = 100, SNOW_HEAT = 4, COBBLE_HEAT = 30, UNLOCK_HEAT = 25;
    public static final int FIRE_INTERVAL = 3, CHARGE_TICKS = 20, FULL_CHARGE = 34;

    /** Client-side effect timing per shooter (recoil, drum spin): last shot game time, heavy flag. */
    public static final Map<LivingEntity, long[]> FX = new WeakHashMap<>();

    public SnowballLauncherItem(Properties props) {
        super(props);
    }

    public static int heat(ItemStack s) {
        return s.getOrDefault(WWComponents.HEAT, 0);
    }

    public static int mode(ItemStack s) {
        return s.getOrDefault(WWComponents.MODE, MODE_SNOW);
    }

    public static boolean overheated(ItemStack s) {
        return s.getOrDefault(WWComponents.OVERHEATED, false);
    }

    @Override
    public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if (player.isShiftKeyDown()) {
            if (!level.isClientSide) {
                int m = mode(stack) == MODE_SNOW ? MODE_COBBLE : MODE_SNOW;
                stack.set(WWComponents.MODE, m);
                level.playSound(null, player.blockPosition(), WWSounds.LAUNCHER_MODE, SoundSource.PLAYERS, 0.9f, m == MODE_SNOW ? 1.3f : 0.8f);
                player.displayClientMessage(Component.translatable("item.winterworks.snowball_launcher.mode." + m), true);
            }
            return InteractionResultHolder.sidedSuccess(stack, level.isClientSide);
        }
        if (overheated(stack)) {
            level.playSound(null, player.blockPosition(), WWSounds.LAUNCHER_OVERHEAT, SoundSource.PLAYERS, 0.5f, 1.6f);
            return InteractionResultHolder.fail(stack);
        }
        if (findAmmo(player, mode(stack)).isEmpty() && !player.getAbilities().instabuild) {
            level.playSound(null, player.blockPosition(), WWSounds.LAUNCHER_EMPTY, SoundSource.PLAYERS, 0.8f, 1.4f);
            return InteractionResultHolder.fail(stack);
        }
        player.startUsingItem(hand);
        return InteractionResultHolder.consume(stack);
    }

    @Override
    public int getUseDuration(ItemStack stack, LivingEntity entity) {
        return 72000;
    }

    @Override
    public UseAnim getUseAnimation(ItemStack stack) {
        return UseAnim.NONE;
    }

    @Override
    public void onUseTick(Level level, LivingEntity user, ItemStack stack, int remaining) {
        int used = getUseDuration(stack, user) - remaining;
        if (mode(stack) == MODE_COBBLE) {
            if (used == 1 || used == CHARGE_TICKS / 2 || used == CHARGE_TICKS) {
                if (!level.isClientSide) {
                    level.playSound(null, user.blockPosition(), WWSounds.LAUNCHER_CHARGE, SoundSource.PLAYERS, 0.7f,
                            0.7f + used / (float) CHARGE_TICKS * 0.8f);
                }
            }
            return;
        }
        if (used % FIRE_INTERVAL != 0) {
            return;
        }
        if (level.isClientSide) {
            FX.put(user, new long[]{level.getGameTime(), 0});
            return;
        }
        if (!(user instanceof Player player)) {
            return;
        }
        ItemStack ammo = findAmmo(player, MODE_SNOW);
        if (ammo.isEmpty() && !player.getAbilities().instabuild) {
            level.playSound(null, player.blockPosition(), WWSounds.LAUNCHER_EMPTY, SoundSource.PLAYERS, 0.8f, 1.4f);
            player.stopUsingItem();
            return;
        }
        IceShotEntity shot = new IceShotEntity(level, player);
        Vec3 muzzle = muzzle(player);
        shot.setPos(muzzle.x, muzzle.y, muzzle.z);
        shot.shootFromRotation(player, player.getXRot(), player.getYRot(), 0.0f, 2.3f, 3.5f);
        level.addFreshEntity(shot);
        level.playSound(null, player.blockPosition(), WWSounds.LAUNCHER_FIRE, SoundSource.PLAYERS, 0.6f,
                1.1f + level.random.nextFloat() * 0.3f);
        if (!player.getAbilities().instabuild) {
            ammo.shrink(1);
            stack.hurtAndBreak(1, player, LivingEntity.getSlotForHand(player.getUsedItemHand()));
        }
        addHeat(level, player, stack, SNOW_HEAT);
    }

    @Override
    public void releaseUsing(ItemStack stack, Level level, LivingEntity user, int remaining) {
        if (mode(stack) != MODE_COBBLE || !(user instanceof Player player)) {
            return;
        }
        int used = getUseDuration(stack, user) - remaining;
        if (used < CHARGE_TICKS) {
            if (!level.isClientSide) {
                level.playSound(null, player.blockPosition(), WWSounds.LAUNCHER_EMPTY, SoundSource.PLAYERS, 0.6f, 0.7f);
            }
            return;
        }
        float power = Math.min(1f, (used - CHARGE_TICKS) / (float) (FULL_CHARGE - CHARGE_TICKS) * 0.5f + 0.5f);
        if (level.isClientSide) {
            FX.put(user, new long[]{level.getGameTime(), 1});
            return;
        }
        ItemStack ammo = findAmmo(player, MODE_COBBLE);
        if (ammo.isEmpty() && !player.getAbilities().instabuild) {
            return;
        }
        CobbleBallEntity ball = new CobbleBallEntity(level, player, power);
        Vec3 muzzle = muzzle(player);
        ball.setPos(muzzle.x, muzzle.y, muzzle.z);
        ball.shootFromRotation(player, player.getXRot(), player.getYRot(), 0.0f, 1.5f + power * 0.7f, 0.5f);
        level.addFreshEntity(ball);
        level.playSound(null, player.blockPosition(), WWSounds.LAUNCHER_HEAVY, SoundSource.PLAYERS, 1.0f, 0.8f + power * 0.2f);
        Vec3 back = player.getLookAngle().scale(-0.35 * power);
        player.push(back.x, 0.05, back.z);   // recoil
        player.hurtMarked = true;
        if (!player.getAbilities().instabuild) {
            ammo.shrink(1);
            stack.hurtAndBreak(3, player, LivingEntity.getSlotForHand(player.getUsedItemHand()));
        }
        addHeat(level, player, stack, COBBLE_HEAT);
    }

    private static void addHeat(Level level, Player player, ItemStack stack, int amount) {
        int h = Math.min(MAX_HEAT, heat(stack) + amount);
        stack.set(WWComponents.HEAT, h);
        if (h >= MAX_HEAT) {
            stack.set(WWComponents.OVERHEATED, true);
            player.stopUsingItem();
            player.getCooldowns().addCooldown(stack.getItem(), 30);
            level.playSound(null, player.blockPosition(), WWSounds.LAUNCHER_OVERHEAT, SoundSource.PLAYERS, 1.0f, 1.0f);
            if (level instanceof ServerLevel sl) {
                Vec3 m = muzzle(player);
                sl.sendParticles(ParticleTypes.LARGE_SMOKE, m.x, m.y, m.z, 8, 0.15, 0.15, 0.15, 0.02);
            }
        }
    }

    private static Vec3 muzzle(Player p) {
        Vec3 look = p.getLookAngle();
        Vec3 right = look.cross(new Vec3(0, 1, 0)).normalize();
        float side = p.getUsedItemHand() == InteractionHand.MAIN_HAND ? 1f : -1f;
        if (p.getMainArm() == net.minecraft.world.entity.HumanoidArm.LEFT) {
            side = -side;
        }
        return p.getEyePosition().add(look.scale(0.6)).add(right.scale(0.28 * side)).add(0, -0.18, 0);
    }

    @Override
    public void inventoryTick(ItemStack stack, Level level, Entity entity, int slot, boolean selected) {
        if (level.isClientSide || level.getGameTime() % 2 != 0) {
            return;
        }
        boolean firing = entity instanceof LivingEntity le && le.isUsingItem() && le.getUseItem() == stack;
        int h = heat(stack);
        if (h > 0 && !firing) {
            boolean over = overheated(stack);
            int nh = Math.max(0, h - (over ? 2 : 3));
            stack.set(WWComponents.HEAT, nh);
            if (over && nh <= UNLOCK_HEAT) {
                stack.set(WWComponents.OVERHEATED, false);
            }
            if (over && level instanceof ServerLevel sl && level.getGameTime() % 6 == 0) {
                sl.sendParticles(ParticleTypes.SMOKE, entity.getX(), entity.getY() + 1.2, entity.getZ(), 1, 0.2, 0.1, 0.2, 0.01);
            }
        }
    }

    /** Snow mode: snowballs. Cobble mode: cobble balls, then cobblestone. Offhand first, then the inventory. */
    public static ItemStack findAmmo(Player p, int mode) {
        Item[] kinds = mode == MODE_SNOW ? new Item[]{Items.SNOWBALL} : new Item[]{WWItems.COBBLE_BALL, Items.COBBLESTONE};
        for (Item k : kinds) {
            if (p.getOffhandItem().is(k)) {
                return p.getOffhandItem();
            }
            for (int i = 0; i < p.getInventory().getContainerSize(); i++) {
                ItemStack s = p.getInventory().getItem(i);
                if (s.is(k)) {
                    return s;
                }
            }
        }
        return ItemStack.EMPTY;
    }

    public static int countAmmo(Player p, int mode) {
        Item[] kinds = mode == MODE_SNOW ? new Item[]{Items.SNOWBALL} : new Item[]{WWItems.COBBLE_BALL, Items.COBBLESTONE};
        int n = 0;
        for (int i = 0; i < p.getInventory().getContainerSize(); i++) {
            ItemStack s = p.getInventory().getItem(i);
            for (Item k : kinds) {
                if (s.is(k)) {
                    n += s.getCount();
                }
            }
        }
        return n;
    }

    @Override
    public boolean allowComponentsUpdateAnimation(Player player, InteractionHand hand, ItemStack oldStack, ItemStack newStack) {
        return false;   // heat changes every tick; don't replay the equip animation
    }

    @Override
    public boolean isBarVisible(ItemStack stack) {
        return heat(stack) > 0 || super.isBarVisible(stack);
    }

    @Override
    public int getBarWidth(ItemStack stack) {
        return heat(stack) > 0 ? Math.round(13f * heat(stack) / MAX_HEAT) : super.getBarWidth(stack);
    }

    @Override
    public int getBarColor(ItemStack stack) {
        if (heat(stack) > 0) {
            return overheated(stack) ? 0xFF3A20 : 0xFFA040;
        }
        return super.getBarColor(stack);
    }

    @Override
    public void appendHoverText(ItemStack stack, TooltipContext ctx, List<Component> lines, TooltipFlag flag) {
        lines.add(Component.translatable("item.winterworks.snowball_launcher.mode." + mode(stack)).withStyle(ChatFormatting.AQUA));
        lines.add(Component.translatable("item.winterworks.snowball_launcher.tip").withStyle(ChatFormatting.GRAY));
    }
}
