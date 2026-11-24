import { createContext, useContext } from "react";
import type {
  Activity,
  ColonyState,
  CraftingRecipe,
  JobType,
} from "../types";

export interface ColonyContextValue {
  colony: ColonyState;
  paused: boolean;
  spedUp: boolean;
  activities: Activity[];
  expeditionPending: boolean;
  togglePaused: () => void;
  toggleSpeedUp: () => void;
  dayDurationMs: number;
  /** How much of the current day has passed, from 0 to 1. */
  getDayProgress: () => number;
  assignDwarf: (id: string, assignment: JobType) => void;
  craftTool: (dwarfId: string, recipe: CraftingRecipe) => void;
  toggleTool: (id: string) => void;
  sendExpedition: (dwarfId: string, destination: string) => Promise<void>;
}

export const ColonyContext = createContext<ColonyContextValue | null>(null);

export function useColony(): ColonyContextValue {
  const context = useContext(ColonyContext);
  if (!context) {
    throw new Error("useColony must be used inside <ColonyProvider>");
  }
  return context;
}
