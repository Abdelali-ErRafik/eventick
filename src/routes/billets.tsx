import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { TicketPass } from "@/components/ticket-pass";
import { Shell } from "@/components/shell";
import { daysUntil, longDate, money, todayKey } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { BASE_LIVED, BASE_POINTS, BASE_SPEND, freshSpend, useStore, type Ticket } from "@/lib/store";
import { useCatalog } from "@/lib/use-catalog";
import { EventCard } from "@/components/event-card";

export const Route = createFileRoute("/billets")({
  component: TicketsPage,
});

type Tab = "active" | "past" | "saved" | "pay";

function TicketsPage() {
  const { locale, t, tf } = useI18n();
  const profile = useStore((state) => state.profile);
  const orders = useStore((state) => state.orders);
  const saved = useStore((state) => state.saved);
  const cards = useStore((state) => state.cards);
  const updateProfile = useStore((state) => state.updateProfile);
  const transferTicket = useStore((state) => state.transferTicket);
  const addCard = useStore((state) => state.addCard);
  const removeCard = useStore((state) => state.removeCard);
  const resetDemo = useStore((state) => state.resetDemo);
  const { events } = useCatalog();
  const [tab, setTab] = useState<Tab>("active");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile);
  const [transferId, setTransferId] = useState<string | null>(null);
  const [friend, setFriend] = useState("");
  const [adding, setAdding] = useState(false);
  const [cardDraft, setCardDraft] = useState({ bank: "", last4: "", exp: "", holder: profile.name.toUpperCase(), brand: "visa" as "visa" | "mastercard" });

  const today = todayKey();
  const flat = useMemo(
    () => orders.flatMap((order) => order.tickets.map((ticket) => ({ ticket, order }))),
    [orders],
  );
  const active = flat
    .filter((item) => item.ticket.status === "valid" && item.ticket.end >= today)
    .sort((a, b) => a.ticket.start.localeCompare(b.ticket.start));
  const past = flat.filter((item) => item.ticket.status !== "valid" || item.ticket.end < today);
  const next = active[0]?.ticket;
  const days = next ? daysUntil(next.start, today) : null;
  const spend = BASE_SPEND + freshSpend(orders);
  const points = BASE_POINTS + Math.floor(freshSpend(orders) / 10);
  const latest = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const savedEvents = saved.map((slug) => events.find((event) => event.slug === slug)).filter((event) => event != null);
  const initials = profile.name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const nextLabel =
    days == null ? "" : days <= 0 ? t("nextToday") : days === 1 ? t("nextTomorrow") : tf("nextIn", { n: days });

  return (
    <Shell>
      <section className="bg-encre text-foam">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-8 md:px-8">
          <span className="inline-flex size-16 items-center justify-center rounded-full bg-lagon font-display text-xl font-extrabold">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-extrabold">{profile.name}</h1>
            <p className="text-sm text-mist">
              {profile.email} · {profile.phone}
            </p>
            <p className="mt-1 text-sm text-safran">
              {profile.vip ? t("vipGold") : t("onDevice")} · {tf("eventsLived", { n: BASE_LIVED })} · {t("memberSince")}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Mini value={String(active.length)} label={t("ready")} />
            <Mini value={String(points)} label={t("points")} />
            <Mini value={money(spend, locale)} label={t("spend")} />
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
        <div className="flex gap-2 overflow-x-auto">
          {(
            [
              ["active", t("tabActive")],
              ["past", t("tabPast")],
              ["saved", t("tabSaved")],
              ["pay", t("tabPay")],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={`h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${tab === id ? "bg-lagon text-foam" : "bg-card text-ink"}`}
              onClick={() => setTab(id)}
            >
              {label}
              {id === "active" ? ` (${active.length})` : ""}
              {id === "saved" ? ` (${savedEvents.length})` : ""}
            </button>
          ))}
        </div>

        {tab === "active" ? (
          <div className="mt-6 space-y-4">
            {next ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brume px-4 py-3">
                <p className="font-semibold text-lagon-deep">{nextLabel}</p>
                <Link to="/billet/$ticketId" params={{ ticketId: next.id }} className="inline-flex h-11 items-center rounded-full bg-encre px-4 text-sm font-semibold text-foam">
                  {t("showPass")}
                </Link>
              </div>
            ) : (
              <p className="text-muted">{t("noActive")}</p>
            )}
            {active[0] ? <TicketPass ticket={active[0].ticket} /> : null}
            {active.length > 1 ? (
              <>
                <h2 className="font-display text-xl font-bold">{t("other")}</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {active.slice(1).map(({ ticket }) => (
                    <SmallTicket key={ticket.id} ticket={ticket} onTransfer={() => setTransferId(ticket.id)} />
                  ))}
                </div>
              </>
            ) : null}
            {active[0] ? (
              <div className="flex flex-wrap gap-2">
                <button className="h-11 rounded-full border border-line/15 px-4 text-sm font-semibold" onClick={() => toast.success(t("walletOk"))}>
                  {t("wallet")}
                </button>
                <button className="h-11 rounded-full border border-line/15 px-4 text-sm font-semibold" onClick={() => setTransferId(active[0].ticket.id)}>
                  {t("transfer")}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "past" ? (
          <div className="mt-6 overflow-x-auto rounded-xl border border-line/10 bg-card">
            <div className="flex items-center justify-between p-4">
              <h2 className="font-display text-xl font-bold">{t("historyTitle")}</h2>
              <button
                className="h-11 rounded-full bg-paper px-4 text-sm font-semibold"
                onClick={() => exportCsv(past.map((item) => item.ticket), locale)}
              >
                {t("exportCsv")}
              </button>
            </div>
            {past.length === 0 ? <p className="px-4 pb-4 text-muted">{t("noPast")}</p> : null}
            <table className="w-full min-w-[40rem] text-start text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 text-start">{t("colEvent")}</th>
                  <th className="px-4 py-2 text-start">{t("colDate")}</th>
                  <th className="px-4 py-2 text-start">{t("colRef")}</th>
                  <th className="px-4 py-2 text-start">{t("colPrice")}</th>
                  <th className="px-4 py-2 text-start">{t("colStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {past.map(({ ticket }) => (
                  <tr key={ticket.id} className="border-t border-line/10">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{locale === "ar" ? ticket.titleAr : ticket.titleFr}</p>
                      <p className="text-muted">{ticket.city}</p>
                    </td>
                    <td className="px-4 py-3">{longDate(ticket.start, locale)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{ticket.ref}</td>
                    <td className="px-4 py-3">{money(ticket.price, locale)}</td>
                    <td className="px-4 py-3">{ticket.status === "transferred" ? t("transferred") : t("used")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === "saved" ? (
          <div className="mt-6">
            <p className="text-sm text-muted">{t("alertsOn")}</p>
            {savedEvents.length === 0 ? <p className="mt-4 text-muted">{t("noSaved")}</p> : null}
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {savedEvents.map((event) => (
                <EventCard key={event.slug} event={event} />
              ))}
            </div>
          </div>
        ) : null}

        {tab === "pay" ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-line/10 bg-card p-4 shadow-card">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-bold">{t("methods")}</h2>
                <button className="h-10 rounded-full bg-brume px-3 text-sm font-semibold text-lagon-deep" onClick={() => setAdding((value) => !value)}>
                  {t("addCard")}
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {cards.map((card) => (
                  <article key={card.id} className={`rounded-xl p-4 text-foam ${card.isDefault ? "bg-lagon" : "bg-paper text-ink"}`}>
                    <div className="flex justify-between text-xs font-bold">
                      <span>{card.bank}</span>
                      {card.isDefault ? <span>{t("defaultCard")}</span> : null}
                    </div>
                    <p className="mt-4 font-mono text-lg">•••• •••• •••• {card.last4}</p>
                    <p className="mt-2 text-xs">
                      {card.holder} · {card.exp} · {card.brand.toUpperCase()}
                    </p>
                    <button className="mt-3 text-xs underline" onClick={() => removeCard(card.id)}>
                      {t("removeCard")}
                    </button>
                  </article>
                ))}
              </div>
              {adding ? (
                <form
                  className="mt-4 grid gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!/^\d{4}$/.test(cardDraft.last4) || cardDraft.bank.trim().length < 2) return;
                    addCard({ ...cardDraft, holder: cardDraft.holder || profile.name.toUpperCase() });
                    setAdding(false);
                    toast.success(t("cardAdded"));
                  }}
                >
                  <input className="field" placeholder={t("holder")} value={cardDraft.holder} onChange={(event) => setCardDraft({ ...cardDraft, holder: event.target.value })} />
                  <input className="field" placeholder="Banque" value={cardDraft.bank} onChange={(event) => setCardDraft({ ...cardDraft, bank: event.target.value })} />
                  <div className="grid grid-cols-2 gap-2">
                    <input className="field font-mono" placeholder="1234" maxLength={4} value={cardDraft.last4} onChange={(event) => setCardDraft({ ...cardDraft, last4: event.target.value.replace(/\D/g, "").slice(0, 4) })} />
                    <input className="field font-mono" placeholder="09 / 28" value={cardDraft.exp} onChange={(event) => setCardDraft({ ...cardDraft, exp: event.target.value })} />
                  </div>
                  <button className="h-11 rounded-full bg-lagon text-sm font-semibold text-foam">{t("saveProfile")}</button>
                </form>
              ) : null}
              <p className="mt-3 text-xs text-muted">{t("ssl")} · {t("cmiCert")} · {t("tdsCert")}</p>
            </section>
            <section className="rounded-xl border border-line/10 bg-card p-4 shadow-card">
              <h2 className="font-display text-xl font-bold">{t("lastTx")}</h2>
              {latest ? (
                <>
                  <p className="mt-2 text-sm text-muted">{latest.authCode}</p>
                  <p className="mt-3 flex justify-between">
                    <span>{latest.tickets[0] ? (locale === "ar" ? latest.tickets[0].titleAr : latest.tickets[0].titleFr) : t("tickets")}</span>
                    <span>{money(latest.subtotal, locale)}</span>
                  </p>
                  <p className="flex justify-between text-sm">
                    <span>{t("serviceFee")}</span>
                    <span>{t("feesFree")}</span>
                  </p>
                  <p className="flex justify-between text-sm">
                    <span>{t("vatShow")}</span>
                    <span>{t("included")}</span>
                  </p>
                  <p className="mt-2 flex justify-between font-display text-2xl font-extrabold">
                    <span>{t("totalDebited")}</span>
                    <span>{money(latest.total, locale)}</span>
                  </p>
                  {latest.tickets[0] ? (
                    <Link to="/billet/$ticketId" params={{ ticketId: latest.tickets[0].id }} className="mt-3 inline-flex h-11 items-center rounded-full bg-paper px-4 text-sm font-semibold">
                      {t("downloadInvoice")}
                    </Link>
                  ) : null}
                </>
              ) : null}
              <div className="mt-6 border-t border-line/10 pt-4">
                <button className="text-sm font-semibold text-lagon" onClick={() => { setDraft(profile); setEditing((value) => !value); }}>
                  {t("edit")}
                </button>
                {editing ? (
                  <form
                    className="mt-3 grid gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      updateProfile(draft);
                      setEditing(false);
                      toast.success(t("profileSaved"));
                    }}
                  >
                    <input className="field" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                    <input className="field" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
                    <input className="field" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />
                    <button className="h-11 rounded-full bg-lagon text-sm font-semibold text-foam">{t("saveProfile")}</button>
                  </form>
                ) : null}
                <button
                  className="mt-4 block text-sm text-corail"
                  onClick={() => {
                    resetDemo();
                    toast.success(t("resetOk"));
                  }}
                >
                  {t("resetDevice")}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
      {transferId ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-encre/60 p-4 sm:items-center">
          <form
            className="w-full max-w-md rounded-2xl bg-card p-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (friend.trim().length < 3) return;
              transferTicket(transferId, friend.trim());
              setTransferId(null);
              setFriend("");
              toast.success(t("transferOk"));
            }}
          >
            <h2 className="font-display text-2xl font-extrabold">{t("transferTitle")}</h2>
            <label className="mt-3 block text-sm">
              {t("friendName")}
              <input className="field mt-1" value={friend} onChange={(event) => setFriend(event.target.value)} />
            </label>
            <div className="mt-4 flex gap-2">
              <button type="button" className="h-12 flex-1 rounded-full border border-line/15" onClick={() => setTransferId(null)}>
                {t("cancel")}
              </button>
              <button className="h-12 flex-1 rounded-full bg-lagon font-semibold text-foam">{t("sendTicket")}</button>
            </div>
          </form>
        </div>
      ) : null}
    </Shell>
  );
}

function Mini({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-foam/10 px-3 py-2 text-center">
      <p className="font-display text-lg font-extrabold tabular-nums">{value}</p>
      <p className="text-xs text-mist">{label}</p>
    </div>
  );
}

function SmallTicket({ ticket, onTransfer }: { ticket: Ticket; onTransfer: () => void }) {
  const { locale, t } = useI18n();
  return (
    <article className="flex gap-3 rounded-xl border border-line/10 bg-card p-3 shadow-card">
      <img src={ticket.image} alt="" className="size-20 rounded-lg object-cover" />
      <div className="min-w-0 flex-1">
        <h3 className="font-display font-bold">{locale === "ar" ? ticket.titleAr : ticket.titleFr}</h3>
        <p className="text-sm text-muted">
          {ticket.city} · {ticket.start} · {ticket.time}
        </p>
        <div className="mt-2 flex gap-2">
          <Link to="/billet/$ticketId" params={{ ticketId: ticket.id }} className="inline-flex h-10 items-center rounded-full bg-lagon px-3 text-sm font-semibold text-foam">
            {t("seeQr")}
          </Link>
          <button className="h-10 rounded-full border border-line/15 px-3 text-sm" onClick={onTransfer}>
            {t("transfer")}
          </button>
        </div>
      </div>
    </article>
  );
}

function exportCsv(tickets: Ticket[], locale: "fr" | "ar") {
  const header = ["title", "date", "ref", "price", "status"];
  const rows = tickets.map((ticket) => [
    locale === "ar" ? ticket.titleAr : ticket.titleFr,
    ticket.start,
    ticket.ref,
    String(ticket.price),
    ticket.status,
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "eventick-releve.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
