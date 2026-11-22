package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.amber.SnifferTaming;
import dev.lowpix.winterworks.amber.TamedSniffer;
import java.util.UUID;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.animal.Animal;
import net.minecraft.world.entity.animal.sniffer.Sniffer;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Sniffers tamed with pitcher pods dig up suspicious blocks (docs/AMBER_UPDATE.md section 8; logic in amber.SnifferTaming). */
@Mixin(Sniffer.class)
public abstract class SnifferMixin extends Animal implements TamedSniffer {
    @Shadow
    @Final
    private static EntityDataAccessor<Integer> DATA_DROP_SEED_AT_TICK;

    @Unique
    @Nullable
    private UUID ww$owner;
    @Unique
    private final SnifferTaming.Job ww$job = new SnifferTaming.Job();

    protected SnifferMixin(EntityType<? extends Animal> type, Level level) {
        super(type, level);
    }

    @Shadow
    private Sniffer.State getState() {
        throw new AssertionError();
    }

    @Override
    @Nullable
    public UUID ww$owner() {
        return ww$owner;
    }

    @Override
    public void ww$setOwner(@Nullable UUID owner) {
        ww$owner = owner;
    }

    @Override
    public SnifferTaming.Job ww$job() {
        return ww$job;
    }

    @Override
    public Sniffer.State ww$state() {
        return getState();
    }

    @Override
    public void ww$noSeedDrop() {
        entityData.set(DATA_DROP_SEED_AT_TICK, -1);
    }

    @Inject(method = "customServerAiStep", at = @At("HEAD"), cancellable = true)
    private void ww$tamedAi(CallbackInfo ci) {
        if (ww$owner != null && SnifferTaming.tick((Sniffer) (Object) this, this)) {
            ci.cancel();
        }
    }

    @Inject(method = "mobInteract", at = @At("HEAD"), cancellable = true)
    private void ww$pitcherPod(Player player, InteractionHand hand, CallbackInfoReturnable<InteractionResult> cir) {
        InteractionResult r = SnifferTaming.interact((Sniffer) (Object) this, this, player, hand);
        if (r != null) {
            cir.setReturnValue(r);
        }
    }

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        if (ww$owner != null) {
            tag.putUUID(SnifferTaming.OWNER_TAG, ww$owner);
        }
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        ww$owner = tag.hasUUID(SnifferTaming.OWNER_TAG) ? tag.getUUID(SnifferTaming.OWNER_TAG) : null;
    }
}
