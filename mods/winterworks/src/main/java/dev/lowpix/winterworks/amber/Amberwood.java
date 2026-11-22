package dev.lowpix.winterworks.amber;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWItems;
import net.fabricmc.fabric.api.itemgroup.v1.ItemGroupEvents;
import net.fabricmc.fabric.api.object.builder.v1.block.type.BlockSetTypeBuilder;
import net.fabricmc.fabric.api.object.builder.v1.block.type.WoodTypeBuilder;
import net.fabricmc.fabric.api.registry.FlammableBlockRegistry;
import net.fabricmc.fabric.api.registry.StrippableBlockRegistry;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.DispenserBlock;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.properties.BlockSetType;
import net.minecraft.world.level.block.state.properties.WoodType;

/**
 * The Amberwood wood set (docs/FIXES_0_4.md, Amber): WoodType and BlockSetType {@code winterworks:amberwood} (so signs,
 * hanging signs and their edit screen find {@code entity/signs/amberwood}, {@code entity/signs/hanging/amberwood} and
 * {@code gui/hanging_signs/amberwood}), and the vanilla behaviour the blocks registered in WWBlocks need: axe
 * stripping, burning, the sign block entities, boats from dispensers and the vanilla creative tabs. Fuel comes from the
 * vanilla item tags (tools/data_amber.py).
 */
public final class Amberwood {
    public static final BlockSetType SET_TYPE = BlockSetTypeBuilder.copyOf(BlockSetType.OAK).register(Winterworks.id("amberwood"));
    public static final WoodType WOOD_TYPE = WoodTypeBuilder.copyOf(WoodType.OAK).register(Winterworks.id("amberwood"), SET_TYPE);

    private Amberwood() {}

    public static void init() {
        StrippableBlockRegistry.register(WWBlocks.AMBERWOOD_LOG, WWBlocks.STRIPPED_AMBERWOOD_LOG);
        StrippableBlockRegistry.register(WWBlocks.AMBERWOOD_WOOD, WWBlocks.STRIPPED_AMBERWOOD_WOOD);
        FlammableBlockRegistry fire = FlammableBlockRegistry.getDefaultInstance();
        for (Block b : new Block[]{WWBlocks.AMBERWOOD_LOG, WWBlocks.AMBERWOOD_WOOD, WWBlocks.STRIPPED_AMBERWOOD_LOG,
                WWBlocks.STRIPPED_AMBERWOOD_WOOD}) {
            fire.add(b, 5, 5);
        }
        for (Block b : new Block[]{WWBlocks.AMBERWOOD_PLANKS, WWBlocks.AMBERWOOD_STAIRS, WWBlocks.AMBERWOOD_SLAB, WWBlocks.AMBERWOOD_FENCE,
                WWBlocks.AMBERWOOD_FENCE_GATE}) {
            fire.add(b, 5, 20);
        }
        fire.add(WWBlocks.AMBERWOOD_BLOOM, 60, 100);
        BlockEntityType.SIGN.addSupportedBlock(WWBlocks.AMBERWOOD_SIGN);
        BlockEntityType.SIGN.addSupportedBlock(WWBlocks.AMBERWOOD_WALL_SIGN);
        BlockEntityType.HANGING_SIGN.addSupportedBlock(WWBlocks.AMBERWOOD_HANGING_SIGN);
        BlockEntityType.HANGING_SIGN.addSupportedBlock(WWBlocks.AMBERWOOD_WALL_HANGING_SIGN);
        DispenserBlock.registerBehavior(WWItems.AMBERWOOD_BOAT, new AmberwoodBoat.DispenseBehavior(false));
        DispenserBlock.registerBehavior(WWItems.AMBERWOOD_CHEST_BOAT, new AmberwoodBoat.DispenseBehavior(true));
        // the vanilla tabs, in vanilla's order: after the cherry set (bamboo comes after it, but isn't a tree)
        ItemGroupEvents.modifyEntriesEvent(CreativeModeTabs.BUILDING_BLOCKS).register(e -> e.addAfter(Items.CHERRY_BUTTON,
                WWItems.AMBERWOOD_LOG, WWItems.AMBERWOOD_WOOD, WWItems.STRIPPED_AMBERWOOD_LOG, WWItems.STRIPPED_AMBERWOOD_WOOD,
                WWItems.AMBERWOOD_PLANKS, WWItems.AMBERWOOD_STAIRS, WWItems.AMBERWOOD_SLAB, WWItems.AMBERWOOD_FENCE,
                WWItems.AMBERWOOD_FENCE_GATE, WWItems.AMBERWOOD_DOOR, WWItems.AMBERWOOD_TRAPDOOR, WWItems.AMBERWOOD_PRESSURE_PLATE,
                WWItems.AMBERWOOD_BUTTON));
        ItemGroupEvents.modifyEntriesEvent(CreativeModeTabs.NATURAL_BLOCKS).register(e -> {
            e.addAfter(Items.CHERRY_LOG, WWItems.AMBERWOOD_LOG);
            e.addAfter(Items.CHERRY_SAPLING, WWItems.AMBERWOOD_BLOOM);
            e.addAfter(Items.SUSPICIOUS_GRAVEL, WWItems.AMBER_SAND, WWItems.AMBER_GRAVEL);
        });
        ItemGroupEvents.modifyEntriesEvent(CreativeModeTabs.FUNCTIONAL_BLOCKS).register(e -> e.addAfter(Items.CHERRY_HANGING_SIGN,
                WWItems.AMBERWOOD_SIGN, WWItems.AMBERWOOD_HANGING_SIGN));
        ItemGroupEvents.modifyEntriesEvent(CreativeModeTabs.TOOLS_AND_UTILITIES).register(e -> e.addAfter(Items.CHERRY_CHEST_BOAT,
                WWItems.AMBERWOOD_BOAT, WWItems.AMBERWOOD_CHEST_BOAT));
        ItemGroupEvents.modifyEntriesEvent(CreativeModeTabs.INGREDIENTS).register(e -> e.addAfter(Items.AMETHYST_SHARD,
                WWItems.AMBER_SHARD));
    }
}
