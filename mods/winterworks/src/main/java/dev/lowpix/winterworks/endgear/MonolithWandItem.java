package dev.lowpix.winterworks.endgear;

import dev.lowpix.winterworks.end.Petrify;
import dev.lowpix.winterworks.registry.EndSounds;
import java.util.List;
import net.fabricmc.fabric.api.networking.v1.PlayerLookup;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.stats.Stats;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.ProjectileUtil;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * The Monolith Wand (docs/END_UPDATE.md section 11): use it on a living entity within 24 blocks (in sight) to petrify
 * it for 10 s in an invulnerable obsidian shell (end.Petrify). A violet beam shows the shot. 3 s cooldown, 1 durability
 * per petrification; bosses (winterworks:petrify_immune) shrug it off (the beam fizzles: cooldown, no wear).
 */
public class MonolithWandItem extends Item {
    public static final double RANGE = 24.0;
    public static final int PETRIFY_TICKS = 200, COOLDOWN = 60;

    public MonolithWandItem(Properties p) {
        super(p);
    }

    @Override
    public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        LivingEntity target = target(player);
        if (target == null) {
            return InteractionResultHolder.pass(stack);
        }
        if (level instanceof ServerLevel server) {
            fire(server, player, hand, target);
        }
        return InteractionResultHolder.sidedSuccess(stack, level.isClientSide);
    }

    /** Petrifies `target` (unless it's a boss), with beam, sound, cooldown and wear. Returns true if it was petrified. */
    public static boolean fire(ServerLevel level, Player player, InteractionHand hand, LivingEntity target) {
        ItemStack stack = player.getItemInHand(hand);
        boolean resisted = Petrify.isImmune(target);
        if (!resisted) {
            Petrify.freeze(target, PETRIFY_TICKS, true);
        }
        Vec3 from = player.getEyePosition().add(player.getViewVector(1f).scale(1.1)).add(0, -0.3, 0);   // the wand's tip
        Vec3 to = target.getBoundingBox().getCenter();
        EndGearPayloads.WandBeam beam = new EndGearPayloads.WandBeam(from, to, resisted);
        for (ServerPlayer p : PlayerLookup.tracking(player)) {
            ServerPlayNetworking.send(p, beam);
        }
        if (player instanceof ServerPlayer self && !PlayerLookup.tracking(player).contains(self)) {
            ServerPlayNetworking.send(self, beam);
        }
        level.playSound(null, player.getX(), player.getEyeY(), player.getZ(), EndSounds.WAND_PETRIFY, SoundSource.PLAYERS, 1.0f,
                resisted ? 0.6f : 0.95f + level.random.nextFloat() * 0.1f);
        if (resisted) {
            level.playSound(null, target.getX(), target.getEyeY(), target.getZ(), SoundEvents.FIRE_EXTINGUISH, SoundSource.PLAYERS, 0.8f, 0.6f);
        }
        player.getCooldowns().addCooldown(stack.getItem(), COOLDOWN);
        player.awardStat(Stats.ITEM_USED.get(stack.getItem()));
        if (!resisted) {
            stack.hurtAndBreak(1, player, LivingEntity.getSlotForHand(hand));
        }
        return !resisted;
    }

    /** The living entity `player` is aiming at within 24 blocks, in sight (not through walls), or null. */
    @Nullable
    public static LivingEntity target(Player player) {
        Vec3 eye = player.getEyePosition();
        Vec3 look = player.getViewVector(1f);
        Vec3 end = eye.add(look.scale(RANGE));
        HitResult block = player.level().clip(new ClipContext(eye, end, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, player));
        double reach = block.getType() == HitResult.Type.MISS ? RANGE * RANGE : block.getLocation().distanceToSqr(eye);
        AABB box = player.getBoundingBox().expandTowards(look.scale(RANGE)).inflate(1.0);
        EntityHitResult hit = ProjectileUtil.getEntityHitResult(player, eye, end, box, MonolithWandItem::targetable, reach);
        return hit != null && hit.getEntity() instanceof LivingEntity living ? living : null;
    }

    private static boolean targetable(Entity e) {
        return e instanceof LivingEntity && e.isAlive() && !e.isSpectator() && e.isPickable();
    }

    @Override
    public void appendHoverText(ItemStack stack, TooltipContext ctx, List<Component> lines, TooltipFlag flag) {
        lines.add(Component.translatable("item.winterworks.monolith_wand.tip").withStyle(ChatFormatting.GRAY));
    }
}
