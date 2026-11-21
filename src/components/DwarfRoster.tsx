import { jobLabel } from "../simulation";
import type { CraftingTask, Dwarf, JobType } from "../types";

const jobs: Exclude<JobType, null>[] = [
  "woodcutting",
  "mining",
  "farming",
];

interface Props {
  dwarves: Dwarf[];
  hungry: boolean;
  toolsAvailable: number;
  craftingTasks: CraftingTask[];
  onAssign: (id: string, job: JobType) => void;
  onToggleTool: (id: string) => void;
}

export function DwarfRoster({
  dwarves,
  hungry,
  toolsAvailable,
  craftingTasks,
  onAssign,
  onToggleTool,
}: Props) {
  const presentDwarves = dwarves.filter(
    (dwarf) => dwarf.status !== "expedition",
  ).length;

  return (
    <section className="panel roster">
      <header>
        <div>
          <small>THE COMPANY</small>
          <h2>Holdfolk</h2>
        </div>
        <span>
          {presentDwarves} / {dwarves.length} present
        </span>
      </header>

      <div className="dwarf-list">
        {dwarves.map((dwarf) => {
          const isAway = dwarf.status === "expedition";
          const task = craftingTasks.find((item) => item.dwarfId === dwarf.id);
          const isBusy = isAway || dwarf.status === "crafting";
          const specialty = dwarf.specialty
            ? `Skilled in ${jobLabel(dwarf.specialty)}`
            : "Generalist";

          return (
            <article
              className={isAway ? "dwarf away" : "dwarf"}
              key={dwarf.id}
            >
              <div className="portrait">
                {dwarf.icon}
                <i className={dwarf.status} />
              </div>

              <div className="dwarf-details">
                <h3>{dwarf.name}</h3>
                <p>
                  {dwarf.title} · {specialty}
                </p>

                <select
                  value={dwarf.assignment ?? ""}
                  disabled={isBusy}
                  onChange={(event) =>
                    onAssign(
                      dwarf.id,
                      (event.target.value || null) as JobType,
                    )
                  }
                >
                  <option value="">Unassigned</option>
                  {jobs.map((job) => (
                    <option value={job} key={job}>
                      {jobLabel(job)}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className={
                    dwarf.toolEquipped ? "tool-toggle equipped" : "tool-toggle"
                  }
                  disabled={
                    dwarf.status === "crafting" ||
                    (!dwarf.toolEquipped && toolsAvailable < 1)
                  }
                  onClick={() => onToggleTool(dwarf.id)}
                >
                  {dwarf.toolEquipped
                    ? "⚒️ Unequip tool"
                    : toolsAvailable > 0
                      ? "⚒️ Equip tool"
                      : "No tools in stores"}
                </button>
              </div>

              <div className="status-tags">
                <span className="status">{dwarf.status}</span>
                {task && (
                  <span className="status crafting">
                    🔨 {task.recipe.name} · {task.daysRemaining}d left
                  </span>
                )}
                {hungry && !isAway && (
                  <span
                    className="status hungry"
                    title="Hungry dwarves work at half strength (rounded down)"
                  >
                    🍖 Hungry · 50% output
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
