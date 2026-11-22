import type { Activity, ColonyState } from "../types";

export const COLONY_SAVE_KEY = "dwarfhold-save";
export const COLONY_SAVE_VERSION = 1;

export interface ColonySave {
  version: typeof COLONY_SAVE_VERSION;
  savedAt: string;
  colony: ColonyState;
  paused: boolean;
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
    !isRecord(value.resources) ||
    !Array.isArray(value.dwarves) ||
    !Array.isArray(value.craftingTasks) ||
    !Array.isArray(value.completedExpeditions)
  ) {
    return false;
  }

  const resourceKeys = ["wood", "stone", "food", "tools", "swords"];
  return resourceKeys.every(
    (key) =>
      typeof (value.resources as Record<string, unknown>)[key] === "number",
  );
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