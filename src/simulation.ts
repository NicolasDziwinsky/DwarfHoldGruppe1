import type {
  ColonyState,
  ExpeditionResult,
  CraftingRecipe,
  CraftingTask,
  Dwarf,
  JobType,
  ResourceKey,
  Resources,
} from "./types";

export const production: Record<Exclude<JobType, null>, Partial<Resources>> = {
  woodcutting: { wood: 3 }, mining: { stone: 2 }, farming: { food: 4 },
};

export function advanceDay(state: ColonyState): ColonyState {
  const resources = { ...state.resources };

  // Each dwarf produces resources based on their assignment
  state.dwarves.forEach((dwarf) => {
    // Only dwarves actually at their job produce (not crafting, not travelling)
    if (!dwarf.assignment || dwarf.status !== "working") return;

    const output = production[dwarf.assignment];
    const toolBonus = dwarf.toolEquipped ? 1 : 0;

    if (state.hungry) {
      Object.entries(output).forEach(([resource, amount]) => {
      resources[resource as keyof Resources] += (Math.floor(amount*0.5) ?? 0) + toolBonus;
    });
    } else {
    Object.entries(output).forEach(([resource, amount]) => {
      resources[resource as keyof Resources] += (amount ?? 0) + toolBonus;
    });

  }});

  


  // Crafting: every task loses one day. Finished tasks pay out their
  // rewards and free their dwarf again.
  const craftingTasks: CraftingTask[] = [];
  const finishedCrafters = new Set<string>();

  state.craftingTasks.forEach((task) => {
    const daysRemaining = task.daysRemaining - 1;

    if (daysRemaining > 0) {
      craftingTasks.push({ ...task, daysRemaining });
      return;
    }

    Object.entries(task.recipe.rewards).forEach(([resource, amount]) => {
      resources[resource as ResourceKey] += amount ?? 0;
    });
    finishedCrafters.add(task.dwarfId);
  });

  const dwarves = state.dwarves.map((dwarf) =>
    finishedCrafters.has(dwarf.id)
      ? { ...dwarf, status: "idle" as const, assignment: null }
      : dwarf,
  );

  // Each dwarf consumes 1 food per day
  resources.food = Math.max(0, resources.food - state.dwarves.length);

  const hungry = resources.food === 0;

  console.log("Hungry state:", state.hungry);
  
  return {
    ...state,
    day: state.day + 1,
    resources,
    hungry,
    dwarves,
    craftingTasks,
  };
}

/** A dwarf can take on new work only while idle or on a local job. */
export const isAvailable = (dwarf: Dwarf) =>
  dwarf.status === "idle" || dwarf.status === "working";

/** Resources the stores are short of for this recipe (empty = affordable). */
export function missingResources(
  resources: Resources,
  recipe: CraftingRecipe,
): ResourceKey[] {
  return (Object.entries(recipe.requiredResources) as [ResourceKey, number][])
    .filter(([resource, amount]) => resources[resource] < amount)
    .map(([resource]) => resource);
}

// ---- Expeditions -------------------------------------------------------

/** Puts the dwarf on the road. Does nothing if they are not available. */
export function startExpedition(
  state: ColonyState,
  dwarfId: string,
  destination: string,
): ColonyState {
  const dwarf = state.dwarves.find((item) => item.id === dwarfId);
  if (!dwarf || !isAvailable(dwarf)) return state;

  return {
    ...state,
    dwarves: state.dwarves.map((item) =>
      item.id === dwarfId
        ? { ...item, status: "expedition", travellingTo: destination }
        : item,
    ),
  };
}

/** Brings a travelling dwarf home, back to their job (or idle). */
function returnHome(state: ColonyState, dwarfId: string): Dwarf[] {
  return state.dwarves.map((item) =>
    item.id === dwarfId && item.status === "expedition"
      ? {
          ...item,
          status: item.assignment ? "working" : "idle",
          travellingTo: undefined,
        }
      : item,
  );
}

/**
 * Successful return. Rewards are paid only if the dwarf is really on this
 * expedition and the expedition id has not been paid before.
 */
export function completeExpedition(
  state: ColonyState,
  dwarfId: string,
  result: ExpeditionResult,
): ColonyState {
  const dwarf = state.dwarves.find((item) => item.id === dwarfId);
  if (dwarf?.status !== "expedition") return state;

  const alreadyPaid = state.completedExpeditions.includes(result.expeditionId);
  const resources = { ...state.resources };

  if (!alreadyPaid) {
    Object.entries(result.rewards ?? {}).forEach(([key, amount]) => {
      // Ignore anything that is not a known resource or a whole number >= 0
      if (key in resources && Number.isInteger(amount) && amount >= 0) {
        resources[key as ResourceKey] += amount;
      }
    });
  }

  return {
    ...state,
    resources,
    dwarves: returnHome(state, dwarfId),
    completedExpeditions: alreadyPaid
      ? state.completedExpeditions
      : [...state.completedExpeditions, result.expeditionId],
  };
}

/** Failed or timed-out request: the dwarf comes home, nothing is paid. */
export function failExpedition(
  state: ColonyState,
  dwarfId: string,
): ColonyState {
  return { ...state, dwarves: returnHome(state, dwarfId) };
}

export const destinationLabel = (destination: string) =>
  destination.replaceAll("-", " ");

export const jobLabel = (job: JobType) => job ? ({ 
  woodcutting: "Woodcutting", 
  mining: "Deep Mining", 
  farming: "Mushroom Farm" 
}[job]) : "Unassigned";
