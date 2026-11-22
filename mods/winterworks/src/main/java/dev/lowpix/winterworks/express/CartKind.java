package dev.lowpix.winterworks.express;

import dev.lowpix.winterworks.registry.WWItems;
import java.util.function.Supplier;
import net.minecraft.world.item.Item;

/** The Winter Express rolling stock. Mass makes long trains slower; seats is how many passengers fit. */
public enum CartKind {
    LOCOMOTIVE("locomotive", () -> WWItems.LOCOMOTIVE, 3.0, 1, true),
    DRAGON_LOCOMOTIVE("dragon_locomotive", () -> WWItems.DRAGON_LOCOMOTIVE, 3.5, 1, true),
    FOX_CART("fox_cart", () -> WWItems.FOX_CART, 1.0, 1, false),
    ZOMBIE_CART("zombie_cart", () -> WWItems.ZOMBIE_CART, 1.0, 1, false);

    public final String id;
    public final Supplier<Item> item;
    public final double mass;
    public final int seats;
    public final boolean locomotive;

    CartKind(String id, Supplier<Item> item, double mass, int seats, boolean locomotive) {
        this.id = id;
        this.item = item;
        this.mass = mass;
        this.seats = seats;
        this.locomotive = locomotive;
    }
}
