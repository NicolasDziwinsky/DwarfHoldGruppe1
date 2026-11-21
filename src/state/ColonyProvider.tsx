import { useEffect, useRef, useState, type ReactNode } from "react";
import { beginExpedition } from "../api";
import {
  advanceDay,
  isAvailable,
  jobLabel,
  missingResources,
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
      assignment: "mining",
      status: "working",
      specialty: "mining",
    },
    {
      id: "dwarf-2",
      name: "Yrsa Flintbraid",
      title: "Trail Scout",
      icon: "🧔🏼‍♀️",
      assignment: "woodcutting",
      status: "working",
      specialty: "woodcutting",
    },
    {
      id: "dwarf-3",
      name: "Dori Ashmantle",
      title: "Stone Singer",
      icon: "🧔🏽",
      assignment: null,
      status: "idle",
    },
    {
      id: "dwarf-4",
      name: "SKELETON",
      title: "GRRRRR",
      icon: "💀",
      assignment: null,
      status: "idle",
    },
  ],
  hungry: false,
  craftingTasks: [],
};


export function ColonyProvider({ children }: { children: ReactNode }) {
  const [colony, setColony] = useState(initialState);
  const [paused, setPaused] = useState(false);
  const [expeditionPending, setExpeditionPending] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([
    {
      id: "welcome",
      day: 12,
      message: "The forge fires are lit. Stonehome wakes.",
    },
  ]);

  useEffect(() => {
    if (paused) return;

    const timer = window.setInterval(
      () => setColony((current) => advanceDay(current)),
      1000,
    );

    return () => window.clearInterval(timer);
  }, [paused]);

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
    if (!dwarf || dwarf.status === "crafting") return;

    const equipping = !dwarf.toolEquipped;
    if (equipping && colony.resources.tools < 1) return;

    setColony((current) => {
      const target = current.dwarves.find((item) => item.id === id);
      if (!target || target.status === "crafting") return current;

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

  async function sendExpedition(dwarfId: string, destination: string) {
    const dwarf = colony.dwarves.find((item) => item.id === dwarfId);
    if (!dwarf) return;
    if (!isAvailable(dwarf)) {
      setActivities((current) =>
        [
          {
            id: crypto.randomUUID(),
            day: colony.day,
            message: `${dwarf.name} is busy and cannot leave the hold.`,
            tone: "warning" as const,
          },
          ...current,
        ].slice(0, 6),
      );
      return;
    }

    setExpeditionPending(true);
    setColony((current) => ({
      ...current,
      dwarves: current.dwarves.map((item) =>
        item.id === dwarf.id ? { ...item, status: "expedition" } : item,
      ),
    }));
    setActivities((current) => [
      {
        id: crypto.randomUUID(),
        day: colony.day,
        message: `${dwarf.name} departed for ${destination.replace("-", " ")}.`,
      },
      ...current,
    ]);

    try {
      const result = await beginExpedition(dwarf.id, destination);

      setColony((current) => ({
        ...current,
        resources: Object.entries(result.rewards).reduce(
          (all, [key, amount]) => ({
            ...all,
            [key]: all[key as ResourceKey] + (amount ?? 0),
          }),
          current.resources,
        ),
        dwarves: current.dwarves.map((item) =>
          item.id === dwarf.id
            ? {
                ...item,
                status: item.assignment ? "working" : "idle",
              }
            : item,
        ),
      }));
      setActivities((current) =>
        [
          {
            id: result.expeditionId,
            day: colony.day,
            message: result.message,
            tone: "good" as const,
          },
          ...current,
        ].slice(0, 6),
      );
    } catch (error) {
      setActivities((current) =>
        [
          {
            id: crypto.randomUUID(),
            day: colony.day,
            message:
              error instanceof Error
                ? error.message
                : "The expedition was lost from view.",
            tone: "warning" as const,
          },
          ...current,
        ].slice(0, 6),
      );
    }

    setExpeditionPending(false);
  }

  const value: ColonyContextValue = {
    colony,
    paused,
    activities,
    expeditionPending,
    togglePaused: () => setPaused((value) => !value),
    assignDwarf,
    craftTool,
    toggleTool,
    sendExpedition,
  };

  return <ColonyContext value={value}>{children}</ColonyContext>;
}
