package dev.lowpix.winterworks.client.endgear;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.lowpix.LowpixGeometry;
import java.util.function.Supplier;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeDeformation;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;

/**
 * The gear's model layers, from the lowpix exports ({@code assets/winterworks/lowpix/<name>.geo.json}). While a
 * Dragonling export is missing its layer is a box stand-in with the contract's bone names (drawn with a vanilla
 * texture), so everything runs before the art lands.
 */
public final class GearLayers {
    public static final ModelLayerLocation OBSIDIAN_SHIELD = layer("obsidian_shield");
    public static final ModelLayerLocation END_GLIDER = layer("end_glider");
    public static final ModelLayerLocation MONOLITH_WAND = layer("monolith_wand");
    public static final ModelLayerLocation DRAGONLING_BABY = layer("dragonling_baby");
    public static final ModelLayerLocation DRAGONLING_TEEN = layer("dragonling_teen");

    private GearLayers() {}

    private static ModelLayerLocation layer(String name) {
        return new ModelLayerLocation(Winterworks.id(name), "main");
    }

    public static boolean exported(String name) {
        return GearLayers.class.getResource("/assets/" + Winterworks.MOD_ID + "/lowpix/" + name + ".geo.json") != null;
    }

    static void init() {
        reg(OBSIDIAN_SHIELD, "obsidian_shield", GearLayers::empty);
        reg(END_GLIDER, "end_glider", GearLayers::empty);
        reg(MONOLITH_WAND, "monolith_wand", GearLayers::empty);
        reg(DRAGONLING_BABY, "dragonling_baby", () -> dragonlingStandIn(1f, false));
        reg(DRAGONLING_TEEN, "dragonling_teen", () -> dragonlingStandIn(2.4f, true));
    }

    private static void reg(ModelLayerLocation layer, String name, Supplier<LayerDefinition> standIn) {
        EntityModelLayerRegistry.registerModelLayer(layer, () -> {
            if (exported(name)) {
                try {
                    return LowpixGeometry.layer(Winterworks.MOD_ID, name);
                } catch (RuntimeException e) {
                    Winterworks.LOG.error("model {} is broken: {}", name, e.getMessage());
                }
            }
            return standIn.get();
        });
    }

    // ------------------------------------------------------------------------------------------------ stand-ins

    /** A missing item model draws nothing (it is in the mod; this only guards against a broken export). */
    private static LayerDefinition empty() {
        return LayerDefinition.create(new MeshDefinition(), 16, 16);
    }
    // Minecraft model space: pixels, Y down, ground at 24, front -Z. Textures are vanilla 16x16 block textures.

    private static PartDefinition box(PartDefinition parent, String name, float x, float y, float z, float w, float h, float d,
                                      PartPose pose) {
        return parent.addOrReplaceChild(name, CubeListBuilder.create().texOffs(0, 0).addBox(x, y, z, w, h, d, CubeDeformation.NONE), pose);
    }

    /** A small four-legged dragon (body, neck, head, jaw, wings, tail, legs; the teen also a saddle). */
    private static LayerDefinition dragonlingStandIn(float s, boolean teen) {
        MeshDefinition mesh = new MeshDefinition();
        float ground = 24f;
        PartDefinition body = box(mesh.getRoot(), "body", -3f * s, -2.5f * s, -4f * s, 6f * s, 5f * s, 8f * s,
                PartPose.offset(0, ground - 5f * s, 0));
        PartDefinition neck = box(body, "neck", -1.25f * s, -1.25f * s, -3f * s, 2.5f * s, 2.5f * s, 3f * s,
                PartPose.offsetAndRotation(0, -1.5f * s, -4f * s, 0.5f, 0, 0));
        PartDefinition head = box(neck, "head", -2f * s, -2f * s, -4.5f * s, 4f * s, 3.5f * s, 4.5f * s, PartPose.offsetAndRotation(0, 0, -2.5f * s, -0.5f, 0, 0));
        box(head, "jaw", -1.5f * s, 1f * s, -4.5f * s, 3f * s, 1f * s, 4f * s, PartPose.ZERO);
        PartDefinition wl = box(body, "wing_l", 0f, -0.25f, -2f * s, 6f * s, 0.5f, 5f * s, PartPose.offsetAndRotation(3f * s, -2f * s, -1f * s, 0, 0, -0.35f));
        PartDefinition wr = box(body, "wing_r", -6f * s, -0.25f, -2f * s, 6f * s, 0.5f, 5f * s, PartPose.offsetAndRotation(-3f * s, -2f * s, -1f * s, 0, 0, 0.35f));
        box(wl, "wing_l_tip", 0f, -0.25f, -1.5f * s, 5f * s, 0.5f, 4f * s, PartPose.offsetAndRotation(6f * s, 0, 0, 0, 0, 0.4f));
        box(wr, "wing_r_tip", -5f * s, -0.25f, -1.5f * s, 5f * s, 0.5f, 4f * s, PartPose.offsetAndRotation(-6f * s, 0, 0, 0, 0, -0.4f));
        PartDefinition t = body;
        for (int i = 0; i < 4; i++) {
            float w = (2.2f - i * 0.4f) * s;
            t = box(t, "tail_" + i, -w / 2, -w / 2, 0f, w, w, 3f * s, PartPose.offsetAndRotation(0, i == 0 ? -0.5f * s : 0, i == 0 ? 4f * s : 3f * s, -0.12f, 0, 0));
        }
        String[] legs = {"leg_fl", "leg_fr", "leg_bl", "leg_br"};
        float[][] at = {{2f, -2.5f}, {-2f, -2.5f}, {2f, 2.5f}, {-2f, 2.5f}};
        for (int i = 0; i < 4; i++) {
            box(body, legs[i], -0.9f * s, 0f, -0.9f * s, 1.8f * s, 3f * s, 1.8f * s, PartPose.offset(at[i][0] * s, 2f * s, at[i][1] * s));
        }
        if (teen) {
            box(body, "saddle", -2.5f * s, -3.1f * s, -2f * s, 5f * s, 0.8f * s, 4f * s, PartPose.ZERO);
        }
        return LayerDefinition.create(mesh, 16, 16);
    }
}
