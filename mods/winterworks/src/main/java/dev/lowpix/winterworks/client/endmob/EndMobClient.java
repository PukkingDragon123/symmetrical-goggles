package dev.lowpix.winterworks.client.endmob;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.endmob.EndGlowEffect;
import dev.lowpix.winterworks.mixin.endmob.EffectParticlesAccessor;
import dev.lowpix.winterworks.registry.EndBlocks;
import dev.lowpix.winterworks.registry.EndEntities;
import dev.lowpix.winterworks.registry.EndItems;
import dev.lowpix.winterworks.registry.EndParticles;
import net.fabricmc.fabric.api.blockrenderlayer.v1.BlockRenderLayerMap;
import net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback;
import net.fabricmc.fabric.api.client.particle.v1.ParticleFactoryRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.ChatFormatting;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.LivingEntity;

/**
 * Client side of the Living End's creatures (docs/END_UPDATE.md sections 2, 4, 6-9): the Enderfly, Endling, Gucker and
 * Obolisk renderers (lowpix exports when the mod has them, else {@link StandIns}), the spit, the three particles, the End
 * Bloom's glow overlay and cutout layers, End Glow's full-bright rendering (mixin.endmob.EndGlowLightMixin) and the End
 * Bulb's tooltip. Dev screenshots: {@link EndMobShots}.
 */
public final class EndMobClient {
    public static final ModelLayerLocation ENDERFLY = layer("enderfly");
    public static final ModelLayerLocation ENDLING = layer("endling");
    public static final ModelLayerLocation GUCKER = layer("gucker");
    public static final ModelLayerLocation OBOLISK = layer("obolisk");

    private EndMobClient() {}

    public static void init() {
        for (String name : new String[]{"enderfly", "endling", "gucker", "obolisk"}) {
            EntityModelLayerRegistry.registerModelLayer(layer(name), () -> EndMobModel.layer(name));
            if (!EndMobModel.isExported(name)) {
                Winterworks.LOG.info("lowpix model {} isn't in the mod yet: drawing its stand-in", name);
            }
        }
        EntityRendererRegistry.register(EndEntities.ENDERFLY, EnderflyRenderer::new);
        EntityRendererRegistry.register(EndEntities.ENDLING, EndlingRenderer::new);
        EntityRendererRegistry.register(EndEntities.GUCKER, GuckerRenderer::new);
        EntityRendererRegistry.register(EndEntities.OBOLISK, OboliskRenderer::new);
        EntityRendererRegistry.register(EndEntities.GUCKER_SPIT, GuckerSpitRenderer::new);

        ParticleFactoryRegistry pf = ParticleFactoryRegistry.getInstance();
        pf.register(EndParticles.BLINDING_DUST, s -> new EndMobParticles.Provider(s, EndMobParticles.Kind.BLINDING_DUST));
        pf.register(EndParticles.GUCKER_BREATH, s -> new EndMobParticles.Provider(s, EndMobParticles.Kind.GUCKER_BREATH));
        pf.register(EndParticles.ENDERFLY_SCALE, s -> new EndMobParticles.Provider(s, EndMobParticles.Kind.ENDERFLY_SCALE));

        BlockRenderLayerMap.INSTANCE.putBlocks(RenderType.cutout(), EndBlocks.END_BLOOM, EndBlocks.CHORUS_COCOON);
        BloomGlowModel.register();

        // the End Bulb only ever admits to the glow
        ItemTooltipCallback.EVENT.register((stack, ctx, type, lines) -> {
            if (stack.is(EndItems.END_BULB)) {
                lines.add(Component.translatable("item.winterworks.end_bulb.tip").withStyle(ChatFormatting.LIGHT_PURPLE));
            }
        });
        EndMobShots.init();
    }

    private static ModelLayerLocation layer(String name) {
        return new ModelLayerLocation(Winterworks.id(name), "main");
    }

    /** End Glow, as this client can see it: its own effects (the local player), or the glow's motes synced for others. */
    public static boolean glows(LivingEntity e) {
        return EndGlowEffect.glows(e, e.getEntityData().get(EffectParticlesAccessor.winterworks$effectParticles()));
    }
}
