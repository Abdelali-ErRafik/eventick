import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Calendar, Clock, Heart, MapPin, Minus, Plus, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EventCard } from "@/components/event-card";
import { Shell } from "@/components/shell";
import { mapsUrl, remainingOf, tierLeft } from "@/lib/catalog";
import { dateRange, groupNumber, money } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { explorerSearch } from "@/lib/search";
import { useStore } from "@/lib/store";
import { eventTitle, eventVenue, useCatalog } from "@/lib/use-catalog";

export const Route = createFileRoute("/evenements/$slug")({
  component: EventPage,
});

function EventPage() {
  const { slug } = Route.useParams();
  const { locale, t, tf } = useI18n();
  const navigate = useNavigate();
  const { events, sold, bySlug } = useCatalog();
  const hydrated = useStore((state) => state.hydrated);
  const saved = useStore((state) => state.saved);
  const toggleSaved = useStore((state) => state.toggleSaved);
  const setCart = useStore((state) => state.setCart);
  const joinWaitlist = useStore((state) => state.joinWaitlist);
  const event = bySlug(slug);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [waitEmail, setWaitEmail] = useState("");

  const lines = useMemo(() => {
    if (!event) return [];
    return event.tiers
      .map((tier) => ({ tier, qty: qty[tier.id] ?? 0, left: tierLeft(event, tier, sold) }))
      .filter((line) => line.qty > 0);
  }, [event, qty, sold]);

  if (!event) {
    if (!hydrated) return <Shell><div className="h-80" /></Shell>;
    return (
      <Shell>
        <div className="mx-auto max-w-xl px-4 py-20 text-center">
          <h1 className="font-display text-3xl font-extrabold">{t("notFound")}</h1>
          <p className="mt-2 text-muted">{t("notFoundBody")}</p>
          <Link to="/explorer" search={explorerSearch()} className="mt-6 inline-flex h-12 items-center rounded-full bg-lagon px-5 font-semibold text-foam">
            {t("backEvents")}
          </Link>
        </div>
      </Shell>
    );
  }

  const total = lines.reduce((sum, line) => sum + line.qty * line.tier.price, 0);
  const count = lines.reduce((sum, line) => sum + line.qty, 0);
  const related = events.filter((item) => item.category === event.category && item.slug !== event.slug && item.end >= event.start).slice(0, 3);
  const title = eventTitle(event, locale);
  const venue = eventVenue(event, locale);
  const soldOut = remainingOf(event, sold) === 0;

  const change = (id: string, left: number, delta: number) => {
    setQty((current) => {
      const next = Math.max(0, Math.min(left, 8, (current[id] ?? 0) + delta));
      return { ...current, [id]: next };
    });
  };

  const checkout = () => {
    if (!count) {
      toast.error(t("emptyCart"));
      return;
    }
    setCart({ slug: event.slug, lines: lines.map((line) => ({ tierId: line.tier.id, qty: line.qty })) });
    void navigate({ to: "/paiement" });
  };

  return (
    <Shell overlay>
      <section className="relative -mt-16 overflow-hidden bg-encre pt-16 text-foam">
        <img src={event.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-t from-encre via-encre/80 to-encre/40" />
        <div className="relative mx-auto max-w-7xl px-4 py-12 md:px-8 md:py-16">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-foam/15 px-3 py-1 text-xs font-bold">{t("official")}</span>
            {event.badge === "last" || event.badge === "hot" ? (
              <span className="rounded-full bg-corail px-3 py-1 text-xs font-bold">{t("limited")}</span>
            ) : null}
          </div>
          <h1 className="mt-4 max-w-4xl font-display text-4xl font-extrabold leading-none md:text-hero">{title}</h1>
          <p className="mt-4 max-w-2xl text-mist">{locale === "ar" ? event.aboutAr : event.aboutFr}</p>
          <div className="mt-6 flex flex-wrap gap-4 text-sm">
            <span className="inline-flex items-center gap-2">
              <Calendar className="size-4 text-safran" />
              {dateRange(event.start, event.end, locale)}
            </span>
            <span className="inline-flex items-center gap-2">
              <Clock className="size-4 text-safran" />
              {t("doors")} {event.doors} · {event.time}
            </span>
            <span className="inline-flex items-center gap-2">
              <MapPin className="size-4 text-safran" />
              {venue}, {event.city}
            </span>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="#billets" className="inline-flex h-12 items-center rounded-full bg-safran px-5 text-sm font-semibold text-encre">
              {t("choose")}
            </a>
            <a href={mapsUrl(event)} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center rounded-full border border-foam/30 px-5 text-sm font-semibold">
              {t("directions")}
            </a>
            <button
              className="inline-flex size-12 items-center justify-center rounded-full border border-foam/30"
              aria-label={t("saved")}
              onClick={() => {
                const on = saved.includes(event.slug);
                toggleSaved(event.slug);
                toast.success(on ? t("savedOk") : t("savedAdd"));
              }}
            >
              <Heart className={saved.includes(event.slug) ? "size-5 fill-safran text-safran" : "size-5"} />
            </button>
          </div>
        </div>
      </section>

      <div id="billets" className="mx-auto grid max-w-7xl gap-6 px-4 py-10 md:px-8 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-8">
          <section className="rounded-xl border border-line/10 bg-card p-4 shadow-card md:p-6">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="font-display text-2xl font-extrabold">{t("select")}</h2>
                <p className="text-sm text-muted">{t("officialSale")}</p>
              </div>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-lagon">
                <ShieldCheck className="size-4" />
                {t("accessOk")}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {event.tiers.map((tier) => {
                const left = tierLeft(event, tier, sold);
                const value = qty[tier.id] ?? 0;
                return (
                  <article key={tier.id} className={`rounded-xl border p-4 ${tier.recommended ? "border-lagon bg-brume/40" : "border-line/10"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap gap-2">
                          {tier.recommended ? <span className="rounded-md bg-safran px-2 py-0.5 text-xs font-bold text-encre">{t("recommended")}</span> : null}
                          {tier.save ? <span className="rounded-md bg-corail px-2 py-0.5 text-xs font-bold text-foam">{tf("savePct", { n: tier.save })}</span> : null}
                          {left < 80 ? <span className="rounded-md bg-corail/10 px-2 py-0.5 text-xs font-bold text-corail">{tf("seatsLeft", { n: left })}</span> : null}
                        </div>
                        <h3 className="mt-2 font-display text-lg font-bold">{locale === "ar" ? tier.nameAr : tier.nameFr}</h3>
                        <p className="mt-1 max-w-xl text-sm text-muted">{locale === "ar" ? tier.blurbAr : tier.blurbFr}</p>
                        <p className="mt-2 text-xs text-lagon">
                          {(locale === "ar" ? tier.zoneAr : tier.zoneFr)} · {(locale === "ar" ? tier.gateAr : tier.gateFr)}
                        </p>
                      </div>
                      <div className="text-end">
                        <p className="font-display text-2xl font-extrabold tabular-nums">{money(tier.price, locale)}</p>
                        <div className="mt-2 inline-flex items-center rounded-full border border-line/15 bg-card">
                          <button className="inline-flex size-11 items-center justify-center" aria-label={t("remove")} disabled={value === 0} onClick={() => change(tier.id, left, -1)}>
                            <Minus className="size-4" />
                          </button>
                          <span className="w-6 text-center font-bold tabular-nums">{value}</span>
                          <button className="inline-flex size-11 items-center justify-center" aria-label={t("add")} disabled={value >= Math.min(8, left)} onClick={() => change(tier.id, left, 1)}>
                            <Plus className="size-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {event.lineup ? (
            <section>
              <h2 className="font-display text-2xl font-extrabold">{t("lineup")}</h2>
              <p className="text-sm text-muted">{t("programming")}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {event.lineup.map((item) => (
                  <article key={item.name} className="overflow-hidden rounded-xl border border-line/10 bg-card shadow-card">
                    <img src={item.image} alt="" className="h-32 w-full object-cover" />
                    <div className="p-3">
                      <p className="font-mono text-xs text-lagon">{item.day.slice(8)} · {item.time}</p>
                      <h3 className="font-display font-bold">{item.name}</h3>
                      <p className="text-sm text-muted">{locale === "ar" ? item.genreAr : item.genreFr}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section className="rounded-xl border border-line/10 bg-card p-4 shadow-card md:p-6">
            <h2 className="font-display text-2xl font-extrabold">{t("plan")}</h2>
            <p className="text-sm text-muted">{venue}</p>
            <div className="mx-auto mt-4 max-w-lg rounded-xl bg-paper p-4">
              <div className="mx-auto flex h-14 max-w-xs items-center justify-center rounded-t-xl bg-lagon text-sm font-bold text-foam">{t("stage")}</div>
              <div className="mx-auto mt-2 flex h-16 max-w-sm items-center justify-center bg-safran/80 text-sm font-bold text-encre">{t("vipZone")}</div>
              <div className="mx-auto mt-2 flex h-24 max-w-lg items-center justify-center bg-brume-deep text-sm font-bold text-lagon-deep">{t("lawn")}</div>
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

        <aside className="h-fit rounded-xl bg-lagon p-4 text-foam shadow-pop lg:sticky lg:top-24">
          <p className="text-sm font-semibold text-brume">{t("recap")}</p>
          <h2 className="font-display text-xl font-extrabold">{t("cart")}</h2>
          <div className="mt-4 space-y-2 text-sm">
            {lines.length === 0 ? <p className="text-brume">{t("emptyCart")}</p> : null}
            {lines.map((line) => (
              <p key={line.tier.id} className="flex justify-between gap-3">
                <span>
                  {line.qty} × {locale === "ar" ? line.tier.nameAr : line.tier.nameFr}
                </span>
                <span className="tabular-nums">{money(line.qty * line.tier.price, locale)}</span>
              </p>
            ))}
          </div>
          <div className="mt-4 space-y-1 border-t border-foam/20 pt-3 text-sm">
            <Row label={t("subtotal")} value={money(total, locale)} />
            <Row label={t("fees")} value={t("feesFree")} />
            <Row label={t("vat")} value={t("included")} />
          </div>
          <p className="mt-3 border-t border-foam/20 pt-3">
            <span className="block text-sm text-brume">{t("total")}</span>
            <span className="font-display text-3xl font-extrabold tabular-nums">{money(total, locale)}</span>
          </p>
          <button className="mt-4 h-12 w-full rounded-full bg-safran text-sm font-semibold text-encre disabled:opacity-50" disabled={!count} onClick={checkout}>
            {t("pay")}
          </button>
          {soldOut ? (
            <form
              className="mt-4 grid gap-2"
              onSubmit={(submitEvent) => {
                submitEvent.preventDefault();
                const ok = joinWaitlist(event.slug, waitEmail);
                toast[ok ? "success" : "error"](ok ? t("waitOk") : t("waitDup"));
                if (ok) setWaitEmail("");
              }}
            >
              <p className="text-sm font-semibold">{t("waitTitle")}</p>
              <p className="text-xs text-brume">{t("waitBody")}</p>
              <input className="field h-11 text-encre" type="email" required value={waitEmail} onChange={(input) => setWaitEmail(input.target.value)} placeholder={t("email")} />
              <button className="h-11 rounded-full bg-foam text-sm font-semibold text-encre" type="submit">
                {t("waitJoin")}
              </button>
            </form>
          ) : null}
          <p className="mt-4 text-xs text-brume">
            {t("helpBook")} · {t("whatsapp")}
          </p>
          <a className="mt-1 inline-block text-sm font-semibold underline" href="https://wa.me/212537001122" target="_blank" rel="noreferrer">
            +212 5 37 00 11 22
          </a>
          <p className="mt-3 font-mono text-xs text-brume">RÉF. {event.slug.toUpperCase()}</p>
        </aside>
      </div>

      {count > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line/10 bg-card p-3 lg:hidden">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div>
              <p className="font-display text-xl font-extrabold tabular-nums">{money(total, locale)}</p>
              <p className="text-xs text-muted">{count}</p>
            </div>
            <button className="h-12 rounded-full bg-safran px-5 text-sm font-semibold text-encre" onClick={checkout}>
              {t("pay")}
            </button>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex justify-between gap-3">
      <span className="text-brume">{label}</span>
      <span>{value}</span>
    </p>
  );
}

function Info({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-xl border border-line/10 bg-card p-4 shadow-card">
      <h3 className="font-display font-bold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </article>
  );
}
