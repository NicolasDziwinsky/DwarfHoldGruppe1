import { NavLink, Outlet } from "react-router";
import { DayProgress } from "../components/DayProgress";
import { ResourceBar } from "../components/ResourceBar";
import { useColony } from "../state/ColonyContext";

export function Layout() {
  const { colony, paused, dayDurationMs, togglePaused } = useColony();

  return (
    <main>
      <header className="masthead">
        <div className="brand">
          <b>⛏</b>
          <div>
            <small>THE DEEP REALMS OF</small>
            <h1>
              Dwarf<span>hold</span>
            </h1>
          </div>
        </div>

        <div className="hold-title">
          <small>COLONY</small>
          <strong>STONEHOME</strong>
          <span>Founded beneath Emberpeak</span>
        </div>

        <div className="day">
          <small>DEEP DAY</small>
          <strong>{colony.day}</strong>
          <button onClick={togglePaused}>
            {paused ? "Wake the hold" : "Pause"}
          </button>
        </div>
      </header>

      <nav className="main-nav" aria-label="Colony navigation">
        <NavLink to="/" end>
          Colony
        </NavLink>
        <NavLink to="/forge">Forge</NavLink>
      </nav>

      <DayProgress />
      <ResourceBar resources={colony.resources} hungry={colony.hungry} />
      <Outlet />

      <footer>
        <span>🔥 Forge: burning</span>
        <span>A deep day lasts {dayDurationMs / 1000} seconds</span>
        <span>{paused ? "The hold is resting" : "⚙ Simulation active"}</span>
      </footer>
    </main>
  );
}
