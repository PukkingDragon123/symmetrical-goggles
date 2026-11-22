package dev.lowpix.winterworks.client.endgear;

import com.mojang.blaze3d.platform.InputConstants;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.end.Petrify;
import dev.lowpix.winterworks.endgear.DragonEggs;
import dev.lowpix.winterworks.endgear.Dragonling;
import dev.lowpix.winterworks.endgear.EndGearPayloads;
import dev.lowpix.winterworks.registry.EndEntities;
import dev.lowpix.winterworks.registry.EndItems;
import dev.lowpix.winterworks.registry.EndParticles;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.particle.v1.ParticleFactoryRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.item.ItemProperties;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.Items;
import org.lwjgl.glfw.GLFW;

/**
 * Client side of the Living End's gear (docs/END_UPDATE.md sections 9, 11-13): the 3D Obsidian Shield, Monolith Wand and
 * End Glider (GUI included), the Dragonling renderer, the petrification shell, the obsidian_crack particle, the wand
 * beam, the glider's jets, the cracked-egg item models and the dragon breath key.
 */
public final class EndGearClient {
    public static final KeyMapping DRAGON_BREATH = new KeyMapping("key.winterworks.dragon_breath", InputConstants.Type.KEYSYM, GLFW.GLFW_KEY_R,
            "key.categories.winterworks");

    private EndGearClient() {}

    public static void init() {
        GearLayers.init();
        BuiltinItemRendererRegistry.INSTANCE.register(EndItems.OBSIDIAN_SHIELD, new ObsidianShieldRenderer());
        BuiltinItemRendererRegistry.INSTANCE.register(EndItems.MONOLITH_WAND, new MonolithWandRenderer());
        BuiltinItemRendererRegistry.INSTANCE.register(EndItems.END_GLIDER, new EndGliderRenderer());
        EntityRendererRegistry.register(EndEntities.DRAGONLING, DragonlingRenderer::new);
        ParticleFactoryRegistry.getInstance().register(EndParticles.OBSIDIAN_CRACK, ObsidianCrackParticle.Provider::new);

        // item model overrides: the shield's blocking pose; the cracked dragon eggs (item/dragon_egg_cracked_1, _2)
        ItemProperties.register(EndItems.OBSIDIAN_SHIELD, ResourceLocation.withDefaultNamespace("blocking"),
                (stack, level, entity, seed) -> entity != null && entity.isUsingItem() && entity.getUseItem() == stack ? 1f : 0f);
        ItemProperties.register(Items.DRAGON_EGG, Winterworks.id("egg_cracks"),
                (stack, level, entity, seed) -> Math.min(2, DragonEggs.cracks(stack)) / 2f);

        KeyBindingHelper.registerKeyBinding(DRAGON_BREATH);
        ClientPlayNetworking.registerGlobalReceiver(EndGearPayloads.WandBeam.TYPE, (payload, ctx) -> GearEffects.onBeam(payload));
        WorldRenderEvents.AFTER_ENTITIES.register(GearEffects::renderBeams);
        HudRenderCallback.EVENT.register(PetrifyShell::hud);
        ClientTickEvents.END_CLIENT_TICK.register(mc -> {
            GearEffects.tickGliders(mc);
            while (DRAGON_BREATH.consumeClick()) {
                if (mc.player != null && mc.player.getVehicle() instanceof Dragonling d && d.isTeen()
                        && ClientPlayNetworking.canSend(EndGearPayloads.DragonBreath.TYPE)) {
                    ClientPlayNetworking.send(new EndGearPayloads.DragonBreath());
                }
            }
        });
        ClientTickEvents.START_CLIENT_TICK.register(mc -> {   // petrified: the hands are stone too (no dropping, swapping or switching)
            if (localFrozen()) {
                while (mc.options.keyDrop.consumeClick()) {
                    // swallowed
                }
                while (mc.options.keySwapOffhand.consumeClick()) {
                    // swallowed
                }
                for (KeyMapping k : mc.options.keyHotbarSlots) {
                    while (k.consumeClick()) {
                        // swallowed
                    }
                }
            }
        });
        EndGearShots.init();
    }

    /** The local player is petrified: no turning, no input, no attacking or using. */
    public static boolean localFrozen() {
        Minecraft mc = Minecraft.getInstance();
        return mc.player != null && Petrify.isFrozen(mc.player);
    }
}
