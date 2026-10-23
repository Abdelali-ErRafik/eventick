import { NavLink, Route, Routes } from "react-router-dom";
import { Protected } from "../../components/Protected";
import Overview from "./Overview";
import Events from "./Events";
import Orders from "./Orders";
import Gate from "./Gate";

const SECTIONS = [
  { to: "", label: "Vue d'ensemble" },
  { to: "events", label: "Événements" },
  { to: "orders", label: "Commandes" },
  { to: "gate", label: "Porte" },
];

function ProInner() {
  return (
    <div className="mx-auto flex max-w-6xl gap-6 px-4 py-8">
      <nav className="w-48 shrink-0">
        <ul className="grid gap-1 text-sm font-semibold">
          {SECTIONS.map((section) => (
            <li key={section.to}>
              <NavLink
                to={section.to === "" ? "/pro" : `/pro/${section.to}`}
                end={section.to === ""}
                className={({ isActive }) => `block rounded-lg px-3 py-2 ${isActive ? "bg-brume text-lagon" : ""}`}
              >
                {section.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex-1">
        <Routes>
          <Route index element={<Overview />} />
          <Route path="events" element={<Events />} />
          <Route path="orders" element={<Orders />} />
          <Route path="gate" element={<Gate />} />
        </Routes>
      </div>
    </div>
  );
}

export default function Pro() {
  return (
    <Protected roles={["ORGANISER", "ADMIN"]}>
      <ProInner />
    </Protected>
  );
}
