import type { ResourceKey } from "./types";

/** Icon and display label for every resource. Add new resources here. */
export const resourceDetails: Record<ResourceKey, { icon: string; label: string }> = {
  wood: { icon: "🪵", label: "Timber" },
  stone: { icon: "🪨", label: "Stone" },
  food: { icon: "🍄", label: "Rations" },
  tools: { icon: "⚒️", label: "Tools" },
  swords: { icon: "⚔️", label: "Swords" },
};
