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

# D5

## Save and restore

Requirement D5 in `REQUIREMENTS.md` requires meaningful colony state to survive a browser refresh, corrupt or incompatible saves to fall back safely, and a clearly communicated policy for active forge or expedition work interrupted by refresh.

The proposed implementation keeps a versioned snapshot in browser `localStorage`. It will not depend on React state surviving a refresh or on the expedition API retaining information for the browser.

### Files and data introduced

The implementation adds a dedicated persistence module:

- `src/state/colonySave.ts`
  - defines the `COLONY_SAVE_KEY` and `COLONY_SAVE_VERSION`,
  - declares the versioned `ColonySave` structure,
  - validates saved colony data,
  - reads JSON from `localStorage`,
  - writes snapshots back to `localStorage`.

`ColonySave` contains:

```ts
interface ColonySave {
  version: typeof COLONY_SAVE_VERSION;
  savedAt: string;
  colony: ColonyState;
  paused: boolean;
  activities: Activity[];
}
```

The save is versioned so future changes to the state shape can be detected rather than loaded as silently incompatible data.

### Provider changes

`src/state/ColonyProvider.tsx` is modified to use a save-aware initializer instead of always starting with `initialState`.

The provider will:

1. Read and parse the saved JSON.
2. Check the save version.
3. Validate the colony state and the other saved fields.
4. Fall back to `initialState`, paused mode off, and the welcome Chronicle entry when no valid save exists.
5. Persist `colony`, `paused`, and `activities` whenever one of these values changes.
6. Save once more on `pagehide` or `beforeunload` so a refresh immediately after a state change is handled.

The provider does **not** restore the temporary request fields:

- `expeditionPending`
- `inFlight`
- API promises
- interval timers

These values describe work owned by the currently mounted React provider. They must be reconstructed or cleared after remount.

### Corrupt and incompatible saves

`readColonySave()` catches unavailable storage or invalid JSON and returns no usable save. `isColonyState()` checks the shape and types of the stored colony before it is accepted.

At minimum, validation checks:

- `day` and `hungry` types,
- the five resource fields,
- arrays for dwarves, crafting tasks and completed expeditions.

A more complete implementation will also validate dwarf fields, crafting recipes and resource values. If the version is unknown or the stored state is invalid, the provider uses a fresh `initialState`.

This policy avoids an application crash and makes a broken browser save recoverable.

### Forge task policy

Forge tasks are meaningful colony state, so they remain in `ColonyState.craftingTasks` and are restored with the save.

For an active forge task:

- required resources remain deducted,
- the assigned dwarf remains `crafting`,
- the recipe and `daysRemaining` remain stored,
- the countdown resumes with the normal interval after remount,
- the reward is paid by `advanceDay()` when the task reaches zero,
- the dwarf then becomes `idle`.

Refreshing does not refund resources or cancel a forge task.

The reason for this rule is that all information required to calculate the task already exists in the saved `ColonyState`. The same `advanceDay()` logic in `src/simulation.ts` can therefore finish the task consistently.

The Forge page will show this policy near the "Work in progress" panel:

> Work in progress is saved automatically. Refreshing the hold does not refund materials or cancel the task.

This makes the interruption behavior visible to the player.

### Expedition policy

Expeditions are not treated as resumable after refresh in this implementation.

The provider's save loader treats every saved dwarf with `status: "expedition"` as interrupted:

- the dwarf's status changes back to `working` if it has an assignment,
- the dwarf becomes `idle` if it has no assignment,
- `travellingTo` is removed,
- no resources are added,
- no expedition reward is paid,
- a warning is added to the Chronicle.

The warning states that the expedition was interrupted by a refresh and the dwarf returned empty-handed.

The policy is deliberately conservative because a refresh cannot prove whether the API result succeeded before the browser was unloaded. It also avoids:

- paying a reward twice,
- leaving a dwarf stranded in `expedition`,
- replaying the same API request after remount,
- and accepting an unknown server response as successful.

The existing `failExpedition()` behavior in `src/simulation.ts` provides the same local dwarf-return result for an in-progress request that fails in normal operation.

The Colony page will explain this behavior beside the Expedition panel:

> Expeditions are in progress until their result reaches the hold. Refreshing during travel returns the scout home empty-handed.

### Changed UI files

The save policy becomes visible in existing UI files:

- `src/pages/ForgePage.tsx`
  - adds a visible message explaining that active forge tasks survive refresh.
- `src/pages/ColonyPage.tsx`
  - adds a visible message explaining that interrupted expeditions fail and return no reward.
- `src/state/ColonyProvider.tsx`
  - restores or repairs saved state and adds Chronicle warnings for interrupted expeditions.

### State excluded from the save

The following are not saved as active work:

- `expeditionPending`,
- `inFlight`,
- the in-browser fetch promise,
- the interval timer,
- temporary UI selections such as the selected dwarf and destination.

The provider can reconstruct the meaningful persistent state. Temporary UI and request state starts fresh after remount.

### Expected behavior

| Situation | Result |
| --- | --- |
| Refresh with no save | Start with `initialState` |
| Refresh with a valid save | Restore `colony`, pause state and Chronicle |
| Refresh with an old or corrupt save | Fall back safely to `initialState` |
| Refresh during forging | Keep materials deducted and continue the task |
| Refresh after forging completes | Restore its already granted reward and idle dwarf |
| Refresh during an expedition | Return the dwarf locally with no reward |
| Refresh after an expedition result reached the provider | Restore the paid result and completed expedition ID normally |
| Navigate between Colony and Forge | Keep the provider state; do not reset or reload from `initialState` |


# D6

## A new species joins Stonehome

Requirement D6 in `REQUIREMENTS.md` requires one successful expedition to introduce a recognizably different non-dwarf resident. The chosen resident is **Pebble**, a mole-beast Crystal Delver.

### Unlock by Crystal Cave

The first successful expedition to `crystal-cave` unlocks Pebble.

The unlock is stored in `ColonyState.crystalCaveResidentJoined` in `src/types.ts`. The default value is `false`. It becomes `true` only in `completeExpedition()` after:

- the dwarf is still travelling,
- the expedition ID has not already been paid,
- the expedition result has `destination: "crystal-cave"`.

`completeExpedition()` is immutable: it builds a new resident array instead of mutating `state.dwarves`.

The expedition ID remains protected by `ColonyState.completedExpeditions`, and the unlock also checks for an existing mole-beast. Repeated or duplicate Crystal Cave results therefore do not add Pebble twice.

The unlock is calculated outside the reward-payment branch. This keeps a successful Crystal Cave result from losing its one-time resident join simply because its expedition ID has already been recorded.

The successful API response includes `destination` in `server/index.js`, so the colony can determine whether the unlocked expedition was Crystal Cave. After the result, the provider adds a good Chronicle entry explaining that Pebble has joined Stonehome.

For compatibility with an older API process, `src/api.ts` also attaches the selected request destination to the parsed result. This ensures Crystal Cave is recognized even if the server response predates the destination field.

### Unique production

Pebble is a member of `ResidentSpecies = "dwarf" | "mole-beast"` in `src/types.ts`.

The shared `Resident` type is used for both dwarves and the mole-beast. Colony, expedition, crafting and roster code operate on residents rather than assuming every character is a dwarf.

Species-specific production is implemented in `src/simulation.ts`:

- Dwarf miners produce 2 stone per day.
- Pebble produces 5 stone per day while assigned to mining.
- An equipped tool adds 1 stone to compatible working output.
- Hungry behavior uses the existing deterministic 50-percent production rule.
- Travelling or crafting residents produce no local resources.
- Every resident consumes 1 food per day.

The `residentOutput(resident, hungry)` helper is shared by daily simulation and the Colony page's daily-output preview. This prevents the preview and actual day from disagreeing.

Pebble is limited to `mining` or `null` assignments. The roster only offers those choices for the mole-beast, and `assignDwarf()` repeats the restriction against the latest provider state.

### Unique crafting capability

Crafting recipes now include `eligibleSpecies` in `src/types.ts`.

The rules in `src/pages/ForgePage.tsx` are:

| Recipe | Eligible species |
| --- | --- |
| Iron Tool | Dwarves |
| Sword | Dwarves |
| Crystal Pick | Mole-beast |

Crystal Pick costs 6 stone, takes 3 days, and rewards 1 tool.

The Smith dropdown only lists residents eligible for that recipe. `craftTool()` repeats `canCraft()` against the latest state, preventing stale UI or fast-click behavior from starting an invalid task.

A crafting resident:

- becomes `crafting`,
- loses its local assignment,
- cannot be assigned work or sent on an expedition,
- remains visible in the crafting queue,
- consumes 1 food per day,
- becomes `idle` when the task finishes.

### Visible species differences

The roster in `src/components/DwarfRoster.tsx` now shows:

- a distinct species label: `MOLE-BEAST`,
- Pebble's Crystal Delver title,
- Pebble's mole icon,
- `Crystal Delving: +5 stone/day while mining`,
- normal status, availability, assignment and tool controls.

The Colony page's Mining card communicates the difference explicitly:

- Dwarfs: +2 stone/day
- Mole-beasts: +5 stone/day

The Forge page only shows eligible Smith choices for each recipe.

### General resident rules

The mole-beast uses the same systems as dwarves:

- `isAvailable()` controls assignments, forging and expeditions,
- `advanceDay()` applies food consumption and hunger,
- tools use the existing inventory and equipped flags,
- crafting tasks identify residents by their ID,
- travelling residents return by `returnHome()`/`failExpedition()`,
- browser saves contain resident state.

### Persistence

The save format was updated to version 2 in `src/state/colonySave.ts`.

The save validator now checks:

- `crystalCaveResidentJoined`,
- resident species,
- resident names and IDs,
- supported resident statuses,
- the invariant that joined is true if and only if exactly one mole-beast is in the resident array.

An old, malformed or inconsistent save falls back to `initialState`.

When Pebble is restored:

- the unlocked resident remains in the colony,
- assignment and tool state remain restored,
- crafting tasks remain resumable,
- expedition state is handled by the existing interrupted-expedition policy.

### Tests

The focused simulation tests cover:

- Pebble producing 5 stone while mining,
- Crystal Cave success adding exactly one mole-beast,
- duplicate Crystal Cave completion not duplicating Pebble,
- Old Mine success not unlocking Pebble,
- dwarf-only forging recipes,
- the mole-beast-only Crystal Pick recipe.

# D7

## Haunted Mansion and colony defense

The additional destination is **Haunted Mansion** (`haunted-mansion`). A successful expedition grants 50 timber (`wood`) and 50 stone, then causes the hostile force following the scout to attack Stonehome.

### Rewards and attack resolution

The API outcome in `server/index.js` supplies the Haunted Mansion reward and narrative. `completeExpedition()` in `src/simulation.ts` applies the fixed 50 timber and 50 stone reward before resolving the attack. This destination-specific reward is applied only when the expedition succeeds and its expedition ID has not already been paid.

The defense threshold is `HAUNTED_MANSION_WEAPON_THRESHOLD` (3 swords):

| Swords when the attack is resolved | Outcome |
| --- | --- |
| 3 or more | Stonehome defends itself; no timber, stone, or rations are looted. |
| Fewer than 3 | Attackers take half of the stored timber, stone, and rations, rounded down for each resource. |

Every successful attack consumes one sword. When the store has no swords, the count remains at zero rather than becoming negative. The Chronicle reports either the successful defense or the raid, including the sword cost or empty sword store.

### Failure and duplicate protection

Only `completeExpedition()` resolves the attack. A failed or timed-out request uses `failExpedition()`, which returns the dwarf home without paying rewards or triggering the attack. `completedExpeditions` prevents a repeated result ID from paying rewards or resolving another attack.

### UI and tests

The Expedition panel offers Haunted Mansion and explains its reward, defense threshold, raid, and sword cost. The API success message notes that a hostile force followed the scout; the provider adds the attack outcome to the Chronicle.

The focused tests in `src/simulation.test.ts` cover:

- the 50 timber and 50 stone reward and defense at the 3-sword threshold,
- a below-threshold raid using post-reward stores and consuming one sword,
- an empty sword store remaining non-negative,
- duplicate result IDs not paying or attacking again,
- a failed Haunted Mansion expedition leaving resources unchanged.

### Running API processes

The API reads `server/index.js` when Node starts and does not automatically reload it when that file changes. If the running API returns *"That destination is not on the hold map"* despite the route being present in source, restart `npm run dev` so the API process loads the updated destination table.



# UI IMPROVEMENTS

## Day progress bar

A bar above the resource bar fills up as the current day passes. It is shown on both the Colony and Forge pages.

- File: `src/components/DayProgress.tsx`, rendered by `src/pages/Layout.tsx`.
- While the game is paused, the bar freezes, turns grey and its label changes from **NEXT DAY** to **PAUSED**.
- The bar has `role="progressbar"` and updates `aria-valuenow`, so assistive technology can read it.

### Day timer

The timer is in `src/state/ColonyProvider.tsx`:

1. Every 50 ms (`CLOCK_TICK_MS`), the elapsed time divided by the day length is added to the `dayProgress` ref (0 to 1).
2. When the progress reaches 1, `advanceDay` runs and the progress starts over, keeping any remainder.
3. At most one day passes per tick. A throttled background tab therefore cannot skip several days at once.

Pausing or changing speed keeps the progress of the current day. Before this change, pausing restarted the day.

### Decision: no React state for the progress

The progress is stored in a ref and exposed as `getDayProgress()`. `DayProgress` reads it with `requestAnimationFrame` and writes it directly to the DOM.

**Why:** if the progress were context state, every component using the colony context would re-render on each update.

**Trade-off:** the bar bypasses React's normal rendering for this one element.

## Speed button

A button beside the progress bar switches between two speeds:

| Speed | Day length | Button |
| --- | --- | --- |
| Normal (`NORMAL_DAY_MS`) | 8 seconds | **▶ 1× · 8s / day** |
| Fast (`FAST_DAY_MS`) | 4 seconds | **⏩ 2× · 4s / day** (filled amber) |

- `spedUp`, `dayDurationMs` and `toggleSpeedUp` are available through the colony context (`src/state/ColonyContext.ts`).
- The footer shows the current day length instead of a fixed text.
- Expeditions do not get faster, because they wait for a real server request. At 2×, more days can pass during a trip.
- The speed is part of the save (`spedUp` in `ColonySave`, save version 3), so it survives a refresh. The progress of the current day is not saved, so a refresh starts with an empty bar.

## Hover and click styling

All styles are at the end of `src/styles.css`.

| Element | Hover | Click |
| --- | --- | --- |
| Buttons | Brighter; Pause and the inactive speed button also get a background and border color | Darker and slightly pressed in |
| Dropdowns | Amber border and lighter background | Brighter border and darker background |
| Navigation links | Lighter background and text | Darker background and slightly pressed in |
| Resource, job and dwarf cards | Lighter background | None, because they are not clickable |

- Disabled controls do not react to hover or click.
- The red hungry Rations tile keeps its warning color on hover.
- Buttons, dropdowns and navigation links show an amber outline on keyboard focus.
- With `prefers-reduced-motion`, the press movement and control transitions are turned off.

## Verification

`npm run build` and the 16 existing simulation tests pass. There are no automated tests for the timer, speed button, progress bar or styling, so these need to be checked by hand:

- The bar fills in about 8 seconds at 1× and 4 seconds at 2×, and the day number goes up when it is full.
- Pausing or changing speed mid-day does not reset the bar.
- Hover, click and keyboard focus are visible on all controls, while disabled controls do not react.
