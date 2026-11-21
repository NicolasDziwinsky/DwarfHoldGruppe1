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

# D2

## Equipping and returning tools

Each dwarf can carry at most one tool. This is stored on the dwarf as `toolEquipped?: boolean` in the `Dwarf` type (`src/types.ts`). If the field is missing, the dwarf has no tool. Tools that nobody carries are counted in `resources.tools`.

Since every dwarf holds either zero or one tool, a single boolean per dwarf is enough. Tools have no identity or durability in this version, so the game only needs to know *whether* a dwarf has a tool, not *which* one. The total number of tools is always:

```
resources.tools + (number of dwarves with toolEquipped === true)
```

Equipping or returning a tool moves it between the two parts of this sum, so the total never changes.

### State logic: `toggleTool`

The logic lives in `toggleTool(id)` in `src/state/ColonyProvider.tsx`. Components can use it through the colony context (`ColonyContextValue` in `src/state/ColonyContext.ts`).

1. It looks up the dwarf and decides the action: **equip** if the dwarf has no tool, **return** if it has one.
2. If it is an equip and the stores have no tools (`resources.tools < 1`), it stops and changes nothing.
3. It updates the state in a single functional `setColony` update:
   - **Equip:** `resources.tools - 1` and `toolEquipped: true` on that dwarf.
   - **Return:** `resources.tools + 1` and `toolEquipped: false` on that dwarf.
4. It adds an entry to the Chronicle, such as *"Bromli Copperkeg takes up a tool from the stores."* or *"… returns a tool to the stores."*

Inside the `setColony` updater, both checks run again against the **latest** state:

- If the dwarf's tool state already matches the requested action, the update is skipped. A tool cannot be equipped or returned twice.
- If there is no tool left to equip, the update is skipped. The count cannot go below 0.

This guards against fast double-clicks, or two updates being queued before React re-renders. The inventory stays consistent even then. The resource count and the dwarf's flag always change together in the same update, so they can never get out of sync.

### UI: the tool button in the dwarf roster

- File: `src/components/DwarfRoster.tsx`. From `src/pages/ColonyPage.tsx` it gets two new props: `toolsAvailable` (= `colony.resources.tools`) and `onToggleTool` (= `toggleTool`).
- Each dwarf card shows a button under the job dropdown:

  | Dwarf state | Tools in stores | Button                                     |
  | ----------- | --------------- | ------------------------------------------ |
  | No tool     | 1 or more       | **"⚒️ Equip tool"** (outlined)             |
  | No tool     | 0               | **"No tools in stores"** (greyed out)      |
  | Has a tool  | any             | **"⚒️ Unequip tool"** (filled amber)       |

- The filled amber style shows which dwarves have a tool.
- The Tools tile in the resource bar shows the stores count. It goes down when a tool is equipped and up when one is returned.
- Styles: `.tool-toggle`, `.tool-toggle.equipped` and `.tool-toggle:disabled` in `src/styles.css`.

### Simulation: More production when tool is equipped

- File: `src/simulation.ts`. The variable `toolBonus` contains a int that is 1 when the working dwarf has a tool equipped. 0 when not. This int gets added to the resource calculation.
