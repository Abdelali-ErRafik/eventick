import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { CalendarDays, LayoutDashboard, LayoutGrid, QrCode, ReceiptText, Tags, Wallet } from "lucide-react";
import { Protected } from "../../components/Protected";
import { api } from "../../api";
import { useI18n } from "../../i18n";
import { ConfirmProvider } from "./ConfirmContext";
import DashboardShell from "./Shell";
import { text } from "./copy";
import Overview from "./Overview";
import Events from "./Events";
import Orders from "./Orders";
import Gate from "./Gate";
import Finance from "./Finance";
import Offers from "./Offers";
import Placements from "./Placements";

const ic = (Icon) => <Icon size={19} strokeWidth={2} aria-hidden />;

function ProInner() {
  const { locale } = useI18n();
  const t = text[locale];
  const [todayCount, setTodayCount] = useState(0);

  // Badge on Réservations: tickets still to be scanned for events happening today.
  useEffect(() => {
    let alive = true;
    api
      .get("/organiser/orders/detailed")
      .then((data) => {
        if (!alive) return;
        const today = new Date().toISOString().slice(0, 10);
        const pending = data.orders
          .flatMap((order) => order.tickets)
          .filter((ticket) => ticket.status === "VALID" && ticket.event.start.slice(0, 10) === today).length;
        setTodayCount(pending);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const sections = [
    { group: t.grpPilotage, to: "/pro", end: true, label: t.overview, icon: ic(LayoutDashboard) },
    { group: t.grpPilotage, to: "/pro/orders", label: t.orders, icon: ic(ReceiptText), badge: todayCount },
    { group: t.grpCatalogue, to: "/pro/events", label: t.events, icon: ic(CalendarDays) },
    { group: t.grpCatalogue, to: "/pro/placements", label: t.placements, icon: ic(LayoutGrid) },
    { group: t.grpCatalogue, to: "/pro/offers", label: t.offers, icon: ic(Tags) },
    { group: t.grpOperations, to: "/pro/gate", label: t.gate, icon: ic(QrCode) },
    { group: t.grpFinances, to: "/pro/finance", label: t.finance, icon: ic(Wallet) },
  ];

  return (
    <DashboardShell sections={sections}>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="events" element={<Events />} />
        <Route path="orders" element={<Orders />} />
        <Route path="gate" element={<Gate />} />
        <Route path="finance" element={<Finance />} />
        <Route path="placements" element={<Placements />} />
        <Route path="offers" element={<Offers />} />
      </Routes>
    </DashboardShell>
  );
}

export default function Pro() {
  return (
    <Protected roles={["ORGANISER", "ADMIN"]}>
      <ConfirmProvider>
        <ProInner />
      </ConfirmProvider>
    </Protected>
  );
}
