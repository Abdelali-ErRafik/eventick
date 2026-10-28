import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { TicketPass, toTicketPassProps } from "../components/TicketPass";
import { EventCard } from "../components/EventCard";
import { Shell } from "../components/Shell";
import { Protected } from "../components/Protected";
import { api, money } from "../api";
import { useAuth } from "../AuthContext";
import { useFavorites } from "../FavoritesContext";
import { useCatalog } from "../useCatalog";
import { Button, Field, Input, Modal } from "../ui";
import { useI18n } from "../i18n";
import { daysUntil, longDate, todayKey } from "../utils";

function BilletsInner() {
  const { locale, t, tf } = useI18n();
  const { user, refresh } = useAuth();
  const { favorites } = useFavorites();
  const { events } = useCatalog();
  const [orders, setOrders] = useState(null);
  const [tab, setTab] = useState("active");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(user?.name ?? "");
  const [transferId, setTransferId] = useState(null);
  const [friend, setFriend] = useState("");
  const [busy, setBusy] = useState(false);

  const loadOrders = () => api.get("/orders").then((data) => setOrders(data.orders));

  useEffect(() => {
    loadOrders();
  }, []);

  const today = todayKey();
  const flat = useMemo(() => orders?.flatMap((order) => order.tickets.map((ticket) => ({ ticket, order }))) ?? [], [orders]);
  const active = flat
    .filter((item) => item.ticket.status === "VALID" && item.ticket.event.end >= today)
    .sort((a, b) => a.ticket.event.start.localeCompare(b.ticket.event.start));
  const past = flat.filter((item) => item.ticket.status !== "VALID" || item.ticket.event.end < today);
  const next = active[0]?.ticket;
  const days = next ? daysUntil(next.event.start, today) : null;
  const latest = orders ? [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] : null;
  const savedEvents = favorites.map((slug) => events.find((event) => event.slug === slug)).filter(Boolean);
  const initials = (user?.name ?? "?")
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const nextLabel = days == null ? "" : days <= 0 ? t("nextToday") : days === 1 ? t("nextTomorrow") : tf("nextIn", { n: days });

  const saveName = async (e) => {
    e.preventDefault();
    if (busy || nameDraft.trim().length < 2) return;
    setBusy(true);
    try {
      await api.patch("/auth/me", { name: nameDraft.trim() });
      await refresh?.();
      setEditingName(false);
      toast.success(t("profileSaved"));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitTransfer = async (e) => {
    e.preventDefault();
    if (busy || friend.trim().length < 3 || !transferId) return;
    setBusy(true);
    try {
      await api.post(`/tickets/${transferId}/transfer`, { holderName: friend.trim() });
      await loadOrders();
      setTransferId(null);
      setFriend("");
      toast.success(t("transferOk"));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const header = ["title", "date", "ref", "price", "status"];
    const rows = past.map(({ ticket }) => [
      locale === "ar" ? ticket.event.titleAr : ticket.event.titleFr,
      ticket.event.start,
      ticket.ref,
      String(ticket.priceCents / 100),
      ticket.status,
    ]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "eventick-releve.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (!orders) {
    return (
      <Shell>
        <div className="mx-auto h-80 max-w-3xl animate-pulse px-4 py-10" />
      </Shell>
    );
  }

  return (
    <Shell>
      {/* Deliberately always dark — see the note on --et-stage in styles.css. */}
      <section className="bg-stage text-stage-fg">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-8 md:px-8">
          <span className="inline-flex size-16 items-center justify-center rounded-full bg-primary font-display text-xl font-extrabold text-primary-fg">{initials}</span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-extrabold">{user?.name}</h1>
            <p className="text-sm text-stage-muted">{user?.email}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Mini value={String(active.length)} label={t("ready")} />
            <Mini value={orders.length ? `${money(orders.reduce((s, o) => s + o.totalCents, 0))} MAD` : "0 MAD"} label={t("spend")} />
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
        <div className="flex gap-2 overflow-x-auto">
          {[
            ["active", t("tabActive")],
            ["past", t("tabPast")],
            ["saved", t("tabSaved")],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-current={tab === id ? "true" : undefined}
              className={`h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition ${
                tab === id ? "bg-action text-action-fg" : "bg-card text-ink hover:bg-brume"
              }`}
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
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-brume px-4 py-3">
                <p className="font-semibold text-primary">{nextLabel}</p>
                <Link to={`/billet/${next.id}`} className="inline-flex h-11 items-center rounded-full bg-action px-4 text-sm font-semibold text-action-fg transition hover:bg-action-hover">
                  {t("showPass")}
                </Link>
              </div>
            ) : (
              <p className="text-muted">{t("noActive")}</p>
            )}
            {active[0] ? <TicketPass {...toTicketPassProps(active[0].ticket)} /> : null}
            {active.length > 1 ? (
              <>
                <h2 className="font-display text-xl font-bold">{t("other")}</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {active.slice(1).map(({ ticket }) => (
                    <SmallTicket key={ticket.id} ticket={ticket} locale={locale} t={t} onTransfer={() => setTransferId(ticket.id)} />
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {tab === "past" ? (
          <div className="mt-6 overflow-x-auto rounded-card border border-line/10 bg-card">
            <div className="flex items-center justify-between p-4">
              <h2 className="font-display text-xl font-bold">{t("historyTitle")}</h2>
              <button type="button" className="h-11 rounded-full border border-line/20 bg-card px-4 text-sm font-semibold transition hover:bg-paper" onClick={exportCsv}>
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
                      <p className="font-semibold">{locale === "ar" ? ticket.event.titleAr : ticket.event.titleFr}</p>
                      <p className="text-muted">{ticket.event.city}</p>
                    </td>
                    <td className="px-4 py-3">{longDate(ticket.event.start, locale)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{ticket.ref}</td>
                    <td className="px-4 py-3">{money(ticket.priceCents)} MAD</td>
                    <td className="px-4 py-3">
                      {ticket.status === "TRANSFERRED" ? t("transferred") : ticket.status === "CANCELLED" ? t("cancelled") : t("used")}
                    </td>
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

        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          <article className="rounded-card border border-line/10 bg-card p-4 shadow-card">
            <h2 className="font-display text-xl font-bold">{t("lastTx")}</h2>
            {latest ? (
              <>
                <p className="mt-2 text-sm text-muted">{latest.paymentRef}</p>
                <p className="mt-3 flex justify-between">
                  <span>{latest.tickets[0] ? (locale === "ar" ? latest.tickets[0].event.titleAr : latest.tickets[0].event.titleFr) : t("tickets")}</span>
                  <span>{money(latest.subtotalCents)} MAD</span>
                </p>
                <p className="flex justify-between text-sm">
                  <span>{t("serviceFee")}</span>
                  <span>{t("feesFree")}</span>
                </p>
                <p className="mt-2 flex justify-between font-display text-2xl font-extrabold">
                  <span>{t("totalDebited")}</span>
                  <span>{money(latest.totalCents)} MAD</span>
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">{t("noPast")}</p>
            )}
          </article>
          <article className="rounded-card border border-line/10 bg-card p-4 shadow-card">
            <h2 className="font-display text-xl font-bold">{t("edit")}</h2>
            {editingName ? (
              <form className="mt-3 grid gap-2" onSubmit={saveName}>
                {/* Was unlabelled: a screen reader announced only "edit text",
                    with no indication of what it edits. */}
                <Field label={t("fullName")} required>
                  {(props) => <Input {...props} value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} autoComplete="name" />}
                </Field>
                <div className="flex gap-2">
                  <button type="submit" disabled={busy} className="h-11 flex-1 rounded-full bg-action text-sm font-semibold text-action-fg transition hover:bg-action-hover disabled:opacity-50">
                    {t("saveProfile")}
                  </button>
                  <button type="button" className="h-11 rounded-full border border-line/20 bg-card px-4 text-sm font-semibold transition hover:bg-paper" onClick={() => setEditingName(false)}>
                    {t("cancel")}
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className="mt-3 text-sm font-semibold text-primary"
                onClick={() => {
                  setNameDraft(user?.name ?? "");
                  setEditingName(true);
                }}
              >
                {t("edit")} — {user?.name}
              </button>
            )}
          </article>
        </section>
      </div>

      <Modal
        open={Boolean(transferId)}
        onClose={() => setTransferId(null)}
        title={t("transferTitle")}
        icon={<Send className="size-5" />}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTransferId(null)}>
              {t("cancel")}
            </Button>
            <Button type="submit" form="transfer-form" loading={busy}>
              {t("sendTicket")}
            </Button>
          </>
        }
      >
        <form id="transfer-form" onSubmit={submitTransfer}>
          <Field label={t("friendName")} required>
            {(props) => <Input {...props} value={friend} onChange={(e) => setFriend(e.target.value)} autoComplete="name" />}
          </Field>
        </form>
      </Modal>
    </Shell>
  );
}

function Mini({ value, label }) {
  return (
    <div className="rounded-card bg-stage-fg/10 px-3 py-2 text-center">
      <p className="font-display text-lg font-extrabold tabular-nums">{value}</p>
      <p className="text-xs text-stage-muted">{label}</p>
    </div>
  );
}

function SmallTicket({ ticket, locale, t, onTransfer }) {
  return (
    <article className="flex gap-3 rounded-card border border-line/10 bg-card p-3 shadow-card">
      <img src={ticket.event.image} alt="" className="size-20 rounded-control object-cover" />
      <div className="min-w-0 flex-1">
        <h3 className="font-display font-bold">{locale === "ar" ? ticket.event.titleAr : ticket.event.titleFr}</h3>
        <p className="text-sm text-muted">{ticket.event.city}</p>
        <div className="mt-2 flex gap-2">
          <Link to={`/billet/${ticket.id}`} className="inline-flex h-10 items-center rounded-full bg-action px-3.5 text-sm font-semibold text-action-fg transition hover:bg-action-hover">
            {t("seeQr")}
          </Link>
          <button type="button" className="h-10 rounded-full border border-line/20 bg-card px-3.5 text-sm font-semibold transition hover:bg-paper" onClick={onTransfer}>
            {t("transfer")}
          </button>
        </div>
      </div>
    </article>
  );
}

export default function Billets() {
  return (
    <Protected>
      <BilletsInner />
    </Protected>
  );
}
