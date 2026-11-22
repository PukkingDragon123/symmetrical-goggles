package dev.lowpix.winterworks.client.hex;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.hex.CursedItems;
import dev.lowpix.winterworks.mixin.client.hex.BlockModelAccessor;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.client.model.loading.v1.ModelLoadingPlugin;
import net.minecraft.client.renderer.block.model.BlockModel;
import net.minecraft.client.renderer.block.model.ItemOverride;
import net.minecraft.client.renderer.item.ItemProperties;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.Items;

/**
 * Cursed books (docs/FIXES_0_4.md "Cursed books and cursed gear"): an enchanted book carrying a curse (any of ours,
 * Binding or Vanishing) is drawn as item/cursed_book, one carrying a sin as item/cursed_book_sin. The property
 * winterworks:cursed (0 none, 0.5 a curse, 1 a sin) drives two overrides added to vanilla's enchanted book model while
 * it loads, so a resource pack's own enchanted book still shows for uncursed books.
 */
public final class CursedBooks {
    public static final ResourceLocation PROPERTY = Winterworks.id("cursed");
    static final ResourceLocation CURSED = Winterworks.id("item/cursed_book");
    static final ResourceLocation SIN = Winterworks.id("item/cursed_book_sin");
    private static final ResourceLocation ENCHANTED_BOOK = ResourceLocation.withDefaultNamespace("item/enchanted_book");

    private CursedBooks() {}

    public static void init() {
        ItemProperties.register(Items.ENCHANTED_BOOK, PROPERTY, (stack, level, entity, seed) -> CursedItems.tier(stack) / 2f);
        ModelLoadingPlugin.register(ctx -> {
            ctx.addModels(CURSED, SIN);
            ctx.modifyModelOnLoad().register((model, context) -> {
                if (model instanceof BlockModel block && ENCHANTED_BOOK.equals(context.resourceId())) {
                    BlockModelAccessor acc = (BlockModelAccessor) block;
                    List<ItemOverride> overrides = new ArrayList<>(acc.ww$overrides());
                    overrides.add(new ItemOverride(CURSED, List.of(new ItemOverride.Predicate(PROPERTY, 0.5f))));
                    overrides.add(new ItemOverride(SIN, List.of(new ItemOverride.Predicate(PROPERTY, 1.0f))));
                    acc.ww$setOverrides(overrides);
                }
                return model;
            });
        });
    }
}
