import { describe, expect, it } from "vitest";
import {
  advanceDay,
  completeExpedition,
  failExpedition,
  startExpedition,
} from "./simulation";
import type { ColonyState } from "./types";
describe("colony simulation", () => {
  it("produces assigned resources and feeds the company", () => {
    const state: ColonyState = { day: 1, resources: { wood: 0, stone: 0, food: 5, tools: 0, swords: 0 }, dwarves: [{ id: "d1", name: "Brom", title: "", icon: "", assignment: "woodcutting", status: "working" }], hungry: false, craftingTasks: [], completedExpeditions: [] };
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
    completedExpeditions: [],
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

describe("expeditions", () => {
  const home: ColonyState = {
    day: 1,
    resources: { wood: 0, stone: 0, food: 10, tools: 0, swords: 0 },
    dwarves: [{ id: "d1", name: "Brom", title: "", icon: "", assignment: "mining", status: "working" }],
    hungry: false,
    craftingTasks: [],
    completedExpeditions: [],
  };
  const result = { expeditionId: "exp-1", status: "completed" as const, rewards: { stone: 8 }, message: "" };

  it("makes the dwarf unavailable and unproductive while travelling", () => {
    const away = startExpedition(home, "d1", "old-mine");
    expect(away.dwarves[0]).toMatchObject({ status: "expedition", travellingTo: "old-mine" });
    expect(advanceDay(away).resources.stone).toBe(0);
    expect(startExpedition(away, "d1", "old-mine")).toBe(away); // can't send twice
  });

  it("pays rewards exactly once and brings the dwarf back to work", () => {
    const back = completeExpedition(startExpedition(home, "d1", "old-mine"), "d1", result);
    expect(back.resources.stone).toBe(8);
    expect(back.dwarves[0].status).toBe("working");
    expect(completeExpedition(back, "d1", result)).toBe(back); // repeat ignored

    const again = completeExpedition(startExpedition(back, "d1", "old-mine"), "d1", result);
    expect(again.resources.stone).toBe(8); // same expedition id is not paid again
  });

  it("brings the dwarf home without rewards on failure", () => {
    const failed = failExpedition(startExpedition(home, "d1", "old-mine"), "d1");
    expect(failed.dwarves[0].status).toBe("working");
    expect(failed.resources).toEqual(home.resources);
  });
});
