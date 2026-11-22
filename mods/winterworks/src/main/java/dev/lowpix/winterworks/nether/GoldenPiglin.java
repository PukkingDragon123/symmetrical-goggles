package dev.lowpix.winterworks.nether;

import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWParticles;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.util.RandomSource;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.SpawnGroupData;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.monster.piglin.AbstractPiglin;
import net.minecraft.world.entity.monster.piglin.Piglin;
import net.minecraft.world.entity.monster.piglin.PiglinAi;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.ServerLevelAccessor;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.loot.LootParams;
import net.minecraft.world.level.storage.loot.parameters.LootContextParamSets;
import net.minecraft.world.level.storage.loot.parameters.LootContextParams;
import org.jetbrains.annotations.Nullable;

/**
 * The Golden Piglin (docs/HEXES_UPDATE.md section 7): a Piglin whose whole body has turned to solid gold. Extremely
 * slow (speed 0.06), stiff and janky, always in pain (it groans and creaks). It keeps the piglin brain, so it barters
 * (with `winterworks:gameplay/golden_piglin_bartering`, mixin.PiglinAiMixin), but it never hunts: it only hits back.
 * Other Piglins attack it for its gold (PiglinGreed.attackTarget); killed, it drops 2-4 gold blocks (its loot table).
 * Spawns 1 in 15 among Piglins (mixin.PiglinMixin) and in every Hex Fortress. Never a baby, never zombifies.
 * <p>
 * A brute that drank Cursed Elixir becomes a golden brute (docs/FIXES_0_4.md "Turning to gold sooner"): a Golden Piglin
 * flagged {@link #isBrute()}, a fifth bigger (the SCALE attribute), tougher, and gripping its gilded axe.
 */
public class GoldenPiglin extends Piglin {
    /** 1 in this many piglins spawned in the world turns out to be golden. */
    public static final int RARITY = 15;
    /** A golden brute: bigger, tougher, with its gilded axe. */
    public static final float BRUTE_SCALE = 0.2f;
    private static final net.minecraft.network.syncher.EntityDataAccessor<Boolean> BRUTE = net.minecraft.network.syncher.SynchedEntityData
            .defineId(GoldenPiglin.class, net.minecraft.network.syncher.EntityDataSerializers.BOOLEAN);
    private static final net.minecraft.resources.ResourceLocation BRUTE_SCALE_ID = dev.lowpix.winterworks.Winterworks.id("golden_brute_scale");
    private static final net.minecraft.resources.ResourceLocation BRUTE_HEALTH_ID = dev.lowpix.winterworks.Winterworks.id("golden_brute_health");
    private static final net.minecraft.resources.ResourceLocation BRUTE_DAMAGE_ID = dev.lowpix.winterworks.Winterworks.id("golden_brute_damage");

    // client: idle (strained trembling), barter (while admiring gold), hurt_groan (on a hit)
    public final AnimationState idleState = new AnimationState();
    public final AnimationState barterState = new AnimationState();
    public final AnimationState hurtGroanState = new AnimationState();
    private int lastHurtTime;
    private int seizeTicks;

    public GoldenPiglin(EntityType<? extends AbstractPiglin> type, Level level) {
        super(type, level);
        setImmuneToZombification(true);   // solid gold doesn't rot
        xpReward = 20;
    }

    public static AttributeSupplier.Builder createAttributes() {
        return Piglin.createAttributes().add(Attributes.MOVEMENT_SPEED, 0.06).add(Attributes.MAX_HEALTH, 40)
                .add(Attributes.KNOCKBACK_RESISTANCE, 0.8).add(Attributes.ARMOR, 8);
    }

    /** Does a piglin spawned this way turn out golden (1 in 15 natural, chunk-generation and structure spawns)? */
    public static boolean rollsGolden(MobSpawnType type, RandomSource random) {
        return (type == MobSpawnType.NATURAL || type == MobSpawnType.CHUNK_GENERATION || type == MobSpawnType.STRUCTURE)
                && random.nextInt(RARITY) == 0;
    }

    /** Replaces a piglin with a Golden Piglin (same place, name and persistence; no gear). */
    @Nullable
    public static GoldenPiglin fromPiglin(Piglin piglin) {
        GoldenPiglin golden = piglin.convertTo(WWEntities.GOLDEN_PIGLIN, false);
        if (golden != null) {
            golden.setItemSlot(EquipmentSlot.MAINHAND, ItemStack.EMPTY);
            golden.setItemSlot(EquipmentSlot.OFFHAND, ItemStack.EMPTY);
        }
        return golden;
    }

    /** Replaces a brute with a golden brute: a bigger Golden Piglin that keeps a (gilded) axe. */
    @Nullable
    public static GoldenPiglin fromBrute(net.minecraft.world.entity.monster.piglin.PiglinBrute brute) {
        GoldenPiglin golden = brute.convertTo(WWEntities.GOLDEN_PIGLIN, false);
        if (golden != null) {
            golden.setBrute(true);
            golden.setItemSlot(EquipmentSlot.OFFHAND, ItemStack.EMPTY);
        }
        return golden;
    }

    @Override
    protected void defineSynchedData(net.minecraft.network.syncher.SynchedEntityData.Builder builder) {
        super.defineSynchedData(builder);
        builder.define(BRUTE, false);
    }

    /** A golden brute (a brute that drank Cursed Elixir). */
    public boolean isBrute() {
        return entityData.get(BRUTE);
    }

    public void setBrute(boolean brute) {
        entityData.set(BRUTE, brute);
        applyBruteStats(brute);
        if (brute) {
            setHealth(getMaxHealth());
            ItemStack axe = new ItemStack(net.minecraft.world.item.Items.GOLDEN_AXE);
            setItemSlot(EquipmentSlot.MAINHAND, axe);
            setDropChance(EquipmentSlot.MAINHAND, 0.1f);
        }
    }

    private void applyBruteStats(boolean brute) {
        modifier(Attributes.SCALE, BRUTE_SCALE_ID, BRUTE_SCALE, brute);
        modifier(Attributes.MAX_HEALTH, BRUTE_HEALTH_ID, 20, brute);
        modifier(Attributes.ATTACK_DAMAGE, BRUTE_DAMAGE_ID, 3, brute);
        if (getHealth() > getMaxHealth()) {
            setHealth(getMaxHealth());
        }
    }

    private void modifier(net.minecraft.core.Holder<net.minecraft.world.entity.ai.attributes.Attribute> attribute,
                          net.minecraft.resources.ResourceLocation id, double amount, boolean on) {
        var inst = getAttribute(attribute);
        if (inst == null) {
            return;
        }
        if (on && !inst.hasModifier(id)) {
            inst.addPermanentModifier(new net.minecraft.world.entity.ai.attributes.AttributeModifier(id, amount,
                    net.minecraft.world.entity.ai.attributes.AttributeModifier.Operation.ADD_VALUE));
        } else if (!on) {
            inst.removeModifier(id);
        }
    }

    @Override
    public void addAdditionalSaveData(net.minecraft.nbt.CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        tag.putBoolean("Brute", isBrute());
    }

    @Override
    public void readAdditionalSaveData(net.minecraft.nbt.CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        entityData.set(BRUTE, tag.getBoolean("Brute"));
        applyBruteStats(isBrute());
    }

    /** Its barter loot: much better than a Piglin's. */
    public static List<ItemStack> barterLoot(Piglin piglin) {
        ServerLevel level = (ServerLevel) piglin.level();
        return level.getServer().reloadableRegistries().getLootTable(NetherFeature.GOLDEN_BARTER).getRandomItems(
                new LootParams.Builder(level).withParameter(LootContextParams.THIS_ENTITY, piglin).create(LootContextParamSets.PIGLIN_BARTER));
    }

    @Nullable
    @Override
    public SpawnGroupData finalizeSpawn(ServerLevelAccessor level, DifficultyInstance difficulty, MobSpawnType type,
                                        @Nullable SpawnGroupData data) {
        SpawnGroupData out = super.finalizeSpawn(level, difficulty, type, data);
        setBaby(false);
        for (EquipmentSlot slot : EquipmentSlot.values()) {
            setItemSlot(slot, ItemStack.EMPTY);   // its body is the gold: no sword, no armour
        }
        return out;
    }

    @Override
    public void setBaby(boolean baby) {
        super.setBaby(false);
    }

    @Override
    protected boolean canHunt() {
        return false;
    }

    @Override
    public boolean isConverting() {
        return false;
    }

    @Override
    protected void customServerAiStep() {
        super.customServerAiStep();
        // stiff and janky: every so often its joints seize up and it freezes mid-step, creaking
        if (seizeTicks > 0) {
            seizeTicks--;
            getNavigation().stop();
            setDeltaMovement(getDeltaMovement().multiply(0, 1, 0));
        } else if (getNavigation().isInProgress() && random.nextInt(80) == 0) {
            seizeTicks = 15 + random.nextInt(25);
            playSound(WWSounds.GOLDEN_PIGLIN_CREAK, 0.8f, 0.6f + random.nextFloat() * 0.3f);
        }
    }

    @Override
    public void tick() {
        super.tick();
        if (level().isClientSide) {
            boolean moving = getDeltaMovement().horizontalDistanceSqr() > 1.0e-6 || walkAnimation.speed() > 0.02f;
            idleState.animateWhen(!moving, tickCount);
            barterState.animateWhen(getOffhandItem().is(PiglinAi.BARTERING_ITEM), tickCount);
            if (hurtTime > lastHurtTime) {
                hurtGroanState.start(tickCount);
            }
            lastHurtTime = hurtTime;
            if (random.nextInt(30) == 0) {
                level().addParticle(WWParticles.GOLD_GLINT, getRandomX(0.6), getRandomY(), getRandomZ(0.6), 0, 0.01, 0);
            }
        }
    }

    // --------------------------------------------------------------------------------------- sounds: always in pain

    @Override
    public void playAmbientSound() {
        makeSound(getAmbientSound());   // groans whatever it is doing (a piglin only talks when idle)
    }

    @Override
    protected SoundEvent getAmbientSound() {
        return WWSounds.GOLDEN_PIGLIN_GROAN;
    }

    @Override
    public int getAmbientSoundInterval() {
        return 140;
    }

    @Override
    protected SoundEvent getHurtSound(DamageSource source) {
        return WWSounds.GOLDEN_PIGLIN_HURT;
    }

    @Override
    protected SoundEvent getDeathSound() {
        return WWSounds.GOLDEN_PIGLIN_DEATH;
    }

    @Override
    protected void playStepSound(BlockPos pos, BlockState state) {
        playSound(WWSounds.GOLDEN_PIGLIN_CREAK, 0.35f, 0.7f + random.nextFloat() * 0.3f);
    }

    @Override
    public float getVoicePitch() {
        return 0.7f + (random.nextFloat() - random.nextFloat()) * 0.1f;
    }
}
