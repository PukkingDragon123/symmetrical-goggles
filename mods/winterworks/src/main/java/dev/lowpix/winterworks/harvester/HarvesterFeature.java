package dev.lowpix.winterworks.harvester;

import dev.lowpix.winterworks.amber.AmberBlock;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWItems;
import net.fabricmc.fabric.api.event.player.UseBlockCallback;
import net.fabricmc.fabric.api.itemgroup.v1.ItemGroupEvents;
import net.fabricmc.fabric.api.object.builder.v1.entity.FabricDefaultAttributeRegistry;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.state.BlockState;

/**
 * The Harvester and the Amber Age plant fixes (docs/FIXES_0_4.md "The Harvester" and "Torchflowers, pitcher plants,
 * mosquitoes and sniffers"): the Harvester's attributes, its egg sealed in Dig Site amber, picking grown torchflowers
 * and pitcher plants with an empty hand, the plants' light levels and the creative tab entries. The Harvester has no
 * natural spawns: it comes from eggs (amber, archaeology loot: tools/data_archaeology.py).
 */
public final class HarvesterFeature {
    private HarvesterFeature() {}

    public static void init() {
        FabricDefaultAttributeRegistry.register(WWEntities.HARVESTER, HarvesterEntity.createAttributes());
        GlowPlants.initLight();
        // a Harvester Egg sealed in amber drops out when the amber breaks without Silk Touch
        AmberBlock.onRelease(AmberBlock.Inclusion.EGG, (level, pos, state, r) ->
                net.minecraft.world.level.block.Block.popResource(level, pos, new ItemStack(WWItems.HARVESTER_EGG)));
        // grown torchflowers and pitcher plants are picked with an empty hand (like sweet berries)
        UseBlockCallback.EVENT.register((player, level, hand, hit) -> {
            if (hand != InteractionHand.MAIN_HAND || player.isSpectator() || !player.getItemInHand(hand).isEmpty()
                    || player.isSecondaryUseActive()) {
                return InteractionResult.PASS;
            }
            BlockPos pos = hit.getBlockPos();
            BlockState s = level.getBlockState(pos);
            if (!GlowPlants.canPick(level, pos, s)) {
                return InteractionResult.PASS;
            }
            if (level instanceof ServerLevel sl) {
                GlowPlants.pick(sl, pos, s, player);
            }
            return InteractionResult.sidedSuccess(level.isClientSide);
        });
        ItemGroupEvents.modifyEntriesEvent(BuiltInRegistries.CREATIVE_MODE_TAB.getResourceKey(WWItems.TAB).orElseThrow())
                .register(entries -> entries.addAfter(WWItems.POT_GOLEM_SPAWN_EGG, WWItems.HARVESTER_EGG, WWItems.HARVESTER_SPAWN_EGG));
    }
}
