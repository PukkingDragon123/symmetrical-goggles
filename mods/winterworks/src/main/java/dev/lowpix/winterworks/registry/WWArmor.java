package dev.lowpix.winterworks.registry;

import dev.lowpix.winterworks.Winterworks;
import java.util.EnumMap;
import java.util.List;
import net.minecraft.Util;
import net.minecraft.core.Holder;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.item.ArmorItem;
import net.minecraft.world.item.ArmorMaterial;
import net.minecraft.world.item.crafting.Ingredient;

/**
 * Armour materials. Fur: docs/COLD_UPDATE.md section 2; worn, it is drawn by vanilla's armour layer from the layer
 * {@code winterworks:fur} ({@code textures/models/armor/fur_layer_1/2.png}, docs/FIXES_0_4.md).
 */
public final class WWArmor {
    public static final Holder<ArmorMaterial> FUR = Registry.registerForHolder(BuiltInRegistries.ARMOR_MATERIAL,
            Winterworks.id("fur"), new ArmorMaterial(Util.make(new EnumMap<>(ArmorItem.Type.class), m -> {
                m.put(ArmorItem.Type.BOOTS, 2);
                m.put(ArmorItem.Type.LEGGINGS, 4);
                m.put(ArmorItem.Type.CHESTPLATE, 5);
                m.put(ArmorItem.Type.HELMET, 2);
                m.put(ArmorItem.Type.BODY, 5);
            }), 15, BuiltInRegistries.SOUND_EVENT.wrapAsHolder(WWSounds.EQUIP_FUR), () -> Ingredient.of(WWItems.POLAR_BEAR_FUR),
                    List.of(new ArmorMaterial.Layer(Winterworks.id("fur"))), 0f, 0f));

    private WWArmor() {}

    public static void init() {}
}
