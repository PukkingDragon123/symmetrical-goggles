package dev.lowpix.winterworks.oceangear;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import net.minecraft.core.HolderLookup;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.Tag;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.level.saveddata.SavedData;

/**
 * The trust lists (docs/OCEAN_UPDATE.md section 6), one per player, saved with the world (the overworld's
 * data/winterworks_trust.dat). Names are kept only to list them back.
 */
public final class TrustData extends SavedData {
    public static final String NAME = "winterworks_trust";
    /** owner -> (trusted player -> their name when trusted), in the order they were added. */
    private final Map<UUID, Map<UUID, String>> lists = new HashMap<>();

    public static SavedData.Factory<TrustData> factory() {
        return new SavedData.Factory<>(TrustData::new, TrustData::load, null);
    }

    public static TrustData get(MinecraftServer server) {
        return server.overworld().getDataStorage().computeIfAbsent(factory(), NAME);
    }

    public boolean trusts(UUID owner, UUID other) {
        Map<UUID, String> l = lists.get(owner);
        return l != null && l.containsKey(other);
    }

    /** Adds `other` to `owner`'s list; false if they were on it already. */
    public boolean trust(UUID owner, UUID other, String name) {
        Map<UUID, String> l = lists.computeIfAbsent(owner, k -> new LinkedHashMap<>());
        boolean added = !l.containsKey(other);
        l.put(other, name);
        setDirty();
        return added;
    }

    /** Takes `other` off `owner`'s list; false if they weren't on it. */
    public boolean untrust(UUID owner, UUID other) {
        Map<UUID, String> l = lists.get(owner);
        if (l == null || l.remove(other) == null) {
            return false;
        }
        if (l.isEmpty()) {
            lists.remove(owner);
        }
        setDirty();
        return true;
    }

    public List<String> names(UUID owner) {
        Map<UUID, String> l = lists.get(owner);
        return l == null ? Collections.emptyList() : new ArrayList<>(l.values());
    }

    @Override
    public CompoundTag save(CompoundTag tag, HolderLookup.Provider registries) {
        ListTag owners = new ListTag();
        lists.forEach((owner, l) -> {
            CompoundTag o = new CompoundTag();
            o.putUUID("Owner", owner);
            ListTag trusted = new ListTag();
            l.forEach((id, name) -> {
                CompoundTag t = new CompoundTag();
                t.putUUID("Id", id);
                t.putString("Name", name);
                trusted.add(t);
            });
            o.put("Trusted", trusted);
            owners.add(o);
        });
        tag.put("Lists", owners);
        return tag;
    }

    public static TrustData load(CompoundTag tag, HolderLookup.Provider registries) {
        TrustData d = new TrustData();
        for (Tag e : tag.getList("Lists", Tag.TAG_COMPOUND)) {
            CompoundTag o = (CompoundTag) e;
            Map<UUID, String> l = new LinkedHashMap<>();
            for (Tag te : o.getList("Trusted", Tag.TAG_COMPOUND)) {
                CompoundTag t = (CompoundTag) te;
                l.put(t.getUUID("Id"), t.getString("Name"));
            }
            if (!l.isEmpty()) {
                d.lists.put(o.getUUID("Owner"), l);
            }
        }
        return d;
    }
}
