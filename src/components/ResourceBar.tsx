import type { Resources } from "../types";

const details = {
  wood: ["🪵", "Timber"],
  stone: ["🪨", "Stone"],
  food: ["🍄", "Rations"],
  tools: ["⚒️", "Tools"],
} as const;

interface Props {
  resources: Resources;
  hungry: boolean;
}

export function ResourceBar({ resources, hungry }: Props) {
  return (
    <section className="resource-bar">
      {Object.entries(resources).map(([key, value]) => {
        const [icon, label] = details[key as keyof Resources];

        return (
          <article
            key={key}
            className={key === "food" && hungry ? "hungry" : undefined}
          >
            <span>{icon}</span>
            <div>
              <small>{label}</small>
              <strong>{value}</strong>
            </div>
          </article>
        );
      })}
    </section>
  );
}
