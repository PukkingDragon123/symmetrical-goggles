package dev.lowpix.winterworks.client.cold;

import dev.lowpix.winterworks.client.particle.ColdParticle;
import dev.lowpix.winterworks.client.particle.ColdParticle.Kind;
import dev.lowpix.winterworks.registry.WWParticles;
import dev.lowpix.winterworks.world.WWWorldgen;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.particle.v1.ParticleFactoryRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.phys.Vec3;

/** Client side of the cold: the Cold Zone particles, breath vapour in the cold, wind-driven snow in blizzards. */
public final class ColdClient {
    private ColdClient() {}

    public static void init() {
        particle(WWParticles.FROST_BREATH, Kind.FROST_BREATH);
        particle(WWParticles.ICE_SHARD, Kind.ICE_SHARD);
        particle(WWParticles.FROST_BURST, Kind.FROST_BURST);
        particle(WWParticles.ROAR_WAVE, Kind.ROAR_WAVE);
        particle(WWParticles.FROST_SLASH, Kind.FROST_SLASH);
        particle(WWParticles.ICE_CRIT, Kind.ICE_CRIT);
        particle(WWParticles.FUR_TUFT, Kind.FUR_TUFT);
        particle(WWParticles.BLIZZARD_FLAKE, Kind.BLIZZARD_FLAKE);
        particle(WWParticles.SNOW_PUFF, Kind.SNOW_PUFF);
        particle(WWParticles.COLD_MIST, Kind.COLD_MIST);
        particle(WWParticles.BLOOD_DRIP, Kind.BLOOD_DRIP);
        particle(WWParticles.AMBER_GLINT, Kind.AMBER_GLINT);
        particle(WWParticles.CAVE_DUST, Kind.CAVE_DUST);
        ClientTickEvents.END_CLIENT_TICK.register(ColdClient::tick);
    }

    private static void particle(SimpleParticleType type, Kind kind) {
        ParticleFactoryRegistry.getInstance().register(type, sprites -> new ColdParticle.Provider(sprites, kind));
    }

    /** Is it cold enough here to see your breath? */
    public static boolean breathVisible(ClientLevel level, BlockPos pos) {
        Holder<Biome> b = level.getBiome(pos);
        return b.is(WWWorldgen.ICE_CAVES) || b.value().coldEnoughToSnow(pos);
    }

    private static void tick(Minecraft mc) {
        ClientLevel level = mc.level;
        if (level == null || mc.isPaused() || mc.player == null) {
            return;
        }
        RandomSource r = level.random;
        long t = level.getGameTime();
        // breath vapour: every player in the cold puffs now and then
        for (Player p : level.players()) {
            if (p.isInvisible() || p.isUnderWater() || (t + p.getId() * 13L) % 45 != 0) {
                continue;
            }
            BlockPos eyes = BlockPos.containing(p.getEyePosition());
            if (!breathVisible(level, eyes)) {
                continue;
            }
            Vec3 look = p.getViewVector(1f);
            Vec3 mouth = p.getEyePosition().add(look.scale(0.35)).add(0, -0.12, 0);
            for (int i = 0; i < 3; i++) {
                level.addParticle(WWParticles.FROST_BREATH, mouth.x, mouth.y, mouth.z,
                        look.x * 0.04 + (r.nextFloat() - 0.5f) * 0.01, 0.006 + r.nextFloat() * 0.006,
                        look.z * 0.04 + (r.nextFloat() - 0.5f) * 0.01);
            }
        }
        // blizzards: thundering snow drives flakes sideways around you
        Player me = mc.player;
        BlockPos at = me.blockPosition();
        if (level.isThundering() && level.getBiome(at).value().getPrecipitationAt(at) == Biome.Precipitation.SNOW
                && level.canSeeSky(BlockPos.containing(me.getEyePosition()))) {
            for (int i = 0; i < 6; i++) {
                double x = me.getX() + (r.nextDouble() - 0.5) * 16, y = me.getY() + r.nextDouble() * 6 - 1;
                double z = me.getZ() + (r.nextDouble() - 0.5) * 16;
                level.addParticle(WWParticles.BLIZZARD_FLAKE, x, y, z, 0.35 + r.nextDouble() * 0.15, -0.06, 0.12);
            }
        }
    }
}
