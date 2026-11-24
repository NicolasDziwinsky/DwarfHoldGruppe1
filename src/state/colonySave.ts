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

const RESOURCE_KEYS = ["wood", "stone", "food", "tools", "swords"];
const SPECIES = ["dwarf", "mole-beast"];
const STATUSES = ["idle", "working", "crafting", "expedition"];
const JOBS = ["woodcutting", "mining", "farming"];

const isString = (value: unknown): value is string =>
  typeof value === "string";
const isAmount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;
const isOptional = (value: unknown, check: (value: unknown) => boolean) =>
  value === undefined || check(value);
const isOneOf = (value: unknown, allowed: string[]) =>
  isString(value) && allowed.includes(value);

/** Only known resources with whole amounts; keys may be missing. */
function isResourceAmounts(value: unknown): value is Record<string, number> {
  return (
    isRecord(value) &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([key, amount]) => RESOURCE_KEYS.includes(key) && isAmount(amount),
    )
  );
}

function isResident(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.title) &&
    isString(value.icon) &&
    isOneOf(value.species, SPECIES) &&
    isOneOf(value.status, STATUSES) &&
    (value.assignment === null || isOneOf(value.assignment, JOBS)) &&
    isOptional(value.specialty, (item) => isOneOf(item, JOBS)) &&
    isOptional(value.toolEquipped, (item) => typeof item === "boolean") &&
    isOptional(value.travellingTo, isString)
  );
}

function isCraftingTask(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    isString(value.dwarfId) &&
    isAmount(value.daysRemaining) &&
    isRecord(value.recipe) &&
    isString(value.recipe.name) &&
    isString(value.recipe.icon) &&
    isAmount(value.recipe.daysToComplete) &&
    isResourceAmounts(value.recipe.requiredResources) &&
    isResourceAmounts(value.recipe.rewards) &&
    Array.isArray(value.recipe.eligibleSpecies) &&
    value.recipe.eligibleSpecies.every((item) => isOneOf(item, SPECIES))
  );
}

function isActivity(value: unknown): value is Activity {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isAmount(value.day) &&
    isString(value.message) &&
    isOptional(value.tone, (item) => isOneOf(item, ["good", "warning"]))
  );
}

export function isColonyState(value: unknown): value is ColonyState {
  if (!isRecord(value)) return false;

  const { resources, dwarves, craftingTasks, completedExpeditions } = value;
  if (
    !isAmount(value.day) ||
    typeof value.hungry !== "boolean" ||
    typeof value.crystalCaveResidentJoined !== "boolean" ||
    !isResourceAmounts(resources) ||
    !RESOURCE_KEYS.every((key) => key in resources) ||
    !Array.isArray(dwarves) ||
    !dwarves.every(isResident) ||
    !Array.isArray(craftingTasks) ||
    !craftingTasks.every(isCraftingTask) ||
    !Array.isArray(completedExpeditions) ||
    !completedExpeditions.every(isString)
  ) {
    return false;
  }

  if (new Set(dwarves.map((dwarf) => dwarf.id)).size !== dwarves.length) {
    return false;
  }

  // A resident is crafting exactly when they have one forge task. Otherwise
  // they would be stuck at the forge, or be in two places at once.
  const crafters = craftingTasks.map((task) => task.dwarfId);
  const crafting = dwarves.filter((dwarf) => dwarf.status === "crafting");
  if (
    crafters.length !== crafting.length ||
    !crafting.every((dwarf) => crafters.includes(dwarf.id))
  ) {
    return false;
  }

  const moleCount = dwarves.filter(
    (dwarf) => dwarf.species === "mole-beast",
  ).length;
  return moleCount === (value.crystalCaveResidentJoined ? 1 : 0);
}

/**
 * Validates untrusted save data. Returns null if it cannot be used.
 * Expeditions cannot be resumed, so travelling residents come home without
 * rewards; `interruptedBy` names the cause in the Chronicle.
 */
export function parseColonySave(
  raw: unknown,
  interruptedBy: string,
): ColonySave | null {
  if (
    !isRecord(raw) ||
    raw.version !== COLONY_SAVE_VERSION ||
    !isColonyState(raw.colony) ||
    typeof raw.paused !== "boolean" ||
    typeof raw.spedUp !== "boolean" ||
    !Array.isArray(raw.activities) ||
    !raw.activities.every(isActivity)
  ) {
    return null;
  }

  const colony = raw.colony;
  const savedAt = isString(raw.savedAt)
    ? raw.savedAt
    : new Date().toISOString();
  const recoveryMessages: Activity[] = colony.dwarves
    .filter((dwarf) => dwarf.status === "expedition")
    .map((dwarf) => ({
      id: `interrupted-expedition-${dwarf.id}-${savedAt}`,
      day: colony.day,
      message: `${dwarf.name}'s expedition was interrupted by ${interruptedBy}. The dwarf returned empty-handed.`,
      tone: "warning",
    }));

  return {
    version: COLONY_SAVE_VERSION,
    savedAt,
    colony: {
      ...colony,
      dwarves: colony.dwarves.map((dwarf) =>
        dwarf.status === "expedition"
          ? {
              ...dwarf,
              status: dwarf.assignment ? "working" : "idle",
              travellingTo: undefined,
            }
          : dwarf,
      ),
    },
    paused: raw.paused,
    spedUp: raw.spedUp,
    activities: [...recoveryMessages, ...raw.activities].slice(0, 6),
  };
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

/** The save exactly as stored, or null if storage is unavailable or empty. */
export function readRawColonySave(): string | null {
  try {
    return localStorage.getItem(COLONY_SAVE_KEY);
  } catch {
    return null;
  }
}
