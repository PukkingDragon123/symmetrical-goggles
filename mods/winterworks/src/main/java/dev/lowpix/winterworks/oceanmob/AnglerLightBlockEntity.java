package dev.lowpix.winterworks.oceanmob;

import dev.lowpix.winterworks.registry.OceanBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;

/**
 * The Angler Light's block entity: every 2 s, players within {@link #RANGE} blocks get Night Vision for 30 s (ambient,
 * like a beacon's). It only works while a player is near: the tick returns at once otherwise.
 */
public class AnglerLightBlockEntity extends BlockEntity {
    public static final double RANGE = 8.0;
    public static final int PERIOD = 40, DURATION = 600;

    public AnglerLightBlockEntity(BlockPos pos, BlockState state) {
        super(OceanBlocks.ANGLER_LIGHT_BE, pos, state);
    }

    public static void serverTick(Level level, BlockPos pos, BlockState state, AnglerLightBlockEntity be) {
        if ((level.getGameTime() + pos.hashCode()) % PERIOD != 0) {
            return;
        }
        double cx = pos.getX() + 0.5, cy = pos.getY() + 0.5, cz = pos.getZ() + 0.5;
        if (!level.hasNearbyAlivePlayer(cx, cy, cz, RANGE)) {
            return;
        }
        for (Player p : level.getEntitiesOfClass(Player.class, new AABB(pos).inflate(RANGE),
                p -> p.isAlive() && !p.isSpectator() && p.distanceToSqr(cx, cy, cz) <= RANGE * RANGE)) {
            p.addEffect(new MobEffectInstance(MobEffects.NIGHT_VISION, DURATION, 0, true, true));
        }
    }
}
