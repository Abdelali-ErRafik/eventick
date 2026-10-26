import { Link, NavLink, Route, Routes } from "react-router-dom";
import { Protected } from "../../components/Protected";
import { useI18n } from "../../i18n";
import { text } from "./copy";
import Overview from "./Overview";
import Events from "./Events";
import Orders from "./Orders";
import Gate from "./Gate";
import Finance from "./Finance";
import Offers from "./Offers";

function ProInner() {
  const { locale } = useI18n();
  const t = text[locale];

  const nav = [
    { to: "", label: t.overview },
    { to: "events", label: t.events },
    { to: "orders", label: t.orders },
    { to: "gate", label: t.gate },
    { to: "finance", label: t.finance },
    { to: "offers", label: t.offers },
  ];

  return (
    <div className="min-h-screen bg-paper text-ink lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="bg-encre text-foam lg:min-h-screen">
        <div className="flex items-center justify-between px-4 py-4">
          <Link to="/" className="font-display text-xl font-extrabold">
            Eventick<span className="text-safran">.ma</span>
          </Link>
          <span className="rounded-full bg-safran px-2 py-1 text-xs font-bold text-encre">Pro</span>
        </div>
        <p className="px-4 text-xs text-mist">{t.brand}</p>
        <nav className="mt-4 flex gap-1 overflow-x-auto px-3 pb-4 lg:grid">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to === "" ? "/pro" : `/pro/${item.to}`}
              end={item.to === ""}
              className={({ isActive }) =>
                `shrink-0 rounded-full px-3 py-2 text-sm font-semibold lg:rounded-lg ${isActive ? "bg-safran text-encre" : "text-foam hover:bg-foam/10"}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden gap-2 px-4 pb-6 text-sm lg:grid">
          <Link to="/" className="text-mist">
            {t.market}
          </Link>
        </div>
      </aside>
      <main className="px-4 py-6 md:px-8">
        <Routes>
          <Route index element={<Overview />} />
          <Route path="events" element={<Events />} />
          <Route path="orders" element={<Orders />} />
          <Route path="gate" element={<Gate />} />
          <Route path="finance" element={<Finance />} />
          <Route path="offers" element={<Offers />} />
        </Routes>
      </main>
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
