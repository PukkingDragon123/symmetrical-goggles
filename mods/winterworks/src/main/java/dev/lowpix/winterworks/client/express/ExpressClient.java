package dev.lowpix.winterworks.client.express;

import dev.lowpix.winterworks.express.CartKind;
import dev.lowpix.winterworks.express.CartRide;
import dev.lowpix.winterworks.express.RailPaint;
import dev.lowpix.winterworks.net.LoopPayload;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWItems;
import java.util.HashMap;
import java.util.Map;
import net.fabricmc.fabric.api.blockrenderlayer.v1.BlockRenderLayerMap;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.model.loading.v1.ModelLoadingPlugin;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.ColorProviderRegistry;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderers;
import net.minecraft.world.entity.Entity;

/**
 * Client side of the Winter Express 0.4 fixes: the Coaster Loop (its renderer, the loop rides the server announces),
 * the Switch Rail's render layer and paint, and the 3D inventory icons of the locomotives and carts.
 */
public final class ExpressClient {
    private static final Map<Integer, LoopPayload> PENDING = new HashMap<>();
    private static final Map<Integer, Integer> PENDING_AGE = new HashMap<>();

    private ExpressClient() {}

    public static void init() {
        ClientPlayNetworking.registerGlobalReceiver(LoopPayload.TYPE, (payload, ctx) -> {
            if (!apply(ctx.client().level, payload)) {   // a cart coming into view: its loop ride can arrive before it does
                PENDING.put(payload.entity(), payload);
                PENDING_AGE.put(payload.entity(), 0);
            }
        });
        ClientTickEvents.END_CLIENT_TICK.register(mc -> {
            if (PENDING.isEmpty()) {
                return;
            }
            PENDING.entrySet().removeIf(e -> apply(mc.level, e.getValue()) || PENDING_AGE.merge(e.getKey(), 1, Integer::sum) > 40);
            PENDING_AGE.keySet().retainAll(PENDING.keySet());
        });
        BlockEntityRenderers.register(WWBlocks.COASTER_LOOP_BE, CoasterLoopRenderer::new);
        ModelLoadingPlugin.register(ctx -> ctx.addModels(CoasterLoopRenderer.SEGMENT));
        BuiltinItemRendererRegistry.INSTANCE.register(WWItems.COASTER_LOOP, new CoasterLoopRenderer.Item());

        BlockRenderLayerMap.INSTANCE.putBlocks(RenderType.cutout(), WWBlocks.SWITCH_RAIL);
        ColorProviderRegistry.BLOCK.register((state, view, pos, tint) -> tint == 0 ? RailPaint.tint(state) : -1, WWBlocks.SWITCH_RAIL);
        ColorProviderRegistry.ITEM.register((stack, tint) -> tint == 0 ? 0xFF8A6B47 : -1, WWItems.SWITCH_RAIL);

        BuiltinItemRendererRegistry.INSTANCE.register(WWItems.LOCOMOTIVE, new CartItemRenderer(CartKind.LOCOMOTIVE));
        BuiltinItemRendererRegistry.INSTANCE.register(WWItems.DRAGON_LOCOMOTIVE, new CartItemRenderer(CartKind.DRAGON_LOCOMOTIVE));
        BuiltinItemRendererRegistry.INSTANCE.register(WWItems.FOX_CART, new CartItemRenderer(CartKind.FOX_CART));
        BuiltinItemRendererRegistry.INSTANCE.register(WWItems.ZOMBIE_CART, new CartItemRenderer(CartKind.ZOMBIE_CART));
        ExpressShots.init();
    }

    private static boolean apply(ClientLevel level, LoopPayload payload) {
        Entity e = level == null ? null : level.getEntity(payload.entity());
        if (e instanceof CartRide ride) {
            ride.ww$setLoop(payload.active() ? payload.motion() : null);
            return true;
        }
        return false;
    }
}
