import { useEffect, useMemo, useState } from "react";
import { Landmark, Percent, Wallet } from "lucide-react";
import { api, money } from "../../api";
import { useI18n } from "../../i18n";
import { planCost } from "../../strategy";
import { Card, DataTable, EmptyState, EntityCell, MoneyCell, PageHead, SectionTitle, StatCard, StatSkeletons, Td, Th } from "./ui";
import { cn } from "../../utils";
import { text } from "./copy";

const PLANS = [
  { id: "starter", label: "Starter · 5%" },
  { id: "pro", label: "Pro · 499 + 3%" },
  { id: "business", label: "Business · 1 999 + 2%" },
];

export default function Finance() {
  const { locale } = useI18n();
  const t = text[locale];
  const [orders, setOrders] = useState(null);
  const [plan, setPlan] = useState("starter");

  useEffect(() => {
    api.get("/organiser/orders/detailed").then((data) => setOrders(data.orders));
  }, []);

  const gmv = (orders ?? []).filter((order) => order.status === "PAID").reduce((sum, order) => sum + order.totalCents, 0);
  const fee = planCost(plan, gmv);

  const byEvent = useMemo(() => {
    const map = new Map();
    for (const order of orders ?? []) {
      for (const ticket of order.tickets) {
        if (ticket.status === "CANCELLED") continue;
        const current = map.get(ticket.event.slug) ?? {
          slug: ticket.event.slug,
          title: locale === "ar" ? ticket.event.titleAr : ticket.event.titleFr,
          image: ticket.event.image,
          city: ticket.event.city,
          gross: 0,
          tickets: 0,
        };
        current.gross += ticket.priceCents;
        current.tickets += 1;
        map.set(ticket.event.slug, current);
      }
    }
    return [...map.values()].sort((a, b) => b.gross - a.gross);
  }, [orders, locale]);

  return (
    <div>
      <PageHead title={t.finance} sub={t.financeSub} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {!orders ? (
          <StatSkeletons count={3} />
        ) : (
          <>
            <StatCard accent icon={<Wallet className="size-5" />} label={t.gross} value={`${money(gmv)} MAD`} sub={t.payout} />
            <StatCard icon={<Percent className="size-5" />} label={t.fee} value={`${money(fee)} MAD`} sub={PLANS.find((p) => p.id === plan)?.label} />
            <StatCard icon={<Landmark className="size-5" />} label={t.net} value={`${money(gmv - fee)} MAD`} sub={t.account} />
          </>
        )}
      </div>

      <SectionTitle>{t.plan}</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {PLANS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={plan === item.id}
            onClick={() => setPlan(item.id)}
            className={cn(
              "h-11 rounded-full border px-4 text-sm font-semibold transition",
              plan === item.id ? "border-lagon bg-lagon text-white" : "border-line/20 bg-card text-muted hover:border-lagon hover:bg-brume hover:text-lagon-deep",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <SectionTitle>{t.perEvent}</SectionTitle>
      <DataTable minWidth={620}>
        <thead>
          <tr>
            <Th className="text-start">{t.events}</Th>
            <Th>{t.tickets}</Th>
            <Th>{t.gross}</Th>
          </tr>
        </thead>
        <tbody>
          {orders && byEvent.length === 0 ? (
            <tr>
              <td colSpan={3}>
                <EmptyState icon="💰" title={t.empty} />
              </td>
            </tr>
          ) : null}
          {byEvent.map((row) => (
            <tr key={row.slug} className="transition hover:bg-brume/40">
              <Td>
                <EntityCell image={row.image} title={row.title} sub={row.city} />
              </Td>
              <Td className="text-center tabular-nums">{row.tickets}</Td>
              <Td className="text-center">
                <MoneyCell unit="MAD">{money(row.gross)}</MoneyCell>
              </Td>
            </tr>
          ))}
        </tbody>
      </DataTable>

      <Card className="mt-4">
        <p className="text-sm text-muted">{t.payout}</p>
        <p className="mt-1 font-mono text-sm text-lagon">{t.account}</p>
      </Card>
    </div>
  );
}
