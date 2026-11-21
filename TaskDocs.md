# D1

## The hunger system

The colony is either **fed** or **hungry**. This is stored as one value for the whole colony, `hungry: boolean` in `ColonyState` (`src/types.ts`). A new game starts fed (`hungry: false` in `src/state/ColonyProvider.tsx`).

Each new day is calculated in `advanceDay` (`src/simulation.ts`) in this order:

1. **Production.** Every dwarf with a job produces that job's resource:

   | Job           | Fed output | Hungry output |
   | ------------- | ---------- | ------------- |
   | Woodcutting   | 3 wood     | 1 wood        |
   | Deep Mining   | 2 stone    | 1 stone       |
   | Mushroom Farm | 4 food     | 2 food        |

   When the colony is hungry, each dwarf makes half the normal amount, rounded down (`Math.floor(amount * 0.5)`). Because of the rounding, woodcutting goes from 3 to 1.

2. **Food consumption.** Every dwarf eats 1 food per day. Food never goes below 0, so a shortage cannot create a negative resource.

3. **Updating the hunger flag.** If food is exactly 0 after the dwarves have eaten, the colony becomes hungry. Otherwise it is fed. The flag is saved in the new state that `advanceDay` returns.

### Consequence and recovery

- The hunger penalty applies on the **day after** food runs out: the flag is set at the end of one day and halves production on the next.
- The colony recovers when the food left after eating is above 0 at the end of a day. Production is back to normal on the following day.
- The same state always gives the same result, so the system is deterministic and has no randomness.

## How the UI reacts

The UI reads `colony.hungry` and shows the shortage in two places.

### Resource bar: Rations tile

- File: `src/components/ResourceBar.tsx`, which gets `hungry` from `src/pages/Layout.tsx`.
- While the colony is hungry, the **Rations** tile gets the CSS class `hungry`. It then has a dark red background, a red outline, and a red label and number (`.resource-bar article.hungry` in `src/styles.css`).
- This shows at a glance that food has run out.

### Dwarf roster: Hungry badge

- File: `src/components/DwarfRoster.tsx`, which gets `hungry` from `src/pages/ColonyPage.tsx`.
- While the colony is hungry, every dwarf in the hold shows a red badge reading **"🍖 Hungry · 50% output"** under their normal status tag.
- Hovering over the badge shows the tooltip *"Hungry dwarves work at half strength (rounded down)"*. This explains what the shortage does, as the requirements ask.
- Dwarves away on an expedition do not get the badge.
- Badge style: `.status.hungry` in `src/styles.css`, in the same red as the Rations tile.

When the colony recovers, both the red Rations tile and the badges disappear on the next render.
