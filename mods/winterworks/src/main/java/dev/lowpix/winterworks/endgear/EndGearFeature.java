package dev.lowpix.winterworks.endgear;

import dev.lowpix.winterworks.end.Petrify;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.event.player.AttackBlockCallback;
import net.fabricmc.fabric.api.event.player.AttackEntityCallback;
import net.fabricmc.fabric.api.event.player.UseBlockCallback;
import net.fabricmc.fabric.api.event.player.UseEntityCallback;
import net.fabricmc.fabric.api.event.player.UseItemCallback;
import net.fabricmc.fabric.api.networking.v1.EntityTrackingEvents;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;

/**
 * The Living End's gear (docs/END_UPDATE.md sections 9, 11-13): wiring for the Obsidian Shield, the Monolith Wand and
 * petrification, the End Glider, Dragon Egg cracking and the Dragonling. The behaviour lives in the classes named.
 */
public final class EndGearFeature {
    private EndGearFeature() {}

    public static void init() {
        PayloadTypeRegistry.playS2C().register(EndGearPayloads.WandBeam.TYPE, EndGearPayloads.WandBeam.CODEC);
        PayloadTypeRegistry.playC2S().register(EndGearPayloads.DragonBreath.TYPE, EndGearPayloads.DragonBreath.CODEC);
        ServerPlayNetworking.registerGlobalReceiver(EndGearPayloads.DragonBreath.TYPE, (payload, ctx) -> {
            if (ctx.player().getVehicle() instanceof Dragonling d && d.isOwnedBy(ctx.player())) {
                d.breathe(ctx.player());
            }
        });

        // petrification: the invulnerable shell takes nothing but /kill and the void; frozen players can't act
        ServerLivingEntityEvents.ALLOW_DAMAGE.register((entity, source, amount) ->
                !Petrify.isInvulnerable(entity) || source.is(DamageTypeTags.BYPASSES_INVULNERABILITY));
        EntityTrackingEvents.START_TRACKING.register(Petrify::onStartTracking);
        AttackEntityCallback.EVENT.register((player, level, hand, entity, hit) -> frozen(player));
        AttackBlockCallback.EVENT.register((player, level, hand, pos, dir) -> frozen(player));
        UseBlockCallback.EVENT.register((player, level, hand, hit) -> frozen(player));
        UseEntityCallback.EVENT.register((player, level, hand, entity, hit) -> frozen(player));
        UseItemCallback.EVENT.register((player, level, hand) -> {
            ItemStack stack = player.getItemInHand(hand);
            return Petrify.isFrozen(player) ? InteractionResultHolder.fail(stack) : InteractionResultHolder.pass(stack);
        });

        // the shield's reflection, the glider's wear
        ServerLivingEntityEvents.AFTER_DAMAGE.register(ObsidianShieldItem::afterDamage);
        ServerTickEvents.END_SERVER_TICK.register(EndGlider::serverTick);
        ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> EndGlider.forget(handler.player));
    }

    private static InteractionResult frozen(Player player) {
        return Petrify.isFrozen(player) ? InteractionResult.FAIL : InteractionResult.PASS;
    }
}
