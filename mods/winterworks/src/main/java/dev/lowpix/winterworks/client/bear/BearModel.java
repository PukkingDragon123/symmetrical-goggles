package dev.lowpix.winterworks.client.bear;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.bear.BearLike;
import dev.lowpix.winterworks.bear.BearState;
import dev.lowpix.winterworks.client.lowpix.LowpixGeometry;
import dev.lowpix.winterworks.client.render.WWModel;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Mob;

/**
 * The lowpix `polar_bear` / `polar_bear_cub` model (docs/COLD_UPDATE.md section 3), for remade polar bears and zombie
 * polar bears: fur_* parts hidden when shorn, zombie_* parts only on zombie bears, loops by state (idle, walk, run, swim,
 * sit) and one-shot clips from entity events (leap, swipe, roar, eat, shake). Missing clips or parts are no-ops.
 */
public class BearModel<T extends Mob> extends WWModel<T> {
    /** limbSwing time scale and weight scale for the walk and run loops; run takes over above RUN_FROM limb speed. */
    private static final float WALK_SPEED = 2.5f, WALK_WEIGHT = 2.5f, RUN_SPEED = 1.3f, RUN_WEIGHT = 1.6f, RUN_FROM = 0.42f, RUN_FULL = 0.7f;
    private final List<String> furParts = new ArrayList<>(), zombieParts = new ArrayList<>();
    /** root .. mouth_item: walked with translateAndRotate to draw the carried salmon. */
    private final List<ModelPart> mouthChain = new ArrayList<>();

    public BearModel(ModelPart root, String name) {
        super(root, name);
        try {
            Map<String, String> parents = new HashMap<>();
            for (JsonElement e : LowpixGeometry.read(Winterworks.MOD_ID, name).getAsJsonArray("parts")) {
                JsonObject p = e.getAsJsonObject();
                String n = p.get("name").getAsString();
                parents.put(n, p.get("parent").isJsonNull() ? null : p.get("parent").getAsString());
                if (n.startsWith("fur_")) {
                    furParts.add(n);
                } else if (n.startsWith("zombie_")) {
                    zombieParts.add(n);
                }
            }
            List<ModelPart> chain = new ArrayList<>();
            for (String n = "mouth_item"; n != null && parents.containsKey(n); n = parents.get(n)) {
                ModelPart part = maybePart(n).orElse(null);
                if (part == null) {
                    chain.clear();
                    break;
                }
                chain.add(0, part);
            }
            if (!chain.isEmpty()) {
                mouthChain.add(root);
                mouthChain.addAll(chain);
            }
        } catch (RuntimeException e) {
            // WWModel has logged the missing model; an empty model draws nothing
        }
    }

    public boolean hasMouth() {
        return !mouthChain.isEmpty();
    }

    /** Moves `pose` to the mouth_item locator (with the bones' current animated pose). */
    public void toMouth(PoseStack pose) {
        for (ModelPart p : mouthChain) {
            p.translateAndRotate(pose);
        }
    }

    @Override
    public void setupAnim(T e, float limbSwing, float limbAmount, float age, float headYaw, float headPitch) {
        reset();
        BearLike bear = (BearLike) e;
        BearState s = bear.ww$bear();
        boolean shorn = bear.ww$isShorn(), zombie = bear.ww$isZombie();
        for (String n : furParts) {
            show(n, !shorn);
        }
        for (String n : zombieParts) {
            show(n, zombie);
        }
        boolean water = e.isInWater();
        if (water) {
            play(s.swim, "swim", age, 1f);
        } else if (bear.ww$isSitting()) {
            play(s.sit, "sit", age, 1f);
        } else {
            // walk, blending into the run as it speeds up (hunting bears are aggressive: run sooner)
            float from = e.isAggressive() ? RUN_FROM * 0.7f : RUN_FROM;
            float run = Mth.clamp((limbAmount - from) / (RUN_FULL - from), 0f, 1f);
            if (!hasClip("run")) {
                run = 0f;
            }
            walk("walk", limbSwing, limbAmount * (1f - run), WALK_SPEED, WALK_WEIGHT);
            walk("run", limbSwing, limbAmount * run, RUN_SPEED, RUN_WEIGHT);
            play(s.idle, "idle", age, 1f);
        }
        play(s.leap, "leap", age, 1f);
        play(s.swipe, "swipe", age, 1f);
        play(s.roar, "roar", age, 1f);
        play(s.eat, "eat", age, 1f);
        play(s.shake, "shake", age, 1f);
        // look where it's going (less while a clip is acting)
        float k = s.roar.isStarted() || s.leap.isStarted() ? 0.25f : 1f;
        float yaw = Mth.clamp(headYaw, -60f, 60f) * Mth.DEG_TO_RAD * k, pitch = headPitch * Mth.DEG_TO_RAD * k;
        get("neck").ifPresent(p -> p.yRot += yaw * 0.4f);
        get("head").ifPresent(p -> {
            p.yRot += yaw * 0.6f;
            p.xRot += pitch * 0.6f;
        });
    }
}
