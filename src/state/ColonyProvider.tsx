import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { beginExpedition } from "../api";
import {
  advanceDay,
  completeExpedition,
  destinationLabel,
  failExpedition,
  startExpedition,
  isAvailable,
  jobLabel,
  missingResources,
  canCraft,
  hauntedMansionAttackMessage,
  HAUNTED_MANSION_WEAPON_THRESHOLD,
} from "../simulation";
import type {
  Activity,
  ColonyState,
  JobType,
  ResourceKey,
  CraftingRecipe,
} from "../types";
import { resourceDetails } from "../resources";
import { ColonyContext, type ColonyContextValue } from "./ColonyContext";

import {
  COLONY_SAVE_VERSION,
  isColonyState,
  readColonySave,
  saveColony,
  isRecord,
  type ColonySave,
} from "./colonySave";

const NORMAL_DAY_MS = 8000;
const FAST_DAY_MS = 4000;
const CLOCK_TICK_MS = 50;

const initialState: ColonyState = {
  day: 12,
  resources: {
    wood: 14,
    stone: 9,
    food: 18,
    tools: 1,
    swords: 0,
  },
  dwarves: [
    {
      id: "dwarf-1",
      name: "Bromli Copperkeg",
      title: "Hold Warden",
      icon: "🧔🏻",
      species: "dwarf",
      assignment: "mining",
      status: "working",
      specialty: "mining",
    },
    {
      id: "dwarf-2",
      name: "Yrsa Flintbraid",
      title: "Trail Scout",
      icon: "🧔🏼‍♀️",
      species: "dwarf",
      assignment: "woodcutting",
      status: "working",
      specialty: "woodcutting",
    },
    {
      id: "dwarf-3",
      name: "Dori Ashmantle",
      title: "Stone Singer",
      icon: "🧔🏽",
      species: "dwarf",
      assignment: null,
      status: "idle",
    }
  ],
  hungry: false,
  craftingTasks: [],
  completedExpeditions: [],
  crystalCaveResidentJoined: false,
};

const initialActivities: Activity[] = [
  {
    id: "welcome",
    day: 12,
    message: "The forge fires are lit. Stonehome wakes.",
  },
];


function loadInitialSave(): ColonySave {
  const fallback: ColonySave = {
    version: COLONY_SAVE_VERSION,
    savedAt: new Date().toISOString(),
    colony: initialState,
    paused: false,
    spedUp: false,
    activities: initialActivities,
  };

  const raw = readColonySave();
  if (!isRecord(raw)) return fallback;

  const saved = raw as Record<string, unknown>;

  if (
    saved.version !== COLONY_SAVE_VERSION ||
    !isColonyState(saved.colony) ||
    typeof saved.paused !== "boolean" ||
    typeof saved.spedUp !== "boolean" ||
    !Array.isArray(saved.activities)
  ) {
    return fallback;
  }

  const colony = saved.colony;
  const interrupted = colony.dwarves.filter(
    (dwarf) => dwarf.status === "expedition",
  );

  if (interrupted.length === 0) {
    return {
      version: COLONY_SAVE_VERSION,
      savedAt:
        typeof saved.savedAt === "string"
          ? saved.savedAt
          : new Date().toISOString(),
      colony,
      paused: saved.paused,
      spedUp: saved.spedUp,
      activities: saved.activities as Activity[],
    };
  }

  // A refresh cannot prove that an in-flight expedition succeeded.
  // Therefore, restore its dwarves locally and pay no rewards.
  const recoveredColony: ColonyState = {
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
  };

  const recoveryMessages: Activity[] = interrupted.map((dwarf) => ({
    id: `interrupted-expedition-${dwarf.id}-${saved.savedAt}`,
    day: colony.day,
    message: `${dwarf.name}'s expedition was interrupted by a refresh. The dwarf returned empty-handed.`,
    tone: "warning",
  }));

  return {
    version: COLONY_SAVE_VERSION,
    savedAt:
      typeof saved.savedAt === "string"
        ? saved.savedAt
        : new Date().toISOString(),
    colony: recoveredColony,
    paused: saved.paused,
    spedUp: saved.spedUp,
    activities: [
      ...recoveryMessages,
      ...(saved.activities as Activity[]),
    ].slice(0, 6),
  };
}


export function ColonyProvider({ children }: { children: ReactNode }) {
  //const [colony, setColony] = useState(initialState);
  //const [paused, setPaused] = useState(false);
  const [expeditionPending, setExpeditionPending] = useState(false);
  //const [activities, setActivities] = useState<Activity[]>(initialActivities);
  const [loadedSave] = useState(loadInitialSave);
  const [colony, setColony] = useState<ColonyState>(
    loadedSave.colony,
  );
  const [paused, setPaused] = useState(loadedSave.paused);
  const [spedUp, setSpeedUp] = useState(loadedSave.spedUp);
  const [activities, setActivities] = useState<Activity[]>(
    loadedSave.activities,
  );
  const dayDurationMs = spedUp ? FAST_DAY_MS : NORMAL_DAY_MS;
  const dayProgress = useRef(0);
  const getDayProgress = useCallback(() => dayProgress.current, []);
  const colonyRef = useRef(colony);
  colonyRef.current = colony;

    const latestSave = useRef<ColonySave>({
    version: COLONY_SAVE_VERSION,
    savedAt: loadedSave.savedAt,
    colony,
    paused,
    spedUp: loadedSave.spedUp,
    activities,
  });

  useEffect(() => {
    const snapshot: ColonySave = {
      version: COLONY_SAVE_VERSION,
      savedAt: new Date().toISOString(),
      colony,
      paused,
      spedUp,
      activities,
    };
    

    latestSave.current = snapshot;
    saveColony(snapshot);
  }, [colony, paused, activities, spedUp]);

  useEffect(() => {
    const saveBeforeLeaving = () => {
      saveColony(latestSave.current);
    };

    window.addEventListener("pagehide", saveBeforeLeaving);
    window.addEventListener("beforeunload", saveBeforeLeaving);

    return () => {
      window.removeEventListener("pagehide", saveBeforeLeaving);
      window.removeEventListener("beforeunload", saveBeforeLeaving);
    };
  }, [colony, paused, activities, spedUp]);


  useEffect(() => {
    if (paused) return;

    // Progress lives in a ref, so pausing or changing speed keeps the part
    // of the day that has already passed.
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      dayProgress.current += (now - last) / dayDurationMs;
      last = now;

      if (dayProgress.current >= 1) {
        // At most one day per tick: a throttled background tab must not
        // skip through several days at once.
        dayProgress.current %= 1;
        setColony((current) => advanceDay(current));
      }
    }, CLOCK_TICK_MS);

    return () => window.clearInterval(timer);
  }, [paused, dayDurationMs]);

  // Log finished crafting work. A task only leaves the list when
  // advanceDay completes it, so "was there before, gone now" = finished.
  const previousTasks = useRef(colony.craftingTasks);
  useEffect(() => {
    const finished = previousTasks.current.filter(
      (task) =>
        !colony.craftingTasks.some((item) => item.dwarfId === task.dwarfId),
    );
    previousTasks.current = colony.craftingTasks;
    if (finished.length === 0) return;

    setActivities((current) =>
      [
        ...finished.map((task) => ({
          id: crypto.randomUUID(),
          day: colony.day,
          message: `${
            colony.dwarves.find((dwarf) => dwarf.id === task.dwarfId)?.name ??
            "A dwarf"
          } finished forging a ${task.recipe.name}.`,
          tone: "good" as const,
        })),
        ...current,
      ].slice(0, 6),
    );
  }, [colony.craftingTasks, colony.day, colony.dwarves]);

  function assignDwarf(id: string, assignment: JobType) {
    const dwarf = colony.dwarves.find((item) => item.id === id);
    if (!dwarf || !isAvailable(dwarf)) return;
    if (
      dwarf.species === "mole-beast" &&
      assignment !== null &&
      assignment !== "mining"
    ) return;

    setColony((current) => ({
      ...current,
      dwarves: current.dwarves.map((dwarf) =>
        dwarf.id === id && isAvailable(dwarf)
          ? {
              ...dwarf,
              assignment,
              status: assignment ? "working" : "idle",
            }
          : dwarf,
      ),
    }));

    setActivities((current) =>
      [
        {
          id: crypto.randomUUID(),
          day: colony.day,
          message: `${dwarf?.name ?? "A dwarf"} assigned to ${jobLabel(assignment)}.`,
        },
        ...current,
      ].slice(0, 6),
    );
  }

  function craftTool(dwarfId: string, recipe: CraftingRecipe) {
    const dwarf = colony.dwarves.find((item) => item.id === dwarfId);
    if (!dwarf) return;

    const warn = (message: string) =>
      setActivities((current) =>
        [
          {
            id: crypto.randomUUID(),
            day: colony.day,
            message,
            tone: "warning" as const,
          },
          ...current,
        ].slice(0, 6),
      );

    if (!isAvailable(dwarf)) {
      warn(`${dwarf.name} is busy and cannot work the forge.`);
      return;
    }

    if (!canCraft(dwarf, recipe)) {
      warn(`${dwarf.name} cannot forge ${recipe.name}.`);
      return;
    }

    const missing = missingResources(colony.resources, recipe);
    if (missing.length > 0) {
      warn(
        `The forge needs more ${missing.map((key) => resourceDetails[key].label.toLowerCase()).join(" and ")}.`,
      );
      return;
    }

    setColony((current) => {
      // Re-check against the latest state so a double-click can't start
      // two tasks or spend resources that are no longer there.
      const target = current.dwarves.find((item) => item.id === dwarfId);
      if (!target || !isAvailable(target)) return current;
      if (!canCraft(target, recipe)) return current;
      if (missingResources(current.resources, recipe).length > 0) {
        return current;
      }

      const resources = { ...current.resources };
      Object.entries(recipe.requiredResources).forEach(([key, amount]) => {
        resources[key as ResourceKey] -= amount ?? 0;
      });

      return {
        ...current,
        resources,
        dwarves: current.dwarves.map((item) =>
          item.id === dwarfId
            ? { ...item, status: "crafting", assignment: null }
            : item,
        ),
        craftingTasks: [
          ...current.craftingTasks,
          { dwarfId, recipe, daysRemaining: recipe.daysToComplete },
        ],
      };
    });

    setActivities((current) =>
      [
        {
          id: crypto.randomUUID(),
          day: colony.day,
          message: `${dwarf.name} begins forging a ${recipe.name} (${recipe.daysToComplete} days).`,
        },
        ...current,
      ].slice(0, 6),
    );
  }

  function toggleTool(id: string) {
    const dwarf = colony.dwarves.find((item) => item.id === id);
    if (!dwarf || !isAvailable(dwarf)) return;

    const equipping = !dwarf.toolEquipped;
    if (equipping && colony.resources.tools < 1) return;

    setColony((current) => {
      const target = current.dwarves.find((item) => item.id === id);
      if (!target || !isAvailable(target)) return current;

      // Re-check against the latest state so tools can never go negative
      // or be returned twice.
      if (equipping === Boolean(target.toolEquipped)) return current;
      if (equipping && current.resources.tools < 1) return current;

      return {
        ...current,
        resources: {
          ...current.resources,
          tools: current.resources.tools + (equipping ? -1 : 1),
        },
        dwarves: current.dwarves.map((item) =>
          item.id === id ? { ...item, toolEquipped: equipping } : item,
        ),
      };
    });

    setActivities((current) =>
      [
        {
          id: crypto.randomUUID(),
          day: colony.day,
          message: equipping
            ? `${dwarf.name} takes up a tool from the stores.`
            : `${dwarf.name} returns a tool to the stores.`,
        },
        ...current,
      ].slice(0, 6),
    );
  }

  // Dwarves whose request is still running. A ref updates immediately, so a
  // fast double-click is caught even before React re-renders.
  const inFlight = useRef(new Set<string>());

  function log(message: string, tone?: Activity["tone"]) {
    setActivities((current) =>
      [
        { id: crypto.randomUUID(), day: colony.day, message, tone },
        ...current,
      ].slice(0, 6),
    );
  }

  async function sendExpedition(dwarfId: string, destination: string) {
    const dwarf = colony.dwarves.find((item) => item.id === dwarfId);
    if (!dwarf || inFlight.current.has(dwarfId)) return;
    if (!isAvailable(dwarf)) {
      log(`${dwarf.name} is busy and cannot leave the hold.`, "warning");
      return;
    }

    inFlight.current.add(dwarfId);
    setExpeditionPending(true);
    setColony((current) => startExpedition(current, dwarfId, destination));
    log(`${dwarf.name} departed for ${destinationLabel(destination)}.`);

    try {
      const result = await beginExpedition(dwarfId, destination);
      const stateAtReturn = colonyRef.current;
      const alreadyCompleted = stateAtReturn.completedExpeditions.includes(
        result.expeditionId,
      );
      setColony((current) => completeExpedition(current, dwarfId, result));
      log(result.message, "good");
      if (result.destination === "haunted-mansion" && !alreadyCompleted) {
        log(
          hauntedMansionAttackMessage(stateAtReturn.resources.swords),
          stateAtReturn.resources.swords >= HAUNTED_MANSION_WEAPON_THRESHOLD
            ? "good"
            : "warning",
        );
      }
      if (
        result.destination === "crystal-cave" &&
        !colony.crystalCaveResidentJoined &&
        !colony.dwarves.some((resident) => resident.species === "mole-beast")
      ) {
        log("Pebble the mole-beast joined Stonehome after the Crystal Cave expedition.", "good");
      }
    } catch (error) {
      // Always bring the dwarf home on failure; no rewards are paid.
      setColony((current) => failExpedition(current, dwarfId));
      log(
        `${dwarf.name} returned empty-handed: ${
          error instanceof Error ? error.message : "the route was lost."
        }`,
        "warning",
      );
    } finally {
      inFlight.current.delete(dwarfId);
      setExpeditionPending(false);
    }
  }

  const value: ColonyContextValue = {
    colony,
    paused,
    spedUp,
    activities,
    expeditionPending,
    togglePaused: () => setPaused((value) => !value),
    toggleSpeedUp: () => setSpeedUp((value) => !value),
    dayDurationMs,
    getDayProgress,
    assignDwarf,
    craftTool,
    toggleTool,
    sendExpedition,
  };

  return <ColonyContext value={value}>{children}</ColonyContext>;
}
