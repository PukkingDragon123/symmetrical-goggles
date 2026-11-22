package dev.lowpix.winterworks.client.nether;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.lowpix.LowpixGeometry;
import dev.lowpix.winterworks.nether.PiglinGreed;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWParticles;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.particle.v1.ParticleFactoryRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.LivingEntityFeatureRendererRegistrationCallback;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.entity.PiglinRenderer;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.monster.piglin.AbstractPiglin;

/**
 * Client side of the nether feature (docs/HEXES_UPDATE.md sections 1, 6 and 7): the Piglin Witch and Golden Piglin
 * renderers (lowpix models `piglin_witch` and `golden_piglin`), the golden shimmer on piglins that drank Cursed Elixir
 * (a layer on the vanilla piglin renderer) with their gold glints, and the gold glint particle.
 */
public final class NetherClient {
    public static final ModelLayerLocation PIGLIN_WITCH = layer("piglin_witch");
    public static final ModelLayerLocation GOLDEN_PIGLIN = layer("golden_piglin");
    // ---- 0.4 fixes: Nether (docs/FIXES_0_4.md "Piglins, hoglins and the Withered Commander")
    public static final ModelLayerLocation WITHERED_COMMANDER = layer("withered_commander");
    public static final ModelLayerLocation NETHERITE_SPEAR = layer("netherite_spear");

    private NetherClient() {}

    public static void init() {
        reg(PIGLIN_WITCH, "piglin_witch");
        reg(GOLDEN_PIGLIN, "golden_piglin");
        EntityRendererRegistry.register(WWEntities.PIGLIN_WITCH, PiglinWitchRenderer::new);
        EntityRendererRegistry.register(WWEntities.GOLDEN_PIGLIN, GoldenPiglinRenderer::new);
        ParticleFactoryRegistry.getInstance().register(WWParticles.GOLD_GLINT, GoldGlintParticle.Provider::new);
        LivingEntityFeatureRendererRegistrationCallback.EVENT.register((type, renderer, helper, ctx) -> {
            if (renderer instanceof PiglinRenderer piglins) {
                helper.register(new GoldenShimmerLayer(piglins));
            }
        });
        ClientTickEvents.END_CLIENT_TICK.register(NetherClient::glints);
        // ---- 0.4 fixes: Nether: the Withered Commander, its spear, the witch's hex bolts; the dev screenshots
        reg(WITHERED_COMMANDER, "withered_commander");
        reg(NETHERITE_SPEAR, "netherite_spear");
        EntityRendererRegistry.register(WWEntities.WITHERED_COMMANDER, WitheredCommanderRenderer::new);
        EntityRendererRegistry.register(WWEntities.HEX_BOLT, net.minecraft.client.renderer.entity.NoopRenderer::new);
        net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry.INSTANCE.register(
                dev.lowpix.winterworks.registry.WWItems.NETHERITE_SPEAR, new NetheriteSpearRenderer());
        NetherShots.init();
    }

    private static ModelLayerLocation layer(String name) {
        return new ModelLayerLocation(Winterworks.id(name), "main");
    }

    /** Same fallback as client.WWLayers: a missing lowpix export draws nothing instead of crashing. */
    private static void reg(ModelLayerLocation layer, String name) {
        EntityModelLayerRegistry.registerModelLayer(layer, () -> {
            try {
                return LowpixGeometry.layer(Winterworks.MOD_ID, name);
            } catch (RuntimeException e) {
                Winterworks.LOG.error("model {} is missing: {}", name, e.getMessage());
                return LayerDefinition.create(new MeshDefinition(), 16, 16);
            }
        });
    }

    /** Golden piglins (those that drank Cursed Elixir) twinkle with gold now and then. */
    private static void glints(Minecraft mc) {
        ClientLevel level = mc.level;
        if (level == null || mc.isPaused() || mc.player == null || level.getGameTime() % 4 != 0) {
            return;
        }
        RandomSource r = level.random;
        for (Entity e : level.entitiesForRendering()) {
            if (e instanceof AbstractPiglin p && !p.isInvisible() && PiglinGreed.isGolden(p) && p.distanceToSqr(mc.player) < 48 * 48
                    && r.nextInt(3) == 0) {
                level.addParticle(WWParticles.GOLD_GLINT, p.getRandomX(0.7), p.getRandomY(), p.getRandomZ(0.7), 0, 0.01, 0);
            }
        }
    }
}
