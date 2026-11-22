package dev.lowpix.winterworks.hex;

import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWSounds;
import net.minecraft.core.BlockPos;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.game.ClientGamePacketListener;
import net.minecraft.network.protocol.game.ClientboundBlockEntityDataPacket;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

/**
 * The Elixir Jar's contents: a liquid and how many doses of it (0-3), and the brew bubbling in it.
 * A brew takes {@link #BREW_TICKS} ticks of heat; it pauses while the jar is off the heat.
 */
public class ElixirJarBlockEntity extends BlockEntity {
    public static final int BREW_TICKS = 200;
    public static final int DOSES = 3;

    private ElixirType liquid = ElixirType.NONE;
    private ElixirType brewing = ElixirType.NONE;
    private int doses;
    private int progress;

    /** Client only: ticks since the jar was loaded, and whether the heat is on (for the bubbling). */
    public int age;
    public boolean heated;

    public ElixirJarBlockEntity(BlockPos pos, BlockState state) {
        super(WWBlocks.ELIXIR_JAR_BE, pos, state);
    }

    public ElixirType liquid() {
        return liquid;
    }

    public ElixirType brewing() {
        return brewing;
    }

    public int doses() {
        return doses;
    }

    public int progress() {
        return progress;
    }

    public boolean isBrewing() {
        return brewing != ElixirType.NONE;
    }

    /** 0..1 through the current brew. */
    public float brewFraction() {
        return isBrewing() ? Mth.clamp(progress / (float) BREW_TICKS, 0f, 1f) : 0f;
    }

    /** The brew this ingredient would start now, or NONE if it can't go in. */
    public ElixirType brewFor(ItemStack ingredient) {
        if (isBrewing()) {
            return ElixirType.NONE;
        }
        if (ingredient.is(Items.SOUL_SAND)) {
            if (doses == 0) {
                return ElixirType.SOUL;
            }
            if (liquid == ElixirType.GREED && doses == DOSES) {
                return ElixirType.CURSED;   // souls bound into a full jar of molten gold
            }
            return ElixirType.NONE;
        }
        if (ingredient.is(Items.GOLD_BLOCK)) {
            return doses == 0 ? ElixirType.GREED : ElixirType.NONE;
        }
        return ElixirType.NONE;
    }

    public void startBrew(ElixirType type) {
        brewing = type;
        progress = 0;
        sync();
    }

    /** Fills one bottle: the elixir taken out, or EMPTY if there is nothing to take. */
    public ItemStack takeDose() {
        if (isBrewing() || doses <= 0 || liquid == ElixirType.NONE) {
            return ItemStack.EMPTY;
        }
        ItemStack out = liquid.dose();
        doses--;
        if (doses == 0) {
            liquid = ElixirType.NONE;
        }
        sync();
        return out;
    }

    /** Sets the contents directly (tests, structures). */
    public void setContents(ElixirType type, int count) {
        liquid = count > 0 ? type : ElixirType.NONE;
        doses = type == ElixirType.NONE ? 0 : Mth.clamp(count, 0, DOSES);
        brewing = ElixirType.NONE;
        progress = 0;
        sync();
    }

    private void finish(ServerLevel level) {
        liquid = brewing;
        doses = DOSES;
        brewing = ElixirType.NONE;
        progress = 0;
        double x = worldPosition.getX() + 0.5, y = worldPosition.getY() + 0.7, z = worldPosition.getZ() + 0.5;
        level.playSound(null, worldPosition, WWSounds.ELIXIR_JAR_BREWED, SoundSource.BLOCKS, 0.9f, 0.9f + level.random.nextFloat() * 0.2f);
        level.sendParticles(liquid == ElixirType.SOUL ? ParticleTypes.SOUL : ParticleTypes.WAX_ON, x, y, z, 10, 0.18, 0.15, 0.18, 0.02);
        level.sendParticles(ParticleTypes.BUBBLE_POP, x, y, z, 8, 0.12, 0.05, 0.12, 0.0);
        sync();
    }

    public static void serverTick(Level level, BlockPos pos, BlockState state, ElixirJarBlockEntity jar) {
        if (!jar.isBrewing() || !ElixirJarBlock.hasHeat(level, pos)) {
            return;
        }
        jar.progress++;
        if (jar.progress % 36 == 1) {
            level.playSound(null, pos, WWSounds.ELIXIR_JAR_BUBBLE, SoundSource.BLOCKS, 0.55f, 0.85f + level.random.nextFloat() * 0.3f);
        }
        if (jar.progress >= BREW_TICKS && level instanceof ServerLevel server) {
            jar.finish(server);
        } else if (jar.progress % 20 == 0) {
            jar.setChanged();
        }
    }

    public static void clientTick(Level level, BlockPos pos, BlockState state, ElixirJarBlockEntity jar) {
        jar.age++;
        jar.heated = ElixirJarBlock.hasHeat(level, pos);
        if (jar.isBrewing() && jar.heated && jar.progress < BREW_TICKS) {
            jar.progress++;   // mirrors the server between syncs, for the rising liquid
        }
        var r = level.random;
        double x = pos.getX() + 0.5, z = pos.getZ() + 0.5;
        float fill = jar.isBrewing() && jar.liquid == ElixirType.NONE ? jar.brewFraction() : jar.doses / (float) DOSES;
        double top = pos.getY() + 0.12 + 0.5 * Math.max(fill, 0.15f);
        if (jar.isBrewing() && jar.heated) {
            if (r.nextInt(3) == 0) {
                level.addParticle(ParticleTypes.BUBBLE_POP, x + (r.nextDouble() - 0.5) * 0.25, top, z + (r.nextDouble() - 0.5) * 0.25, 0, 0.02, 0);
            }
            if (r.nextInt(7) == 0) {
                level.addParticle(jar.brewing == ElixirType.GREED ? ParticleTypes.SMALL_FLAME : ParticleTypes.SOUL_FIRE_FLAME,
                        x + (r.nextDouble() - 0.5) * 0.2, pos.getY() + 0.85, z + (r.nextDouble() - 0.5) * 0.2, 0, 0.015, 0);
            }
            if (r.nextInt(12) == 0) {
                level.addParticle(ParticleTypes.WHITE_SMOKE, x, pos.getY() + 0.9, z, 0, 0.03, 0);
            }
        } else if (jar.doses > 0 && r.nextInt(40) == 0) {
            level.addParticle(jar.liquid == ElixirType.SOUL ? ParticleTypes.SOUL : ParticleTypes.WAX_ON,
                    x + (r.nextDouble() - 0.5) * 0.25, top, z + (r.nextDouble() - 0.5) * 0.25, 0, 0.01, 0);
        }
    }

    private void sync() {
        setChanged();
        if (level != null && !level.isClientSide) {
            level.sendBlockUpdated(worldPosition, getBlockState(), getBlockState(), Block.UPDATE_CLIENTS);
            level.updateNeighbourForOutputSignal(worldPosition, getBlockState().getBlock());
        }
    }

    @Override
    protected void saveAdditional(CompoundTag tag, HolderLookup.Provider registries) {
        super.saveAdditional(tag, registries);
        tag.putString("liquid", liquid.id);
        tag.putInt("doses", doses);
        tag.putString("brewing", brewing.id);
        tag.putInt("progress", progress);
    }

    @Override
    protected void loadAdditional(CompoundTag tag, HolderLookup.Provider registries) {
        super.loadAdditional(tag, registries);
        liquid = ElixirType.byId(tag.getString("liquid"));
        doses = Mth.clamp(tag.getInt("doses"), 0, DOSES);
        brewing = ElixirType.byId(tag.getString("brewing"));
        progress = tag.getInt("progress");
        if (liquid == ElixirType.NONE) {
            doses = 0;
        }
    }

    @Override
    public Packet<ClientGamePacketListener> getUpdatePacket() {
        return ClientboundBlockEntityDataPacket.create(this);
    }

    @Override
    public CompoundTag getUpdateTag(HolderLookup.Provider registries) {
        return saveWithoutMetadata(registries);
    }
}
