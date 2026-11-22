package dev.lowpix.winterworks.endboss;

import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.core.HolderLookup;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.saveddata.SavedData;
import org.jetbrains.annotations.Nullable;

/**
 * The eclipse's state (docs/END_UPDATE.md section 5): saved data on the End level, a 1-in-8 roll at the start of each
 * 24000-tick day, {@link #DEFAULT_TICKS} long with {@link #FADE}-tick fades. Behind {@link dev.lowpix.winterworks.end.Eclipse}.
 *
 * <p>It is two numbers: {@code remaining} (ticks until it is fully over) and {@code level} (the 0..1 fraction). Each tick
 * {@code remaining} counts down and {@code level} rises by 1/FADE, but never above remaining/FADE, so it fades in over
 * FADE ticks, holds, and fades out over the last FADE ticks; extending it mid-fade rises again smoothly. The client runs
 * the same step on a mirrored copy ({@link #CLIENT}) that the server resends on change, on join and on dimension change.
 */
public final class EclipseState extends SavedData {
    public static final int DEFAULT_TICKS = 6000, FADE = 600, DAY = 24000, CHANCE = 8;
    private static final String NAME = "winterworks_eclipse";
    /** The client's mirror of the End's eclipse (only read on the client). */
    public static final EclipseState CLIENT = new EclipseState();

    float level;
    int remaining;
    /** The last day index rolled for (-1: not yet). */
    long lastDay = -1;
    // what the clients were last told (to resend when the server drifts from their prediction)
    private int sentRemaining = -1;
    private long sentAt;

    public EclipseState() {}

    public static SavedData.Factory<EclipseState> factory() {
        return new SavedData.Factory<>(EclipseState::new, EclipseState::load, null);
    }

    /** The End's eclipse (whichever level is passed in: the eclipse only exists in the End). */
    @Nullable
    public static EclipseState get(ServerLevel any) {
        ServerLevel end = any.dimension() == Level.END ? any : any.getServer().getLevel(Level.END);
        return end == null ? null : end.getDataStorage().computeIfAbsent(factory(), NAME);
    }

    public float level() {
        return level;
    }

    public int remaining() {
        return remaining;
    }

    public boolean active() {
        return remaining > 0;
    }

    /** One tick of the fade rule (server and client). */
    void step() {
        if (remaining > 0) {
            remaining--;
            level = Math.min(Math.min(1f, level + 1f / FADE), remaining / (float) FADE);
        } else {
            level = 0f;
        }
    }

    /** Sets the client mirror from a packet. */
    public void set(float level, int remaining) {
        this.level = level;
        this.remaining = remaining;
    }

    /** Client tick (the mirror keeps time between packets). */
    public void clientStep() {
        step();
    }

    // ------------------------------------------------------------------------------------------------ server

    /** Starts (or extends: never shortens) the eclipse to `ticks` from now. */
    public void start(ServerLevel end, int ticks) {
        boolean was = active();
        if (ticks > remaining) {
            remaining = ticks;
            setDirty();
        }
        if (!was && active()) {
            broadcast(end.getServer());   // the clients hear it begin (client.endboss.EclipseClient)
        } else {
            maybeResend(end.getServer(), end.getGameTime());
        }
    }

    public void stop(ServerLevel end) {
        if (remaining > 0 || level > 0) {
            remaining = 0;
            level = 0f;
            setDirty();
            broadcast(end.getServer());
        }
    }

    /** Dev and screenshot use: skips the fade in. */
    public void forceFull(ServerLevel end, int ticks) {
        remaining = Math.max(remaining, ticks);
        level = Math.min(1f, remaining / (float) FADE);
        setDirty();
        broadcast(end.getServer());
    }

    /** The End's server tick: the day roll, then the fade step. */
    void tick(ServerLevel end) {
        long day = Math.floorDiv(end.getDayTime(), DAY);
        if (lastDay < 0) {
            lastDay = day;   // a new world (or the first visit with this mod): no roll for the day already under way
            setDirty();
        } else if (day != lastDay) {
            lastDay = day;
            setDirty();
            if (end.getRandom().nextInt(CHANCE) == 0) {
                start(end, DEFAULT_TICKS);
            }
        }
        if (remaining > 0) {
            boolean last = remaining == 1;
            step();
            if (end.getGameTime() % 20 == 0) {
                setDirty();
            }
            if (last) {
                setDirty();
                broadcast(end.getServer());
            }
        }
    }

    private void maybeResend(MinecraftServer server, long now) {
        int predicted = (int) Math.max(0, sentRemaining - (now - sentAt));
        if (Math.abs(predicted - remaining) > 100) {
            broadcast(server);
        }
    }

    void broadcast(MinecraftServer server) {
        ServerLevel end = server.getLevel(Level.END);
        sentRemaining = remaining;
        sentAt = end != null ? end.getGameTime() : 0;
        EclipsePayload p = new EclipsePayload(level, remaining);
        for (ServerPlayer player : server.getPlayerList().getPlayers()) {
            if (ServerPlayNetworking.canSend(player, EclipsePayload.TYPE)) {
                ServerPlayNetworking.send(player, p);
            }
        }
    }

    void send(ServerPlayer player) {
        if (ServerPlayNetworking.canSend(player, EclipsePayload.TYPE)) {
            ServerPlayNetworking.send(player, new EclipsePayload(level, remaining));
        }
    }

    // ------------------------------------------------------------------------------------------------ saving

    @Override
    public CompoundTag save(CompoundTag tag, HolderLookup.Provider registries) {
        tag.putFloat("Level", level);
        tag.putInt("Remaining", remaining);
        tag.putLong("LastDay", lastDay);
        return tag;
    }

    public static EclipseState load(CompoundTag tag, HolderLookup.Provider registries) {
        EclipseState s = new EclipseState();
        s.level = tag.getFloat("Level");
        s.remaining = tag.getInt("Remaining");
        s.lastDay = tag.contains("LastDay") ? tag.getLong("LastDay") : -1;
        return s;
    }
}
