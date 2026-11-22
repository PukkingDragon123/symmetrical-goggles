package dev.lowpix.winterworks.hex;

import dev.lowpix.winterworks.registry.WWParticles;
import dev.lowpix.winterworks.registry.WWSounds;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

/**
 * A Hexed Book: enchantments made stronger by a curse (docs/HEXES_UPDATE.md section 2). It carries
 * STORED_ENCHANTMENTS (anvils read them like an enchanted book's: mixin.EnchantmentHelperMixin) and
 * {@link HexComponents#HEX} (its tier, for the texture, and its hidden curses). Its tooltip is drawn by
 * client.hex.HexTooltips. Held, it whispers and sheds runes.
 */
public class HexedBookItem extends Item {
    public HexedBookItem(Properties properties) {
        super(properties);
    }

    public static HexComponents.HexInfo info(ItemStack stack) {
        return stack.getOrDefault(HexComponents.HEX, HexComponents.HexInfo.NONE);
    }

    @Override
    public void inventoryTick(ItemStack stack, Level level, Entity entity, int slot, boolean selected) {
        if (!level.isClientSide || !(entity instanceof Player player)) {
            return;
        }
        boolean offhand = player.getOffhandItem() == stack;
        if (!selected && !offhand) {
            return;
        }
        var r = level.random;
        int look = info(stack).look();
        if (r.nextInt(look == HexComponents.HIDDEN ? 6 : 10) == 0) {
            // a rune peels off the book in hand
            float yaw = (player.getYRot() + (offhand ? -35f : 35f)) * Mth.DEG_TO_RAD;
            Vec3 at = player.getEyePosition().add(-Mth.sin(yaw) * 0.55, -0.45, Mth.cos(yaw) * 0.55);
            level.addParticle(WWParticles.HEX_RUNE, at.x + (r.nextDouble() - 0.5) * 0.2, at.y, at.z + (r.nextDouble() - 0.5) * 0.2,
                    (r.nextDouble() - 0.5) * 0.02, 0.02 + r.nextDouble() * 0.02, (r.nextDouble() - 0.5) * 0.02);
        }
        if (player.tickCount % 20 == 0 && r.nextInt(look == HexComponents.HIDDEN ? 6 : 10) == 0) {
            level.playLocalSound(player.getX(), player.getEyeY(), player.getZ(), WWSounds.HEXED_BOOK_WHISPER, SoundSource.PLAYERS,
                    0.12f + r.nextFloat() * 0.1f, look == HexComponents.SIN ? 0.7f : 0.9f + r.nextFloat() * 0.2f, false);
        }
    }
}
