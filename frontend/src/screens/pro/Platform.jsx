import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, CalendarDays, Minus, ReceiptText, Users as UsersIcon, Wallet } from "lucide-react";
import { api, money } from "../../api";
import { useI18n } from "../../i18n";
import { Badge } from "../../ui";
import { EmptyState, PageHead, SectionTitle, StatCard, StatSkeletons } from "./ui";
import { text } from "./copy";

/**
 * The platform console — the marketplace, not one organiser's events.
 *
 * An admin's Pilotage was an ORGANISER dashboard with bigger numbers: the
 * same encaissé / billets / entrées tiles, summed across everyone because
 * scope.any widens the query. That answers "how are my events doing", which
 * an admin does not have. It never answered how many organisers exist,
 * whether anyone is waiting for approval, how many have never sold anything,
 * or whether refunds are climbing.
 */
export default function Platform() {
  const { locale } = useI18n();
  const t = text[locale];
  const [stats, setStats] = useState(null);
  const [sellers, setSellers] = useState(null);

  useEffect(() => {
    api.get("/platform/stats").then(setStats).catch(() => setStats(null));
    api
      .get("/platform/organisers")
      .then((data) => setSellers(data.organisers))
      .catch(() => setSellers([]));
  }, []);

  const revenue = stats?.revenue;
  // Percentage change week on week. Guarded because the first week has no
  // previous week to compare against, and x/0 would render "Infinity%".
  const weekDelta =
    revenue && revenue.prevWeekCents > 0
      ? Math.round(((revenue.thisWeekCents - revenue.prevWeekCents) / revenue.prevWeekCents) * 100)
      : null;

  return (
    <div>
      <PageHead title={t.platform} sub={t.platformSub} />

      {!stats ? (
        <StatSkeletons count={4} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              accent
              icon={<Wallet className="size-5" />}
              label={t.plGross}
              value={`${money(revenue.grossCents)} MAD`}
              sub={t.plGrossSub}
            />
            <StatCard
              icon={<ReceiptText className="size-5" />}
              label={t.plNet}
              value={`${money(revenue.netCents)} MAD`}
              // Basis points keep the API integer; a percent with one decimal
              // is what a person reads.
              sub={`${t.plRefundRate} ${(revenue.refundRateBp / 100).toFixed(1)}%`}
            />
            <StatCard
              icon={
                weekDelta === null ? (
                  <Minus className="size-5" />
                ) : weekDelta >= 0 ? (
                  <ArrowUpRight className="size-5" />
                ) : (
                  <ArrowDownRight className="size-5" />
                )
              }
              label={t.plWeek}
              value={`${money(revenue.thisWeekCents)} MAD`}
              sub={weekDelta === null ? t.plWeekFlat : weekDelta >= 0 ? t.plWeekUp : t.plWeekDown}
              trend={
                weekDelta === null
                  ? { dir: "flat", text: "—" }
                  : { dir: weekDelta >= 0 ? "up" : "down", text: `${weekDelta >= 0 ? "+" : ""}${weekDelta}%` }
              }
            />
            <StatCard
              icon={<UsersIcon className="size-5" />}
              label={t.plPeople}
              value={String(stats.users.total)}
              sub={`${stats.users.newThisWeek} ${t.plNewWeek}`}
            />
          </div>

          {/* The one number here that is a to-do rather than a metric, so it
              gets a link to the place it is cleared. */}
          {stats.pendingApplications > 0 ? (
            <Link
              to="/pro/users"
              className="mt-4 flex items-center justify-between gap-3 rounded-card border border-warn/30 bg-warn-bg px-4 py-3 text-warn transition hover:brightness-105"
            >
              <span className="text-sm font-bold">
                {stats.pendingApplications} {t.plPending}
              </span>
              <span className="text-sm font-semibold underline underline-offset-4">{t.plReview}</span>
            </Link>
          ) : null}

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Breakdown
              icon={<UsersIcon className="size-4" />}
              title={t.plPeople}
              rows={[
                [t.plCustomers, stats.users.customers],
                [t.plOrganisers, stats.users.organisers],
                [t.plAdmins, stats.users.admins],
              ]}
            />
            <Breakdown
              icon={<CalendarDays className="size-4" />}
              title={t.plCatalogue}
              rows={[
                [t.plPublished, stats.events.published],
                [t.plHidden, stats.events.hidden],
              ]}
            />
            <Breakdown
              icon={<ReceiptText className="size-4" />}
              title={t.plOrders}
              rows={[
                [t.plPaid, stats.orders.paid],
                [t.plRefunded, stats.orders.refunded],
                [t.plCancelled, stats.orders.cancelled],
              ]}
            />
          </div>
        </>
      )}

      <SectionTitle>{t.plWhoSells}</SectionTitle>
      <p className="-mt-2 mb-3 text-sm text-muted">{t.plWhoSellsSub}</p>

      {sellers && sellers.length === 0 ? (
        <EmptyState icon={<UsersIcon className="size-6" />} title={t.plNoSales} />
      ) : (
        <div className="grid gap-3">
          {(sellers ?? []).map((seller) => (
            <article
              key={seller.id}
              className="flex flex-wrap items-center gap-4 rounded-card border border-line/10 bg-card p-4 shadow-card"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-bold">
                  {seller.name}
                  {/* An ADMIN can appear here when they run house events —
                      see the route's comment. Saying so stops the row from
                      looking like a bug. */}
                  {seller.role === "ADMIN" ? <Badge tone="info">{t.roleAdmin}</Badge> : null}
                </p>
                <p className="truncate text-sm text-muted">{seller.email}</p>
              </div>

              <div className="flex shrink-0 items-center gap-4 text-xs text-muted">
                <span>
                  <span className="font-bold tabular-nums text-ink">{seller.events}</span> {t.plEventsCount}
                </span>
                <span>
                  <span className="font-bold tabular-nums text-ink">{seller.orders}</span> {t.plOrdersCount}
                </span>
              </div>

              <p className="shrink-0 text-end">
                <span className="block font-display text-subhead font-bold tabular-nums">
                  {money(seller.grossCents)}
                </span>
                <span className="block text-[11px] font-semibold text-muted">MAD</span>
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Breakdown({ icon, title, rows }) {
  return (
    <div className="rounded-card border border-line/10 bg-card p-4 shadow-card">
      <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
        {icon}
        {title}
      </p>
      <dl className="mt-3 grid gap-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="font-display text-base font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
