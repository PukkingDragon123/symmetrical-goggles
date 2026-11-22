package dev.lowpix.winterworks.client.dagger;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.lowpix.LowpixGeometry;
import dev.lowpix.winterworks.client.render.WWModel;
import dev.lowpix.winterworks.registry.WWArmor;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import net.fabricmc.fabric.api.client.rendering.v1.ArmorRenderer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.ItemRenderer;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ArmorItem;
import net.minecraft.world.item.ItemStack;

/**
 * Polar Bear Fur armour in 3D (docs/COLD_UPDATE.md section 2): the lowpix model {@code fur_armor}, its bones posed
 * like the wearer's {@link HumanoidModel} parts (so it works on players, armour stands, zombies, skeletons...):
 * hood = {@code head}; coat = {@code body} + {@code right_arm} + {@code left_arm} (plus any loose root parts, which
 * follow the body); leggings = {@code right_leg} + {@code left_leg}; boots = {@code right_boot} + {@code left_boot}
 * (they follow the legs). Bones may be nested in the export: each is drawn on its own with the wearer's pose, nested
 * bones of other pieces hidden. Babies get the vanilla baby head and body scaling. Enchanted pieces glint.
 */
public class FurArmorRenderer implements ArmorRenderer {
    private static final List<String> BONES = List.of("head", "body", "right_arm", "left_arm", "right_leg", "left_leg",
            "right_boot", "left_boot");

    private WWModel<Entity> model;
    private final List<ModelPart> bones = new ArrayList<>();
    private final List<ModelPart> loose = new ArrayList<>();

    public static boolean isFur(ItemStack s) {
        return s.getItem() instanceof ArmorItem a && a.getMaterial().is(WWArmor.FUR);
    }

    private WWModel<Entity> model() {
        if (model == null) {
            model = new WWModel<>(Minecraft.getInstance().getEntityModels().bakeLayer(DaggerClient.FUR_ARMOR), "fur_armor");
            for (String b : BONES) {
                model.get(b).ifPresent(bones::add);
            }
            try {
                for (JsonElement e : LowpixGeometry.read(Winterworks.MOD_ID, "fur_armor").getAsJsonArray("parts")) {
                    JsonObject p = e.getAsJsonObject();
                    String name = p.get("name").getAsString();
                    if (p.get("parent").isJsonNull() && !BONES.contains(name)) {
                        model.get(name).ifPresent(loose::add);
                    }
                }
            } catch (RuntimeException e) {   // no export yet: nothing to draw
                loose.clear();
            }
        }
        return model;
    }

    @Override
    public void render(PoseStack pose, MultiBufferSource buffers, ItemStack stack, LivingEntity entity, EquipmentSlot slot, int light,
                       HumanoidModel<LivingEntity> wearer) {
        WWModel<Entity> m = model();
        if (bones.isEmpty() && loose.isEmpty()) {
            return;
        }
        VertexConsumer vc = ItemRenderer.getArmorFoilBuffer(buffers, RenderType.armorCutoutNoCull(m.texture), stack.hasFoil());
        m.reset();
        boolean baby = wearer.young;
        switch (slot) {
            case HEAD -> bone(m, "head", wearer.head, true, baby, pose, vc, light);
            case CHEST -> {
                bone(m, "body", wearer.body, false, baby, pose, vc, light);
                bone(m, "right_arm", wearer.rightArm, false, baby, pose, vc, light);
                bone(m, "left_arm", wearer.leftArm, false, baby, pose, vc, light);
                for (ModelPart p : loose) {   // the body pivot is the model origin: pose like the body, then the part's own offset
                    pose.pushPose();
                    babyScale(pose, baby, false);
                    wearer.body.translateAndRotate(pose);
                    p.render(pose, vc, light, OverlayTexture.NO_OVERLAY, 0xFFFFFFFF);
                    pose.popPose();
                }
            }
            case LEGS -> {
                bone(m, "right_leg", wearer.rightLeg, false, baby, pose, vc, light);
                bone(m, "left_leg", wearer.leftLeg, false, baby, pose, vc, light);
            }
            case FEET -> {
                bone(m, "right_boot", wearer.rightLeg, false, baby, pose, vc, light);
                bone(m, "left_boot", wearer.leftLeg, false, baby, pose, vc, light);
            }
            default -> {
            }
        }
        m.reset();
    }

    /** Draws one bone with the pose of the wearer's matching part; other bones nested in it are left to their pieces. */
    private void bone(WWModel<Entity> m, String name, ModelPart like, boolean head, boolean baby, PoseStack pose, VertexConsumer vc,
                      int light) {
        Optional<ModelPart> found = m.get(name);
        if (found.isEmpty()) {
            return;
        }
        ModelPart part = found.get();
        List<ModelPart> hidden = new ArrayList<>();
        for (ModelPart other : bones) {
            if (other != part && other.visible) {
                other.visible = false;
                hidden.add(other);
            }
        }
        part.copyFrom(like);
        part.visible = true;
        pose.pushPose();
        babyScale(pose, baby, head);
        part.render(pose, vc, light, OverlayTexture.NO_OVERLAY, 0xFFFFFFFF);
        pose.popPose();
        hidden.forEach(p -> p.visible = true);
        part.resetPose();
    }

    /** AgeableListModel's baby layout for HumanoidModel: the head at 3/4 size, the body at half size. */
    private static void babyScale(PoseStack pose, boolean baby, boolean head) {
        if (!baby) {
            return;
        }
        if (head) {
            pose.scale(0.75f, 0.75f, 0.75f);
            pose.translate(0f, 1.0f, 0f);
        } else {
            pose.scale(0.5f, 0.5f, 0.5f);
            pose.translate(0f, 1.5f, 0f);
        }
    }
}
