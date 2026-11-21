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

# D3

## Crafting as colony work

Crafting is not instant. A recipe needs **materials**, a free **dwarf** and **time**. While the dwarf works at the forge, they cannot do anything else. When the work is done, the reward goes into the stores and the dwarf is idle again.

### Data model

- **`CraftingRecipe`** (`src/types.ts`) has a `name`, an `icon`, `requiredResources`, `rewards` and `daysToComplete`. The recipes are defined in `src/pages/ForgePage.tsx` in the `recipes` list. There are currently two:

  | Recipe    | Cost              | Reward    | Time   |
  | --------- | ----------------- | --------- | ------ |
  | Iron Tool | 3 timber, 2 stone | 1 tool    | 5 days |
  | Sword     | 8 timber, 5 stone | 1 sword   | 5 days |

- **`CraftingTask`** (`src/types.ts`) is one job at the forge in progress. It holds the `dwarfId`, the `recipe` and the `daysRemaining`.
- **`ColonyState.craftingTasks`** holds every active task. It starts empty.
- **`DwarfStatus`** has a new value, `"crafting"`.

### Starting a task: `craftTool(dwarfId, recipe)`

The logic lives in `src/state/ColonyProvider.tsx`. Components can use it through the colony context.

1. **The dwarf must be eligible.** Only dwarves who are `idle` or `working` on a local job can craft. This is checked by `isAvailable(dwarf)` in `src/simulation.ts`. A dwarf who is crafting or on an expedition is refused.
2. **The materials must be in the stores.** `missingResources(resources, recipe)` in `src/simulation.ts` checks *every* resource the recipe needs, not only timber.
3. If either check fails, nothing changes. The Chronicle gets a warning instead, for example *"The forge needs more timber and stone."* or *"Yrsa Flintbraid is busy and cannot work the forge."*
4. If both checks pass, **one** state update does all of this:
   - takes the recipe's materials out of the stores,
   - sets the dwarf's status to `crafting` and clears their job (`assignment: null`),
   - adds a new task with `daysRemaining = recipe.daysToComplete`.
5. The Chronicle logs the start, for example *"Bromli Copperkeg begins forging a Sword (5 days)."*

**Invalid attempts change nothing.** This is checked at two levels:

- before the update, so the player gets a warning, and
- again inside the `setColony` updater against the **latest** state.

The second check matters when two clicks happen before React re-renders. Without it, a fast double-click could start two tasks or spend materials that are already gone. With it, the update returns the unchanged state. Workers and resources change together in a single update, so they cannot get out of sync.

### Daily progress: `advanceDay`

On every tick, `advanceDay` in `src/simulation.ts` handles crafting:

- Each task's `daysRemaining` goes down by 1.
- When a task reaches 0, it is finished:
  - the recipe's `rewards` are added to the stores, for example `tools + 1` or `swords + 1`,
  - the dwarf's status is set back to `idle`,
  - the task is removed from `craftingTasks`.
- Crafting dwarves produce no resources from jobs. They are skipped in the production step.
- Crafting dwarves still eat 1 food per day, like every other dwarf.
- Hunger does not slow crafting down.

Rewards are paid in the same pure function that removes the task, so a task can pay out **only once**. `advanceDay` returns a new state and never changes the old one.

A small effect in `ColonyProvider` watches `craftingTasks`. When a task disappears from the list, it logs *"… finished forging a Sword."* in the Chronicle. A task only leaves the list when it finishes, so this is reliable.

### A crafting dwarf can't be used for anything else

Every action that uses a dwarf checks for the `crafting` status. The check happens both in the UI and in the provider function:

| Action            | UI                                                 | Provider guard                               |
| ----------------- | -------------------------------------------------- | -------------------------------------------- |
| Change job        | Job dropdown disabled in the roster                | `assignDwarf` ignores busy dwarves           |
| Equip/return tool | Tool button disabled in the roster                 | `toggleTool` ignores crafting dwarves        |
| Send expedition   | Dwarf greyed out in the picker, button disabled    | `sendExpedition` refuses and logs a warning  |
| Start crafting    | Dwarf not listed in the "Smith" dropdown           | `craftTool` refuses and logs a warning       |

The same availability rule also stops a dwarf who is already on an expedition from being sent out again.

### How the UI shows crafting

**Forge page** (`src/pages/ForgePage.tsx`)

- **A card for each recipe**, with:
  - a **Smith** dropdown listing only the free dwarves (it says "No dwarf is free" if there are none),
  - the time needed, the cost and the reward,
  - a **Start forging** button. It is disabled and reads *"Not enough materials"* when the stores are short.
- **Costs and rewards are drawn from the recipe data.** The small `ResourceList` component renders any `Partial<Resources>`, for example *"8 🪵 + 5 🪨 → 1 ⚔️"*. A new recipe or a new resource therefore appears without changing the card. Icons and labels come from one shared map, `resourceDetails` in `src/resources.ts`, which the resource bar uses too.
- **The "Work in progress" panel** lists every active task: who is crafting, what they are crafting, how many days are left, and a progress bar.

**Dwarf roster** (`src/components/DwarfRoster.tsx`)

- The dwarf's status tag reads **CRAFTING**, and the status dot on their portrait turns orange.
- An extra tag shows the recipe and the time left, for example **"🔨 Sword · 3d left"**.
- The job dropdown and the tool button are locked.

Styles: `.status.crafting`, `.portrait i.crafting`, `.forge-stack`, `.forge .crafter` and `.forge-queue` in `src/styles.css`.

### Resource types

- `Resources` now has a `swords` count, and the resource bar shows it with ⚔️.
- `ResourceKey` is now `keyof Resources` instead of its own separate list. When a resource is added, TypeScript points out every place that still needs updating. This is how the missing `swords` values in the daily-output preview and the tests were found.

### Tests

`src/simulation.test.ts` has a `crafting` test group:

- a task counts down without paying out early, and the dwarf stays `crafting`,
- after the last day, the reward is in the stores, the task is gone, and the dwarf is `idle`.

# D4

## Resilient expeditions

A dwarf can be sent to a destination. While they travel, they are unavailable for anything else and produce nothing. The rewards are applied **exactly once** after a successful trip. A failed or timed-out request brings the dwarf home and pays nothing. Fast or repeated clicks cannot put a dwarf in two places at once.

### Data model

- **`Dwarf.travellingTo?: string`** (`src/types.ts`) holds the destination while the dwarf is away. It is cleared when they come back.
- **`ColonyState.completedExpeditions: string[]`** holds the IDs of every expedition that has already paid out, for example `"exp-17"`. It is used to stop the same result from being paid twice.

### State logic: pure functions in `src/simulation.ts`

All expedition state changes are pure functions. Each one takes a state and returns a new state, the same way `advanceDay` works. This keeps the rules in one place and makes them easy to test.

| Function | What it does | When it does nothing |
| --- | --- | --- |
| `startExpedition(state, dwarfId, destination)` | Sets the dwarf's status to `expedition` and sets `travellingTo`. | The dwarf is not available, meaning not `idle` or `working`. This covers a dwarf who is crafting or already travelling. |
| `completeExpedition(state, dwarfId, result)` | Adds the rewards, brings the dwarf home and stores `result.expeditionId` in `completedExpeditions`. | The dwarf is not on an expedition. If the ID was already paid, the dwarf still comes home but **no rewards** are added. |
| `failExpedition(state, dwarfId)` | Brings the dwarf home. **No rewards.** | — |

"Home" means the dwarf goes back to their job (`working`) if they still have an assignment, and to `idle` otherwise.

`completeExpedition` also checks the server's rewards before using them. Only known resource keys with whole numbers of at least 0 are added, so a broken response cannot create invalid resources.

### Sending an expedition: `sendExpedition` in `src/state/ColonyProvider.tsx`

1. If the dwarf is busy, the function stops and the Chronicle logs *"… is busy and cannot leave the hold."*
2. The dwarf is added to `inFlight`, a `useRef` set. If a request for this dwarf is already running, the function stops.
3. `startExpedition` sends the dwarf out.
4. It calls the API with `beginExpedition` (`src/api.ts`):
   - **On success:** `completeExpedition`, and the server's message is logged as a good event.
   - **On any error:** `failExpedition`, and the Chronicle logs *"… returned empty-handed: <reason>"*.
5. In a `finally` block, the dwarf is taken out of `inFlight` and the pending flag is cleared. This happens whatever the outcome.

### Protection against slow or repeated actions

| Problem | Protection |
| --- | --- |
| Double-click before React re-renders | The `inFlight` ref changes immediately. The second click sees the request already running and does nothing. |
| A stale `colony` value in the click handler | `startExpedition` runs inside the `setColony` updater and checks again against the **latest** state. |
| The dwarf got busy before the result came back | `completeExpedition` only pays if the dwarf is still on an expedition. |
| The same result arrives twice | The `completedExpeditions` ID list stops a second payout. |
| The server hangs | `beginExpedition` gives up after **10 seconds** (`AbortSignal.timeout`). This counts as a failure, so the dwarf comes home. |
| The server is unreachable, or the error response is not JSON | A network error and a body that is not JSON are both turned into a readable error and handled as a failure. |

Because of these checks, a dwarf can never be marked as travelling for ever, and resources are never paid twice.

### Travelling dwarves are unavailable

- `advanceDay` only counts production from dwarves whose status is `working`, so a travelling dwarf produces nothing. Their job is kept, and they go back to it when they return.
- The "Daily Production" preview on the Colony page uses the same rule.
- Travelling dwarves still eat 1 food per day.
- **In the UI** (roster and expedition panel):
  - the job dropdown and the tool button are disabled,
  - the dwarf is greyed out in the "Scout" picker, with their status shown,
  - the Forge's "Smith" dropdown does not list them.
- **In the provider:** `assignDwarf`, `toggleTool`, `craftTool` and `sendExpedition` all refuse dwarves who are not available.

### Team decision: tools travel with the dwarf

An equipped tool **stays with the travelling dwarf**:

- It stays equipped and still counts as owned by that dwarf.
- It gives **no production bonus** while the dwarf is away, because the dwarf produces nothing.
- It **cannot be returned** until the dwarf is home, because the tool button is locked.

**Why:** this is the simplest rule that keeps the inventory consistent. The tool count never changes during a trip, and the player does not have to equip the tool again afterwards. The rule is explained in the interface, in the text below the Expedition panel.

### How the UI shows expeditions

- **Roster:** a travelling dwarf has the status tag **EXPEDITION**, a "🗺️ Old mine" tag with the destination, and the amber status dot on their portrait. Style: `.status.travelling` in `src/styles.css`.
- **Expedition panel:**
  - The button reads *"Beyond the gate…"* while a request is running.
  - It is disabled if the selected scout is not available.
  - The text below the panel explains the rules: away until the request returns, no production, tools travel with the dwarf, a failed trip brings the dwarf back.
- **Chronicle:** logs the departure, the success message, or the failure reason.

### Tests

`src/simulation.test.ts` has an `expeditions` test group:

- a travelling dwarf is unavailable, produces nothing, and cannot be sent out twice,
- rewards are paid exactly once: a repeated completion is ignored, and the same expedition ID is not paid again on a later trip,
- a failed expedition brings the dwarf back to work and leaves the resources unchanged.

**How to check by hand:**

- Send a dwarf to **Blocked Pass**. The server returns 503. The dwarf comes home after about 2 seconds and gets no reward.
- The server can also be slowed down with `?latency=5000`.
