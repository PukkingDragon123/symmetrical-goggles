package dev.lowpix.winterworks.client.ocean;

import dev.lowpix.winterworks.Winterworks;
import java.util.function.Supplier;
import net.fabricmc.fabric.api.client.model.loading.v1.ModelLoadingPlugin;
import net.fabricmc.fabric.api.renderer.v1.Renderer;
import net.fabricmc.fabric.api.renderer.v1.RendererAccess;
import net.fabricmc.fabric.api.renderer.v1.material.BlendMode;
import net.fabricmc.fabric.api.renderer.v1.material.RenderMaterial;
import net.fabricmc.fabric.api.renderer.v1.mesh.QuadEmitter;
import net.fabricmc.fabric.api.renderer.v1.model.ForwardingBakedModel;
import net.fabricmc.fabric.api.renderer.v1.render.RenderContext;
import net.fabricmc.fabric.api.util.TriState;
import net.minecraft.client.renderer.block.model.BakedQuad;
import net.minecraft.client.resources.model.BakedModel;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.BlockAndTintGetter;
import net.minecraft.world.level.block.state.BlockState;

/**
 * The hydrothermal vent's glowing mouth (docs/OCEAN_UPDATE.md section 11, {@code block/hydrothermal_vent_glow}): the
 * vent's model with the glow drawn on top at full brightness through the Fabric Renderer API, turned like each of the
 * blockstate's variants. Without a renderer that supports it the vent just draws without the glow.
 */
final class VentGlowModel extends ForwardingBakedModel {
    static final ResourceLocation MODEL = Winterworks.id("block/hydrothermal_vent");
    static final ResourceLocation GLOW = Winterworks.id("block/hydrothermal_vent_glow");
    private final BakedModel glow;
    private final RenderMaterial emissive;

    private VentGlowModel(BakedModel base, BakedModel glow, RenderMaterial emissive) {
        this.wrapped = base;
        this.glow = glow;
        this.emissive = emissive;
    }

    static void register() {
        ModelLoadingPlugin.register(ctx -> {
            ctx.addModels(GLOW);
            ctx.modifyModelAfterBake().register((model, c) -> {
                if (model == null || !MODEL.equals(c.resourceId())) {
                    return model;
                }
                Renderer renderer = RendererAccess.INSTANCE.getRenderer();
                BakedModel glow = c.baker().bake(GLOW, c.settings());
                if (renderer == null || glow == null) {
                    return model;
                }
                RenderMaterial mat = renderer.materialFinder().blendMode(BlendMode.CUTOUT).emissive(true).disableDiffuse(true)
                        .ambientOcclusion(TriState.FALSE).find();
                return new VentGlowModel(model, glow, mat);
            });
        });
    }

    @Override
    public boolean isVanillaAdapter() {
        return false;
    }

    @Override
    public void emitBlockQuads(BlockAndTintGetter view, BlockState state, BlockPos pos, Supplier<RandomSource> random, RenderContext ctx) {
        super.emitBlockQuads(view, state, pos, random, ctx);
        QuadEmitter out = ctx.getEmitter();
        for (Direction d : Direction.values()) {
            for (BakedQuad q : glow.getQuads(state, d, random.get())) {
                out.fromVanilla(q, emissive, d).emit();
            }
        }
        for (BakedQuad q : glow.getQuads(state, null, random.get())) {
            out.fromVanilla(q, emissive, null).emit();
        }
    }
}
