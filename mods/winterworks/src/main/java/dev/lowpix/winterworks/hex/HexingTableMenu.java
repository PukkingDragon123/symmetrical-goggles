package dev.lowpix.winterworks.hex;

import dev.lowpix.winterworks.amber.AmberFeature;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEffects;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.registry.WWMenus;
import dev.lowpix.winterworks.registry.WWParticles;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.Registry;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.stats.Stats;
import net.minecraft.util.RandomSource;
import net.minecraft.world.Container;
import net.minecraft.world.SimpleContainer;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.ContainerData;
import net.minecraft.world.inventory.ContainerLevelAccess;
import net.minecraft.world.inventory.SimpleContainerData;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.ItemEnchantments;
import net.minecraft.world.level.Level;

/**
 * The Hexing Table's menu (docs/HEXES_UPDATE.md section 2): an enchanted book slot, a Soul Elixir slot, a slot for
 * Potions of Blood (up to 3; docs/FIXES_0_4.md "Blood in hexing") and the player inventory. Two options: button 0 is
 * the lesser hex, button 1 the sin hex. Blood instead of yourself: a lesser hex takes 1 Potion of Blood instead of
 * hexing you; a sin hex always needs 1, and takes 2 more instead of hexing you; with no blood offered you are Hexed as
 * before. The server works out everything (which curse a lesser hex will attach, what blocks a hex) and syncs it to the
 * screen in data slots; the hidden curse is rolled only when the hex happens and never shown in advance.
 */
public class HexingTableMenu extends AbstractContainerMenu {
    public static final int BOOK_SLOT = 0, ELIXIR_SLOT = 1, BLOOD_SLOT = 2, INV_START = 3, INV_END = 39;
    /** The blood slot holds this many Potions of Blood (they don't stack anywhere else). */
    public static final int BLOOD_MAX = 3;
    /** A Soul Tank must be within this many blocks of the table (a cube). */
    public static final int TANK_RADIUS = 3;
    /** Slot item positions in the GUI (client.hex.HexGui draws the frames round them). */
    public static final int BOOK_X = 34, BOOK_Y = 47, ELIXIR_X = 56, ELIXIR_Y = 47, BLOOD_X = 74, BLOOD_Y = 20, INV_X = 8, INV_Y = 84,
            HOTBAR_Y = 142;

    // synced data: indices
    public static final int D_SOULS = 0, D_CAPACITY = 1, D_TANKS = 2, D_LESSER_CURSE = 3, D_SIN = 4, D_SIN_SOURCE = 5,
            D_LESSER_PROBLEM = 6, D_SIN_PROBLEM = 7, D_SEED = 8, D_HEXES = 9, D_LAST_HIDDEN = 10, D_COUNT = 11;

    private final ContainerLevelAccess access;
    private final Player player;
    private final RandomSource random = RandomSource.create();
    private final ContainerData data = new SimpleContainerData(D_COUNT);
    private final Container hexSlots = new SimpleContainer(3) {
        @Override
        public void setChanged() {
            super.setChanged();
            HexingTableMenu.this.slotsChanged(this);
        }

        @Override
        public int getMaxStackSize(ItemStack stack) {
            return isBlood(stack) ? BLOOD_MAX : super.getMaxStackSize(stack);
        }
    };
    /** Server: the lesser curse this book will get (fixed per book and seed, so the preview tells the truth). */
    private Optional<Holder<Enchantment>> plannedCurse = Optional.empty();
    private int refreshTimer;

    public HexingTableMenu(int id, Inventory inventory) {
        this(id, inventory, ContainerLevelAccess.NULL);
    }

    public HexingTableMenu(int id, Inventory inventory, ContainerLevelAccess access) {
        super(WWMenus.HEXING_TABLE, id);
        this.access = access;
        this.player = inventory.player;
        addSlot(new Slot(hexSlots, BOOK_SLOT, BOOK_X, BOOK_Y) {
            @Override
            public boolean mayPlace(ItemStack stack) {
                return stack.is(Items.ENCHANTED_BOOK) || stack.is(WWItems.HEXED_BOOK);
            }

            @Override
            public int getMaxStackSize() {
                return 1;
            }
        });
        addSlot(new Slot(hexSlots, ELIXIR_SLOT, ELIXIR_X, ELIXIR_Y) {
            @Override
            public boolean mayPlace(ItemStack stack) {
                return stack.is(WWItems.SOUL_ELIXIR);
            }
        });
        addSlot(new Slot(hexSlots, BLOOD_SLOT, BLOOD_X, BLOOD_Y) {
            @Override
            public boolean mayPlace(ItemStack stack) {
                return isBlood(stack);
            }

            @Override
            public int getMaxStackSize(ItemStack stack) {
                return BLOOD_MAX;
            }
        });
        for (int row = 0; row < 3; row++) {
            for (int col = 0; col < 9; col++) {
                addSlot(new Slot(inventory, col + row * 9 + 9, INV_X + col * 18, INV_Y + row * 18));
            }
        }
        for (int col = 0; col < 9; col++) {
            addSlot(new Slot(inventory, col, INV_X + col * 18, HOTBAR_Y));
        }
        addDataSlots(data);
        data.set(D_LESSER_CURSE, -1);
        data.set(D_SIN, -1);
        data.set(D_SIN_SOURCE, -1);
        data.set(D_LESSER_PROBLEM, Hexing.NO_BOOK);
        data.set(D_SIN_PROBLEM, Hexing.NO_BOOK);
        data.set(D_SEED, random.nextInt(Short.MAX_VALUE));
        access.execute((level, pos) -> refresh(level, pos, true));
    }

    // ------------------------------------------------------------------------------------------------ tanks

    public static List<SoulTankBlockEntity> findTanks(Level level, BlockPos table) {
        List<SoulTankBlockEntity> out = new ArrayList<>();
        for (BlockPos p : BlockPos.betweenClosed(table.offset(-TANK_RADIUS, -TANK_RADIUS, -TANK_RADIUS),
                table.offset(TANK_RADIUS, TANK_RADIUS, TANK_RADIUS))) {
            if (level.getBlockEntity(p) instanceof SoulTankBlockEntity tank) {
                out.add(tank);
            }
        }
        return out;
    }

    public static List<BlockPos> findTankPositions(Level level, BlockPos table) {
        return findTanks(level, table).stream().map(t -> t.getBlockPos()).toList();
    }

    // ------------------------------------------------------------------------------------------------ server logic

    @Override
    public void slotsChanged(Container container) {
        super.slotsChanged(container);
        if (container == hexSlots) {
            access.execute((level, pos) -> refresh(level, pos, true));
        }
    }

    @Override
    public void broadcastChanges() {
        if (++refreshTimer >= 5) {   // the tank fills and drains while the screen is open
            refreshTimer = 0;
            access.execute((level, pos) -> refresh(level, pos, false));
        }
        super.broadcastChanges();
    }

    private void refresh(Level level, BlockPos pos, boolean bookChanged) {
        Registry<Enchantment> registry = level.registryAccess().registryOrThrow(Registries.ENCHANTMENT);
        List<SoulTankBlockEntity> tanks = findTanks(level, pos);
        int souls = tanks.stream().mapToInt(SoulTankBlockEntity::souls).sum();
        data.set(D_SOULS, Math.min(souls, Short.MAX_VALUE));
        data.set(D_CAPACITY, Math.min(tanks.size() * SoulTankBlockEntity.CAPACITY, Short.MAX_VALUE));
        data.set(D_TANKS, tanks.size());
        ItemStack book = hexSlots.getItem(BOOK_SLOT);
        if (bookChanged) {
            ItemEnchantments stored = Hexing.stored(book);
            plannedCurse = Hexing.isHexable(book)
                    ? Hexing.pickLesserCurse(registry, stored, RandomSource.create(data.get(D_SEED) * 1_000_003L + stored.hashCode()))
                    : Optional.empty();
            data.set(D_LESSER_CURSE, plannedCurse.map(h -> registry.asHolderIdMap().getId(h)).orElse(-1));
            Optional<Hexing.SinPick> sin = Hexing.isHexable(book) ? Hexing.sinSource(registry, stored) : Optional.empty();
            data.set(D_SIN, sin.flatMap(Hexing.SinPick::sin).map(h -> registry.asHolderIdMap().getId(h)).orElse(-1));
            data.set(D_SIN_SOURCE, sin.map(s -> registry.asHolderIdMap().getId(s.source())).orElse(-1));
        }
        data.set(D_LESSER_PROBLEM, problem(Hexing.Kind.LESSER, Hexing.lesserBookProblem(registry, book), tanks.size(), souls));
        data.set(D_SIN_PROBLEM, problem(Hexing.Kind.SIN, Hexing.sinBookProblem(registry, book), tanks.size(), souls));
    }

    private int problem(Hexing.Kind kind, int bookProblem, int tanks, int souls) {
        if (bookProblem != Hexing.OK) {
            return bookProblem;
        }
        if (tanks == 0) {
            return Hexing.NO_TANK;
        }
        if (player.getAbilities().instabuild) {
            return Hexing.OK;   // creative: free, like vanilla enchanting
        }
        if (hexSlots.getItem(ELIXIR_SLOT).getCount() < kind.elixir()) {
            return Hexing.NO_ELIXIR;
        }
        if (blood() < kind.blood()) {
            return Hexing.NO_BLOOD;
        }
        return souls < kind.souls() ? Hexing.NO_SOULS : Hexing.OK;
    }

    @Override
    public boolean clickMenuButton(Player player, int id) {
        if (id != 0 && id != 1) {
            return false;
        }
        Hexing.Kind kind = id == 0 ? Hexing.Kind.LESSER : Hexing.Kind.SIN;
        access.execute((level, pos) -> refresh(level, pos, false));
        if (problem(kind) != Hexing.OK) {
            return false;
        }
        boolean[] done = {access == ContainerLevelAccess.NULL};   // the client only asks
        access.execute((level, pos) -> done[0] = hex(level, pos, kind, player));
        return done[0];
    }

    private boolean hex(Level level, BlockPos pos, Hexing.Kind kind, Player player) {
        Registry<Enchantment> registry = level.registryAccess().registryOrThrow(Registries.ENCHANTMENT);
        ItemStack book = hexSlots.getItem(BOOK_SLOT);
        ItemEnchantments stored = Hexing.stored(book);
        ItemEnchantments result;
        int minutes;
        if (kind == Hexing.Kind.LESSER) {
            if (plannedCurse.isEmpty()) {
                return false;
            }
            result = Hexing.lesserEnchantments(stored, plannedCurse.get());
            minutes = Hexing.lesserMinutes(stored);
        } else {
            Optional<Hexing.SinPick> sin = Hexing.sinSource(registry, stored);
            if (sin.isEmpty() || sin.get().sin().isEmpty()) {
                return false;
            }
            result = Hexing.sinEnchantments(stored, sin.get());
            minutes = Hexing.SIN_MINUTES;
        }
        Optional<Holder<Enchantment>> hidden = random.nextFloat() < Hexing.HIDDEN_CHANCE
                ? Hexing.pickHiddenCurse(registry, result, random) : Optional.empty();
        ItemStack hexed = Hexing.hexedBook(book, result, kind, hidden);

        boolean spared = blood() >= kind.spareBlood();   // blood instead of yourself
        int bloodUsed = spared ? kind.spareBlood() : kind.blood();
        if (!player.getAbilities().instabuild) {
            hexSlots.getItem(ELIXIR_SLOT).shrink(kind.elixir());
            if (bloodUsed > 0) {
                hexSlots.getItem(BLOOD_SLOT).shrink(bloodUsed);
            }
            int owed = kind.souls();
            List<SoulTankBlockEntity> tanks = new ArrayList<>(findTanks(level, pos));
            tanks.sort(Comparator.comparingInt(SoulTankBlockEntity::souls).reversed());
            for (SoulTankBlockEntity tank : tanks) {
                owed -= tank.drain(owed);
                if (owed <= 0) {
                    break;
                }
            }
        }
        if (!spared) {
            player.addEffect(new MobEffectInstance(WWEffects.HEXED, minutes * 60 * 20, 0, false, true, true));
        }
        player.awardStat(Stats.ENCHANT_ITEM);
        data.set(D_SEED, random.nextInt(Short.MAX_VALUE));
        data.set(D_HEXES, (data.get(D_HEXES) + 1) & 0x7FFF);
        data.set(D_LAST_HIDDEN, hidden.isPresent() ? 1 : 0);
        hexSlots.setItem(BOOK_SLOT, hexed);   // -> slotsChanged -> refresh with the new seed

        level.playSound(null, pos, WWSounds.HEXING_TABLE_HEX, SoundSource.BLOCKS, 1f, kind == Hexing.Kind.SIN ? 0.75f : 1f);
        level.blockEvent(pos, level.getBlockState(pos).getBlock(), HexingTableBlockEntity.EVENT_HEX, 0);   // the book surges
        if (level instanceof ServerLevel server) {
            double x = pos.getX() + 0.5, y = pos.getY() + 1.0, z = pos.getZ() + 0.5;
            server.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, x, y, z, 24, 0.3, 0.25, 0.3, 0.06);
            server.sendParticles(ParticleTypes.SOUL, x, y + 0.3, z, 10, 0.3, 0.2, 0.3, 0.03);
            server.sendParticles(WWParticles.HEX_RUNE, x, y + 0.4, z, 16, 0.4, 0.3, 0.4, 0.04);
            if (kind == Hexing.Kind.SIN) {
                server.sendParticles(ParticleTypes.CRIMSON_SPORE, x, y + 0.2, z, 30, 0.5, 0.3, 0.5, 0.0);
            }
            if (bloodUsed > 0) {   // the blood boils away into the hex
                server.sendParticles(WWParticles.BLOOD_DRIP, x, y + 0.5, z, 6 + 4 * bloodUsed, 0.3, 0.2, 0.3, 0.02);
                server.sendParticles(ParticleTypes.DAMAGE_INDICATOR, x, y + 0.3, z, 2 * bloodUsed, 0.3, 0.2, 0.3, 0.05);
            }
        }
        broadcastChanges();
        return true;
    }

    // ------------------------------------------------------------------------------------------------ what the screen reads

    public int souls() {
        return data.get(D_SOULS);
    }

    public int capacity() {
        return data.get(D_CAPACITY);
    }

    public int tanks() {
        return data.get(D_TANKS);
    }

    /** Registry id (asHolderIdMap) of the curse a lesser hex will attach, or -1. */
    public int lesserCurseId() {
        return data.get(D_LESSER_CURSE);
    }

    public int sinId() {
        return data.get(D_SIN);
    }

    public int sinSourceId() {
        return data.get(D_SIN_SOURCE);
    }

    public int problem(Hexing.Kind kind) {
        return data.get(kind == Hexing.Kind.LESSER ? D_LESSER_PROBLEM : D_SIN_PROBLEM);
    }

    public int seed() {
        return data.get(D_SEED);
    }

    /** Counts successful hexes while open (the screen flares up when it changes). */
    public int hexes() {
        return data.get(D_HEXES);
    }

    public boolean lastHexHidHidden() {
        return data.get(D_LAST_HIDDEN) != 0;
    }

    public ItemStack book() {
        return hexSlots.getItem(BOOK_SLOT);
    }

    public ItemStack elixir() {
        return hexSlots.getItem(ELIXIR_SLOT);
    }

    /** The Potions of Blood offered. */
    public ItemStack bloodStack() {
        return hexSlots.getItem(BLOOD_SLOT);
    }

    /** How many Potions of Blood are offered (0-3). */
    public int blood() {
        ItemStack b = hexSlots.getItem(BLOOD_SLOT);
        return isBlood(b) ? b.getCount() : 0;
    }

    /** Will this hex take blood instead of hexing you, with what is offered now? */
    public boolean spares(Hexing.Kind kind) {
        return blood() >= kind.spareBlood();
    }

    /** A (drinkable) Potion of Blood. */
    public static boolean isBlood(ItemStack stack) {
        return stack.is(Items.POTION) && AmberFeature.isBloodPotion(stack);
    }

    // ------------------------------------------------------------------------------------------------ inventory

    @Override
    public ItemStack quickMoveStack(Player player, int index) {
        Slot slot = index >= 0 && index < this.slots.size() ? this.slots.get(index) : null;
        if (slot == null || !slot.hasItem()) {
            return ItemStack.EMPTY;
        }
        ItemStack stack = slot.getItem();
        ItemStack moved = stack.copy();
        if (index == BOOK_SLOT || index == ELIXIR_SLOT || index == BLOOD_SLOT) {
            if (!moveItemStackTo(stack, INV_START, INV_END, true)) {
                return ItemStack.EMPTY;
            }
        } else if (isBlood(stack)) {
            if (!moveItemStackTo(stack, BLOOD_SLOT, BLOOD_SLOT + 1, false)) {
                return ItemStack.EMPTY;
            }
        } else if (stack.is(WWItems.SOUL_ELIXIR)) {
            if (!moveItemStackTo(stack, ELIXIR_SLOT, ELIXIR_SLOT + 1, false)) {
                return ItemStack.EMPTY;
            }
        } else if (this.slots.get(BOOK_SLOT).mayPlace(stack)) {
            if (this.slots.get(BOOK_SLOT).hasItem()) {
                return ItemStack.EMPTY;
            }
            ItemStack one = stack.copyWithCount(1);
            stack.shrink(1);
            this.slots.get(BOOK_SLOT).setByPlayer(one);
        } else if (index < INV_END - 9) {
            if (!moveItemStackTo(stack, INV_END - 9, INV_END, false)) {
                return ItemStack.EMPTY;
            }
        } else if (!moveItemStackTo(stack, INV_START, INV_END - 9, false)) {
            return ItemStack.EMPTY;
        }
        if (stack.isEmpty()) {
            slot.setByPlayer(ItemStack.EMPTY);
        } else {
            slot.setChanged();
        }
        if (stack.getCount() == moved.getCount()) {
            return ItemStack.EMPTY;
        }
        slot.onTake(player, stack);
        return moved;
    }

    @Override
    public void removed(Player player) {
        super.removed(player);
        access.execute((level, pos) -> clearContainer(player, hexSlots));
    }

    @Override
    public boolean stillValid(Player player) {
        return stillValid(access, player, WWBlocks.HEXING_TABLE);
    }
}
