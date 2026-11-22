package dev.lowpix.winterworks.end;

import dev.lowpix.winterworks.endmob.Obolisk;
import it.unimi.dsi.fastutil.longs.LongArrayList;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.core.HolderLookup;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.LongArrayTag;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.saveddata.SavedData;

/**
 * The disguised Obolisks that guard the Living End's structures (docs/END_UPDATE.md section 3). Structures are built
 * on world-generation threads, where nothing may be added to the level, so each piece queues its guards' spots
 * here; on the server thread they are saved with the level and spawned through {@code Obolisk.spawnDisguised} once
 * their chunk is loaded and ticking (they stand on the ground found there). Until the mobs land spawnDisguised
 * returns null, and the spot is dropped.
 */
public final class EndGuards {
    private static final Map<ResourceKey<Level>, ConcurrentLinkedQueue<BlockPos>> INCOMING = new ConcurrentHashMap<>();
    private static final String NAME = "winterworks_end_guards";

    private EndGuards() {}

    /** Queues a guard at `pos` (any thread). */
    public static void queue(ServerLevel level, BlockPos pos) {
        INCOMING.computeIfAbsent(level.dimension(), k -> new ConcurrentLinkedQueue<>()).add(pos.immutable());
    }

    /** How many guards are waiting to be spawned in `level` (server thread). */
    public static int pending(ServerLevel level) {
        drain(level);
        return data(level).spots.size();
    }

    static void init() {
        ServerTickEvents.END_WORLD_TICK.register(EndGuards::tick);
    }

    private static Data data(ServerLevel level) {
        return level.getDataStorage().computeIfAbsent(new SavedData.Factory<>(Data::new, Data::load, null), NAME);
    }

    private static void drain(ServerLevel level) {
        ConcurrentLinkedQueue<BlockPos> q = INCOMING.get(level.dimension());
        if (q == null || q.isEmpty()) {
            return;
        }
        Data d = data(level);
        for (BlockPos p; (p = q.poll()) != null; ) {
            d.spots.add(p.asLong());
        }
        d.setDirty();
    }

    private static void tick(ServerLevel level) {
        drain(level);
        if (level.getGameTime() % 20 != 7) {
            return;
        }
        Data d = level.getDataStorage().get(new SavedData.Factory<>(Data::new, Data::load, null), NAME);
        if (d == null || d.spots.isEmpty()) {
            return;
        }
        boolean changed = false;
        for (int i = d.spots.size() - 1; i >= 0; i--) {
            BlockPos p = BlockPos.of(d.spots.getLong(i));
            if (!level.isLoaded(p) || !level.isPositionEntityTicking(p)) {
                continue;
            }
            d.spots.removeLong(i);
            changed = true;
            Obolisk.spawnDisguised(level, stand(level, p));
        }
        if (changed) {
            d.setDirty();
        }
    }

    /** The spot over the ground nearest `p` in its column (within a few blocks), or `p`. */
    static BlockPos stand(ServerLevel level, BlockPos p) {
        for (int dy = 6; dy >= -10; dy--) {
            BlockPos q = p.above(dy);
            if (level.getBlockState(q).isAir() && level.getBlockState(q.above()).isAir()
                    && level.getBlockState(q.below()).isFaceSturdy(level, q.below(), net.minecraft.core.Direction.UP)) {
                return q;
            }
        }
        return p;
    }

    static final class Data extends SavedData {
        final LongArrayList spots = new LongArrayList();

        static Data load(CompoundTag tag, HolderLookup.Provider registries) {
            Data d = new Data();
            for (long l : tag.getLongArray("Spots")) {
                d.spots.add(l);
            }
            return d;
        }

        @Override
        public CompoundTag save(CompoundTag tag, HolderLookup.Provider registries) {
            tag.put("Spots", new LongArrayTag(spots.toLongArray()));
            return tag;
        }
    }
}
