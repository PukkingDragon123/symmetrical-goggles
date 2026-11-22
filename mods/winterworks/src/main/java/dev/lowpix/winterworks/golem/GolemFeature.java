package dev.lowpix.winterworks.golem;

import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import net.fabricmc.fabric.api.tag.convention.v2.ConventionalBlockTags;
import net.minecraft.advancements.CriteriaTriggers;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.ItemTags;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CarvedPumpkinBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.DecoratedPotBlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.pattern.BlockInWorld;
import net.minecraft.world.level.block.state.pattern.BlockPattern;
import net.minecraft.world.level.block.state.pattern.BlockPatternBuilder;
import net.minecraft.world.level.block.state.predicate.BlockStatePredicate;
import org.jetbrains.annotations.Nullable;

/**
 * The Pot Golem (docs/AMBER_UPDATE.md section 9): building it (an iron-golem T of amber blocks with a decorated pot on
 * top; hooked from {@code mixin.DecoratedPotBlockMixin}) and the Miner shard's rules for what it may dig.
 */
public final class GolemFeature {
    private static BlockPattern pattern;

    private GolemFeature() {}

    public static void init() {}

    /** The iron-golem T: "~^~", "###", "~#~" with amber blocks and the pot as the head. */
    public static BlockPattern pattern() {
        if (pattern == null) {
            pattern = BlockPatternBuilder.start()
                    .aisle("~^~", "###", "~#~")
                    .where('^', BlockInWorld.hasState(BlockStatePredicate.forBlock(Blocks.DECORATED_POT)))
                    .where('#', BlockInWorld.hasState(BlockStatePredicate.forBlock(WWBlocks.AMBER_BLOCK)))
                    .where('~', b -> b.getState().isAir())
                    .build();
        }
        return pattern;
    }

    /**
     * Called when a decorated pot has been placed (its decorations and contents already applied). If it tops an
     * amber T, the blocks become a Pot Golem wearing that pot, owned by whoever placed it.
     */
    @Nullable
    public static PotGolemEntity trySpawnGolem(Level level, BlockPos potPos, @Nullable LivingEntity placer) {
        if (!(level instanceof ServerLevel sl)) {
            return null;
        }
        BlockPattern.BlockPatternMatch match = pattern().find(sl, potPos);
        if (match == null) {
            return null;
        }
        PotGolemEntity golem = WWEntities.POT_GOLEM.create(sl);
        if (golem == null) {
            return null;
        }
        ItemStack head = new ItemStack(Items.DECORATED_POT);
        if (sl.getBlockEntity(potPos) instanceof DecoratedPotBlockEntity pot) {
            head = pot.getPotAsItem();        // the sherds and what's inside go to the head...
            pot.setTheItem(ItemStack.EMPTY);  // ...so clearing the block must not spill the contents
        }
        golem.setHead(head);
        if (placer instanceof Player p) {
            golem.setOwner(p.getUUID());
        }
        BlockPos at = match.getBlock(1, 2, 0).getPos();
        CarvedPumpkinBlock.clearPatternBlocks(sl, match);
        float yaw = placer != null ? placer.getYRot() + 180f : 0f;
        golem.moveTo(at.getX() + 0.5, at.getY() + 0.05, at.getZ() + 0.5, yaw, 0f);
        golem.setYHeadRot(yaw);
        golem.yBodyRot = yaw;
        sl.addFreshEntity(golem);
        for (ServerPlayer sp : sl.getEntitiesOfClass(ServerPlayer.class, golem.getBoundingBox().inflate(5.0))) {
            CriteriaTriggers.SUMMONED_ENTITY.trigger(sp, golem);
        }
        CarvedPumpkinBlock.updatePatternBlocks(sl, match);
        sl.playSound(null, at, WWSounds.POT_GOLEM_BUILD, SoundSource.NEUTRAL, 1.0f, 1.0f);
        double x = golem.getX(), y = golem.getY(), z = golem.getZ();
        sl.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, WWBlocks.AMBER_BLOCK.defaultBlockState()), x, y + 1.2, z, 60, 0.5,
                0.8, 0.5, 0.15);
        sl.sendParticles(ParticleTypes.WAX_ON, x, y + 1.3, z, 25, 0.6, 0.9, 0.6, 0.5);
        return golem;
    }

    // ------------------------------------------------------------------------------------------------ the Miner shard

    static final int MINE_RADIUS = 6;
    private static final ItemStack TOOL = new ItemStack(Items.IRON_PICKAXE);

    /** Ores, vanilla and modded (c:ores). */
    public static boolean isOre(BlockState s) {
        return s.is(ConventionalBlockTags.ORES) || s.is(BlockTags.COAL_ORES) || s.is(BlockTags.IRON_ORES) || s.is(BlockTags.COPPER_ORES)
                || s.is(BlockTags.GOLD_ORES) || s.is(BlockTags.REDSTONE_ORES) || s.is(BlockTags.LAPIS_ORES) || s.is(BlockTags.DIAMOND_ORES)
                || s.is(BlockTags.EMERALD_ORES) || s.is(Blocks.NETHER_QUARTZ_ORE) || s.is(Blocks.NETHER_GOLD_ORE);
    }

    /** Raw natural stone (stone, deepslate, tuff, granite, diorite, andesite). Polished, brick and cobble are never natural. */
    public static boolean isNaturalStone(BlockState s) {
        return s.is(BlockTags.BASE_STONE_OVERWORLD);
    }

    /** What the ground is made of where nobody has built: a block next to anything else might be part of a build. */
    public static boolean isTerrain(BlockState s) {
        return isOre(s) || s.is(BlockTags.BASE_STONE_OVERWORLD) || s.is(BlockTags.BASE_STONE_NETHER) || s.is(BlockTags.DIRT)
                || s.is(BlockTags.SAND) || s.is(BlockTags.LEAVES) || s.is(BlockTags.NYLIUM) || s.is(BlockTags.ICE)
                || s.is(Blocks.GRAVEL) || s.is(Blocks.CLAY) || s.is(Blocks.CALCITE) || s.is(Blocks.DRIPSTONE_BLOCK)
                || s.is(Blocks.POINTED_DRIPSTONE) || s.is(Blocks.AMETHYST_BLOCK) || s.is(Blocks.BUDDING_AMETHYST)
                || s.is(Blocks.SMOOTH_BASALT) || s.is(Blocks.BEDROCK) || s.is(Blocks.OBSIDIAN) || s.is(Blocks.MAGMA_BLOCK)
                || s.is(Blocks.SNOW_BLOCK) || s.is(Blocks.POWDER_SNOW) || s.is(Blocks.SANDSTONE) || s.is(Blocks.RED_SANDSTONE)
                || s.is(Blocks.SCULK) || s.is(Blocks.MOSS_BLOCK) || s.is(Blocks.SOUL_SAND) || s.is(Blocks.SOUL_SOIL);
    }

    /** Solid things that aren't terrain (planks, bricks, glass, cobble...) or anything with a block entity. */
    private static boolean looksBuilt(BlockState s) {
        if (s.isAir() || !s.getFluidState().isEmpty()) {
            return false;
        }
        return s.hasBlockEntity() || (s.isSolid() && !isTerrain(s));
    }

    /**
     * May the Miner dig {@code pos}? Only natural ore or stone, set in the ground: it must have an open face, at least
     * three terrain neighbours and nothing that looks built (or a block entity) within 2 blocks; no fluid next to it
     * (no floods), not the ground under its owner or itself, breakable with an iron pickaxe, and mobGriefing on.
     */
    public static boolean canMine(Level level, BlockPos pos, @Nullable Player owner, PotGolemEntity golem) {
        if (!(level instanceof ServerLevel sl) || !sl.getGameRules().getBoolean(GameRules.RULE_MOBGRIEFING)) {
            return false;
        }
        BlockState s = level.getBlockState(pos);
        if (!(isOre(s) || isNaturalStone(s)) || s.getDestroySpeed(level, pos) < 0 || !TOOL.isCorrectToolForDrops(s)) {
            return false;
        }
        if (under(pos, golem.blockPosition()) || (owner != null && under(pos, owner.blockPosition()))) {
            return false;
        }
        boolean open = false;
        int terrain = 0;
        for (Direction d : Direction.values()) {
            BlockPos n = pos.relative(d);
            BlockState ns = level.getBlockState(n);
            if (!ns.getFluidState().isEmpty()) {
                return false;
            }
            if (ns.getCollisionShape(level, n).isEmpty()) {
                open = true;
            } else if (isTerrain(ns)) {
                terrain++;
            }
        }
        if (!open || terrain < 3) {
            return false;
        }
        for (BlockPos n : BlockPos.betweenClosed(pos.offset(-2, -2, -2), pos.offset(2, 2, 2))) {
            if (looksBuilt(level.getBlockState(n))) {
                return false;
            }
        }
        return true;
    }

    /** The ground column under a mob: never dig it out from under them. */
    private static boolean under(BlockPos block, BlockPos feet) {
        return block.getY() < feet.getY() && Math.abs(block.getX() - feet.getX()) <= 1 && Math.abs(block.getZ() - feet.getZ()) <= 1;
    }

    /**
     * The nearest thing to dig around the owner: exposed ores anywhere within 6 blocks; plain stone too while the owner
     * holds a pickaxe (they're mining), at walking height (feet to head + 1) so it widens tunnels without making holes.
     */
    @Nullable
    public static BlockPos findMineable(Level level, Player owner, PotGolemEntity golem) {
        BlockPos o = owner.blockPosition();
        boolean stone = owner.getMainHandItem().is(ItemTags.PICKAXES) || owner.getOffhandItem().is(ItemTags.PICKAXES);
        List<BlockPos> ores = new ArrayList<>(), rock = new ArrayList<>();
        for (BlockPos p : BlockPos.betweenClosed(o.offset(-MINE_RADIUS, -3, -MINE_RADIUS), o.offset(MINE_RADIUS, 4, MINE_RADIUS))) {
            BlockState s = level.getBlockState(p);
            if (isOre(s)) {
                ores.add(p.immutable());
            } else if (stone && isNaturalStone(s) && p.getY() >= o.getY() && p.getY() <= o.getY() + 2) {
                rock.add(p.immutable());
            }
        }
        Comparator<BlockPos> near = Comparator.comparingDouble(p -> p.distToCenterSqr(golem.position()));
        for (List<BlockPos> list : List.of(ores, rock)) {
            list.sort(near);
            for (BlockPos p : list) {
                if (canMine(level, p, owner, golem)) {
                    return p;
                }
            }
        }
        return null;
    }

    /** Digs the block as if with an iron pickaxe: normal drops (raw ore, cobblestone) and ore XP. */
    public static boolean mine(ServerLevel level, BlockPos pos, PotGolemEntity golem) {
        BlockState s = level.getBlockState(pos);
        if (s.isAir()) {
            return false;
        }
        BlockEntity be = s.hasBlockEntity() ? level.getBlockEntity(pos) : null;
        Block.dropResources(s, level, pos, be, golem, TOOL.copy());
        return level.destroyBlock(pos, false, golem);
    }
}
