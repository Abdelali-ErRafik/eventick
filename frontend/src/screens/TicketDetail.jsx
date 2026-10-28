import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { QrMark } from "../components/QrMark";
import { Shell } from "../components/Shell";
import { toast } from "sonner";
import { seatLabel } from "../components/TicketPass";
import { api, downloadFile, money } from "../api";
import { useI18n } from "../i18n";
import { Badge, Button, Card, Field, Input, Modal } from "../ui";

export default function TicketDetail() {
  const { ticketId } = useParams();
  const { locale, t } = useI18n();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [options, setOptions] = useState(null);
  const [busy, setBusy] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [renaming, setRenaming] = useState(null);

  const load = useCallback(() => {
    api
      .get(`/tickets/${ticketId}`)
      .then(setData)
      .catch((err) => setError(err.message));
    // What the holder may actually do — drives which controls appear, so the
    // page never offers an action the server will reject.
    api
      .get(`/tickets/${ticketId}/options`)
      .then(setOptions)
      .catch(() => setOptions(null));
  }, [ticketId]);

  useEffect(load, [load]);

  const cancelTicket = async () => {
    if (busy) return;
    setConfirmCancel(false);
    setBusy(true);
    try {
      await api.post(`/tickets/${ticketId}/cancel`, {});
      toast.success(t("cancelDone"));
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const changeZone = async (tierId) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/tickets/${ticketId}/exchange`, { tierId });
      toast.success(t("zoneChanged"));
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitName = async (event) => {
    event.preventDefault();
    const next = (renaming ?? "").trim();
    if (next.length < 2 || busy) return;
    setBusy(true);
    try {
      await api.patch(`/tickets/${ticketId}/holder`, { holderName: next });
      toast.success(t("nameFixed"));
      setRenaming(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Giving the ticket away. The link is created here but nothing moves until
  // the recipient claims it, so until then this ticket keeps working and the
  // share can be pulled back.
  const shareUrl = (token) => `${window.location.origin}/billet-offert/${token}`;

  const createShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const share = await api.post("/share", {
        ticketId,
        message: shareMessage.trim() || undefined,
      });
      setShareMessage("");
      // Offer the link straight away — copying is the whole point of creating it.
      await copyShare(share.token);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const copyShare = async (token) => {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      toast.success(t("shareCopied"));
    } catch {
      // Clipboard access needs a secure context and can be blocked outright;
      // showing the link is a worse UX than copying but better than silence.
      window.prompt(t("shareLink"), shareUrl(token));
    }
  };

  const revokeShare = async (shareId) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.del(`/share/${shareId}`);
      toast.success(t("shareRevoked"));
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <Shell>
        <div className="mx-auto max-w-xl px-4 py-16 text-center">
          <h1 className="font-display text-3xl font-extrabold">{t("notFound")}</h1>
          <Link to="/billets" className="mt-4 inline-flex h-12 items-center rounded-full bg-action px-5 font-semibold text-action-fg transition hover:bg-action-hover">
            {t("seeTickets")}
          </Link>
        </div>
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell>
        <div className="mx-auto h-80 max-w-xl animate-pulse px-4 py-10" />
      </Shell>
    );
  }

  const { ticket, event, tier, order } = data;
  const title = locale === "ar" ? event.titleAr : event.titleFr;
  const venue = locale === "ar" ? event.venueAr : event.venueFr;
  const zone = locale === "ar" ? tier.zoneAr : tier.zoneFr;
  const gate = locale === "ar" ? tier.gateAr : tier.gateFr;
  const seat = seatLabel(ticket, locale);

  return (
    <Shell>
      <div className="mx-auto max-w-xl px-4 py-8">
        <div className="flex items-center justify-between no-print">
          <Link to="/billets" className="text-sm font-semibold text-primary">
            {t("back")}
          </Link>
          <div className="flex gap-2">
            <button
              type="button"
              className="h-11 rounded-full bg-action px-4 text-sm font-semibold text-action-fg transition hover:bg-action-hover"
              onClick={() => downloadFile(`/tickets/${ticketId}/pdf`, `${ticket.ref}.pdf`).catch((err) => toast.error(err.message))}
            >
              {t("download")}
            </button>
            <button type="button" className="h-11 rounded-full border border-line/20 bg-card px-4 text-sm font-semibold transition hover:bg-paper" onClick={() => window.print()}>
              {t("print")}
            </button>
          </div>
        </div>
        <article className="mt-4 overflow-hidden rounded-card bg-card shadow-pop">
          {event.image ? <img src={event.image} alt="" className="h-44 w-full object-cover" /> : null}
          <div className="p-5">
            <p className="font-mono text-xs text-primary">{ticket.ref}</p>
            <h1 className="mt-1 font-display text-3xl font-extrabold">{title}</h1>
            <p className="mt-2 text-sm text-muted">{new Date(event.start).toLocaleDateString(locale === "ar" ? "ar-MA" : "fr-FR")}</p>
            <p className="font-semibold">{venue}</p>
            <p className="text-sm">
              {zone} · {gate}
            </p>
            <p className="text-sm">{seat ?? t("freeSeat")}</p>
            <p className="mt-2 text-sm">
              {t("holderOf")} · {ticket.holderName}
            </p>
            <div className="mt-4 flex justify-center rounded-control bg-paper p-4">
              <QrMark value={data.qrPayload} className="size-52" />
            </div>
            <p className="mt-2 text-center text-xs text-muted">{t("brightness")}</p>
            {ticket.status !== "VALID" ? (
              <p className="mt-3 text-center font-bold text-danger">
                {ticket.status === "TRANSFERRED" ? t("transferred") : ticket.status === "CANCELLED" ? t("cancelled") : t("used")}
              </p>
            ) : (
              <p className="mt-3 text-center font-bold text-success">{t("validEntry")}</p>
            )}
          </div>
        </article>
        <section className="mt-4 rounded-card border border-line/10 bg-card p-4">
          <h2 className="font-display text-lg font-bold">{t("invoice")}</h2>
          <p className="mt-2 flex justify-between text-sm">
            <span>{t("subtotal")}</span>
            <span>{money(order.subtotalCents)} MAD</span>
          </p>
          <p className="flex justify-between text-sm">
            <span>{t("fees")}</span>
            <span>{t("feesFree")}</span>
          </p>
          <p className="flex justify-between text-sm">
            <span>{t("vat")}</span>
            <span>{t("included")}</span>
          </p>
          <p className="mt-2 flex justify-between font-display text-xl font-extrabold">
            <span>{t("totalDebited")}</span>
            <span>{money(order.totalCents)} MAD</span>
          </p>
          <p className="mt-2 font-mono text-xs text-muted">
            {order.paymentRef} · {order.cardBank} ···· {order.cardLast4}
          </p>
        </section>

        {/* Only offered while the ticket is still a live entitlement. */}
        {options && ticket.status === "VALID" ? (
          <section className="no-print mt-4 rounded-card border border-line/10 bg-card p-4">
            <h2 className="font-display text-lg font-bold">{t("manageTicket")}</h2>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="h-11 rounded-full border border-line/20 bg-card px-4 text-sm font-semibold transition hover:bg-paper disabled:opacity-50"
                onClick={() => setRenaming(data?.ticket?.holderName ?? "")}
                disabled={busy}
              >
                {t("fixName")}
              </button>
              {options.cancel?.allowed ? (
                <button
                  type="button"
                  className="h-11 rounded-full bg-danger px-4 text-sm font-semibold text-danger-fg transition hover:brightness-110 disabled:opacity-50"
                  onClick={() => setConfirmCancel(true)}
                  disabled={busy}
                >
                  {t("cancelTicket")}
                </button>
              ) : null}
            </div>

            <p className="mt-2 text-xs text-muted">
              {options.cancel?.allowed
                ? t("cancelUntil").replace("{n}", String(options.cancel.cutoffHours))
                : options.cancel?.reason === "self-cancel-disabled"
                  ? t("cancelDisabled")
                  : t("cancelClosed")}
            </p>

            {options.exchange?.length ? (
              <>
                <h3 className="mt-4 text-sm font-bold">{t("changeZone")}</h3>
                <ul className="mt-2 grid gap-2">
                  {options.exchange.map((zone) => (
                    <li key={zone.tierId} className="flex items-center justify-between gap-3 rounded-control bg-paper px-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">
                          {locale === "ar" ? zone.nameAr : zone.nameFr}
                        </span>
                        <span className="block text-xs text-muted">
                          {zone.dueCents > 0 ? t("zoneExtra").replace("{n}", money(zone.dueCents)) : t("zoneIncluded")}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="h-10 shrink-0 rounded-full bg-action px-3.5 text-xs font-semibold text-action-fg transition hover:bg-action-hover disabled:opacity-40"
                        onClick={() => changeZone(zone.tierId)}
                        // An upgrade owes money, which this page cannot yet
                        // collect — the server refuses it, so don't offer it.
                        disabled={busy || zone.soldOut || zone.dueCents > 0}
                      >
                        {zone.soldOut ? t("zoneSoldOut") : t("changeZone")}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {/* Give it away. An open link is shown back rather than offering
                a second "share" button the server would refuse. */}
            {options.share ? (
              <>
                <h3 className="mt-4 text-sm font-bold">{t("shareTicket")}</h3>
                <p className="mt-1 text-xs text-muted">{t("shareOpen")}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="h-11 rounded-full bg-action px-4 text-sm font-semibold text-action-fg transition hover:bg-action-hover disabled:opacity-50"
                    onClick={() => copyShare(options.share.token)}
                    disabled={busy}
                  >
                    {t("shareCopy")}
                  </button>
                  <button
                    type="button"
                    className="h-11 rounded-full border border-line/20 bg-card px-4 text-sm font-semibold transition hover:bg-paper disabled:opacity-50"
                    onClick={() => revokeShare(options.share.id)}
                    disabled={busy}
                  >
                    {t("shareRevoke")}
                  </button>
                </div>
              </>
            ) : options.shareable ? (
              <>
                <h3 className="mt-4 text-sm font-bold">{t("shareTicket")}</h3>
                <p className="mt-1 text-xs text-muted">{t("shareTicketHint")}</p>
                <input
                  value={shareMessage}
                  onChange={(event) => setShareMessage(event.target.value)}
                  maxLength={280}
                  placeholder={t("shareMessagePlaceholder")}
                  aria-label={t("shareMessage")}
                  className="mt-2 h-11 w-full rounded-control border border-line/20 bg-paper px-3 text-sm"
                />
                <button
                  type="button"
                  className="mt-2 h-11 rounded-full bg-action px-4 text-sm font-semibold text-action-fg transition hover:bg-action-hover disabled:opacity-50"
                  onClick={createShare}
                  disabled={busy}
                >
                  {t("shareCreate")}
                </button>
                <p className="mt-2 text-xs text-muted">{t("shareNote")}</p>
              </>
            ) : null}
          </section>
        ) : null}
      </div>

      {/* Cancelling refunds money and cannot be undone, so it gets a real
          dialog. window.confirm could not be styled or fully translated, and
          some mobile browsers suppress it outright - which would have
          cancelled the ticket with no prompt shown at all. */}
      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title={t("cancelTicket")}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmCancel(false)}>
              {t("cancel")}
            </Button>
            <Button variant="danger" loading={busy} onClick={cancelTicket}>
              {t("cancelTicket")}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-muted">{t("confirmCancelTicket")}</p>
      </Modal>

      <Modal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title={t("fixName")}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenaming(null)}>
              {t("cancel")}
            </Button>
            <Button type="submit" form="rename-form" loading={busy} disabled={(renaming ?? "").trim().length < 2}>
              {t("saveProfile")}
            </Button>
          </>
        }
      >
        <form id="rename-form" onSubmit={submitName}>
          <Field label={t("holderOf")} required>
            {(props) => (
              <Input {...props} value={renaming ?? ""} onChange={(e) => setRenaming(e.target.value)} autoComplete="name" />
            )}
          </Field>
        </form>
      </Modal>
    </Shell>
  );
}
