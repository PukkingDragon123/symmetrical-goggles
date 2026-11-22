package dev.lowpix.winterworks.amber;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEffects;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWParticles;
import dev.lowpix.winterworks.registry.WWSounds;
import net.fabricmc.fabric.api.loot.v3.LootTableEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.SpawnPlacementTypes;
import net.minecraft.world.entity.SpawnPlacements;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.alchemy.PotionContents;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.storage.loot.BuiltInLootTables;
import net.minecraft.world.level.storage.loot.LootTable;
import net.minecraft.world.level.storage.loot.entries.NestedLootTable;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/** Amber, Amberwood, mosquitoes, blood and sniffers (docs/AMBER_UPDATE.md sections 4-8). */
public final class AmberFeature {
    /** Extra sniffer finds (Amberwood seeds, amber chunks, bones, sherds): data/winterworks/loot_table/gameplay/sniffer_finds. */
    public static final ResourceKey<LootTable> SNIFFER_FINDS = ResourceKey.create(Registries.LOOT_TABLE, Winterworks.id("gameplay/sniffer_finds"));
    /** Potion of Blood colour (it has no effect to take a colour from; see mixin.PotionContentsMixin). */
    public static final int BLOOD_COLOR = 0xFF6E0B14;

    private AmberFeature() {}

    public static void init() {
        // natural spawning comes from the Dead Caves biome (data); like other monsters, only in the dark
        SpawnPlacements.register(WWEntities.MOSQUITO, SpawnPlacementTypes.ON_GROUND, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES,
                Monster::checkMonsterSpawnRules);
        // sniffers dig up amber age finds too: one weight-2 entry beside vanilla's two seeds (so seeds stay half the drops)
        LootTableEvents.MODIFY.register((key, builder, source, registries) -> {
            if (source.isBuiltin() && BuiltInLootTables.SNIFFER_DIGGING.equals(key)) {
                builder.modifyPools(pool -> pool.add(NestedLootTable.lootTableReference(SNIFFER_FINDS).setWeight(2)));
            }
        });
    }

    // --------------------------------------------------------------------------------------- blood

    public static boolean isBloodPotion(ItemStack stack) {
        PotionContents pc = stack.get(DataComponents.POTION_CONTENTS);
        return pc != null && pc.is(WWEffects.BLOOD_POTION);
    }

    /** A Potion of Blood in the given container (potion, splash or lingering). */
    public static ItemStack bloodPotion(Item container) {
        return PotionContents.createItemStack(container, WWEffects.BLOOD_POTION);
    }

    /**
     * A splash or lingering Potion of Blood broke at `at` (mixin.ThrownPotionMixin): it stains the floor and every amber
     * mosquito within 8 blocks spits out its amber.
     */
    public static void bloodSplash(ServerLevel level, Vec3 at, boolean lingering) {
        level.playSound(null, at.x, at.y, at.z, WWSounds.BLOOD_SPLASH, SoundSource.NEUTRAL, 1.0f, 0.9f + level.random.nextFloat() * 0.2f);
        level.sendParticles(WWParticles.BLOOD_DRIP, at.x, at.y + 0.3, at.z, lingering ? 40 : 24, 1.0, 0.3, 1.0, 0.0);
        int r = lingering ? 2 : 1;
        BlockPos c = BlockPos.containing(at);
        for (int dx = -r; dx <= r; dx++) {
            for (int dz = -r; dz <= r; dz++) {
                boolean centre = dx == 0 && dz == 0;
                if (!centre && (dx * dx + dz * dz > r * r + 1 || level.random.nextFloat() > (lingering ? 0.8f : 0.55f))) {
                    continue;
                }
                stain(level, c.offset(dx, 0, dz));
            }
        }
        AABB box = new AABB(at, at).inflate(8.0);
        for (MosquitoEntity m : level.getEntitiesOfClass(MosquitoEntity.class, box, m -> m.isAmber() && m.distanceToSqr(at) <= 64.0)) {
            m.feedBlood();
        }
    }

    /** Puts a blood stain on the first floor at or below `p` (up to 3 blocks down). */
    public static boolean stain(ServerLevel level, BlockPos p) {
        BlockState stain = WWBlocks.BLOOD_STAIN.defaultBlockState();
        for (int dy = 1; dy >= -3; dy--) {
            BlockPos q = p.above(dy);
            BlockState here = level.getBlockState(q);
            if ((here.isAir() || (here.canBeReplaced() && here.getFluidState().isEmpty() && !here.is(WWBlocks.BLOOD_STAIN)))
                    && level.getBlockState(q.below()).isFaceSturdy(level, q.below(), Direction.UP)) {
                return level.setBlockAndUpdate(q, stain);
            }
            if (here.is(WWBlocks.BLOOD_STAIN)) {
                return false;
            }
        }
        return false;
    }
}
