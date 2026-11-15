package dev.lowpix.winterworks.client;

import dev.lowpix.winterworks.launcher.SnowballLauncherItem;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.Vec3;

/** A hot launcher smokes from its barrels, and an overheated one vents steam: the heat gauge you can see in the world. */
public final class LauncherEffects {
    private LauncherEffects() {}

    public static void init() {
        ClientTickEvents.END_CLIENT_TICK.register(mc -> {
            if (mc.player == null || mc.level == null || mc.isPaused()) {
                return;
            }
            ItemStack s = mc.player.getMainHandItem().getItem() instanceof SnowballLauncherItem ? mc.player.getMainHandItem()
                    : mc.player.getOffhandItem().getItem() instanceof SnowballLauncherItem ? mc.player.getOffhandItem() : ItemStack.EMPTY;
            if (s.isEmpty()) {
                return;
            }
            int heat = SnowballLauncherItem.heat(s);
            boolean over = SnowballLauncherItem.overheated(s);
            if (heat < 50 && !over) {
                return;
            }
            int every = over ? 2 : heat > 80 ? 3 : 6;
            if (mc.player.tickCount % every == 0) {
                Vec3 m = SnowballLauncherItem.muzzle(mc.player);
                mc.level.addParticle(over ? ParticleTypes.CLOUD : ParticleTypes.SMOKE, m.x, m.y + 0.05, m.z,
                        (mc.level.random.nextDouble() - 0.5) * 0.02, 0.04 + mc.level.random.nextDouble() * 0.03,
                        (mc.level.random.nextDouble() - 0.5) * 0.02);
            }
        });
    }
}
