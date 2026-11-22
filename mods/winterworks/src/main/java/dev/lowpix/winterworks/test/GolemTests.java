package dev.lowpix.winterworks.test;

import dev.lowpix.winterworks.golem.PotGolemEntity;
import dev.lowpix.winterworks.golem.PotGolemEntity.HeadForm;
import dev.lowpix.winterworks.golem.PotGolemEntity.Shard;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWItems;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.component.DataComponents;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.animal.Wolf;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.monster.Zombie;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.ItemContainerContents;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.DecoratedPotBlockEntity;
import net.minecraft.world.level.block.entity.PotDecorations;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/** GameTests for the Pot Golem (docs/AMBER_UPDATE.md section 9). ./gradlew runGametest */
public class GolemTests implements FabricGameTest {
    private static final BlockPos BASE = new BlockPos(3, 1, 3);   // the T's foot; the golem stands here

    private static void floor(GameTestHelper h) {
        for (int x = 0; x < 8; x++) {
            for (int z = 0; z < 8; z++) {
                h.setBlock(new BlockPos(x, 0, z), Blocks.STONE);
            }
        }
    }

    private static ItemStack pot(Item back, Item left, Item right, Item front) {
        return DecoratedPotBlockEntity.createDecoratedPotItem(new PotDecorations(back, left, right, front));
    }

    private static ItemStack withInside(ItemStack pot, ItemStack inside) {
        pot.set(DataComponents.CONTAINER, ItemContainerContents.fromItems(List.of(inside)));
        return pot;
    }

    private static ServerPlayer player(GameTestHelper h, double x, double z) {
        ServerPlayer p = h.makeMockServerPlayerInLevel();
        p.moveTo(h.absoluteVec(new Vec3(x, 1, z)));
        return p;
    }

    private static List<PotGolemEntity> golems(GameTestHelper h) {
        return h.getLevel().getEntitiesOfClass(PotGolemEntity.class, new AABB(h.absolutePos(BlockPos.ZERO)).expandTowards(8, 8, 8));
    }

    private static List<ItemEntity> drops(GameTestHelper h, Item item) {
        return h.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(h.absolutePos(BlockPos.ZERO)).inflate(1).expandTowards(8, 8, 8),
                e -> e.getItem().is(item));
    }

    private static int count(List<ItemEntity> drops) {
        return drops.stream().mapToInt(e -> e.getItem().getCount()).sum();
    }

    /** Builds the amber T and has `player` place `pot` on top, the way a player does it (BlockItem#useOn). */
    private static void buildT(GameTestHelper h, ServerPlayer player, ItemStack pot) {
        h.setBlock(BASE, WWBlocks.AMBER_BLOCK);
        for (int dx = -1; dx <= 1; dx++) {
            h.setBlock(BASE.offset(dx, 1, 0), WWBlocks.AMBER_BLOCK);
        }
        BlockPos top = h.absolutePos(BASE.above());
        player.setItemInHand(InteractionHand.MAIN_HAND, pot);
        BlockHitResult hit = new BlockHitResult(Vec3.atCenterOf(top).add(0, 0.5, 0), Direction.UP, top, false);
        pot.useOn(new UseOnContext(player, InteractionHand.MAIN_HAND, hit));
    }

    private static PotGolemEntity build(GameTestHelper h, ItemStack pot) {
        floor(h);
        ServerPlayer player = player(h, 0.5, 0.5);
        ItemStack placed = pot.copy();
        buildT(h, player, pot);
        List<PotGolemEntity> found = golems(h);
        h.assertTrue(found.size() == 1, "the amber T and pot should build exactly one Pot Golem, found " + found.size());
        PotGolemEntity g = found.get(0);
        h.assertTrue(player.getUUID().equals(g.getOwnerUUID()), "the golem should belong to the player who placed the pot");
        h.assertTrue(ItemStack.isSameItemSameComponents(g.head(), placed), "the head should be the placed pot, got " + g.head()
                + " " + g.head().getComponentsPatch() + " vs " + placed.getComponentsPatch());
        h.assertTrue(g.blockPosition().equals(h.absolutePos(BASE)), "the golem should stand where the T's foot was");
        h.assertBlockNotPresent(WWBlocks.AMBER_BLOCK, BASE);
        h.assertBlockNotPresent(WWBlocks.AMBER_BLOCK, BASE.above());
        h.assertBlockNotPresent(Blocks.DECORATED_POT, BASE.above(2));
        h.assertTrue(drops(h, Items.DECORATED_POT).isEmpty() && drops(h, Items.ECHO_SHARD).isEmpty(),
                "building must not spill the pot or its contents");
        return g;
    }

    private static PotGolemEntity spawn(GameTestHelper h, ItemStack pot) {
        PotGolemEntity g = h.spawn(WWEntities.POT_GOLEM, BASE);
        g.setHead(pot);
        return g;
    }

    // ------------------------------------------------------------------------------------------------ building, heads

    @GameTest(template = EMPTY_STRUCTURE)
    public void amberTWithAPotBuildsAGolem(GameTestHelper h) {
        PotGolemEntity g = build(h, pot(Items.ARMS_UP_POTTERY_SHERD, Items.BRICK, Items.SKULL_POTTERY_SHERD, Items.HEART_POTTERY_SHERD));
        h.assertTrue(g.headForm() == HeadForm.PLAIN, "sherds without echo/howl/danger make a plain head, got " + g.headForm());
        h.assertTrue(g.getMaxHealth() == 80f, "Pot Golems have 80 health");
        g.discard();
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void anIncompleteTBuildsNothing(GameTestHelper h) {
        floor(h);
        ServerPlayer player = player(h, 0.5, 0.5);
        h.setBlock(BASE, WWBlocks.AMBER_BLOCK);
        h.setBlock(BASE.above(), WWBlocks.AMBER_BLOCK);
        h.setBlock(BASE.offset(-1, 1, 0), WWBlocks.AMBER_BLOCK);   // one arm missing
        BlockPos top = h.absolutePos(BASE.above());
        ItemStack pot = new ItemStack(Items.DECORATED_POT);
        player.setItemInHand(InteractionHand.MAIN_HAND, pot);
        pot.useOn(new UseOnContext(player, InteractionHand.MAIN_HAND, new BlockHitResult(Vec3.atCenterOf(top).add(0, 0.5, 0), Direction.UP,
                top, false)));
        h.assertTrue(golems(h).isEmpty(), "three amber blocks are not a golem");
        h.assertBlockPresent(Blocks.DECORATED_POT, BASE.above(2));
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void echoShardPotBuildsAnEchoHead(GameTestHelper h) {
        PotGolemEntity g = build(h, withInside(pot(Items.BRICK, Items.BRICK, Items.BRICK, Items.BRICK), new ItemStack(Items.ECHO_SHARD)));
        h.assertTrue(g.headForm() == HeadForm.ECHO, "an echo shard in the pot makes an Echo Head, got " + g.headForm());
        h.assertTrue(PotGolemEntity.contents(g.head()).is(Items.ECHO_SHARD), "the echo shard stays in the head");
        g.discard();
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void howlSherdBuildsAHowlHead(GameTestHelper h) {
        PotGolemEntity g = build(h, pot(Items.BRICK, Items.HOWL_POTTERY_SHERD, Items.BRICK, Items.BRICK));
        h.assertTrue(g.headForm() == HeadForm.HOWL, "the howl sherd makes a Howl Head, got " + g.headForm());
        g.discard();
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void dangerSherdBuildsADangerHead(GameTestHelper h) {
        PotGolemEntity g = build(h, pot(Items.BRICK, Items.BRICK, Items.BRICK, Items.DANGER_POTTERY_SHERD));
        h.assertTrue(g.headForm() == HeadForm.DANGER, "the danger sherd makes a Danger Head, got " + g.headForm());
        g.discard();
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------------ head abilities

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 100)
    public void echoHeadBeamIgnoresArmour(GameTestHelper h) {
        floor(h);
        PotGolemEntity g = h.spawn(WWEntities.POT_GOLEM, new BlockPos(1, 1, 3));
        g.setHead(withInside(new ItemStack(Items.DECORATED_POT), new ItemStack(Items.ECHO_SHARD)));
        Zombie z = h.spawn(EntityType.ZOMBIE, new BlockPos(6, 1, 3));
        z.setNoAi(true);
        for (EquipmentSlot s : new EquipmentSlot[]{EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET}) {
            z.setItemSlot(s, new ItemStack(switch (s) {
                case HEAD -> Items.DIAMOND_HELMET;
                case CHEST -> Items.DIAMOND_CHESTPLATE;
                case LEGS -> Items.DIAMOND_LEGGINGS;
                default -> Items.DIAMOND_BOOTS;
            }));
        }
        g.setTarget(z);
        float max = z.getHealth();
        h.onEachTick(() -> {
            if (g.beamCooldown() > 0) {
                float lost = max - z.getHealth();
                h.assertTrue(Math.abs(lost - PotGolemEntity.BEAM_DAMAGE) < 0.01f, "the beam should deal 10 through diamond armour, dealt " + lost);
                h.assertTrue(g.beamCooldown() > PotGolemEntity.BEAM_COOLDOWN - 5, "an 8 s cooldown starts with the beam");
                g.discard();
                h.succeed();
            }
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 100)
    public void howlHeadBuffsWolves(GameTestHelper h) {
        floor(h);
        PotGolemEntity g = spawn(h, pot(Items.BRICK, Items.HOWL_POTTERY_SHERD, Items.BRICK, Items.BRICK));
        Wolf wolf = h.spawn(EntityType.WOLF, new BlockPos(6, 1, 6));
        Zombie z = h.spawn(EntityType.ZOMBIE, new BlockPos(0, 1, 6));
        z.setNoAi(true);
        g.setTarget(z);
        h.succeedWhen(() -> {
            h.assertTrue(wolf.hasEffect(net.minecraft.world.effect.MobEffects.DAMAGE_BOOST)
                    && wolf.getEffect(net.minecraft.world.effect.MobEffects.DAMAGE_BOOST).getAmplifier() == 1, "wolves get Strength II");
            h.assertTrue(wolf.hasEffect(net.minecraft.world.effect.MobEffects.MOVEMENT_SPEED), "wolves get Speed II");
            h.assertTrue(wolf.hasEffect(net.minecraft.world.effect.MobEffects.DAMAGE_RESISTANCE), "wolves get Resistance");
            h.assertTrue(wolf.hasEffect(net.minecraft.world.effect.MobEffects.REGENERATION), "wolves get Regeneration");
            g.discard();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 100)
    public void dangerHeadExplodesWithoutBreakingBlocks(GameTestHelper h) {
        floor(h);
        ServerPlayer owner = player(h, 3.5, 5.5);
        PotGolemEntity g = spawn(h, pot(Items.BRICK, Items.BRICK, Items.BRICK, Items.DANGER_POTTERY_SHERD));
        g.setOwner(owner.getUUID());
        Zombie z = h.spawn(EntityType.ZOMBIE, new BlockPos(5, 1, 3));
        z.setNoAi(true);
        float ownerHealth = owner.getHealth();
        g.setHealth(10f);   // below 20% of 80
        h.runAfterDelay(2, () -> h.assertTrue(g.isFusing(), "a Danger Head fuses below 20% health"));
        h.succeedWhen(() -> {
            h.assertFalse(g.hasPot(), "the pot is spent in the blast");
            h.assertTrue(z.getHealth() < z.getMaxHealth(), "the blast hurts hostile mobs");
            h.assertTrue(owner.getHealth() == ownerHealth, "the blast doesn't hurt players");
            for (int x = 0; x < 8; x++) {
                for (int zz = 0; zz < 8; zz++) {
                    h.assertBlockPresent(Blocks.STONE, new BlockPos(x, 0, zz));
                }
            }
            h.assertTrue(count(drops(h, Items.DANGER_POTTERY_SHERD)) == 1, "the danger sherd drops");
            g.discard();
        });
    }

    // ------------------------------------------------------------------------------------------------ brushing, pots

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 100)
    public void brushedGolemSneezesOffItsPot(GameTestHelper h) {
        floor(h);
        ItemStack head = withInside(pot(Items.BRICK, Items.HOWL_POTTERY_SHERD, Items.BRICK, Items.BRICK), new ItemStack(Items.DIAMOND));
        PotGolemEntity g = spawn(h, head.copy());
        ServerPlayer p = player(h, 1.5, 3.5);
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.BRUSH));
        h.assertTrue(p.interactOn(g, InteractionHand.MAIN_HAND).consumesAction(), "brushing a potted golem should work");
        h.succeedWhen(() -> {
            h.assertFalse(g.hasPot(), "the sneeze should knock the pot off");
            h.assertTrue(g.headForm() == HeadForm.NONE, "no pot, no head form");
            List<ItemEntity> pots = drops(h, Items.DECORATED_POT);
            h.assertTrue(pots.size() == 1 && ItemStack.isSameItemSameComponents(pots.get(0).getItem(), head),
                    "the pot drops intact, with its sherds and contents");
            g.discard();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void aDecoratedPotGivesANewHead(GameTestHelper h) {
        floor(h);
        PotGolemEntity g = spawn(h, ItemStack.EMPTY);
        ServerPlayer p = player(h, 1.5, 3.5);
        ItemStack pot = pot(Items.BRICK, Items.BRICK, Items.DANGER_POTTERY_SHERD, Items.BRICK);
        p.setItemInHand(InteractionHand.MAIN_HAND, pot.copy());
        p.interactOn(g, InteractionHand.MAIN_HAND);
        h.assertTrue(g.hasPot() && g.headForm() == HeadForm.DANGER, "using a decorated pot on it gives it that head");
        g.discard();
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------------ body shards

    @GameTest(template = EMPTY_STRUCTURE)
    public void bladeSherdEquipsTheBlade(GameTestHelper h) {
        floor(h);
        PotGolemEntity g = spawn(h, new ItemStack(Items.DECORATED_POT));
        g.setNoAi(true);
        ServerPlayer p = player(h, 1.5, 1.5);
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.BLADE_POTTERY_SHERD));
        p.interactOn(g, InteractionHand.MAIN_HAND);
        h.assertTrue(g.shard() == Shard.BLADE, "a blade sherd gives it the blade arm, got " + g.shard());
        // the blade hits for 12 and sweeps the mob next to the target
        Zombie a = h.spawn(EntityType.ZOMBIE, new BlockPos(3, 1, 5));
        Zombie b = h.spawn(EntityType.ZOMBIE, new BlockPos(4, 1, 5));
        a.setNoAi(true);
        b.setNoAi(true);
        g.doHurtTarget(a);
        h.assertTrue(a.getHealth() <= a.getMaxHealth() - 11f, "the blade should hit for about 12, health " + a.getHealth());
        h.assertTrue(b.getHealth() < b.getMaxHealth(), "the blade should sweep the zombie beside it");
        // one shard at a time: swapping drops the old one
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.ARCHER_POTTERY_SHERD));
        p.interactOn(g, InteractionHand.MAIN_HAND);
        h.assertTrue(g.shard() == Shard.ARCHER, "an archer sherd swaps in the bow arm, got " + g.shard());
        h.assertTrue(count(drops(h, Items.BLADE_POTTERY_SHERD)) == 1, "swapping drops the blade sherd");
        g.discard();
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 200)
    public void minerDigsNaturalOreButNotBuilds(GameTestHelper h) {
        floor(h);
        // a stone wall (x 5..6) with an exposed iron ore; a second ore sits next to a plank "build"
        for (int y = 1; y <= 4; y++) {
            for (int z = 0; z < 8; z++) {
                h.setBlock(new BlockPos(5, y, z), Blocks.STONE);
                h.setBlock(new BlockPos(6, y, z), Blocks.STONE);
            }
        }
        BlockPos ore = new BlockPos(5, 2, 2), built = new BlockPos(5, 2, 6);
        h.setBlock(ore, Blocks.IRON_ORE);
        h.setBlock(built, Blocks.IRON_ORE);
        h.setBlock(new BlockPos(4, 1, 7), Blocks.OAK_PLANKS);
        ServerPlayer owner = player(h, 1.5, 4.5);
        PotGolemEntity g = h.spawn(WWEntities.POT_GOLEM, new BlockPos(3, 1, 2));
        g.setHead(new ItemStack(Items.DECORATED_POT));
        g.setOwner(owner.getUUID());
        g.setShard(Shard.MINER);
        h.succeedWhen(() -> {
            h.assertBlockNotPresent(Blocks.IRON_ORE, ore);
            h.assertTrue(count(drops(h, Items.RAW_IRON)) >= 1, "the ore should drop raw iron");
            h.assertBlockPresent(Blocks.IRON_ORE, built);
            h.assertBlockPresent(Blocks.STONE, new BlockPos(5, 1, 2));   // no stone: the owner holds no pickaxe
            h.assertBlockPresent(Blocks.STONE, new BlockPos(5, 3, 2));
            g.discard();
        });
    }

    // ------------------------------------------------------------------------------------------------ weakness, death

    @GameTest(template = EMPTY_STRUCTURE)
    public void threeCracksShatterTheHead(GameTestHelper h) {
        floor(h);
        PotGolemEntity g = spawn(h, withInside(pot(Items.BRICK, Items.HOWL_POTTERY_SHERD, Items.BRICK, Items.BRICK),
                new ItemStack(Items.ECHO_SHARD)));
        g.crack();
        h.assertTrue(g.cracks() == 1 && g.hasPot(), "one crack");
        // a brick (or any sherd) repairs a crack
        ServerPlayer p = player(h, 1.5, 1.5);
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.BRICK));
        p.interactOn(g, InteractionHand.MAIN_HAND);
        h.assertTrue(g.cracks() == 0, "a brick should repair the crack, cracks " + g.cracks());
        g.crack();
        g.crack();
        h.assertTrue(g.cracks() == 2 && g.hasPot(), "two cracks hold");
        g.crack();
        h.assertFalse(g.hasPot(), "the third crack shatters the pot");
        h.assertTrue(g.headForm() == HeadForm.NONE, "a shattered head loses its ability");
        h.assertTrue(g.isDazed(), "shattering dazes it");
        h.assertTrue(count(drops(h, Items.HOWL_POTTERY_SHERD)) == 1 && count(drops(h, Items.BRICK)) == 3,
                "the pot's sherds drop");
        h.assertTrue(count(drops(h, Items.ECHO_SHARD)) == 1, "the pot's contents drop");
        g.discard();
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void deathDropsSherdsAndAmber(GameTestHelper h) {
        floor(h);
        PotGolemEntity g = spawn(h, pot(Items.BRICK, Items.SKULL_POTTERY_SHERD, Items.BRICK, Items.BRICK));
        g.setShard(Shard.BLADE);
        g.kill();
        h.succeedWhen(() -> {
            int amber = count(drops(h, WWItems.AMBER_CHUNK));
            h.assertTrue(amber >= 2 && amber <= 4, "a Pot Golem drops 2-4 amber chunks, dropped " + amber);
            h.assertTrue(count(drops(h, Items.SKULL_POTTERY_SHERD)) == 1, "the head's sherds drop");
            h.assertTrue(count(drops(h, Items.BLADE_POTTERY_SHERD)) == 1, "the body shard drops");
        });
    }

    // ------------------------------------------------------------------------------------------------ owner, saving

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 100)
    public void golemNeverAttacksItsOwner(GameTestHelper h) {
        floor(h);
        ServerPlayer owner = player(h, 1.5, 1.5);
        ServerPlayer stranger = player(h, 6.5, 6.5);
        PotGolemEntity g = spawn(h, new ItemStack(Items.DECORATED_POT));
        g.setOwner(owner.getUUID());
        Wolf pet = h.spawn(EntityType.WOLF, new BlockPos(1, 1, 5));
        pet.setTame(true, false);
        pet.setOwnerUUID(owner.getUUID());
        Wolf stray = h.spawn(EntityType.WOLF, new BlockPos(6, 1, 1));
        stray.setTame(true, false);
        stray.setOwnerUUID(stranger.getUUID());
        h.assertTrue(g.isFriendly(owner) && g.isAlliedTo(owner), "the owner is a friend");
        h.assertFalse(g.canAttack(owner), "it can't attack its owner");
        h.assertFalse(g.canAttack(pet), "it can't attack the owner's pets");
        h.assertTrue(g.canAttack(stray), "someone else's wolf is fair game when it must defend itself");
        g.setTarget(owner);
        h.assertTrue(g.getTarget() == null, "setTarget(owner) is refused");
        g.setTarget(pet);
        h.assertTrue(g.getTarget() == null, "setTarget(pet) is refused");
        float ownerHealth = owner.getHealth(), petHealth = pet.getHealth();
        g.hurt(g.damageSources().playerAttack(owner), 2f);   // the owner smacks it: no grudge
        owner.setLastHurtMob(pet);     // the owner swats its own pet: the golem doesn't join in
        owner.setLastHurtByMob(pet);   // ...or defend the owner from it
        h.onEachTick(() -> h.assertTrue(g.getTarget() != owner && g.getTarget() != pet, "the golem must never target its owner or pets"));
        h.runAfterDelay(80, () -> {
            h.assertTrue(owner.getHealth() == ownerHealth, "the owner was hurt");
            h.assertTrue(pet.getHealth() == petHealth, "the pet was hurt by the golem");
            g.discard();
            h.succeed();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void golemStateSurvivesSaving(GameTestHelper h) {
        floor(h);
        ServerPlayer owner = player(h, 1.5, 1.5);
        ItemStack head = withInside(pot(Items.BRICK, Items.HOWL_POTTERY_SHERD, Items.BRICK, Items.ANGLER_POTTERY_SHERD),
                new ItemStack(Items.ECHO_SHARD));
        PotGolemEntity g = spawn(h, head.copy());
        g.setOwner(owner.getUUID());
        g.setShard(Shard.MINER);
        g.crack();
        g.crack();
        g.setNoAi(true);
        CompoundTag tag = g.saveWithoutId(new CompoundTag());
        PotGolemEntity copy = WWEntities.POT_GOLEM.create(h.getLevel());
        copy.load(tag);
        h.assertTrue(ItemStack.isSameItemSameComponents(copy.head(), head), "the pot head (sherds and contents) is saved");
        h.assertTrue(copy.headForm() == HeadForm.ECHO, "the head form follows the saved pot");
        h.assertTrue(copy.shard() == Shard.MINER, "the body shard is saved");
        h.assertTrue(copy.cracks() == 2, "cracks are saved, got " + copy.cracks());
        h.assertTrue(owner.getUUID().equals(copy.getOwnerUUID()), "the owner is saved");
        g.discard();
        h.succeed();
    }
}
