import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Shell } from "../components/Shell";
import { QrMark } from "../components/QrMark";
import { toast } from "sonner";
import { api } from "../api";
import { Button } from "../ui";
import { useI18n } from "../i18n";

/**
 * Claim a shared ticket.
 *
 * No account needed: the token in the URL is the credential, the same rule the
 * guest confirmation and PDF links use. Once claimed, the ticket id becomes
 * the recipient's capability — so this page points them at it immediately
 * rather than leaving them with a QR they can never find again.
 */
export default function ClaimShare() {
  const { token } = useParams();
  const { locale, t } = useI18n();
  const [offer, setOffer] = useState(null);
  const [error, setError] = useState(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState(null);

  useEffect(() => {
    api
      .get(`/share/${token}`)
      .then(setOffer)
      .catch((err) => setError(err.status === 410 ? t("claimGone") : err.message));
  }, [token, t]);

  const accept = async (event) => {
    event.preventDefault();
    if (busy || name.trim().length < 3) return;
    setBusy(true);
    try {
      const result = await api.post(`/share/${token}/claim`, { holderName: name.trim() });
      setClaimed(result);
      toast.success(t("claimDone"));
    } catch (err) {
      // 410 means someone else got there first, or the sender pulled it.
      toast.error(err.status === 410 ? t("claimGone") : err.message);
      if (err.status === 410) setError(t("claimGone"));
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <Shell>
        <div className="mx-auto max-w-xl px-4 py-16 text-center">
          <p className="text-sm text-muted">{error}</p>
          <Link to="/explorer" className="mt-4 inline-block text-sm font-semibold text-primary underline">
            {t("explore")}
          </Link>
        </div>
      </Shell>
    );
  }

  if (claimed) {
    return (
      <Shell>
        <div className="mx-auto max-w-xl px-4 py-12 text-center">
          <h1 className="font-display text-2xl font-black">{t("claimDone")}</h1>
          <div className="mt-6 inline-block rounded-2xl border border-line/10 bg-card p-6">
            <QrMark value={claimed.qrPayload} />
            <p className="mt-3 font-mono text-xs tracking-widest text-muted">{claimed.ref}</p>
          </div>
          <p className="mt-4 text-sm text-muted">{t("claimKeepLink")}</p>
          <Link
            to={`/billet/${claimed.ticketId}`}
            className="mt-6 inline-flex h-12 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-fg transition hover:bg-primary-hover"
          >
            {t("viewTicket")}
          </Link>
        </div>
      </Shell>
    );
  }

  if (!offer) {
    return (
      <Shell>
        <div className="mx-auto max-w-xl px-4 py-16 text-center text-sm text-muted">{t("claimLoading")}</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mx-auto max-w-xl px-4 py-10">
        <h1 className="font-display text-2xl font-black">{t("claimTitle")}</h1>
        <p className="mt-1 text-sm text-muted">{t("claimFrom").replace("{n}", offer.senderName)}</p>

        <section className="mt-6 overflow-hidden rounded-2xl border border-line/10 bg-card">
          {offer.eventImage ? (
            <img src={offer.eventImage} alt="" className="h-40 w-full object-cover" />
          ) : null}
          <div className="p-4">
            <h2 className="font-display text-lg font-bold">
              {locale === "ar" ? offer.eventTitleAr : offer.eventTitleFr}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {new Date(offer.eventStart).toLocaleString(locale === "ar" ? "ar-MA" : "fr-MA", {
                dateStyle: "long",
                timeStyle: "short",
              })}
            </p>
            <p className="mt-2 text-sm font-semibold">
              {locale === "ar" ? offer.tierNameAr : offer.tierNameFr}
              {offer.seatRow ? ` · ${offer.seatRow}${offer.seatNumber}` : ""}
            </p>
            {offer.message ? (
              <p className="mt-3 rounded-lg bg-paper px-3 py-2 text-sm italic">“{offer.message}”</p>
            ) : null}
          </div>
        </section>

        <form onSubmit={accept} className="mt-6">
          <label className="block text-sm font-semibold" htmlFor="claim-name">
            {t("claimYourName")}
          </label>
          <input
            id="claim-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            minLength={3}
            className="mt-2 h-12 w-full rounded-xl border border-line/15 bg-card px-4 text-sm outline-none transition focus:border-primary focus:ring-[3px] focus:ring-primary/20"
          />
          <Button type="submit" full size="lg" className="mt-4" loading={busy} disabled={name.trim().length < 3}>
            {t("claimAccept")}
          </Button>
        </form>
      </div>
    </Shell>
  );
}
