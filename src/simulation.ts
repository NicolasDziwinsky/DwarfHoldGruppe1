import type {
  ColonyState,
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
    if (!dwarf.assignment || dwarf.status === "crafting") return;

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

export const jobLabel = (job: JobType) => job ? ({ 
  woodcutting: "Woodcutting", 
  mining: "Deep Mining", 
  farming: "Mushroom Farm" 
}[job]) : "Unassigned";
