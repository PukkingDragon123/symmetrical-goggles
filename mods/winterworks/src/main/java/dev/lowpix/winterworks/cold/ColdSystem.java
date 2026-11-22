package dev.lowpix.winterworks.cold;

import dev.lowpix.winterworks.registry.WWArmor;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWDamage;
import dev.lowpix.winterworks.registry.WWEffects;
import dev.lowpix.winterworks.registry.WWParticles;
import dev.lowpix.winterworks.registry.WWSounds;
import dev.lowpix.winterworks.world.WWWorldgen;
import java.util.Map;
import java.util.UUID;
import java.util.WeakHashMap;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ArmorItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.block.AbstractFurnaceBlock;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CampfireBlock;
import net.minecraft.world.level.block.state.BlockState;

/**
 * The cold (docs/COLD_UPDATE.md sections 1-2, made harsher in docs/FIXES_0_4.md). Ice Caves, cold water, touching or
 * standing on ice, powder snow and snowstorms fill a cold meter (0-400) in four levels, shown as the Cold effect
 * (amplifier 0-3): Chilly (shivers, frost breath), Cold (Slowness, Mining Fatigue), Freezing (Slowness II, Weakness,
 * fully frozen: vanilla freeze damage), Frozen (Slowness IV, Weakness II, extra freeze damage). The vanilla frost
 * overlay follows the meter. Warmth (fires, lava, lit furnaces, torches and lanterns nearby or in hand) thaws you fast;
 * out of the cold you thaw slowly. Each leather or fur armour piece cuts the cold by a quarter (all four: immune).
 * Fur armour also turns the cold into Strength, but cooks you in the Nether.
 */
public final class ColdSystem {
    private static final EquipmentSlot[] ARMOR = {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET};
    /** Cold meter points added per tick by each source (each level is 100 points; the meter tops out at 400). */
    public static final float ICE_CAVES = 0.5f, COLD_WATER = 1.5f, SNOWSTORM = 0.3f, BLIZZARD = 0.8f, ON_ICE = 0.25f,
            TOUCHING_ICE = 0.4f, POWDER_SNOW = 1.0f;
    /** The cold meter: one level every 100 points, at most 4 levels. */
    public static final float LEVEL = 100f, MAX_COLD = 400f;
    /** Thawing per tick: near warmth, and simply out of the cold. */
    public static final float THAW_WARM = 4f, THAW = 1f;
    /** A cold hit (Frostbite shrugged off, a frost zombie's claws, a roar) counts as "in the cold" this long. */
    private static final int CHILL_TICKS = 100;

    private static final class State {
        float cold;
        boolean warm;
        boolean nearAncientIce;
        long checked = -1000;
        float exposure;
    }

    private static final Map<UUID, State> STATES = new java.util.HashMap<>();
    private static final Map<LivingEntity, Long> CHILLED = new WeakHashMap<>();

    private ColdSystem() {}

    public static void init() {
        ServerTickEvents.END_WORLD_TICK.register(level -> {
            for (ServerPlayer p : level.players()) {
                tickPlayer(level, p);
            }
        });
        net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents.DISCONNECT.register(
                (handler, server) -> STATES.remove(handler.player.getUUID()));
    }

    private static State state(Player p) {
        return STATES.computeIfAbsent(p.getUUID(), u -> new State());
    }

    /** How many Polar Bear Fur armour pieces the entity wears (0-4). */
    public static int furPieces(LivingEntity e) {
        int n = 0;
        for (EquipmentSlot slot : ARMOR) {
            ItemStack s = e.getItemBySlot(slot);
            if (s.getItem() instanceof ArmorItem a && a.getMaterial().is(WWArmor.FUR)) {
                n++;
            }
        }
        return n;
    }

    /**
     * Fur armour shrugs off Slowness, Frostbite and Stunned, and anything that can't freeze ignores Frostbite.
     * A shrugged-off cold effect still counts as being in the cold (it feeds the fur's Strength).
     */
    public static boolean resists(LivingEntity e, Holder<MobEffect> effect) {
        boolean frost = effect.is(WWEffects.FROSTBITE);
        boolean chill = frost || effect.is(MobEffects.MOVEMENT_SLOWDOWN) || effect.is(WWEffects.STUNNED);
        if (chill && furPieces(e) > 0) {
            chill(e);
            return true;
        }
        if (frost && !e.canFreeze()) {
            chill(e);
            return true;
        }
        return false;
    }

    /** A cold attack touched `e` (it counts as being in the cold for a few seconds). */
    public static void chill(LivingEntity e) {
        CHILLED.put(e, e.level().getGameTime());
    }

    /** Frozen ticks per tick the world is pushing onto this player right now (0 when warm or sheltered). */
    public static float exposure(Player p) {
        return state(p).exposure;
    }

    /** Is this player in the cold: exposed, near ancient ice, or recently hit by a cold attack? */
    public static boolean inTheCold(Player p) {
        State s = state(p);
        Long chilled = CHILLED.get(p);
        boolean recent = chilled != null && p.level().getGameTime() - chilled < CHILL_TICKS;
        return s.exposure > 0 || s.nearAncientIce || p.isInPowderSnow || p.wasInPowderSnow || recent;
    }

    /** The raw cold of a place for an entity, before warmth: Ice Caves, cold water, snowstorms. */
    public static float coldAt(ServerLevel level, LivingEntity e) {
        BlockPos pos = e.blockPosition();
        Holder<Biome> biome = level.getBiome(pos);
        float rate = 0;
        if (biome.is(WWWorldgen.ICE_CAVES)) {
            rate += ICE_CAVES;
        }
        boolean coldBiome = biome.value().coldEnoughToSnow(pos);
        if (e.isInWater() && coldBiome) {
            rate += COLD_WATER;
        }
        BlockPos eyes = BlockPos.containing(e.getEyePosition());
        if (level.isRaining() && biome.value().getPrecipitationAt(pos) == Biome.Precipitation.SNOW && level.canSeeSky(eyes)) {
            rate += level.isThundering() ? BLIZZARD : SNOWSTORM;
        }
        if (e.isInPowderSnow || e.wasInPowderSnow) {
            rate += POWDER_SNOW;
        }
        if (isIce(level.getBlockState(e.getBlockPosBelowThatAffectsMyMovement()))) {
            rate += ON_ICE;
        }
        if (touchingIce(level, e)) {
            rate += TOUCHING_ICE;
        }
        return rate;
    }

    /** Ice of every kind (vanilla ice, packed, blue, frosted; our ancient ice and icicles). */
    public static boolean isIce(BlockState s) {
        return s.is(BlockTags.ICE) || s.is(WWBlocks.ANCIENT_ICE) || s.is(WWBlocks.ICICLE);
    }

    /** Is any block of ice pressed against the entity (its box grown a little)? */
    private static boolean touchingIce(ServerLevel level, LivingEntity e) {
        var box = e.getBoundingBox().inflate(0.25, 0.0, 0.25);   // within arm's reach of a wall of ice
        for (BlockPos p : BlockPos.betweenClosed(BlockPos.containing(box.minX, box.minY, box.minZ),
                BlockPos.containing(box.maxX, box.maxY, box.maxZ))) {
            if (isIce(level.getBlockState(p))) {
                return true;
            }
        }
        return false;
    }

    /** Leather and fur pieces (each cuts the cold by a quarter). */
    public static int warmPieces(LivingEntity e) {
        int n = 0;
        for (EquipmentSlot slot : ARMOR) {
            if (e.getItemBySlot(slot).is(net.minecraft.tags.ItemTags.FREEZE_IMMUNE_WEARABLES)) {
                n++;
            }
        }
        return n;
    }

    /** The cold meter (0-400) of this player. */
    public static float coldMeter(Player p) {
        return state(p).cold;
    }

    /** The cold level of this player: 0 none, 1 Chilly, 2 Cold, 3 Freezing, 4 Frozen. */
    public static int coldLevel(Player p) {
        return levelOf(state(p).cold);
    }

    public static int levelOf(float meter) {
        return Math.min(4, (int) (meter / LEVEL));
    }

    /** Tests: set the meter directly. */
    public static void setColdMeter(Player p, float meter) {
        state(p).cold = Math.max(0, Math.min(MAX_COLD, meter));
    }

    /** Fires, lava, magma, lit furnaces within 5 blocks; torches and lanterns within 2 or in hand. */
    public static boolean isWarm(ServerLevel level, LivingEntity e) {
        if (heldWarmth(e.getMainHandItem()) || heldWarmth(e.getOffhandItem())) {
            return true;
        }
        BlockPos c = e.blockPosition();
        for (BlockPos p : BlockPos.betweenClosed(c.offset(-5, -2, -5), c.offset(5, 3, 5))) {
            BlockState s = level.getBlockState(p);
            if (s.isAir()) {
                continue;
            }
            if (bigHeat(s)) {
                return true;
            }
            if (smallHeat(s) && Math.abs(p.getX() - c.getX()) <= 2 && Math.abs(p.getZ() - c.getZ()) <= 2
                    && p.getY() - c.getY() <= 2 && p.getY() - c.getY() >= -1) {
                return true;
            }
        }
        return false;
    }

    private static boolean heldWarmth(ItemStack s) {
        return s.is(Items.TORCH) || s.is(Items.SOUL_TORCH) || s.is(Items.LANTERN) || s.is(Items.SOUL_LANTERN)
                || s.is(Items.LAVA_BUCKET) || s.is(Items.CAMPFIRE) || s.is(Items.SOUL_CAMPFIRE);
    }

    private static boolean bigHeat(BlockState s) {
        if (s.is(BlockTags.CAMPFIRES)) {
            return s.getValue(CampfireBlock.LIT);
        }
        if (s.getBlock() instanceof AbstractFurnaceBlock) {
            return s.getValue(AbstractFurnaceBlock.LIT);
        }
        return s.is(BlockTags.FIRE) || s.is(Blocks.LAVA) || s.is(Blocks.MAGMA_BLOCK) || s.is(Blocks.LAVA_CAULDRON);
    }

    private static boolean smallHeat(BlockState s) {
        return s.is(Blocks.TORCH) || s.is(Blocks.WALL_TORCH) || s.is(Blocks.SOUL_TORCH) || s.is(Blocks.SOUL_WALL_TORCH)
                || s.is(Blocks.LANTERN) || s.is(Blocks.SOUL_LANTERN) || s.is(BlockTags.CANDLES) && s.getValue(
                net.minecraft.world.level.block.CandleBlock.LIT);
    }

    private static boolean ancientIceNear(ServerLevel level, LivingEntity e) {
        BlockPos c = e.blockPosition();
        for (BlockPos p : BlockPos.betweenClosed(c.offset(-6, -3, -6), c.offset(6, 4, 6))) {
            if (level.getBlockState(p).is(WWBlocks.ANCIENT_ICE)) {
                return true;
            }
        }
        return false;
    }

    /** Fur pieces -> Strength amplifier in the cold: 1-2 pieces I, 3 pieces II, the full set III. */
    public static int strengthAmplifier(int pieces) {
        return pieces >= 4 ? 2 : pieces == 3 ? 1 : 0;
    }

    /** Fur pieces -> ticks between overheating hits in the Nether. */
    public static int overheatInterval(int pieces) {
        return Math.max(15, 60 / Math.max(1, pieces));
    }

    static void tickPlayer(ServerLevel level, ServerPlayer p) {
        GameType mode = p.gameMode.getGameModeForPlayer();
        if (mode == GameType.CREATIVE || mode == GameType.SPECTATOR || !p.isAlive()) {
            return;
        }
        State s = state(p);
        long t = level.getGameTime();
        int fur = furPieces(p);
        // overheating: fur in the Nether
        if (fur > 0 && level.dimensionType().ultraWarm()) {
            s.exposure = 0;
            s.cold = Math.max(0, s.cold - THAW_WARM);
            if (t % overheatInterval(fur) == 0) {
                p.hurt(WWDamage.source(level, WWDamage.OVERHEAT), 1f);
                level.sendParticles(ParticleTypes.WHITE_SMOKE, p.getX(), p.getY() + 1.2, p.getZ(), 6, 0.3, 0.5, 0.3, 0.02);
                if (level.random.nextInt(3) == 0) {
                    level.playSound(null, p, WWSounds.PLAYER_OVERHEAT, SoundSource.PLAYERS, 0.6f, 0.9f + level.random.nextFloat() * 0.3f);
                }
            }
            return;
        }
        float cold = coldAt(level, p);
        if (t - s.checked >= 10 || t < s.checked) {   // the block scans run twice a second (and right away)
            s.checked = t;
            s.warm = (cold > 0 || s.cold > 0) && isWarm(level, p);
            s.nearAncientIce = ancientIceNear(level, p);
        }
        int warmPieces = warmPieces(p);
        s.exposure = s.warm ? 0 : cold * Math.max(0, 4 - warmPieces) / 4f;
        if (s.exposure > 0) {
            s.cold = Math.min(MAX_COLD, s.cold + s.exposure);
        } else {
            s.cold = Math.max(0, s.cold - (s.warm ? THAW_WARM : THAW));
        }
        int lvl = levelOf(s.cold);
        // the vanilla frost overlay follows the meter: it starts at Chilly and is full (frozen) from Freezing
        int required = p.getTicksRequiredToFreeze();
        int frozen = s.cold <= LEVEL ? 0 : Math.min(required, (int) ((s.cold - LEVEL) / (2 * LEVEL) * required));
        if (lvl >= 3) {
            frozen = Math.max(frozen, required);
        }
        if (!p.isInPowderSnow || frozen > p.getTicksFrozen()) {
            p.setTicksFrozen(frozen + (frozen >= required ? 0 : 2));   // +2: vanilla thaws 2 a tick
        }
        // the levels
        if (lvl > 0 && t % 20 == 0) {
            p.addEffect(new MobEffectInstance(WWEffects.COLD, 40, lvl - 1, true, false, true));
            if (lvl >= 2) {
                p.addEffect(new MobEffectInstance(MobEffects.MOVEMENT_SLOWDOWN, 40, lvl == 2 ? 0 : lvl == 3 ? 1 : 3, true, false, false));
                p.addEffect(new MobEffectInstance(MobEffects.DIG_SLOWDOWN, 40, lvl >= 4 ? 1 : 0, true, false, false));
            }
            if (lvl >= 3) {
                p.addEffect(new MobEffectInstance(MobEffects.WEAKNESS, 40, lvl >= 4 ? 1 : 0, true, false, false));
            }
            if (lvl >= 4) {
                p.hurt(level.damageSources().freeze(), 1f);
            }
            if (level.random.nextInt(3) == 0) {
                level.sendParticles(WWParticles.FROST_BREATH, p.getX(), p.getEyeY() - 0.1, p.getZ(), 1 + lvl, 0.15, 0.05, 0.15, 0.01);
            }
        }
        // shivering
        if (lvl >= 1 && level.random.nextInt(Math.max(12, 80 - lvl * 15)) == 0) {
            level.playSound(null, p, WWSounds.PLAYER_SHIVER, SoundSource.PLAYERS, 0.5f, 0.9f + level.random.nextFloat() * 0.2f);
        }
        // fur armour: the colder it gets, the stronger you are
        if (fur > 0 && t % 20 == 0 && inTheCold(p)) {
            p.addEffect(new MobEffectInstance(MobEffects.DAMAGE_BOOST, 50, strengthAmplifier(fur), true, true, true));
            if (level.random.nextInt(4) == 0) {
                level.sendParticles(WWParticles.FROST_BREATH, p.getX(), p.getY() + 1.0, p.getZ(), 2, 0.3, 0.4, 0.3, 0.01);
            }
        }
    }
}
