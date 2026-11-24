import { useRef, useState, type ChangeEvent } from "react";
import { useColony } from "../state/ColonyContext";

export function SaveFileControls() {
  const { colony, expeditionPending, exportSave, importSave } = useColony();
  const fileInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState({ message: "", failed: false });

  function handleExport() {
    const url = URL.createObjectURL(
      new Blob([exportSave()], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `dwarfhold-save-day-${colony.day}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    // Give the browser time to start the download first.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus({ message: "Save file exported.", failed: false });
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      if (!window.confirm("Replace your current colony with this save file?")) {
        return;
      }
      const error = importSave(text);
      setStatus({
        message: error ?? "Save file imported.",
        failed: error !== null,
      });
    } catch {
      setStatus({ message: "The file could not be read.", failed: true });
    } finally {
      // Allows choosing the same file again.
      input.value = "";
    }
  }

  return (
    <section className="save-controls" aria-label="Save files">
      <button type="button" onClick={handleExport}>
        Export save
      </button>
      <button
        type="button"
        disabled={expeditionPending}
        title={
          expeditionPending
            ? "Wait for the expedition to return before importing"
            : undefined
        }
        onClick={() => fileInput.current?.click()}
      >
        Import save
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        aria-label="Save file to import"
        hidden
        onChange={handleImport}
      />
      <span role="status" className={status.failed ? "loss" : "gain"}>
        {status.message}
      </span>
    </section>
  );
}
