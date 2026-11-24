import type { Activity, ColonyState } from "../types";

export const COLONY_SAVE_KEY = "dwarfhold-save";
export const COLONY_SAVE_VERSION = 3;

export interface ColonySave {
  version: typeof COLONY_SAVE_VERSION;
  savedAt: string;
  colony: ColonyState;
  paused: boolean;
  spedUp: boolean;
  activities: Activity[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isColonyState(value: unknown): value is ColonyState {
  if (!isRecord(value)) return false;

  if (
    typeof value.day !== "number" ||
    typeof value.hungry !== "boolean" ||
    typeof value.crystalCaveResidentJoined !== "boolean" ||
    !isRecord(value.resources) ||
    !Array.isArray(value.dwarves) ||
    !Array.isArray(value.craftingTasks) ||
    !Array.isArray(value.completedExpeditions)
  ) {
    return false;
  }

  const resourceKeys = ["wood", "stone", "food", "tools", "swords"];
  if (!resourceKeys.every(
    (key) =>
      typeof (value.resources as Record<string, unknown>)[key] === "number",
  )) return false;

  const residents = value.dwarves as unknown[];
  const validResidents = residents.every((resident) =>
    isRecord(resident) &&
    typeof resident.id === "string" &&
    typeof resident.name === "string" &&
    typeof resident.species === "string" &&
    ["dwarf", "mole-beast"].includes(resident.species) &&
    typeof resident.status === "string",
  );
  if (!validResidents) return false;

  const moleCount = residents.filter(
    (resident) => isRecord(resident) && resident.species === "mole-beast",
  ).length;

  if (value.crystalCaveResidentJoined && moleCount !== 1) return false;
  if (!value.crystalCaveResidentJoined && moleCount !== 0) return false;

  return true;
}

export function saveColony(save: ColonySave): void {
  try {
    localStorage.setItem(COLONY_SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage may be unavailable or full. The live game should still work.
  }
}

export function readColonySave(): unknown {
  try {
    const serialized = localStorage.getItem(COLONY_SAVE_KEY);
    return serialized ? JSON.parse(serialized) : null;
  } catch {
    return null;
  }
}