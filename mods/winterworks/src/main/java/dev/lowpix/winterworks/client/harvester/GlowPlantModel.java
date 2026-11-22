package dev.lowpix.winterworks.client.harvester;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
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
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.block.model.BakedQuad;
import net.minecraft.client.renderer.texture.MissingTextureAtlasSprite;
import net.minecraft.client.renderer.texture.TextureAtlas;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.client.resources.model.BakedModel;
import net.minecraft.client.resources.model.ModelResourceLocation;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.BlockAndTintGetter;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Torchflowers and pitcher plants glow (docs/FIXES_0_4.md): their block models (planted, potted, every crop stage) are
 * wrapped so that after vanilla's quads the same quads are drawn again, re-textured with the runtime glow masks
 * (client.harvester.GlowMaskSource: only the luminous pixels of the game's own textures) and full-bright, through the
 * Fabric Renderer API (like the End Bloom's BloomGlowModel). Without a renderer that supports it they draw as vanilla.
 */
final class GlowPlantModel extends ForwardingBakedModel {
    /** The block ids whose models get the glow. */
    private static final Set<ResourceLocation> PLANTS = Set.of(ResourceLocation.withDefaultNamespace("torchflower"),
            ResourceLocation.withDefaultNamespace("potted_torchflower"), ResourceLocation.withDefaultNamespace("torchflower_crop"),
            ResourceLocation.withDefaultNamespace("pitcher_crop"), ResourceLocation.withDefaultNamespace("pitcher_plant"));
    private static final Direction[] FACES = {Direction.DOWN, Direction.UP, Direction.NORTH, Direction.SOUTH, Direction.WEST,
            Direction.EAST, null};
    private final RenderMaterial emissive;
    /** Source sprite name -> its glow mask (null value: no mask), resolved on first use; models are rebuilt on reload. */
    private final Map<ResourceLocation, java.util.Optional<TextureAtlasSprite>> glows = new ConcurrentHashMap<>();

    private GlowPlantModel(BakedModel base, RenderMaterial emissive) {
        this.wrapped = base;
        this.emissive = emissive;
    }

    static void register() {
        ModelLoadingPlugin.register(ctx -> ctx.modifyModelAfterBake().register((model, c) -> {
            ModelResourceLocation top = c.topLevelId();
            if (model == null || top == null || "inventory".equals(top.variant()) || !PLANTS.contains(top.id())) {
                return model;
            }
            Renderer renderer = RendererAccess.INSTANCE.getRenderer();
            if (renderer == null) {
                return model;
            }
            RenderMaterial mat = renderer.materialFinder().blendMode(BlendMode.CUTOUT).emissive(true).disableDiffuse(true)
                    .ambientOcclusion(TriState.FALSE).find();
            return new GlowPlantModel(model, mat);
        }));
    }

    @Override
    public boolean isVanillaAdapter() {
        return false;
    }

    private TextureAtlasSprite glowFor(TextureAtlasSprite sprite) {
        return glows.computeIfAbsent(sprite.contents().name(), name -> {
            TextureAtlas atlas = Minecraft.getInstance().getModelManager().getAtlas(TextureAtlas.LOCATION_BLOCKS);
            TextureAtlasSprite g = atlas.getSprite(GlowMaskSource.glowId(name));
            return g.contents().name().equals(MissingTextureAtlasSprite.getLocation()) ? java.util.Optional.empty()
                    : java.util.Optional.of(g);
        }).orElse(null);
    }

    @Override
    public void emitBlockQuads(BlockAndTintGetter view, BlockState state, BlockPos pos, Supplier<RandomSource> random, RenderContext ctx) {
        super.emitBlockQuads(view, state, pos, random, ctx);
        QuadEmitter out = ctx.getEmitter();
        for (Direction d : FACES) {
            for (BakedQuad q : wrapped.getQuads(state, d, random.get())) {
                TextureAtlasSprite src = q.getSprite();
                TextureAtlasSprite glow = glowFor(src);
                if (glow == null) {
                    continue;
                }
                out.fromVanilla(q, emissive, d);
                float du = src.getU1() - src.getU0(), dv = src.getV1() - src.getV0();
                for (int i = 0; i < 4; i++) {   // the same spot of the glow mask (same size as its texture)
                    float u = (out.u(i) - src.getU0()) / du, v = (out.v(i) - src.getV0()) / dv;
                    out.uv(i, glow.getU0() + u * (glow.getU1() - glow.getU0()), glow.getV0() + v * (glow.getV1() - glow.getV0()));
                }
                out.color(-1, -1, -1, -1);
                out.emit();
            }
        }
    }
}
