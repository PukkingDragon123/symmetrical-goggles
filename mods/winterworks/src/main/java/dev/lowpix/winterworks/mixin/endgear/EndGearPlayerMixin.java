package dev.lowpix.winterworks.mixin.endgear;

import dev.lowpix.winterworks.registry.EndItems;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.stats.Stats;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** The Obsidian Shield wears and is disabled by axes like the vanilla shield (Player only does that for Items.SHIELD). */
@Mixin(Player.class)
public abstract class EndGearPlayerMixin {
    @Inject(method = "hurtCurrentlyUsedShield", at = @At("HEAD"))
    private void ww$obsidianShieldWear(float amount, CallbackInfo ci) {
        Player self = (Player) (Object) this;
        ItemStack use = self.getUseItem();
        if (!use.is(EndItems.OBSIDIAN_SHIELD)) {
            return;
        }
        if (!self.level().isClientSide) {
            self.awardStat(Stats.ITEM_USED.get(use.getItem()));
        }
        if (amount >= 3.0f) {
            InteractionHand hand = self.getUsedItemHand();
            use.hurtAndBreak(1 + Mth.floor(amount), self, LivingEntity.getSlotForHand(hand));
            if (use.isEmpty()) {
                self.setItemSlot(hand == InteractionHand.MAIN_HAND ? EquipmentSlot.MAINHAND : EquipmentSlot.OFFHAND, ItemStack.EMPTY);
                self.stopUsingItem();
                self.playSound(SoundEvents.SHIELD_BREAK, 0.8f, 0.8f + self.level().random.nextFloat() * 0.4f);
            }
        }
    }

    @Inject(method = "disableShield", at = @At("HEAD"))
    private void ww$obsidianShieldDisabled(CallbackInfo ci) {
        Player self = (Player) (Object) this;
        if (self.getUseItem().is(EndItems.OBSIDIAN_SHIELD)) {
            self.getCooldowns().addCooldown(EndItems.OBSIDIAN_SHIELD, 100);
        }
    }
}
