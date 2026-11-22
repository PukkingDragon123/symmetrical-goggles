package dev.lowpix.winterworks.client.curse;

import dev.lowpix.winterworks.curse.SoulFirePayload;
import it.unimi.dsi.fastutil.ints.Int2LongMap;
import it.unimi.dsi.fastutil.ints.Int2LongOpenHashMap;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.TextureAtlas;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.client.resources.model.Material;
import net.minecraft.client.resources.model.ModelBakery;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.Entity;

/**
 * Soul fire on the client: which entities burn with soul fire (synced by curse.SoulFirePayload), and the blue flame
 * sprites drawn instead of vanilla's orange ones, on their bodies (mixin.client.SoulFlameMixin) and, for the local
 * player, on the first-person fire overlay (mixin.client.SoulFireOverlayMixin).
 */
public final class SoulFireClient {
    public static final Material SOUL_FIRE_0 = new Material(TextureAtlas.LOCATION_BLOCKS, ResourceLocation.withDefaultNamespace("block/soul_fire_0"));
    public static final Material SOUL_FIRE_1 = new Material(TextureAtlas.LOCATION_BLOCKS, ResourceLocation.withDefaultNamespace("block/soul_fire_1"));

    /** Entity id -> the client tick its soul fire runs out (a safety net: the server also says when it stops). */
    private static final Int2LongMap BURNING = new Int2LongOpenHashMap();
    private static long ticks;

    private SoulFireClient() {}

    public static void init() {
        ClientPlayNetworking.registerGlobalReceiver(SoulFirePayload.TYPE, (payload, ctx) -> set(payload.entity(), payload.ticks()));
        ClientTickEvents.END_CLIENT_TICK.register(mc -> {
            ticks++;
            if (!BURNING.isEmpty() && ticks % 20 == 0) {
                BURNING.int2LongEntrySet().removeIf(e -> e.getLongValue() < ticks);
            }
        });
        ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> BURNING.clear());
        ClientPlayConnectionEvents.JOIN.register((handler, sender, client) -> BURNING.clear());
    }

    /** Marks an entity as soul-burning for `ticks` (0 puts it out). Also used by the dev screenshots. */
    public static void set(int entityId, int burnTicks) {
        if (burnTicks > 0) {
            BURNING.put(entityId, ticks + burnTicks + 10);
        } else {
            BURNING.remove(entityId);
        }
    }

    /** Is this entity on fire with soul fire (so its flames are drawn blue)? */
    public static boolean soulBurning(Entity e) {
        return e != null && !BURNING.isEmpty() && BURNING.containsKey(e.getId()) && e.displayFireAnimation();
    }

    /** The sprite to draw for a fire material on this entity: soul fire's when it burns with soul fire. */
    public static TextureAtlasSprite sprite(Material vanilla, TextureAtlasSprite original, Entity e) {
        if (!soulBurning(e)) {
            return original;
        }
        return (vanilla == ModelBakery.FIRE_0 ? SOUL_FIRE_0 : SOUL_FIRE_1).sprite();
    }

    /** The local player's first-person fire overlay. */
    public static TextureAtlasSprite overlaySprite(TextureAtlasSprite original) {
        Minecraft mc = Minecraft.getInstance();
        return soulBurning(mc.player) ? SOUL_FIRE_1.sprite() : original;
    }
}
