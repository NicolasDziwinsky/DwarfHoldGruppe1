import { describe, expect, it } from "vitest";
import type { ColonyState } from "../types";
import {
  COLONY_SAVE_VERSION,
  parseColonySave,
  type ColonySave,
} from "./colonySave";

function makeSave(colony: Partial<ColonyState> = {}): ColonySave {
  return {
    version: COLONY_SAVE_VERSION,
    savedAt: "2026-11-24T18:00:00.000Z",
    paused: true,
    spedUp: true,
    activities: [{ id: "a", day: 12, message: "Hello" }],
    colony: {
      day: 12,
      resources: { wood: 1, stone: 2, food: 3, tools: 0, swords: 0 },
      dwarves: [
        {
          id: "dwarf-1",
          name: "Bromli",
          title: "Warden",
          icon: "x",
          species: "dwarf",
          assignment: "mining",
          status: "working",
        },
      ],
      hungry: false,
      craftingTasks: [],
      completedExpeditions: ["exp-17"],
      crystalCaveResidentJoined: false,
      ...colony,
    },
  };
}

const parse = (raw: unknown) => parseColonySave(raw, "an import");
const worker = makeSave().colony.dwarves[0];
const task = {
  dwarfId: "dwarf-1",
  daysRemaining: 2,
  recipe: {
    name: "Sword",
    icon: "x",
    requiredResources: { wood: 8 },
    rewards: { swords: 1 },
    daysToComplete: 5,
    eligibleSpecies: ["dwarf" as const],
  },
};

describe("save files", () => {
  it("restores an exported save", () => {
    const save = makeSave({
      dwarves: [{ ...worker, status: "crafting", assignment: null }],
      craftingTasks: [task],
    });
    expect(parse(JSON.parse(JSON.stringify(save)))).toEqual(save);
  });

  it("brings travelling dwarves home with a warning", () => {
    const result = parse(
      makeSave({
        dwarves: [
          { ...worker, status: "expedition", travellingTo: "old-mine" },
        ],
      }),
    );
    expect(result?.colony.dwarves[0].status).toBe("working");
    expect(result?.colony.dwarves[0].travellingTo).toBeUndefined();
    expect(result?.activities[0].message).toContain("an import");
  });

  it.each<[string, unknown]>([
    ["null", null],
    ["an unrelated object", { hello: "world" }],
    ["another version", { ...makeSave(), version: 2 }],
    ["malformed activities", { ...makeSave(), activities: [null] }],
    [
      "negative resources",
      makeSave({ resources: { wood: -1, stone: 0, food: 0, tools: 0, swords: 0 } }),
    ],
    ["duplicate residents", makeSave({ dwarves: [worker, worker] })],
    ["a task without a crafter", makeSave({ craftingTasks: [task] })],
    [
      "a crafter without a task",
      makeSave({ dwarves: [{ ...worker, status: "crafting" }] }),
    ],
  ])("rejects %s", (_name, raw) => {
    expect(parse(raw)).toBeNull();
  });
});
