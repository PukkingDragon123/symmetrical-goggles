package dev.lowpix.winterworks.client.end;

import dev.lowpix.winterworks.registry.EndBlocks;
import dev.lowpix.winterworks.registry.EndParticles;
import net.fabricmc.fabric.api.blockrenderlayer.v1.BlockRenderLayerMap;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.particle.v1.ParticleFactoryRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Client side of the Living End's world: the end_spore, end_dust and meteor_spark particles, cut-out plants, and
 * sparks spitting off meteorites near the player. The dev screenshot harness is EndShots.
 */
public final class EndWorldClient {
    private EndWorldClient() {}

    public static void init() {
        ParticleFactoryRegistry particles = ParticleFactoryRegistry.getInstance();
        particles.register(EndParticles.END_SPORE, s -> new EndParticle.Provider(s, EndParticle.Kind.SPORE));
        particles.register(EndParticles.END_DUST, s -> new EndParticle.Provider(s, EndParticle.Kind.DUST));
        particles.register(EndParticles.METEOR_SPARK, s -> new EndParticle.Provider(s, EndParticle.Kind.SPARK));
        BlockRenderLayerMap.INSTANCE.putBlocks(RenderType.cutout(), EndBlocks.END_GRASS, EndBlocks.TALL_END_GRASS,
                EndBlocks.DRY_END_BUSH, EndBlocks.CHORUS_ROOTS);
        ClientTickEvents.END_WORLD_TICK.register(EndWorldClient::sparks);
        EndShots.init();
    }

    /** Like a block's animateTick: a few random spots round the player; meteorites there spit a spark now and then. */
    private static void sparks(ClientLevel level) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.isPaused()) {
            return;
        }
        RandomSource r = level.random;
        BlockPos c = mc.player.blockPosition();
        BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos();
        for (int i = 0; i < 160; i++) {
            p.set(c.getX() + r.nextInt(25) - 12, c.getY() + r.nextInt(25) - 12, c.getZ() + r.nextInt(25) - 12);
            BlockState s = level.getBlockState(p);
            boolean core = s.is(EndBlocks.METEORITE_CORE);
            if (!(core || s.is(EndBlocks.METEORITE)) || r.nextInt(core ? 2 : 5) != 0) {
                continue;
            }
            Direction d = Direction.getRandom(r);
            BlockPos out = p.relative(d);
            if (!level.getBlockState(out).isAir()) {
                continue;
            }
            double x = p.getX() + 0.5 + d.getStepX() * 0.55 + (d.getStepX() == 0 ? r.nextFloat() - 0.5 : 0);
            double y = p.getY() + 0.5 + d.getStepY() * 0.55 + (d.getStepY() == 0 ? r.nextFloat() - 0.5 : 0);
            double z = p.getZ() + 0.5 + d.getStepZ() * 0.55 + (d.getStepZ() == 0 ? r.nextFloat() - 0.5 : 0);
            level.addParticle(EndParticles.METEOR_SPARK, x, y, z, d.getStepX() * 0.06 + (r.nextFloat() - 0.5) * 0.05,
                    0.06 + r.nextFloat() * 0.08 + d.getStepY() * 0.04, d.getStepZ() * 0.06 + (r.nextFloat() - 0.5) * 0.05);
        }
    }
}
