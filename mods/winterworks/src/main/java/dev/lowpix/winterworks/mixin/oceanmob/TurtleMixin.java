package dev.lowpix.winterworks.mixin.oceanmob;

import dev.lowpix.winterworks.oceanmob.SeaTurtle;
import dev.lowpix.winterworks.oceanmob.TurtleGoals;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.animal.Animal;
import net.minecraft.world.entity.animal.Turtle;
import net.minecraft.world.level.Level;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Turtles overhauled (docs/OCEAN_UPDATE.md section 4): basking on beaches and surfacing for air, with synced flags. */
@Mixin(Turtle.class)
public abstract class TurtleMixin extends Animal implements SeaTurtle {
    @Unique
    private static final EntityDataAccessor<Byte> WW_TURTLE_FLAGS = SynchedEntityData.defineId(Turtle.class, EntityDataSerializers.BYTE);

    protected TurtleMixin(EntityType<? extends Animal> type, Level level) {
        super(type, level);
    }

    @Inject(method = "defineSynchedData", at = @At("TAIL"))
    private void ww$defineFlags(SynchedEntityData.Builder builder, CallbackInfo ci) {
        builder.define(WW_TURTLE_FLAGS, (byte) 0);
    }

    @Inject(method = "registerGoals", at = @At("TAIL"))
    private void ww$goals(CallbackInfo ci) {
        Turtle self = (Turtle) (Object) this;
        goalSelector.addGoal(2, new TurtleGoals.Bask(self));
        goalSelector.addGoal(6, new TurtleGoals.Surface(self));
    }

    @Unique
    private boolean ww$flag(int bit) {
        return (entityData.get(WW_TURTLE_FLAGS) & bit) != 0;
    }

    @Unique
    private void ww$setFlag(int bit, boolean on) {
        byte b = entityData.get(WW_TURTLE_FLAGS);
        entityData.set(WW_TURTLE_FLAGS, (byte) (on ? b | bit : b & ~bit));
    }

    @Override
    public boolean ww$isBasking() {
        return ww$flag(1);
    }

    @Override
    public void ww$setBasking(boolean basking) {
        ww$setFlag(1, basking);
    }

    @Override
    public boolean ww$isSurfacing() {
        return ww$flag(2);
    }

    @Override
    public void ww$setSurfacing(boolean surfacing) {
        ww$setFlag(2, surfacing);
    }
}
