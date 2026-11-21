import { useState } from "react";
import { Chronicle } from "../components/Chronicle";
import { isAvailable, missingResources } from "../simulation";
import { resourceDetails } from "../resources";
import { useColony } from "../state/ColonyContext";
import type { CraftingRecipe, ResourceKey, Resources } from "../types";

const ironToolRecipe: CraftingRecipe = {
  name: "Iron Tool",
  requiredResources: { wood: 3, stone: 2 },
  rewards: { tools: 1 },
  daysToComplete: 5,
  icon: "⚒️",
};

const swordRecipe: CraftingRecipe = {
  name: "Sword",
  requiredResources: { wood: 8, stone: 5 },
  rewards: { swords: 1 },
  daysToComplete: 5,
  icon: "⚔️",
};

// Add further recipes here; each one gets its own card.
const recipes: CraftingRecipe[] = [ironToolRecipe, swordRecipe];

/** Renders e.g. "3 🪵 + 2 🪨" for whatever resources the list contains. */
function ResourceList({ amounts }: { amounts: Partial<Resources> }) {
  const entries = Object.entries(amounts) as [ResourceKey, number][];

  return entries.map(([key, amount], index) => (
    <span key={key} title={resourceDetails[key].label}>
      {index > 0 && <i>+</i>} {amount} {resourceDetails[key].icon}
    </span>
  ));
}

function RecipeCard({ recipe }: { recipe: CraftingRecipe }) {
  const { colony, craftTool } = useColony();
  const availableDwarves = colony.dwarves.filter(isAvailable);
  const [crafterId, setCrafterId] = useState("");

  // Fall back to the first free dwarf if the chosen one became busy.
  const crafter =
    availableDwarves.find((dwarf) => dwarf.id === crafterId) ??
    availableDwarves[0];
  const affordable = missingResources(colony.resources, recipe).length === 0;

  return (
    <section className="panel forge">
      <div>
        <small>EMBER FORGE</small>
        <h2>{recipe.name}</h2>
        <p>Equip the hold for future work or battles.</p>

        <label className="crafter">
          Smith
          <select
            value={crafter?.id ?? ""}
            disabled={availableDwarves.length === 0}
            onChange={(event) => setCrafterId(event.target.value)}
          >
            {availableDwarves.length === 0 && (
              <option value="">No dwarf is free</option>
            )}
            {availableDwarves.map((dwarf) => (
              <option key={dwarf.id} value={dwarf.id}>
                {dwarf.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="recipe">
        <span>{recipe.daysToComplete} days ⏱️</span>
        <ResourceList amounts={recipe.requiredResources} />
        <i>→</i>
        <ResourceList amounts={recipe.rewards} />
        <button
          disabled={!crafter || !affordable}
          onClick={() => crafter && craftTool(crafter.id, recipe)}
        >
          {affordable ? "Start forging" : "Not enough materials"}
        </button>
      </div>
    </section>
  );
}

export function ForgePage() {
  const { colony, activities } = useColony();

  return (
    <div className="forge-layout">
      <div className="forge-stack">
        {recipes.map((recipe) => (
          <RecipeCard recipe={recipe} key={recipe.name} />
        ))}

        <section className="panel forge-queue">
          <header>
            <div>
              <small>AT THE ANVIL</small>
              <h2>Work in progress</h2>
            </div>
            <span>{colony.craftingTasks.length} active</span>
          </header>

          {colony.craftingTasks.length === 0 ? (
            <p className="empty">The anvils are quiet.</p>
          ) : (
            colony.craftingTasks.map((task) => {
              const dwarf = colony.dwarves.find(
                (item) => item.id === task.dwarfId,
              );
              const done = task.recipe.daysToComplete - task.daysRemaining;

              return (
                <article key={task.dwarfId}>
                  <span>
                    {dwarf?.icon} <b>{dwarf?.name}</b> · {task.recipe.name}
                  </span>
                  <span>
                    {task.daysRemaining}{" "}
                    {task.daysRemaining === 1 ? "day" : "days"} left
                  </span>
                  <progress value={done} max={task.recipe.daysToComplete} />
                </article>
              );
            })
          )}
        </section>
      </div>

      <Chronicle activities={activities} />
    </div>
  );
}
