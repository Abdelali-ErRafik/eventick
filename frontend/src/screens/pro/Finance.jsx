import { useEffect, useMemo, useState } from "react";
import { Info, Landmark, Lock, Percent, Ticket, Undo2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api, money } from "../../api";
import { useI18n } from "../../i18n";
import { useOrganisers } from "./useOrganisers";
import { Card, EmptyState, PageHead, SectionTitle, StatCard, StatSkeletons } from "./ui";
import { Button, Field, Input, Select } from "../../ui";
import { cn, eventText } from "../../utils";
import { text } from "./copy";

/**
 * Finance — what came in, what Eventick took, and what is owed.
 *
 * Every figure here used to be computed in this file: the organiser picked a
 * plan from a row of buttons, `planCost()` ran in the browser, and nothing was
 * stored. So the commission changed when you clicked a different button, reset
 * on reload, and matched no charge anyone would ever make. Revenue was also
 * the sum of PAID orders' totals, which counted refunded money as earnings.
 *
 * Now the server owns all of it. The plan is read-only because an admin
 * assigns it, the fee was recorded on each order when it was paid, and revenue
 * is net of refunds. This screen only renders and explains.
 */

const RATE = (bps) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;

export default function Finance() {
  const { locale } = useI18n();
  const t = text[locale];
  const { maySeeAllOrganisers, organisers } = useOrganisers();
  const [orders, setOrders] = useState(null);
  const [finance, setFinance] = useState(null);
  const [payouts, setPayouts] = useState(null);
  const [organiserId, setOrganiserId] = useState("");

  useEffect(() => {
    const suffix = organiserId ? `?organiserId=${organiserId}` : "";
    setFinance(null);
    setPayouts(null);
    api.get(`/organiser/orders/detailed${suffix}`).then((data) => setOrders(data.orders));
    api.get(`/organiser/finance${suffix}`).then(setFinance);
    api.get(`/organiser/payouts${suffix}`).then((data) => setPayouts(data.payouts));
  }, [organiserId]);

  // Per-event rows stay client-side: this is a breakdown of orders already
  // fetched for the table, not a money figure anyone is charged on.
  const byEvent = useMemo(() => {
    const map = new Map();
    for (const order of orders ?? []) {
      for (const ticket of order.tickets) {
        if (ticket.status === "CANCELLED") continue;
        const current = map.get(ticket.event.slug) ?? {
          slug: ticket.event.slug,
          title: eventText(ticket.event, "title", locale),
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

  const lifetime = finance?.lifetime;
  const pending = finance?.pending;

  return (
    <div>
      <PageHead
        title={t.finance}
        sub={t.financeSub}
        actions={
          maySeeAllOrganisers ? (
            <label className="flex flex-col gap-1.5">
              <span className="ps-0.5 text-[11px] font-bold uppercase tracking-wide text-muted">{t.allOrganisers}</span>
              <Select value={organiserId} onChange={(e) => setOrganiserId(e.target.value)} style={{ width: 200 }}>
                <option value="">{t.allOrganisers}</option>
                {organisers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </label>
          ) : null
        }
      />

      {/* The four figures that matter, in the order they happen: money in,
          refunds out, our cut, their share. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {!lifetime ? (
          <StatSkeletons count={4} />
        ) : (
          <>
            <StatCard
              accent
              icon={<Wallet className="size-5" />}
              label={t.netRevenue}
              value={`${money(lifetime.netRevenueCents)} MAD`}
              sub={`${t.gross} ${money(lifetime.grossCents)} MAD`}
            />
            <StatCard
              icon={<Undo2 className="size-5" />}
              label={t.refundedLabel}
              value={`${money(lifetime.refundedCents)} MAD`}
            />
            <StatCard
              icon={<Percent className="size-5" />}
              label={t.fee}
              value={`${money(lifetime.feeCents)} MAD`}
              sub={finance.plan ? `${finance.plan.label} · ${RATE(finance.plan.rateBps)}` : undefined}
            />
            <StatCard
              icon={<Landmark className="size-5" />}
              label={t.payable}
              value={`${money(pending?.payableCents ?? 0)} MAD`}
              sub={`${t.paidOut} ${money(finance.paidOutCents)} MAD`}
            />
          </>
        )}
      </div>

      {/* Plan — read-only. It used to be three buttons that changed the fee
          on screen and nothing in the world. */}
      <SectionTitle>{t.plan}</SectionTitle>
      {finance?.plan ? (
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-brume px-3 py-1.5 text-sm font-bold text-primary">
              <Lock className="size-3.5 shrink-0" aria-hidden />
              {finance.plan.label}
            </span>
            <span className="text-sm font-semibold tabular-nums">
              {RATE(finance.plan.rateBps)}
              {finance.plan.monthlyCents > 0
                ? ` + ${t.subscriptionMonthly.replace("{amount}", money(finance.plan.monthlyCents))}`
                : ""}
            </span>
            <span className="text-xs text-muted">{finance.plan.assigned ? t.planAssigned : t.planDefault}</span>
          </div>

          {/* The fixed monthly part used to be printed on the plan and never
              charged, which made Pro cheaper than Starter at every volume. It
              is withheld from the payout now, so the card says where it goes
              and how much has actually been taken. */}
          {finance.subscription?.monthlyCents > 0 ? (
            <p className="mt-3 text-xs text-muted">
              <span className="font-semibold text-ink">{t.subscription}:</span> {t.subscriptionOnPayout}
              {finance.subscription.billedMonths > 0
                ? ` · ${t.subscriptionBilled
                    .replace("{amount}", money(finance.subscription.billedCents))
                    .replace("{n}", String(finance.subscription.billedMonths))}`
                : ""}
            </p>
          ) : (
            <p className="mt-3 text-xs text-muted">{t.subscriptionNone}</p>
          )}

          <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted">
            <Info className="mt-px size-3.5 shrink-0" aria-hidden />
            {t.planNote}
          </p>

          {/*
            What the other tiers cost.
            An organiser was shown their own rate and nothing else, so someone
            on Starter's 5% had no way to learn that Pro charges 3% — the
            cheaper plans existed, nobody was on one, and there was no moment
            at which anyone would find out. Changing plan stays an admin
            action; this is only what makes it worth asking about.
          */}
          {(finance.plans ?? []).length > 1 ? (
            <div className="mt-4 border-t border-line/10 pt-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted">{t.planCompare}</p>
              <ul className="mt-2 grid gap-1.5">
                {finance.plans.map((row) => (
                  <li
                    key={row.key}
                    className={cn(
                      "flex flex-wrap items-baseline justify-between gap-2 rounded-control px-2.5 py-1.5 text-sm",
                      row.current ? "bg-brume font-bold text-primary" : "text-muted",
                    )}
                  >
                    <span>
                      {row.label}
                      {row.current ? ` · ${t.planCurrent}` : ""}
                    </span>
                    <span className="tabular-nums">
                      {RATE(row.rateBps)}
                      {row.monthlyCents > 0 ? ` + ${t.subscriptionMonthly.replace("{amount}", money(row.monthlyCents))}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs leading-relaxed text-muted">{t.planCompareNote}</p>
            </div>
          ) : null}
        </Card>
      ) : null}

      <BankPanel t={t} current={finance?.bankAccount ?? null} readOnly={Boolean(organiserId)} />

      <SectionTitle>{t.payoutsTitle}</SectionTitle>
      {payouts && payouts.length === 0 ? (
        <EmptyState icon="🏦" title={t.payoutsEmpty} />
      ) : (
        <div className="grid gap-3">
          {(payouts ?? []).map((row) => (
            <PayoutRow key={row.id} row={row} t={t} locale={locale} />
          ))}
        </div>
      )}

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
    </div>
  );
}

const STATUS_TONE = {
  PENDING: "bg-warn-bg text-warn",
  PAID: "bg-success-bg text-success",
  CANCELLED: "bg-sunken text-muted",
};

function PayoutRow({ row, t, locale }) {
  const label = { PENDING: t.payoutPending, PAID: t.payoutPaid, CANCELLED: t.payoutCancelled }[row.status] ?? row.status;
  const fmt = (iso) => new Date(iso).toLocaleDateString(locale === "ar" ? "ar-MA" : locale === "en" ? "en-GB" : "fr-MA");

  return (
    <article className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-line/10 bg-card p-4 shadow-card">
      <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide", STATUS_TONE[row.status])}>
        {label}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold tabular-nums">
          {money(row.netCents)} MAD
          <span className="ms-2 text-xs font-semibold text-muted">
            ({t.gross} {money(row.grossCents)} − {t.fee} {money(row.feeCents)}
            {/* Shown only when non-zero: a month already billed by an earlier
                run deducts nothing, and a 0.00 line would read as a mistake. */}
            {row.subscriptionCents > 0 ? ` − ${t.subscription} ${money(row.subscriptionCents)}` : ""})
          </span>
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {t.payoutPeriod} {fmt(row.periodStart)} → {fmt(row.periodEnd)} · {row.orders} {t.payoutOrders}
          {row.subscriptionMonths?.length ? ` · ${row.subscriptionMonths.map((m) => m.month).join(", ")}` : ""}
          {row.reference ? ` · ${t.payoutRef} ${row.reference}` : ""}
        </p>
      </div>
    </article>
  );
}

/**
 * Bank details.
 *
 * The organiser owns this — it is their account, and an admin retyping
 * someone else's RIB is a worse place for a typo. Read-only when an admin is
 * viewing another organiser through the ?organiserId= switch, because saving
 * would silently write the admin's own details.
 */
function BankPanel({ t, current, readOnly }) {
  const [holderName, setHolderName] = useState("");
  const [rib, setRib] = useState("");
  const [bank, setBank] = useState("");
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onFile = saved ?? current;

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const digits = rib.replace(/[\s-]/g, "");
    if (!/^\d{24}$/.test(digits)) {
      setError(t.bankBadRib);
      return;
    }
    setError("");
    setBusy(true);
    try {
      const result = await api.put("/organiser/bank-account", { holderName: holderName.trim(), rib: digits, bank: bank.trim() });
      setSaved(result);
      setRib("");
      toast.success(t.bankSaved);
    } catch (err) {
      toast.error(err.message || t.bankBadRib);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionTitle>{t.account}</SectionTitle>
      <Card>
        <p className="text-sm font-bold">{t.bankTitle}</p>
        <p className="mt-1 text-xs text-muted">{t.bankSub}</p>

        <p className="mt-3 text-sm">
          {onFile ? (
            <span className="font-semibold text-success">
              {t.bankOnFile} · {onFile.holderName} · **** {onFile.ribLast4}
              {onFile.bank ? ` · ${onFile.bank}` : ""}
            </span>
          ) : (
            <span className="font-semibold text-danger">{t.bankMissing}</span>
          )}
        </p>

        {readOnly ? null : (
          <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label={t.bankHolder} required>
              {(props) => <Input {...props} value={holderName} onChange={(e) => setHolderName(e.target.value)} autoComplete="name" />}
            </Field>
            <Field label={t.bankName}>
              {(props) => <Input {...props} value={bank} onChange={(e) => setBank(e.target.value)} placeholder="CIH, Attijariwafa…" />}
            </Field>
            <Field label={t.bankRib} error={error} required className="sm:col-span-2">
              {(props) => (
                <Input
                  {...props}
                  value={rib}
                  onChange={(e) => setRib(e.target.value)}
                  inputMode="numeric"
                  placeholder="1234 5678 9012 3456 7890 1234"
                  // The RIB is a payment credential: keep it out of the
                  // browser's autofill store and off password managers.
                  autoComplete="off"
                />
              )}
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy || holderName.trim().length < 3 || !rib}>
                {t.bankSave}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </>
  );
}
