import { describe, expect, it } from "vitest";
import { advanceDay } from "./simulation";
import type { ColonyState } from "./types";
describe("colony simulation", () => {
  it("produces assigned resources and feeds the company", () => {
    const state: ColonyState = { day: 1, resources: { wood: 0, stone: 0, food: 5, tools: 0, swords: 0 }, dwarves: [{ id: "d1", name: "Brom", title: "", icon: "", assignment: "woodcutting", status: "working" }], hungry: false, craftingTasks: [] };
    expect(advanceDay(state)).toMatchObject({ day: 2, resources: { wood: 3, food: 4 } });
    expect(state.resources.wood).toBe(0);
  });
});

describe("crafting", () => {
  const recipe = { name: "Iron Tool", icon: "⚒️", requiredResources: { wood: 3, stone: 2 }, rewards: { tools: 1 }, daysToComplete: 2 };
  const state: ColonyState = {
    day: 1,
    resources: { wood: 0, stone: 0, food: 10, tools: 0, swords: 0 },
    dwarves: [{ id: "d1", name: "Brom", title: "", icon: "", assignment: null, status: "crafting" }],
    hungry: false,
    craftingTasks: [{ dwarfId: "d1", recipe, daysRemaining: 2 }],
  };

  it("counts down without rewarding early", () => {
    const next = advanceDay(state);
    expect(next.craftingTasks).toEqual([{ dwarfId: "d1", recipe, daysRemaining: 1 }]);
    expect(next.resources.tools).toBe(0);
    expect(next.dwarves[0].status).toBe("crafting");
  });

  it("awards the reward and frees the dwarf when done", () => {
    const done = advanceDay(advanceDay(state));
    expect(done.craftingTasks).toEqual([]);
    expect(done.resources.tools).toBe(1);
    expect(done.dwarves[0].status).toBe("idle");
  });
});
