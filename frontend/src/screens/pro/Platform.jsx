import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, CalendarDays, Landmark, Minus, ReceiptText, Users as UsersIcon, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api, money } from "../../api";
import { useI18n } from "../../i18n";
import { Badge, Button, Field, Input, Modal, Select } from "../../ui";
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
  const [plans, setPlans] = useState([]);
  const [payouts, setPayouts] = useState(null);
  /** The organiser a payout is being prepared for, or null. */
  const [running, setRunning] = useState(null);

  const loadSellers = useCallback(() => {
    api
      .get("/platform/organisers")
      .then((data) => setSellers(data.organisers))
      .catch(() => setSellers([]));
  }, []);
  const loadPayouts = useCallback(() => {
    api
      .get("/platform/payouts")
      .then((data) => setPayouts(data.payouts))
      .catch(() => setPayouts([]));
  }, []);

  useEffect(() => {
    api.get("/platform/stats").then(setStats).catch(() => setStats(null));
    api.get("/platform/plans").then((data) => setPlans(data.plans)).catch(() => setPlans([]));
    loadSellers();
    loadPayouts();
  }, [loadSellers, loadPayouts]);

  /** Move an organiser onto a plan. Affects future orders only. */
  const assignPlan = async (sellerId, planKey) => {
    try {
      await api.patch(`/platform/organisers/${sellerId}/plan`, { planKey: planKey || null });
      toast.success(t.plPlanSaved);
      loadSellers();
    } catch (err) {
      toast.error(err.message);
    }
  };

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

              {/* Commission plan. The organiser sees this read-only on their
                  own Finance screen — assigning it is an admin act, because
                  an organiser choosing their own rate is the bug being fixed. */}
              <label className="flex shrink-0 flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted">{t.plPlan}</span>
                <Select
                  value={seller.plan ?? ""}
                  onChange={(e) => assignPlan(seller.id, e.target.value)}
                  style={{ width: 150 }}
                >
                  <option value="">{t.plPlanDefault}</option>
                  {plans.map((plan) => (
                    <option key={plan.key} value={plan.key}>
                      {plan.label} · {plan.rateBps / 100}%
                    </option>
                  ))}
                </Select>
              </label>

              <p className="shrink-0 text-end">
                <span className="block font-display text-subhead font-bold tabular-nums">
                  {money(seller.grossCents)}
                </span>
                <span className="block text-[11px] font-semibold text-muted">
                  MAD · {t.fee} {money(seller.feeCents ?? 0)}
                </span>
              </p>

              <Button variant="ghost" onClick={() => setRunning(seller)} className="shrink-0">
                {t.plRunPayout}
              </Button>
            </article>
          ))}
        </div>
      )}

      <SectionTitle>{t.plPayouts}</SectionTitle>
      {payouts && payouts.length === 0 ? (
        <EmptyState icon={<Landmark className="size-6" />} title={t.plPayoutsNone} />
      ) : (
        <div className="grid gap-3">
          {(payouts ?? []).map((row) => (
            <PayoutAdminRow
              key={row.id}
              row={row}
              t={t}
              onChanged={() => {
                loadPayouts();
                loadSellers();
              }}
            />
          ))}
        </div>
      )}

      {running ? (
        <RunPayoutModal
          seller={running}
          t={t}
          onClose={() => setRunning(null)}
          onDone={() => {
            setRunning(null);
            loadPayouts();
            loadSellers();
          }}
        />
      ) : null}
    </div>
  );
}

const PAYOUT_TONE = {
  PENDING: "bg-warn-bg text-warn",
  PAID: "bg-success-bg text-success",
  CANCELLED: "bg-sunken text-muted",
};

const PAYOUT_LABEL = (row, t) =>
  ({ PENDING: t.payoutPending, PAID: t.payoutPaid, CANCELLED: t.payoutCancelled })[row.status] ?? row.status;

/** One payout, with the bank details needed to action it. */
function PayoutAdminRow({ row, t, onChanged }) {
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  const markPaid = async () => {
    if (!reference.trim() || busy) return;
    setBusy(true);
    try {
      await api.post(`/platform/payouts/${row.id}/paid`, { reference: reference.trim() });
      toast.success(t.plPayoutPaid);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await api.post(`/platform/payouts/${row.id}/cancel`, { note: "" });
      toast.success(t.plCancelled);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="rounded-card border border-line/10 bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${PAYOUT_TONE[row.status]}`}>
          {PAYOUT_LABEL(row, t)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{row.organiserName}</p>
          <p className="truncate text-xs text-muted">
            {row.orders} {t.payoutOrders} · {t.gross} {money(row.grossCents)} − {t.fee} {money(row.feeCents)}
            {row.reference ? ` · ${t.payoutRef} ${row.reference}` : ""}
          </p>
        </div>
        <p className="shrink-0 font-display text-subhead font-bold tabular-nums">{money(row.netCents)} MAD</p>
      </div>

      {/* The RIB shows only on a payout waiting to be sent — it is what the
          transfer is made from, and there is no reason to keep displaying a
          payment credential once the money has gone. */}
      {row.status === "PENDING" ? (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line/10 pt-3">
          <p className="me-auto font-mono text-xs text-muted">
            {row.bank
              ? `${row.bank.holderName} · ${row.bank.rib}${row.bank.bank ? ` · ${row.bank.bank}` : ""}`
              : t.plNoBank}
          </p>
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={t.plPayoutRef}
            style={{ width: 200 }}
          />
          <Button onClick={markPaid} disabled={busy || !reference.trim()}>
            {t.plMarkPaid}
          </Button>
          <Button variant="ghost" onClick={cancel} disabled={busy}>
            {t.plCancelPayout}
          </Button>
        </div>
      ) : null}
    </article>
  );
}

/** Pick a period and create the payout. */
function RunPayoutModal({ seller, t, onClose, onDone }) {
  const [earnings, setEarnings] = useState(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Defaults to a wide window on purpose: a run only picks up orders that
    // are not already in a payout, so "everything outstanding" is both the
    // common case and safe to repeat.
    const now = new Date();
    setTo(new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10));
    setFrom("2020-01-01");
    api.get(`/platform/organisers/${seller.id}/earnings`).then(setEarnings).catch(() => setEarnings(null));
  }, [seller.id]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api.post(`/platform/organisers/${seller.id}/payouts`, {
        periodStart: from,
        periodEnd: to,
      });
      toast.success(t.plPayoutDone.replace("{amount}", money(result.netCents)));
      onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={t.plRunPayoutFor.replace("{name}", seller.name)}>
      <div className="grid gap-3">
        {earnings ? (
          <p className="text-sm">
            <span className="text-muted">{t.plOwed}: </span>
            <span className="font-bold tabular-nums">{money(earnings.pending.payableCents)} MAD</span>
            <span className="text-muted">
              {" "}
              ({earnings.unpaidOrders} {t.payoutOrders})
            </span>
            {/* Without a RIB there is nowhere to send it, and the server
                refuses the run — say so before they fill the dates in. */}
            {!earnings.bankAccount ? <span className="ms-2 font-semibold text-danger">· {t.plNoBank}</span> : null}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.plPeriodFrom}>
            {(props) => <Input {...props} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}
          </Field>
          <Field label={t.plPeriodTo}>
            {(props) => <Input {...props} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}
          </Field>
        </div>
        <Button onClick={submit} disabled={busy || !from || !to || !earnings?.bankAccount}>
          {t.plRunPayout}
        </Button>
      </div>
    </Modal>
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
