package dev.lowpix.winterworks.client.hex;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.hex.HexComponents;
import dev.lowpix.winterworks.hex.HexedBookItem;
import dev.lowpix.winterworks.hex.SoulDriftPayload;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.registry.WWMenus;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback;
import net.fabricmc.fabric.api.client.model.loading.v1.ModelLoadingPlugin;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.MenuScreens;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderers;
import net.minecraft.client.renderer.item.ItemProperties;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.phys.Vec3;

/** Client side of the hex feature (docs/HEXES_UPDATE.md sections 1-2). */
public final class HexClient {
    private HexClient() {}

    public static void init() {
        HexLayers.init();
        BlockEntityRenderers.register(WWBlocks.ELIXIR_JAR_BE, ElixirJarRenderer::new);
        BlockEntityRenderers.register(WWBlocks.SOUL_TANK_BE, SoulTankRenderer::new);
        BlockEntityRenderers.register(WWBlocks.HEXING_TABLE_BE, HexingTableRenderer::new);
        BuiltinItemRendererRegistry.INSTANCE.register(WWItems.ELIXIR_JAR, new ElixirJarRenderer.Item());
        BuiltinItemRendererRegistry.INSTANCE.register(WWItems.SOUL_TANK, new SoulTankRenderer.Item());
        BuiltinItemRendererRegistry.INSTANCE.register(WWItems.HEXING_TABLE, new HexingTableRenderer.Item());
        BuiltinItemRendererRegistry.INSTANCE.register(WWItems.HEX_CORE, new HexCoreRenderer());
        ModelLoadingPlugin.register(ctx -> ctx.addModels(HexCoreRenderer.ICON_MODEL));

        MenuScreens.register(WWMenus.HEXING_TABLE, HexingTableScreen::new);
        // item/hexed_book overrides: 0 lesser, 0.5 sin, 1 hidden
        ItemProperties.register(WWItems.HEXED_BOOK, Winterworks.id("hex_tier"),
                (stack, level, entity, seed) -> HexedBookItem.info(stack).look() / 2f);
        ItemTooltipCallback.EVENT.register((stack, context, type, lines) -> HexTooltips.append(stack, lines));
        ClientPlayNetworking.registerGlobalReceiver(SoulDriftPayload.TYPE, (payload, context) -> SoulDrifts.add(payload));
        ClientTickEvents.END_CLIENT_TICK.register(mc -> {
            SoulDrifts.tick(mc);
            heldHexCore(mc);
        });
    }

    /** The Hex Core sheds souls while held. */
    private static void heldHexCore(Minecraft mc) {
        LocalPlayer p = mc.player;
        if (p == null || mc.level == null || mc.isPaused()) {
            return;
        }
        for (InteractionHand hand : InteractionHand.values()) {
            if (!p.getItemInHand(hand).is(WWItems.HEX_CORE) || p.getRandom().nextInt(4) != 0) {
                continue;
            }
            boolean right = (hand == InteractionHand.MAIN_HAND) == (p.getMainArm() == net.minecraft.world.entity.HumanoidArm.RIGHT);
            float yaw = (p.getYRot() + (right ? 38f : -38f)) * Mth.DEG_TO_RAD;
            Vec3 at = p.getEyePosition().add(-Mth.sin(yaw) * 0.6, -0.42, Mth.cos(yaw) * 0.6);
            var r = p.getRandom();
            mc.level.addParticle(r.nextInt(3) == 0 ? ParticleTypes.SOUL_FIRE_FLAME : ParticleTypes.SOUL,
                    at.x + (r.nextDouble() - 0.5) * 0.25, at.y + (r.nextDouble() - 0.5) * 0.2, at.z + (r.nextDouble() - 0.5) * 0.25,
                    0, 0.01, 0);
        }
        if (p.getMainHandItem().is(WWItems.HEXED_BOOK) && p.getMainHandItem().getOrDefault(HexComponents.HEX, HexComponents.HexInfo.NONE)
                .look() == HexComponents.HIDDEN && p.getRandom().nextInt(90) == 0) {
            mc.level.addParticle(ParticleTypes.SMOKE, p.getX(), p.getEyeY() - 0.3, p.getZ(), 0, 0.02, 0);
        }
    }
}
