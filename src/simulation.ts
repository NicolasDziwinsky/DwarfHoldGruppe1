import type {
  ColonyState,
  ExpeditionResult,
  CraftingRecipe,
  CraftingTask,
  Resident,
  JobType,
  ResourceKey,
  Resources,
} from "./types";

export const production: Record<Exclude<JobType, null>, Partial<Resources>> = {
  woodcutting: { wood: 3 }, mining: { stone: 2 }, farming: { food: 4 },
};

export const MOLE_BEAST_MINING_OUTPUT = 5;
export const HAUNTED_MANSION_WEAPON_THRESHOLD = 3;

export const MOLE_BEAST_RESIDENT: Resident = {
  id: "mole-beast-1",
  name: "Pebble",
  title: "Crystal Delver",
  icon: "🦦",
  species: "mole-beast",
  assignment: null,
  status: "idle",
  specialty: "mining",
};

export function residentOutput(
  resident: Resident,
  hungry = false,
): Partial<Resources> {
  if (!resident.assignment || resident.status !== "working") return {};

  const dwarfOutput = production[resident.assignment];
  let output = dwarfOutput;

  if (
    resident.species === "mole-beast" &&
    resident.assignment === "mining"
  ) {
    output = { stone: MOLE_BEAST_MINING_OUTPUT };
  }

  const toolBonus = resident.toolEquipped ? 1 : 0;
  const result: Partial<Resources> = {};

  Object.entries(output).forEach(([resource, amount]) => {
    const base = amount ?? 0;
    result[resource as ResourceKey] =
      (hungry ? Math.floor(base * 0.5) : base) + toolBonus;
  });

  return result;
}

export function canCraft(
  resident: Resident,
  recipe: CraftingRecipe,
): boolean {
  return (
    isAvailable(resident) &&
    recipe.eligibleSpecies.includes(resident.species)
  );
}

export function advanceDay(state: ColonyState): ColonyState {
  const resources = { ...state.resources };

  state.dwarves.forEach((resident) => {
    Object.entries(residentOutput(resident, state.hungry)).forEach(
      ([resource, amount]) => {
        resources[resource as ResourceKey] += amount ?? 0;
      },
    );
  });

  


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
export const isAvailable = (dwarf: Resident) =>
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
function returnHome(state: ColonyState, dwarfId: string): Resident[] {
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
  let dwarves = returnHome(state, dwarfId);
  let crystalCaveResidentJoined = state.crystalCaveResidentJoined;

  if (!alreadyPaid) {
    const rewards =
      result.destination === "haunted-mansion"
        ? { wood: 50, stone: 50 }
        : result.rewards ?? {};
    Object.entries(rewards).forEach(([key, amount]) => {
      // Ignore anything that is not a known resource or a whole number >= 0
      if (key in resources && Number.isInteger(amount) && amount >= 0) {
        resources[key as ResourceKey] += amount;
      }
    });

    if (result.destination === "haunted-mansion") {
      if (resources.swords < HAUNTED_MANSION_WEAPON_THRESHOLD) {
        resources.wood -= Math.floor(resources.wood / 2);
        resources.stone -= Math.floor(resources.stone / 2);
        resources.food -= Math.floor(resources.food / 2);
      }
      resources.swords = Math.max(0, resources.swords - 1);
    }
  }

  if (
    result.destination === "crystal-cave" &&
    !crystalCaveResidentJoined &&
    !dwarves.some((resident) => resident.species === "mole-beast")
  ) {
    dwarves = [...dwarves, { ...MOLE_BEAST_RESIDENT }];
    crystalCaveResidentJoined = true;
  }

  return {
    ...state,
    resources,
    dwarves,
    crystalCaveResidentJoined,
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

export function hauntedMansionAttackMessage(swords: number): string {
  if (swords >= HAUNTED_MANSION_WEAPON_THRESHOLD) {
    return "Stonehome successfully defended itself against the hostile force. One sword was lost.";
  }

  return swords > 0
    ? "The hostile force looted half of Stonehome's stored timber, stone, and rations, and took one sword."
    : "The hostile force looted half of Stonehome's stored timber, stone, and rations. The sword stores were already empty.";
}

export const jobLabel = (job: JobType) => job ? ({ 
  woodcutting: "Woodcutting", 
  mining: "Deep Mining", 
  farming: "Mushroom Farm" 
}[job]) : "Unassigned";
