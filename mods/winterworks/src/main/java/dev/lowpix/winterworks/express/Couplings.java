package dev.lowpix.winterworks.express;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.net.CouplingPayload;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import net.fabricmc.fabric.api.attachment.v1.AttachmentRegistry;
import net.fabricmc.fabric.api.attachment.v1.AttachmentType;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.event.player.UseEntityCallback;
import net.fabricmc.fabric.api.networking.v1.EntityTrackingEvents;
import net.fabricmc.fabric.api.networking.v1.PlayerLookup;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.core.UUIDUtil;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.vehicle.AbstractMinecart;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * Chains between minecarts (any minecart, vanilla ones too): right-click the front cart with a chain, then the cart
 * behind it. Sneak + right-click a cart with an empty hand to uncouple it (the chain drops). Coupled carts are held at
 * a fixed spacing by a damped spring, so a locomotive pulls the whole train and heavier trains accelerate slower.
 */
public final class Couplings {
    public static final double SPACING = 1.55;
    public static final double BREAK_DISTANCE = 6.0;
    public static final int MAX_TRAIN = 16;

    public record Link(Optional<UUID> front, Optional<UUID> back) {
        public static final Codec<Link> CODEC = RecordCodecBuilder.create(i -> i.group(
                UUIDUtil.CODEC.optionalFieldOf("front").forGetter(Link::front),
                UUIDUtil.CODEC.optionalFieldOf("back").forGetter(Link::back)).apply(i, Link::new));
        static final Link NONE = new Link(Optional.empty(), Optional.empty());
    }

    public static final AttachmentType<Link> LINK = AttachmentRegistry.<Link>builder()
            .persistent(Link.CODEC).initializer(() -> Link.NONE).buildAndRegister(Winterworks.id("coupling"));

    /** Player -> the cart they clicked first. */
    private static final Map<UUID, UUID> PENDING = new HashMap<>();

    private Couplings() {}

    public static void init() {
        UseEntityCallback.EVENT.register((player, level, hand, entity, hit) -> {
            if (!(entity instanceof AbstractMinecart cart)) {
                return InteractionResult.PASS;
            }
            ItemStack stack = player.getItemInHand(hand);
            if (stack.is(Items.CHAIN)) {
                if (!level.isClientSide) {
                    useChain((ServerPlayer) player, cart, stack);
                }
                return InteractionResult.sidedSuccess(level.isClientSide);
            }
            if (stack.isEmpty() && player.isShiftKeyDown() && hasAnyLink(cart) && !(cart instanceof LocomotiveCart)) {
                if (!level.isClientSide) {
                    unlinkAll((ServerLevel) level, cart, true);
                }
                return InteractionResult.sidedSuccess(level.isClientSide);
            }
            return InteractionResult.PASS;
        });
        ServerTickEvents.END_WORLD_TICK.register(Couplings::physics);
        EntityTrackingEvents.START_TRACKING.register((entity, player) -> {
            if (entity instanceof AbstractMinecart cart && entity.level() instanceof ServerLevel sl) {
                link(cart).back().map(sl::getEntity).ifPresent(b ->
                        ServerPlayNetworking.send(player, new CouplingPayload(cart.getId(), b.getId(), true)));
                link(cart).front().map(sl::getEntity).ifPresent(f ->
                        ServerPlayNetworking.send(player, new CouplingPayload(f.getId(), cart.getId(), true)));
            }
        });
    }

    public static Link link(Entity e) {
        Link l = e.getAttached(LINK);
        return l == null ? Link.NONE : l;
    }

    public static boolean hasAnyLink(Entity e) {
        Link l = link(e);
        return l.front().isPresent() || l.back().isPresent();
    }

    private static void set(Entity e, Link l) {
        if (l.front().isEmpty() && l.back().isEmpty()) {
            e.removeAttached(LINK);
        } else {
            e.setAttached(LINK, l);
        }
    }

    private static void useChain(ServerPlayer player, AbstractMinecart cart, ItemStack chain) {
        ServerLevel level = player.serverLevel();
        UUID first = PENDING.remove(player.getUUID());
        Entity front = first == null ? null : level.getEntity(first);
        if (!(front instanceof AbstractMinecart f) || f == cart || f.isRemoved()) {
            PENDING.put(player.getUUID(), cart.getUUID());
            player.displayClientMessage(Component.translatable("message.winterworks.couple.first"), true);
            level.playSound(null, cart.blockPosition(), net.minecraft.sounds.SoundEvents.CHAIN_HIT, SoundSource.PLAYERS, 0.8f, 1.2f);
            return;
        }
        if (f.distanceTo(cart) > 4.0) {
            player.displayClientMessage(Component.translatable("message.winterworks.couple.too_far"), true);
            return;
        }
        if (link(f).back().isPresent() || link(cart).front().isPresent()) {
            player.displayClientMessage(Component.translatable("message.winterworks.couple.taken"), true);
            return;
        }
        if (train(cart).contains(f)) {
            player.displayClientMessage(Component.translatable("message.winterworks.couple.loop"), true);
            return;
        }
        set(f, new Link(link(f).front(), Optional.of(cart.getUUID())));
        set(cart, new Link(Optional.of(f.getUUID()), link(cart).back()));
        if (!player.getAbilities().instabuild) {
            chain.shrink(1);
        }
        level.playSound(null, cart.blockPosition(), WWSounds.COUPLE, SoundSource.PLAYERS, 1.0f, 1.0f);
        player.displayClientMessage(Component.translatable("message.winterworks.couple.done", trainLength(cart)), true);
        broadcast(f, cart, true);
    }

    /** Couple `back` behind `front` directly (used by tests and other mods); false if either coupler is taken. */
    public static boolean couple(AbstractMinecart front, AbstractMinecart back) {
        if (link(front).back().isPresent() || link(back).front().isPresent() || train(back).contains(front)) {
            return false;
        }
        set(front, new Link(link(front).front(), Optional.of(back.getUUID())));
        set(back, new Link(Optional.of(front.getUUID()), link(back).back()));
        broadcast(front, back, true);
        return true;
    }

    public static void unlinkAll(ServerLevel level, AbstractMinecart cart, boolean drop) {
        Link l = link(cart);
        l.front().map(level::getEntity).ifPresent(f -> {
            set(f, new Link(link(f).front(), Optional.empty()));
            broadcast(f, cart, false);
        });
        l.back().map(level::getEntity).ifPresent(b -> {
            set(b, new Link(Optional.empty(), link(b).back()));
            broadcast(cart, b, false);
        });
        int chains = (l.front().isPresent() ? 1 : 0) + (l.back().isPresent() ? 1 : 0);
        set(cart, Link.NONE);
        if (drop && chains > 0) {
            cart.spawnAtLocation(new ItemStack(Items.CHAIN, chains));
        }
    }

    private static void broadcast(Entity front, Entity back, boolean linked) {
        CouplingPayload p = new CouplingPayload(front.getId(), back.getId(), linked);
        for (ServerPlayer sp : PlayerLookup.tracking(front)) {
            ServerPlayNetworking.send(sp, p);
        }
        for (ServerPlayer sp : PlayerLookup.tracking(back)) {
            if (!PlayerLookup.tracking(front).contains(sp)) {
                ServerPlayNetworking.send(sp, p);
            }
        }
    }

    @Nullable
    static AbstractMinecart back(AbstractMinecart cart) {
        if (!(cart.level() instanceof ServerLevel sl)) {
            return null;
        }
        return link(cart).back().map(sl::getEntity).filter(e -> e instanceof AbstractMinecart).map(e -> (AbstractMinecart) e).orElse(null);
    }

    @Nullable
    static AbstractMinecart front(AbstractMinecart cart) {
        if (!(cart.level() instanceof ServerLevel sl)) {
            return null;
        }
        return link(cart).front().map(sl::getEntity).filter(e -> e instanceof AbstractMinecart).map(e -> (AbstractMinecart) e).orElse(null);
    }

    /** The whole train this cart belongs to, front to back. */
    public static List<AbstractMinecart> train(AbstractMinecart cart) {
        AbstractMinecart head = cart;
        for (int i = 0; i < MAX_TRAIN; i++) {
            AbstractMinecart f = front(head);
            if (f == null || f == cart) {
                break;
            }
            head = f;
        }
        List<AbstractMinecart> out = new ArrayList<>();
        AbstractMinecart c = head;
        while (c != null && out.size() < MAX_TRAIN && !out.contains(c)) {
            out.add(c);
            c = back(c);
        }
        return out;
    }

    public static int trainLength(AbstractMinecart cart) {
        return Math.max(1, train(cart).size());
    }

    static double mass(AbstractMinecart c) {
        double m = c instanceof WWCart w ? w.kind.mass : c instanceof net.minecraft.world.entity.vehicle.MinecartFurnace ? 1.4 : 1.0;
        if (c instanceof net.minecraft.world.Container box && !box.isEmpty()) {
            m += 0.5;
        }
        return m + 0.6 * c.getPassengers().size();
    }

    /** Spring + damper between every coupled pair, run after the carts have moved this tick. */
    private static void physics(ServerLevel level) {
        for (Entity e : level.getAllEntities()) {
            if (!(e instanceof AbstractMinecart front) || front.isRemoved()) {
                continue;
            }
            Optional<UUID> backId = link(front).back();
            if (backId.isEmpty()) {
                continue;
            }
            Entity be = level.getEntity(backId.get());
            if (!(be instanceof AbstractMinecart back) || back.isRemoved()) {
                if (be == null && front.tickCount > 40 && !level.isLoaded(front.blockPosition())) {
                    continue;
                }
                if (be == null) {
                    continue;   // the other cart is in an unloaded chunk; keep the link
                }
                set(front, new Link(link(front).front(), Optional.empty()));
                continue;
            }
            if (CoasterLoop.looping(front) || CoasterLoop.looping(back)) {
                continue;   // a loop ride takes each car round on its own; the chain goes slack meanwhile
            }
            Vec3 d = front.position().subtract(back.position());
            double dist = d.length();
            if (dist > BREAK_DISTANCE) {   // derailed or teleported: the chain snaps
                set(front, new Link(link(front).front(), Optional.empty()));
                set(back, new Link(Optional.empty(), link(back).back()));
                back.spawnAtLocation(new ItemStack(Items.CHAIN));
                broadcast(front, back, false);
                continue;
            }
            if (dist < 1.0e-4) {
                continue;
            }
            Vec3 n = d.scale(1.0 / dist);
            double stretch = dist - SPACING;
            if (Math.abs(stretch) < 0.03) {
                stretch = 0;
            }
            Vec3 vf = front.getDeltaMovement(), vb = back.getDeltaMovement();
            double rel = vf.subtract(vb).dot(n);
            double force = 0.35 * stretch + 0.45 * rel;
            double mf = mass(front), mb = mass(back);
            double shareF = mb / (mf + mb), shareB = mf / (mf + mb);
            front.setDeltaMovement(vf.subtract(n.scale(force * shareF)));
            back.setDeltaMovement(vb.add(n.scale(force * shareB)));
        }
    }
}
