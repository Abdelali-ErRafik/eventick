import { useEffect, useMemo, useState } from "react";
import { Landmark, Percent, Ticket, Wallet } from "lucide-react";
import { api, money } from "../../api";
import { useI18n } from "../../i18n";
import { planCost } from "../../strategy";
import { useOrganisers } from "./useOrganisers";
import { Card, EmptyState, PageHead, SectionTitle, StatCard, StatSkeletons } from "./ui";
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
  const { isAdmin, organisers } = useOrganisers();
  const [orders, setOrders] = useState(null);
  const [plan, setPlan] = useState("starter");
  const [organiserId, setOrganiserId] = useState("");

  useEffect(() => {
    const suffix = organiserId ? `?organiserId=${organiserId}` : "";
    api.get(`/organiser/orders/detailed${suffix}`).then((data) => setOrders(data.orders));
  }, [organiserId]);

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
      <PageHead
        title={t.finance}
        sub={t.financeSub}
        actions={
          isAdmin ? (
            <label className="flex flex-col gap-1.5">
              <span className="ps-0.5 text-[11px] font-bold uppercase tracking-wide text-muted">{t.allOrganisers}</span>
              <select
                value={organiserId}
                onChange={(e) => setOrganiserId(e.target.value)}
                className="h-11 rounded-control border border-line/20 bg-card px-3 text-sm outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15"
                style={{ width: 200 }}
              >
                <option value="">{t.allOrganisers}</option>
                {organisers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null
        }
      />

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
              plan === item.id ? "border-action bg-action text-action-fg" : "border-line/20 bg-card text-muted hover:border-primary hover:bg-brume hover:text-primary",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <SectionTitle>{t.perEvent}</SectionTitle>
      {orders && byEvent.length === 0 ? (
        <EmptyState icon="💰" title={t.empty} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {byEvent.map((row) => (
            <article key={row.slug} className="flex items-center gap-3 rounded-card border border-line/10 bg-card p-4 shadow-card">
              <img src={row.image} alt="" className="size-12 shrink-0 rounded-control object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{row.title}</p>
                <p className="truncate text-xs text-muted">{row.city}</p>
                <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-muted">
                  <Ticket className="size-3.5" aria-hidden />
                  {row.tickets}
                </p>
              </div>
              <p className="shrink-0 text-end">
                <span className="block font-display text-subhead font-bold tabular-nums">{money(row.gross)}</span>
                <span className="block text-[11px] font-semibold text-muted">MAD</span>
              </p>
            </article>
          ))}
        </div>
      )}

      <Card className="mt-4">
        <p className="text-sm text-muted">{t.payout}</p>
        <p className="mt-1 font-mono text-sm text-primary">{t.account}</p>
      </Card>
    </div>
  );
}
