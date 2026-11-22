package dev.lowpix.winterworks.hex;

import dev.lowpix.winterworks.curse.Curse;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.contents.TranslatableContents;

/**
 * A curse shows in a tooltip as just its name (docs/FIXES_0_4.md "Curses"): no description lines, whoever adds them
 * (the curses ship no description strings, and lines another mod adds from an enchantment's description key are
 * taken out again). Used by the client tooltip callback (client.hex.HexTooltips) and the tests.
 */
public final class CurseTooltips {
    private static final Set<String> DESCRIPTION_KEYS = new HashSet<>();

    static {
        for (Curse c : Curse.ALL) {
            add(c.key.location().getNamespace(), c.id());
        }
        add("minecraft", "binding_curse");
        add("minecraft", "vanishing_curse");
    }

    private static void add(String ns, String id) {
        for (String suffix : new String[]{".desc", ".description", ".info", ".tooltip"}) {
            DESCRIPTION_KEYS.add("enchantment." + ns + "." + id + suffix);
        }
    }

    private CurseTooltips() {}

    /** The translation keys a curse's description could be written under (none of them exist in our lang). */
    public static Set<String> descriptionKeys() {
        return DESCRIPTION_KEYS;
    }

    /** Takes every curse description line out of a tooltip; returns how many it took. */
    public static int nameOnly(List<Component> lines) {
        int removed = 0;
        for (Iterator<Component> it = lines.iterator(); it.hasNext(); ) {
            if (isDescription(it.next())) {
                it.remove();
                removed++;
            }
        }
        return removed;
    }

    /** Does this line (or anything inside it) say what a curse does? */
    public static boolean isDescription(Component line) {
        if (line.getContents() instanceof TranslatableContents t) {
            if (DESCRIPTION_KEYS.contains(t.getKey())) {
                return true;
            }
            for (Object arg : t.getArgs()) {
                if (arg instanceof Component c && isDescription(c)) {
                    return true;
                }
            }
        }
        for (Component sibling : line.getSiblings()) {
            if (isDescription(sibling)) {
                return true;
            }
        }
        return false;
    }
}
