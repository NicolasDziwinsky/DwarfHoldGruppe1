import type { ExpeditionResult } from "./types";

const TIMEOUT_MS = 10_000;

export async function beginExpedition(
  dwarfId: string,
  destination: string,
): Promise<ExpeditionResult> {
  let response: Response;
  try {
    response = await fetch("/api/expeditions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dwarfId, destination }),
      // Give up after 10 s so a hanging server can't strand the dwarf.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new Error("No word from the expedition. The scout turned back.");
  }

  // The body may not be JSON (e.g. proxy error page), so parse carefully.
  const body = (await response.json().catch(() => null)) as
    | (ExpeditionResult & { error?: string })
    | null;

  if (!response.ok || !body) {
    throw new Error(body?.error ?? `Expedition failed (${response.status})`);
  }
  return {
    ...body,
    // The browser knows which destination was requested. Keep this field
    // authoritative even if an older API process omits it from the response.
    destination,
  };
}
