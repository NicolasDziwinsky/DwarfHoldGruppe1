import { resourceDetails } from "../resources";
import type { ResourceKey, Resources } from "../types";

interface Props {
  resources: Resources;
  hungry: boolean;
}

export function ResourceBar({ resources, hungry }: Props) {
  return (
    <section className="resource-bar">
      {Object.entries(resources).map(([key, value]) => {
        const { icon, label } = resourceDetails[key as ResourceKey];

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
