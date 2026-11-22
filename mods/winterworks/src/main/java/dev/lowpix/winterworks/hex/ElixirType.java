package dev.lowpix.winterworks.hex;

import dev.lowpix.winterworks.registry.WWItems;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

/** What an Elixir Jar holds (docs/HEXES_UPDATE.md section 1): its liquid colour and the elixir a bottle takes out. */
public enum ElixirType {
    NONE("none", 0x000000),
    /** Pale soul-blue: the Hexing Table's fuel. */
    SOUL("soul", 0x8FE8F4),
    /** Molten gold. */
    GREED("greed", 0xF4B12C),
    /** Gold bound with souls: the renderer swirls it toward soul blue. */
    CURSED("cursed", 0xD49A2E),
    /** A Potion of Blood poured in: what a gold block needs to become the Elixir of Greed. Not bottled. */
    BLOOD("blood", 0x8E1016);

    public final String id;
    public final int color;

    ElixirType(String id, int color) {
        this.id = id;
        this.color = color;
    }

    public Item item() {
        return switch (this) {
            case SOUL -> WWItems.SOUL_ELIXIR;
            case GREED -> WWItems.ELIXIR_OF_GREED;
            case CURSED -> WWItems.CURSED_ELIXIR;
            case NONE, BLOOD -> Items.AIR;
        };
    }

    /** Can an Elixir Bottle take a dose of it? */
    public boolean bottled() {
        return this == SOUL || this == GREED || this == CURSED;
    }

    public ItemStack dose() {
        return bottled() ? new ItemStack(item()) : ItemStack.EMPTY;
    }

    public String translationKey() {
        return "block.winterworks.elixir_jar." + id;
    }

    public static ElixirType byId(String id) {
        for (ElixirType t : values()) {
            if (t.id.equals(id)) {
                return t;
            }
        }
        return NONE;
    }
}
