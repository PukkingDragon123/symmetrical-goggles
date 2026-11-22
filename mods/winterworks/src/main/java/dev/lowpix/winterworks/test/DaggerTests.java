package dev.lowpix.winterworks.test;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.dagger.DaggerFeature;
import dev.lowpix.winterworks.registry.WWEffects;
import dev.lowpix.winterworks.registry.WWItems;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.animal.IronGolem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.crafting.CraftingInput;
import net.minecraft.world.item.crafting.RecipeType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/**
 * GameTests for the Fang Daggers and fur armour data (docs/COLD_UPDATE.md sections 2 and 9). ./gradlew runGametest
 * The target is an AI-less iron golem: 100 health, no armour, no knockback. Mock players don't tick on their own,
 * so tests call {@code doTick()} where the player's physics, equipment attributes or attack cooldown matter.
 */
public class DaggerTests implements FabricGameTest {

    private static void floor(GameTestHelper h) {
        for (int x = 0; x < 8; x++) {
            for (int z = 0; z < 8; z++) {
                h.setBlock(new BlockPos(x, 0, z), Blocks.STONE);
            }
        }
    }

    private static IronGolem dummy(GameTestHelper h, BlockPos at) {
        IronGolem golem = h.spawn(EntityType.IRON_GOLEM, at);
        golem.setNoAi(true);
        return golem;
    }

    /** A mock player facing +X with a Fang Dagger in the main hand (and one in the off hand if `dual`). */
    @SuppressWarnings("removal")
    private static ServerPlayer duelist(GameTestHelper h, Vec3 at, boolean dual) {
        ServerPlayer p = h.makeMockServerPlayerInLevel();
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(WWItems.FANG_DAGGER));
        p.setItemInHand(InteractionHand.OFF_HAND, dual ? new ItemStack(WWItems.FANG_DAGGER) : ItemStack.EMPTY);
        Vec3 abs = h.absoluteVec(at);
        p.moveTo(abs.x, abs.y, abs.z, -90f, 0f);
        return p;
    }

    /** Runs the player's own tick (physics, equipment attributes, attack cooldown) n times. */
    private static void settle(ServerPlayer p, int ticks) {
        for (int i = 0; i < ticks; i++) {
            p.doTick();
        }
    }

    private static void leave(GameTestHelper h, ServerPlayer p) {
        h.getLevel().getServer().getPlayerList().remove(p);
    }

    private static boolean near(float a, float b) {
        return Math.abs(a - b) < 0.01f;
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 60)
    public void dualDaggersHitThroughInvulnerabilityFrames(GameTestHelper h) {
        floor(h);
        IronGolem golem = dummy(h, new BlockPos(3, 1, 3));
        ServerPlayer p = duelist(h, new Vec3(1.5, 1, 3.5), true);
        float max = golem.getHealth();
        p.attack(golem);
        h.assertTrue(near(golem.getHealth(), max - 3f), "a frenzy hit should deal 3, health " + golem.getHealth());
        h.assertTrue(golem.invulnerableTime > 10, "the golem should be in its invulnerability frames");
        h.runAfterDelay(2, () -> {
            h.assertTrue(golem.invulnerableTime > 10, "still invulnerable for vanilla hits, frames " + golem.invulnerableTime);
            p.attack(golem);
            h.assertTrue(near(golem.getHealth(), max - 6f), "the second hit 2 ticks later should land, health " + golem.getHealth());
            for (int i = 0; i < 5; i++) {   // spam: one click is kept for when the gap is over, the rest are ignored
                p.attack(golem);
            }
            h.assertTrue(near(golem.getHealth(), max - 6f), "spam clicks inside the gap must not land, health " + golem.getHealth());
        });
        h.runAfterDelay(9, () -> {
            h.assertTrue(near(golem.getHealth(), max - 9f), "exactly one buffered hit should land after the gap, health " + golem.getHealth());
            h.assertTrue(near(DaggerFeature.fatigue(p), 0.36f), "three hits = 0.36 fatigue, got " + DaggerFeature.fatigue(p));
            leave(h, p);
            h.succeed();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 140)
    public void fatigueSlowsTheFrenzyThenDrains(GameTestHelper h) {
        floor(h);
        IronGolem golem = dummy(h, new BlockPos(3, 1, 3));
        ServerPlayer p = duelist(h, new Vec3(1.5, 1, 3.5), true);
        float max = golem.getHealth();
        float[] mark = new float[1];
        h.startSequence()
                .thenExecute(() -> p.attack(golem))
                .thenExecuteAfter(2, () -> p.attack(golem))   // gap 2 at 0.12
                .thenExecuteAfter(3, () -> p.attack(golem))   // gap 3 at 0.24
                .thenExecuteAfter(4, () -> p.attack(golem))   // gap 4 at 0.36
                .thenExecuteAfter(5, () -> p.attack(golem))   // gap 5 at 0.48
                .thenExecute(() -> {
                    h.assertTrue(near(golem.getHealth(), max - 15f), "five frenzy hits should land, health " + golem.getHealth());
                    h.assertTrue(near(DaggerFeature.fatigue(p), 0.6f), "fatigue should be 0.6, got " + DaggerFeature.fatigue(p));
                    h.assertTrue(DaggerFeature.gap(p) == 6, "the gap should have grown to 6 ticks, got " + DaggerFeature.gap(p));
                    h.assertTrue(DaggerFeature.gap(0f) == 2 && DaggerFeature.gap(1f) == 10, "the gap goes from 2 to 10 ticks");
                    mark[0] = golem.getHealth();
                })
                .thenExecuteAfter(2, () -> {
                    p.attack(golem);
                    h.assertTrue(near(golem.getHealth(), mark[0]), "2 ticks is too soon at 0.6 fatigue, health " + golem.getHealth());
                })
                .thenExecuteAfter(6, () -> {
                    h.assertTrue(near(golem.getHealth(), mark[0] - 3f), "the early click should land once the gap is over");
                    h.assertTrue(near(DaggerFeature.fatigue(p), 0.72f), "fatigue should be 0.72, got " + DaggerFeature.fatigue(p));
                })
                .thenExecuteAfter(30, () -> {
                    float f = DaggerFeature.fatigue(p);
                    h.assertTrue(f < 0.68f && f > 0.3f, "fatigue should drain after a second without attacking, got " + f);
                    h.assertFalse(DaggerFeature.exhausted(p), "not exhausted");
                })
                .thenExecute(() -> leave(h, p))
                .thenSucceed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 40)
    public void singleDaggerDoesNotFrenzy(GameTestHelper h) {
        floor(h);
        IronGolem golem = dummy(h, new BlockPos(3, 1, 3));
        ServerPlayer p = duelist(h, new Vec3(1.5, 1, 3.5), false);
        settle(p, 15);   // equip (attack damage 5) and a full swing
        float max = golem.getHealth();
        p.attack(golem);
        h.assertTrue(near(golem.getHealth(), max - 5f), "one dagger is a 5 damage knife, health " + golem.getHealth());
        p.attack(golem);
        p.attack(golem);
        h.assertTrue(near(golem.getHealth(), max - 5f), "no frenzy: invulnerability frames and the swing cooldown apply, health "
                + golem.getHealth());
        h.assertTrue(DaggerFeature.fatigue(p) == 0f, "a single dagger builds no fatigue");
        leave(h, p);
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 40)
    public void exhaustedFallingHitIsAFangCrit(GameTestHelper h) {
        floor(h);
        IronGolem golem = dummy(h, new BlockPos(3, 1, 3));
        ServerPlayer p = duelist(h, new Vec3(1.5, 1, 3.5), true);
        settle(p, 15);
        DaggerFeature.setFatigue(p, 1f);
        h.assertTrue(DaggerFeature.exhausted(p), "fatigue 1 exhausts the daggers");
        float max = golem.getHealth();
        p.setOnGround(false);   // falling from a jump
        p.fallDistance = 1.2f;
        p.attack(golem);
        h.assertTrue(near(golem.getHealth(), max - 10f), "a Fang Crit is 2x the 5 damage swing, health " + golem.getHealth());
        h.assertTrue(golem.hasEffect(WWEffects.FROSTBITE), "a Fang Crit gives Frostbite");
        h.assertTrue(DaggerFeature.exhausted(p), "crits don't recharge the frenzy");
        leave(h, p);
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 80)
    public void pounceLeapsAndStrikes(GameTestHelper h) {
        floor(h);
        IronGolem golem = dummy(h, new BlockPos(5, 1, 3));
        ServerPlayer p = duelist(h, new Vec3(0.5, 1, 3.5), true);
        settle(p, 3);
        p.setShiftKeyDown(true);
        h.assertTrue(p.onGround(), "the player should stand on the floor");
        double startX = p.getX();
        float max = golem.getHealth();
        h.assertFalse(DaggerFeature.tryPounce(p, Float.NaN), "a bad direction is refused");
        h.assertTrue(DaggerFeature.tryPounce(p, -90f), "sneak + jump with two daggers should pounce");
        h.assertTrue(p.getCooldowns().isOnCooldown(WWItems.FANG_DAGGER), "the pounce puts the daggers on cooldown");
        h.assertTrue(near(DaggerFeature.fatigue(p), DaggerFeature.POUNCE_FATIGUE), "a pounce costs 0.35 fatigue");
        h.assertFalse(DaggerFeature.tryPounce(p, -90f), "no second pounce during the cooldown");
        h.onEachTick(p::doTick);
        h.startSequence()
                .thenWaitUntil(() -> {
                    h.assertTrue(p.getX() - startX > 2.5, "the pounce should carry the player forward, moved " + (p.getX() - startX));
                    h.assertTrue(golem.getHealth() <= max - 3f, "the pounce should strike the golem in the way, health " + golem.getHealth());
                })
                .thenWaitUntil(() -> h.assertFalse(DaggerFeature.pouncing(p), "the pounce should end on landing"))
                .thenExecute(() -> {
                    float dealt = max - golem.getHealth();
                    h.assertTrue(dealt <= DaggerFeature.POUNCE_HITS * 3f + 0.01f, "at most 5 pounce hits, dealt " + dealt);
                    leave(h, p);
                })
                .thenSucceed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void daggerAndFurRecipes(GameTestHelper h) {
        var rm = h.getLevel().getRecipeManager();
        var regs = h.getLevel().registryAccess();
        for (String n : List.of("fang_dagger", "fur_hood", "fur_coat", "fur_leggings", "fur_boots")) {
            var r = rm.byKey(Winterworks.id(n));
            h.assertTrue(r.isPresent(), "missing recipe " + n);
            Item want = BuiltInRegistries.ITEM.get(Winterworks.id(n));
            h.assertTrue(r.get().value().getResultItem(regs).is(want), "recipe " + n + " should make " + n);
        }
        ItemStack fur = new ItemStack(WWItems.POLAR_BEAR_FUR);
        CraftingInput dagger = CraftingInput.of(1, 3, List.of(new ItemStack(WWItems.MAULER_FANG), fur.copy(), new ItemStack(Items.STICK)));
        var d = rm.getRecipeFor(RecipeType.CRAFTING, dagger, h.getLevel());
        h.assertTrue(d.isPresent() && d.get().value().assemble(dagger, regs).is(WWItems.FANG_DAGGER), "fang / fur / stick makes a dagger");
        CraftingInput hood = CraftingInput.of(3, 2, List.of(fur.copy(), new ItemStack(Items.RED_WOOL), fur.copy(),
                fur.copy(), ItemStack.EMPTY, fur.copy()));
        var hr = rm.getRecipeFor(RecipeType.CRAFTING, hood, h.getLevel());
        h.assertTrue(hr.isPresent() && hr.get().value().assemble(hood, regs).is(WWItems.FUR_HOOD), "fur + any wool makes a hood");
        CraftingInput boots = CraftingInput.of(3, 2, List.of(fur.copy(), ItemStack.EMPTY, fur.copy(),
                new ItemStack(Items.WHITE_WOOL), ItemStack.EMPTY, new ItemStack(Items.BLACK_WOOL)));
        var br = rm.getRecipeFor(RecipeType.CRAFTING, boots, h.getLevel());
        h.assertTrue(br.isPresent() && br.get().value().assemble(boots, regs).is(WWItems.FUR_BOOTS), "fur boots: F F / W W");
        h.succeed();
    }
}
