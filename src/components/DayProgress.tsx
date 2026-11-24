import { useEffect, useRef } from "react";
import { useColony } from "../state/ColonyContext";

export function DayProgress() {
  const { paused, spedUp, dayDurationMs, toggleSpeedUp, getDayProgress } =
    useColony();
  const track = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);

  // Written straight to the DOM so the rest of the app does not re-render
  // on every animation frame.
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const progress = getDayProgress();
      if (fill.current) fill.current.style.transform = `scaleX(${progress})`;
      track.current?.setAttribute(
        "aria-valuenow",
        String(Math.round(progress * 100)),
      );
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [getDayProgress]);

  return (
    <section className={paused ? "day-progress paused" : "day-progress"}>
      <small>{paused ? "PAUSED" : "NEXT DAY"}</small>
      <div
        ref={track}
        className="day-track"
        role="progressbar"
        aria-label="Progress to the next day"
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div ref={fill} className="day-fill" />
      </div>
      <button
        type="button"
        className={spedUp ? "speed-toggle active" : "speed-toggle"}
        aria-pressed={spedUp}
        title={spedUp ? "Return to normal speed" : "Speed up time"}
        onClick={toggleSpeedUp}
      >
        {spedUp ? "⏩ 2×" : "▶ 1×"} · {dayDurationMs / 1000}s / day
      </button>
    </section>
  );
}
