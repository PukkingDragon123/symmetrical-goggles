package dev.lowpix.winterworks.client.dagger;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.lowpix.LowpixGeometry;
import dev.lowpix.winterworks.dagger.DaggerFeature;
import dev.lowpix.winterworks.dagger.FangDaggerItem;
import dev.lowpix.winterworks.net.DaggerStatePayload;
import dev.lowpix.winterworks.net.PouncePayload;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.registry.WWSounds;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback;
import net.fabricmc.fabric.api.client.model.loading.v1.ModelLoadingPlugin;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.ArmorRenderer;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.fabricmc.fabric.api.event.player.AttackEntityCallback;
import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * Client side of the Fang Daggers and fur armour (docs/COLD_UPDATE.md sections 2 and 9): the 3D dagger and fur
 * armour renderers, the fur tooltip, and the local player's frenzy and pounce.
 *
 * <p>Frenzy clicks go straight to the server (no client-side vanilla attack, so the hands never dip) and the swing
 * alternates hands. A pounce is detected here (sneak + jump on the ground), the leap is applied at once for
 * responsiveness and the server is told ({@link PouncePayload}); hits, fatigue and the cooldown are the server's.
 */
public final class DaggerClient {
    public static final ModelLayerLocation FANG_DAGGER = new ModelLayerLocation(Winterworks.id("fang_dagger"), "main");
    public static final ModelLayerLocation FUR_ARMOR = new ModelLayerLocation(Winterworks.id("fur_armor"), "main");
    private static final float DEG = Mth.DEG_TO_RAD;

    // the local player's dagger state, as the server last told us
    @Nullable private static LocalPlayer owner;
    private static float fatigue;
    private static boolean exhausted;
    private static float readyAt = -1000f;
    // frenzy swings
    private static int strikes;
    @Nullable private static InteractionHand strikeHand;
    private static final float[] LAST_STRIKE = {-1000f, -1000f};
    // pounce
    private static boolean wasOnGround;
    private static int pounceTicks;
    private static boolean pounceDamped;

    private DaggerClient() {}

    public static void init() {
        layer(FANG_DAGGER, "fang_dagger");
        layer(FUR_ARMOR, "fur_armor");
        BuiltinItemRendererRegistry.INSTANCE.register(WWItems.FANG_DAGGER, new FangDaggerRenderer());
        ModelLoadingPlugin.register(ctx -> ctx.addModels(FangDaggerRenderer.ICON_MODEL));
        ArmorRenderer.register(new FurArmorRenderer(), WWItems.FUR_HOOD, WWItems.FUR_COAT, WWItems.FUR_LEGGINGS, WWItems.FUR_BOOTS);
        ItemTooltipCallback.EVENT.register((stack, context, flag, lines) -> {
            if (FurArmorRenderer.isFur(stack)) {
                lines.add(Math.min(1, lines.size()), Component.translatable("item.winterworks.fur.tip").withStyle(ChatFormatting.GRAY));
            }
        });
        ClientPlayNetworking.registerGlobalReceiver(DaggerStatePayload.TYPE, (payload, ctx) -> onState(payload));
        AttackEntityCallback.EVENT.register(DaggerClient::onAttack);
        ClientTickEvents.END_CLIENT_TICK.register(DaggerClient::tick);
    }

    /** Registers a lowpix model layer; a missing export draws nothing instead of crashing (as WWLayers does). */
    private static void layer(ModelLayerLocation layer, String name) {
        EntityModelLayerRegistry.registerModelLayer(layer, () -> {
            try {
                return LowpixGeometry.layer(Winterworks.MOD_ID, name);
            } catch (RuntimeException e) {
                Winterworks.LOG.error("model {} is missing: {}", name, e.getMessage());
                return LayerDefinition.create(new MeshDefinition(), 16, 16);
            }
        });
    }

    // ------------------------------------------------------------------------------------------------ state

    private static void syncOwner(Minecraft mc) {
        if (mc.player != owner) {   // a new player (joined, respawned, changed dimension): fresh state until told
            owner = mc.player;
            fatigue = 0f;
            exhausted = false;
            strikes = 0;
            strikeHand = null;
            pounceTicks = 0;
            wasOnGround = false;
        }
    }

    private static void onState(DaggerStatePayload s) {
        Minecraft mc = Minecraft.getInstance();
        syncOwner(mc);
        if (exhausted && !s.exhausted() && mc.level != null) {
            readyAt = mc.level.getGameTime();
        }
        fatigue = s.fatigue();
        exhausted = s.exhausted();
    }

    /** The local player has two daggers out and the frenzy is ready (not exhausted). */
    public static boolean frenzyReady(@Nullable LivingEntity e) {
        return e != null && e == owner && !exhausted && FangDaggerItem.dualWielding(e);
    }

    public static float fatigue() {
        return fatigue;
    }

    /** Ticks since the local player's last frenzy strike with `hand`. */
    public static float sinceStrike(InteractionHand hand, float now) {
        return now - LAST_STRIKE[hand.ordinal()];
    }

    /** Ticks since the frenzy recharged. */
    public static float sinceReady(float now) {
        return now - readyAt;
    }

    // ------------------------------------------------------------------------------------------------ frenzy

    private static InteractionResult onAttack(Player player, Level level, InteractionHand hand, Entity entity, @Nullable EntityHitResult hit) {
        if (!level.isClientSide) {
            return InteractionResult.PASS;
        }
        Minecraft mc = Minecraft.getInstance();
        if (player != mc.player || player.isSpectator() || !FangDaggerItem.dualWielding(player)) {
            return InteractionResult.PASS;
        }
        syncOwner(mc);
        if (exhausted || !(entity instanceof LivingEntity) || !entity.isAttackable()) {
            return InteractionResult.PASS;   // exhausted: the vanilla attack (the server turns falling hits into Fang Crits)
        }
        InteractionHand strike = strikes++ % 2 == 0 ? InteractionHand.MAIN_HAND : InteractionHand.OFF_HAND;
        strikeHand = strike;
        LAST_STRIKE[strike.ordinal()] = level.getGameTime();
        return InteractionResult.SUCCESS;   // sends the attack packet; the server strikes (or buffers) the frenzy hit
    }

    private static void tick(Minecraft mc) {
        LocalPlayer p = mc.player;
        if (p == null || mc.level == null) {
            owner = null;
            return;
        }
        syncOwner(mc);
        if (strikeHand != null) {
            if (p.swinging && p.swingTime == 0) {   // the swing that started this tick belongs to the striking hand
                p.swingingArm = strikeHand;
            }
            strikeHand = null;
        }
        boolean jumped = wasOnGround && !p.onGround() && p.getDeltaMovement().y > 0.2 && p.input != null && p.input.jumping;
        if (jumped && p.isShiftKeyDown() && !exhausted && FangDaggerItem.dualWielding(p) && canPounce(p)
                && ClientPlayNetworking.canSend(PouncePayload.TYPE)) {
            pounce(mc, p);
        }
        if (pounceTicks > 0) {
            tickPounce(p);
        }
        wasOnGround = p.onGround();
    }

    // ------------------------------------------------------------------------------------------------ pounce

    private static boolean canPounce(LocalPlayer p) {
        return !p.isPassenger() && !p.isFallFlying() && !p.isInWater() && !p.getAbilities().flying && !p.isSpectator()
                && !p.getCooldowns().isOnCooldown(WWItems.FANG_DAGGER) && pounceTicks == 0;
    }

    private static void pounce(Minecraft mc, LocalPlayer p) {
        float yaw = p.getYRot();
        Vec3 dir = new Vec3(-Mth.sin(yaw * DEG), 0, Mth.cos(yaw * DEG));
        p.setDeltaMovement(dir.x * DaggerFeature.POUNCE_SPEED, DaggerFeature.POUNCE_UP, dir.z * DaggerFeature.POUNCE_SPEED);
        p.getCooldowns().addCooldown(WWItems.FANG_DAGGER, DaggerFeature.POUNCE_COOLDOWN);
        ClientPlayNetworking.send(new PouncePayload(yaw));
        p.swing(InteractionHand.MAIN_HAND);
        float now = mc.level.getGameTime();
        LAST_STRIKE[0] = LAST_STRIKE[1] = now;   // both daggers flick forward
        mc.level.playLocalSound(p.getX(), p.getY(), p.getZ(), WWSounds.DAGGER_POUNCE, SoundSource.PLAYERS, 1.0f,
                0.95f + p.getRandom().nextFloat() * 0.1f, false);
        pounceTicks = 1;
        pounceDamped = false;
    }

    private static void tickPounce(LocalPlayer p) {
        pounceTicks++;
        if (!pounceDamped && !p.level().getEntitiesOfClass(LivingEntity.class, p.getBoundingBox().inflate(0.6, 0.3, 0.6),
                e -> DaggerFeature.canPounceOn(p, e)).isEmpty()) {
            pounceDamped = true;   // landed on the prey: stop there so the rapid hits go in
            Vec3 m = p.getDeltaMovement();
            p.setDeltaMovement(m.x * 0.3, m.y, m.z * 0.3);
        }
        if (pounceTicks > DaggerFeature.POUNCE_MAX_TICKS || (pounceTicks > 3 && p.onGround())) {
            pounceTicks = 0;
        }
    }
}
