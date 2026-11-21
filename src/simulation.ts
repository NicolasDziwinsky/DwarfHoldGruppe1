import type { ColonyState, JobType, Resources, Dwarf } from "./types";

export const production: Record<Exclude<JobType, null>, Partial<Resources>> = {
  woodcutting: { wood: 3 }, mining: { stone: 2 }, farming: { food: 4 },
};

export function advanceDay(state: ColonyState): ColonyState {
  const resources = { ...state.resources };

  // Each dwarf produces resources based on their assignment
  state.dwarves.forEach((dwarf) => {
    if (!dwarf.assignment) return;

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

  


  // Each dwarf consumes 1 food per day
  resources.food = Math.max(0, resources.food - state.dwarves.length);

  const hungry = resources.food === 0;

  console.log("Hungry state:", state.hungry);
  
  return { ...state, day: state.day + 1, resources, hungry };
}

export const jobLabel = (job: JobType) => job ? ({ 
  woodcutting: "Woodcutting", 
  mining: "Deep Mining", 
  farming: "Mushroom Farm" 
}[job]) : "Unassigned";
