import { describe, expect, it } from "vitest";
import {
  advanceDay,
  canCraft,
  completeExpedition,
  failExpedition,
  startExpedition,
} from "./simulation";
import type { ColonyState } from "./types";
describe("colony simulation", () => {
  it("produces assigned resources and feeds the company", () => {
    const state: ColonyState = { day: 1, resources: { wood: 0, stone: 0, food: 5, tools: 0, swords: 0 }, dwarves: [{ id: "d1", name: "Brom", title: "", icon: "", species: "dwarf", assignment: "woodcutting", status: "working" }], hungry: false, craftingTasks: [], completedExpeditions: [], crystalCaveResidentJoined: false };
    expect(advanceDay(state)).toMatchObject({ day: 2, resources: { wood: 3, food: 4 } });
    expect(state.resources.wood).toBe(0);
  });

  it("gives a mole-beast 5 stone while mining", () => {
    const state: ColonyState = {
      day: 1,
      resources: { wood: 0, stone: 0, food: 10, tools: 0, swords: 0 },
      dwarves: [{
        id: "mole-1",
        name: "Pebble",
        title: "Crystal Delver",
        icon: "🦦",
        species: "mole-beast",
        assignment: "mining",
        status: "working",
        specialty: "mining",
      }],
      hungry: false,
      craftingTasks: [],
      completedExpeditions: [],
      crystalCaveResidentJoined: true,
    };

    expect(advanceDay(state).resources.stone).toBe(5);
  });
});

describe("crafting", () => {
  const recipe = {
    name: "Iron Tool",
    icon: "⚒️",
    requiredResources: { wood: 3, stone: 2 },
    rewards: { tools: 1 },
    daysToComplete: 2,
    eligibleSpecies: ["dwarf"] as ("dwarf" | "mole-beast")[],
  };
  const state: ColonyState = {
    day: 1,
    resources: { wood: 0, stone: 0, food: 10, tools: 0, swords: 0 },
    dwarves: [{ id: "d1", name: "Brom", title: "", icon: "", species: "dwarf", assignment: null, status: "crafting" }],
    hungry: false,
    craftingTasks: [{ dwarfId: "d1", recipe, daysRemaining: 2 }],
    completedExpeditions: [],
    crystalCaveResidentJoined: false,
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
    dwarves: [{ id: "d1", name: "Brom", title: "", icon: "", species: "dwarf", assignment: "mining", status: "working" }],
    hungry: false,
    craftingTasks: [],
    completedExpeditions: [],
    crystalCaveResidentJoined: false,
  };
  const result = { expeditionId: "exp-1", destination: "old-mine", status: "completed" as const, rewards: { stone: 8 }, message: "" };

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

  it("adds Pebble after the first successful Crystal Cave expedition", () => {
    const crystalResult = {
      expeditionId: "exp-crystal",
      destination: "crystal-cave",
      status: "completed" as const,
      rewards: { stone: 8, tools: 1 },
      message: "Crystal found",
    };
    const away = startExpedition(home, "d1", "crystal-cave");
    const joined = completeExpedition(away, "d1", crystalResult);

    expect(joined.crystalCaveResidentJoined).toBe(true);
    expect(joined.dwarves.filter((resident) =>
      resident.species === "mole-beast",
    )).toHaveLength(1);
    expect(joined.dwarves.find((resident) =>
      resident.species === "mole-beast",
    )?.name).toBe("Pebble");
  });

  it("does not add Pebble twice or for an old-mine success", () => {
    const crystalResult = {
      expeditionId: "exp-crystal",
      destination: "crystal-cave",
      status: "completed" as const,
      rewards: { stone: 8 },
      message: "",
    };
    const joined = completeExpedition(
      startExpedition(home, "d1", "crystal-cave"),
      "d1",
      crystalResult,
    );
    const repeated = completeExpedition(
      startExpedition(joined, "d1", "crystal-cave"),
      "d1",
      crystalResult,
    );

    expect(repeated.dwarves.filter((resident) =>
      resident.species === "mole-beast",
    )).toHaveLength(1);

    const noJoin = completeExpedition(
      startExpedition(home, "d1", "old-mine"),
      "d1",
      result,
    );
    expect(noJoin.crystalCaveResidentJoined).toBe(false);
  });

  it("adds Pebble when the Crystal Cave result ID was already recorded", () => {
    const crystalResult = {
      expeditionId: "exp-already-paid",
      destination: "crystal-cave",
      status: "completed" as const,
      rewards: { stone: 8 },
      message: "",
    };
    const existing = {
      ...home,
      completedExpeditions: ["exp-already-paid"],
    };

    const joined = completeExpedition(
      startExpedition(existing, "d1", "crystal-cave"),
      "d1",
      crystalResult,
    );

    expect(joined.resources.stone).toBe(home.resources.stone);
    expect(joined.crystalCaveResidentJoined).toBe(true);
    expect(joined.dwarves.filter((resident) =>
      resident.species === "mole-beast",
    )).toHaveLength(1);
  });
});

describe("resident crafting eligibility", () => {
  const dwarfRecipe = {
    name: "Iron Tool",
    icon: "⚒️",
    requiredResources: { wood: 3, stone: 2 },
    rewards: { tools: 1 },
    daysToComplete: 5,
    eligibleSpecies: ["dwarf"] as ("dwarf" | "mole-beast")[],
  };
  const moleRecipe = {
    name: "Crystal Pick",
    icon: "⛏️",
    requiredResources: { stone: 6 },
    rewards: { tools: 1 },
    daysToComplete: 3,
    eligibleSpecies: ["mole-beast"] as ("dwarf" | "mole-beast")[],
  };

  const dwarf = {
    id: "d1", name: "Brom", title: "", icon: "🧔",
    species: "dwarf" as const, assignment: null, status: "idle" as const,
  };
  const mole = {
    id: "mole-1", name: "Pebble", title: "", icon: "🦦",
    species: "mole-beast" as const, assignment: null, status: "idle" as const,
  };

  it("limits existing forge recipes to dwarves", () => {
    expect(canCraft(dwarf, dwarfRecipe)).toBe(true);
    expect(canCraft(mole, dwarfRecipe)).toBe(false);
  });

  it("allows only the mole-beast to craft its Crystal Pick", () => {
    expect(canCraft(mole, moleRecipe)).toBe(true);
    expect(canCraft(dwarf, moleRecipe)).toBe(false);
  });
});
