import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Calendar, Clock, Heart, MapPin, Minus, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "../components/Shell";
import { EventCard } from "../components/EventCard";
import { api, money } from "../api";
import { useCart } from "../CartContext";
import { useFavorites } from "../FavoritesContext";
import { useCatalog } from "../useCatalog";
import { useI18n } from "../i18n";
import { Badge, Button, Card, Container, ErrorState, LoadingState } from "../ui";
import { cn, dateRange, groupNumber, mapsUrl, totalRemaining } from "../utils";

const MAX_QTY_PER_TIER = 8;

export default function EventDetail() {
  const { slug } = useParams();
  const { locale, t, tf } = useI18n();
  const navigate = useNavigate();
  const { setCart } = useCart();
  const { favorites, toggle } = useFavorites();
  const { events, bySlug, loading, error, reload } = useCatalog();
  const event = bySlug(slug);
  const [qty, setQty] = useState({});
  const [waitEmail, setWaitEmail] = useState("");
  const [waitBusy, setWaitBusy] = useState(false);
  const [booking, setBooking] = useState(false);
  // Live remaining counts, refreshed after a failed booking so the buyer sees
  // the real numbers rather than the ones the page loaded with.
  const [remaining, setRemaining] = useState(null);

  /** Seats left per tier: the live figure once we've refreshed, else the one
   * the catalogue was loaded with. */
  const leftFor = (tier) => remaining?.[tier.id] ?? tier.remaining;

  const lines = useMemo(() => {
    if (!event) return [];
    return event.tiers
      .map((tier) => ({ tier, qty: qty[tier.id] ?? 0, left: remaining?.[tier.id] ?? tier.remaining }))
      .filter((line) => line.qty > 0);
  }, [event, qty, remaining]);

  // Three distinct states. The old code rendered an empty 320px box while
  // loading and the same box on failure, so a dead backend looked like a slow
  // one and neither offered a way out.
  if (loading) {
    return (
      <Shell>
        <Container className="py-10">
          <LoadingState label={t("loadingEvents")} rows={3} />
        </Container>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <Container className="py-10">
          <ErrorState
            title={t("catalogErrorTitle")}
            body={t("catalogErrorBody")}
            onRetry={reload}
            retryLabel={t("retry")}
          />
        </Container>
      </Shell>
    );
  }

  if (!event) {
    return (
      <Shell>
        <Container size="narrow" className="py-20 text-center">
          <h1 className="font-display text-title font-extrabold">{t("notFound")}</h1>
          <p className="mt-2 text-muted">{t("notFoundBody")}</p>
          <Button className="mt-6" onClick={() => navigate("/explorer")}>
            {t("backEvents")}
          </Button>
        </Container>
      </Shell>
    );
  }

  const total = lines.reduce((sum, line) => sum + line.qty * line.tier.priceCents, 0);
  const count = lines.reduce((sum, line) => sum + line.qty, 0);
  const related = events.filter((item) => item.category === event.category && item.slug !== event.slug && item.end >= event.start).slice(0, 3);
  const title = locale === "ar" ? event.titleAr : event.titleFr;
  const venue = locale === "ar" ? event.venueAr : event.venueFr;
  const soldOut = totalRemaining(event) === 0;
  const isSaved = favorites.includes(event.slug);

  const change = (id, left, delta) => {
    setQty((current) => {
      const next = Math.max(0, Math.min(left, MAX_QTY_PER_TIER, (current[id] ?? 0) + delta));
      return { ...current, [id]: next };
    });
  };

  /**
   * Reserve the seats NOW, before the buyer fills anything in.
   *
   * The reservation used to happen when the checkout form was submitted, so a
   * buyer could type their whole name, email and phone and only then be told
   * the tickets had gone. Claiming the seat on this click means the form is
   * only ever shown for tickets they already hold.
   */
  const checkout = async () => {
    if (!count) {
      toast.error(t("emptyCart"));
      return;
    }
    if (booking) return;
    setBooking(true);
    try {
      const hold = await api.post("/orders/hold", {
        eventSlug: event.slug,
        lines: lines.map((line) => ({ tierId: line.tier.id, qty: line.qty })),
      });
      setCart({
        eventSlug: event.slug,
        lines: lines.map((line) => ({ tierId: line.tier.id, qty: line.qty })),
        orderId: hold.order.id,
        holdUntil: hold.holdUntil,
      });
      navigate("/paiement");
    } catch (err) {
      // 409 means someone else took them between the page loading and this
      // click — tell them here, where they've lost nothing but a tap.
      toast.error(err.status === 409 ? t("oversell") : err.message || t("reserveFail"));
      api
        .get(`/orders/availability/${event.slug}`)
        .then((data) => setRemaining(data.remaining))
        .catch(() => {});
      setQty({});
    } finally {
      setBooking(false);
    }
  };

  const joinWaitlist = async (e) => {
    e.preventDefault();
    if (waitBusy) return;
    setWaitBusy(true);
    try {
      await api.post(`/events/${event.slug}/waitlist`, { email: waitEmail.trim() });
      toast.success(t("waitOk"));
      setWaitEmail("");
    } catch (err) {
      toast.error(err.status === 409 ? t("waitDup") : err.message);
    } finally {
      setWaitBusy(false);
    }
  };

  return (
    <Shell overlay>
      {/* Deliberately always dark, so the photo stays legible regardless of
          app theme — see the note on --et-stage in styles.css. */}
      <section className="relative -mt-16 overflow-hidden bg-stage pt-16 text-stage-fg">
        <img src={event.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-t from-stage via-stage/80 to-stage/40" />
        <div className="relative mx-auto max-w-7xl px-4 py-12 md:px-8 md:py-16">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-stage-fg/15 px-3 py-1 text-xs font-bold">{t("official")}</span>
            {event.badge === "last" || event.badge === "hot" ? (
              <span className="rounded-full bg-danger px-3 py-1 text-xs font-bold">{t("limited")}</span>
            ) : null}
          </div>
          <h1 className="mt-4 max-w-4xl font-display text-4xl font-extrabold leading-none md:text-hero">{title}</h1>
          <p className="mt-4 max-w-2xl text-stage-muted">{locale === "ar" ? event.aboutAr : event.aboutFr}</p>
          <div className="mt-6 flex flex-wrap gap-4 text-sm">
            <span className="inline-flex items-center gap-2">
              <Calendar className="size-4 text-accent" />
              {dateRange(event.start, event.end, locale)}
            </span>
            <span className="inline-flex items-center gap-2">
              <Clock className="size-4 text-accent" />
              {t("doors")} {new Date(event.doors).toLocaleTimeString(locale === "ar" ? "ar-MA" : "fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="inline-flex items-center gap-2">
              <MapPin className="size-4 text-accent" />
              {venue}, {event.city}
            </span>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="#billets" className="inline-flex h-12 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-fg transition hover:bg-primary-hover">
              {t("choose")}
            </a>
            <a href={mapsUrl(event)} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center rounded-full border border-stage-fg/30 px-5 text-sm font-semibold">
              {t("directions")}
            </a>
            <button
              type="button"
              className="inline-flex size-12 items-center justify-center rounded-full border border-stage-fg/30"
              aria-label={t("saved")}
              onClick={() => {
                toggle(event.slug);
                toast.success(isSaved ? t("savedOk") : t("savedAdd"));
              }}
            >
              <Heart className={isSaved ? "size-5 fill-accent text-accent" : "size-5"} />
            </button>
          </div>
        </div>
      </section>

      <div id="billets" className="mx-auto grid max-w-7xl gap-6 px-4 py-10 md:px-8 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-8">
          <Card pad={false} className="overflow-hidden">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line/10 p-5">
              <div className="min-w-0">
                <h2 className="font-display text-heading font-extrabold">{t("select")}</h2>
                <p className="mt-0.5 text-sm text-muted">{t("officialSale")}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                <ShieldCheck className="size-4 shrink-0" aria-hidden />
                {t("accessOk")}
              </span>
            </div>

            <ul className="divide-y divide-line/10">
              {event.tiers.map((tier) => {
                const left = leftFor(tier);
                const value = qty[tier.id] ?? 0;
                const gone = left === 0;
                // "Only n left" is only true when it IS few. The old card
                // showed it under 80 seats, which on a 20 000-seat festival
                // was manufactured urgency.
                const scarce = !gone && left <= 10;

                return (
                  <li
                    key={tier.id}
                    className={cn(
                      "p-5 transition",
                      tier.recommended && "bg-brume/30",
                      value > 0 && "bg-brume/50",
                      gone && "opacity-55",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap gap-1.5">
                          {tier.recommended ? <Badge tone="primary">{t("recommended")}</Badge> : null}
                          {tier.saveCents ? (
                            <Badge tone="accent">{tf("savePct", { n: Math.round((tier.saveCents / tier.priceCents) * 100) })}</Badge>
                          ) : null}
                          {scarce ? <Badge tone="danger">{tf("seatsLeft", { n: left })}</Badge> : null}
                          {gone ? <Badge tone="neutral">{t("soldOut")}</Badge> : null}
                        </div>

                        <h3 className="mt-2 font-display text-subhead font-bold">
                          {locale === "ar" ? tier.nameAr : tier.nameFr}
                        </h3>
                        <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">
                          {locale === "ar" ? tier.blurbAr : tier.blurbFr}
                        </p>
                        <p className="mt-2 font-mono text-xs text-primary">
                          {locale === "ar" ? tier.zoneAr : tier.zoneFr} · {locale === "ar" ? tier.gateAr : tier.gateFr}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-2.5">
                        <p className="font-display text-heading font-extrabold tabular-nums">
                          {money(tier.priceCents)} <span className="text-sm font-bold text-muted">MAD</span>
                        </p>
                        <div className="inline-flex items-center rounded-full border border-line/15 bg-card">
                          <button
                            type="button"
                            className="inline-flex size-11 items-center justify-center rounded-s-full text-muted transition hover:bg-paper hover:text-ink disabled:opacity-35"
                            aria-label={t("remove")}
                            disabled={value === 0}
                            onClick={() => change(tier.id, left, -1)}
                          >
                            <Minus className="size-4" aria-hidden />
                          </button>
                          <span
                            className="w-8 text-center font-display font-extrabold tabular-nums"
                            aria-live="polite"
                            aria-label={tf("ticketsChosen", { n: value })}
                          >
                            {value}
                          </span>
                          <button
                            type="button"
                            className="inline-flex size-11 items-center justify-center rounded-e-full text-muted transition hover:bg-paper hover:text-ink disabled:opacity-35"
                            aria-label={t("add")}
                            disabled={value >= Math.min(MAX_QTY_PER_TIER, left)}
                            onClick={() => change(tier.id, left, 1)}
                          >
                            <Plus className="size-4" aria-hidden />
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          {event.lineup?.length ? (
            <section>
              <h2 className="font-display text-2xl font-extrabold">{t("lineup")}</h2>
              <p className="text-sm text-muted">{t("programming")}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {event.lineup.map((item) => (
                  <article key={item.name} className="overflow-hidden rounded-card border border-line/10 bg-card shadow-card">
                    <img src={item.image} alt="" className="h-32 w-full object-cover" />
                    <div className="p-3">
                      <p className="font-mono text-xs text-primary">
                        {new Date(item.day).getUTCDate()} · {item.time}
                      </p>
                      <h3 className="font-display font-bold">{item.name}</h3>
                      <p className="text-sm text-muted">{locale === "ar" ? item.genreAr : item.genreFr}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section className="rounded-card border border-line/10 bg-card p-4 shadow-card md:p-6">
            <h2 className="font-display text-2xl font-extrabold">{t("plan")}</h2>
            <p className="text-sm text-muted">{venue}</p>
            <div className="mx-auto mt-4 max-w-lg rounded-card bg-paper p-4">
              <div className="mx-auto flex h-14 max-w-xs items-center justify-center rounded-t-xl bg-primary text-sm font-bold text-primary-fg">{t("stage")}</div>
              <div className="mx-auto mt-2 flex h-16 max-w-sm items-center justify-center bg-accent/80 text-sm font-bold text-accent-fg">{t("vipZone")}</div>
              <div className="mx-auto mt-2 flex h-24 max-w-lg items-center justify-center bg-brume-deep text-sm font-bold text-primary">{t("lawn")}</div>
              <p className="mt-3 text-center text-xs text-muted">
                {t("capacity")} · {groupNumber(event.tiers.reduce((sum, tier) => sum + tier.capacity, 0))}
              </p>
            </div>
          </section>

          <section>
            <h2 className="font-display text-2xl font-extrabold">{t("practical")}</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Info title={t("access")} body={`${venue}, ${event.address}. ${t("accessBody")}`} />
              <Info title={t("parking")} body={t("parkingBody")} />
              <Info title={t("age")} body={locale === "ar" ? event.ageAr : event.ageFr} />
              <Info title={t("fraud")} body={t("fraudBody")} />
            </div>
          </section>
        </div>

        <aside className="h-fit lg:sticky lg:top-24">
          {/* Deliberately always dark — see the note on --et-stage. */}
          <Card className="bg-stage text-stage-fg" pad={false}>
            <div className="border-b border-stage-fg/10 p-5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-stage-muted">{t("recap")}</p>
              <h2 className="mt-0.5 font-display text-subhead font-extrabold">{t("cart")}</h2>
            </div>

            <div className="p-5">
              {lines.length === 0 ? (
                <p className="text-sm text-stage-muted">{t("emptyCart")}</p>
              ) : (
                <ul className="grid gap-2 text-sm">
                  {lines.map((line) => (
                    <li key={line.tier.id} className="flex justify-between gap-3">
                      <span className="min-w-0">
                        <span className="font-semibold tabular-nums">{line.qty}×</span>{" "}
                        {locale === "ar" ? line.tier.nameAr : line.tier.nameFr}
                      </span>
                      <span className="shrink-0 tabular-nums">{money(line.qty * line.tier.priceCents)}</span>
                    </li>
                  ))}
                </ul>
              )}

              <dl className="mt-4 grid gap-1.5 border-t border-stage-fg/15 pt-4 text-sm">
                <Row label={t("fees")} value={t("feesFree")} />
                <Row label={t("vat")} value={t("included")} />
              </dl>

              {/* The total is the biggest thing in the panel — it is what the
                  buyer is deciding about. */}
              <div className="mt-4 border-t border-stage-fg/15 pt-4">
                <p className="text-sm text-stage-muted">{t("total")}</p>
                <p className="font-display text-display font-extrabold leading-none tabular-nums">
                  {money(total)} <span className="text-heading font-bold text-stage-muted">MAD</span>
                </p>
              </div>

              <Button
                full
                size="lg"
                className="mt-4"
                disabled={!count}
                loading={booking}
                onClick={checkout}
              >
                {t("pay")}
              </Button>

              {soldOut ? (
                <form className="mt-5 grid gap-2 border-t border-stage-fg/15 pt-5" onSubmit={joinWaitlist}>
                  <p className="text-sm font-bold">{t("waitTitle")}</p>
                  <p className="text-xs leading-relaxed text-stage-muted">{t("waitBody")}</p>
                  <input
                    className="h-11 w-full rounded-control border border-stage-fg/20 bg-stage-fg/10 px-4 text-sm text-stage-fg outline-none placeholder:text-stage-muted focus:border-accent"
                    type="email"
                    required
                    value={waitEmail}
                    onChange={(e) => setWaitEmail(e.target.value)}
                    placeholder={t("email")}
                    aria-label={t("email")}
                  />
                  <Button variant="inverse" full type="submit" loading={waitBusy}>
                    {t("waitJoin")}
                  </Button>
                </form>
              ) : null}

              <div className="mt-5 border-t border-stage-fg/15 pt-4">
                <p className="text-xs text-stage-muted">{t("helpBook")}</p>
                <a
                  className="mt-1 inline-block text-sm font-semibold text-accent underline-offset-2 hover:underline"
                  href="https://wa.me/212537001122"
                  target="_blank"
                  rel="noreferrer"
                >
                  +212 5 37 00 11 22
                </a>
              </div>
            </div>
          </Card>
        </aside>
      </div>

      {/* Phone action bar. The count used to render as a bare number under
          the price — just "3", with no unit — so it read as a stray figure. */}
      {count > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line/10 bg-card/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-subhead font-extrabold tabular-nums">{money(total)} MAD</p>
              <p className="text-xs text-muted">{tf("ticketsChosen", { n: count })}</p>
            </div>
            <Button size="lg" loading={booking} onClick={checkout}>
              {t("pay")}
            </Button>
          </div>
        </div>
      ) : null}

      <section className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <h2 className="font-display text-2xl font-extrabold">{t("alsoSub")}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {related.map((item) => (
            <EventCard key={item.slug} event={item} />
          ))}
        </div>
      </section>
    </Shell>
  );
}

function Row({ label, value }) {
  // Used only inside the always-dark checkout summary card (bg-stage).
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-stage-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Info({ title, body }) {
  return (
    <article className="rounded-card border border-line/10 bg-card p-4 shadow-card">
      <h3 className="font-display font-bold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </article>
  );
}
