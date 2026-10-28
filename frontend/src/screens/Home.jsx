import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Flame, Headphones, MapPin, Music, QrCode, RefreshCcw, Theater, Trophy, Utensils, MoonStar } from "lucide-react";
import { QrMark } from "../components/QrMark";
import { Shell } from "../components/Shell";
import { EventCard } from "../components/EventCard";
import { useCatalog } from "../useCatalog";
import { Button, Container, Dropdown, ErrorState, LoadingState } from "../ui";
import { categoryLabel, useI18n } from "../i18n";
import { CITIES, addDays, dateKey, todayKey } from "../utils";

const CATS = [
  { id: "festivals", icon: Music, tone: "bg-primary text-primary-fg" },
  { id: "humour", icon: Theater, tone: "bg-secondary text-secondary-fg" },
  { id: "sport", icon: Trophy, tone: "bg-accent text-accent-fg" },
  { id: "nightlife", icon: MoonStar, tone: "bg-stage text-stage-fg" },
  { id: "culture", icon: Utensils, tone: "bg-info text-info-fg" },
];

const TRENDS = [
  { label: "#Mawazine2027", query: "Mawazine" },
  { label: "#Gnaoua", query: "Gnaoua" },
  { label: "#DerbyCasa", query: "Derby" },
  { label: "#OasisFest", query: "Oasis" },
];

export default function Home() {
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const { events, loading, error, reload } = useCatalog();
  const [cat, setCat] = useState("");
  const [quand, setQuand] = useState("");
  const [ville, setVille] = useState("");

  const today = todayKey();
  const live = useMemo(() => events.filter((event) => dateKey(event.end) >= today), [events, today]);
  const cityCount = useMemo(() => new Set(live.map((event) => event.city)).size, [live]);
  const feature = live.find((event) => event.slug === "mawazine-2027") ?? live[0];
  const side = ["gnaoua-2027", "oasis-2026"]
    .map((slug) => live.find((event) => event.slug === slug))
    .filter((event) => event && event.slug !== feature?.slug);
  const imminent = [...live]
    .filter((event) => dateKey(event.start) <= addDays(today, 21))
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 3);

  const submitSearch = (event) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (cat) params.set("cat", cat);
    if (quand) params.set("quand", quand);
    if (ville) params.set("ville", ville);
    navigate(`/explorer?${params.toString()}`);
  };

  // The grids below are driven by the catalog. Without these the page
  // rendered its whole marketing frame around empty rails while loading, and
  // did the same on failure with nothing to retry.
  if (loading) {
    return (
      <Shell>
        <Container className="py-10">
          <LoadingState label={t("loadingEvents")} rows={4} />
        </Container>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <Container className="py-10">
          <ErrorState title={t("catalogErrorTitle")} body={t("catalogErrorBody")} onRetry={reload} retryLabel={t("retry")} />
        </Container>
      </Shell>
    );
  }

  const seatsAvailable = live.reduce((sum, event) => sum + event.tiers.reduce((n, tier) => n + tier.remaining, 0), 0);

  return (
    <Shell overlay>
      {/* Deliberately always dark, like the reference's hero band — see the
          note on --et-stage in styles.css. Full-viewport height instead of a
          content-hugging band: this is the one moment on the page meant to
          feel like a poster, not a card, so the headline gets room the rest
          of the page deliberately doesn't give anything else. */}
      <section className="relative -mt-16 flex min-h-[min(92vh,56rem)] flex-col overflow-hidden bg-stage pt-16 text-stage-fg">
        <img src="/events/mawazine.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" />
        <div className="absolute inset-0 bg-gradient-to-t from-stage via-stage/75 to-stage/35" />
        <div className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-4 py-16 md:px-8">
          <div className="max-w-4xl">
            <p className="inline-flex items-center gap-2 rounded-full bg-stage-fg/10 px-3 py-1 text-xs font-semibold">
              <span className="size-2 rounded-full bg-accent" />
              {t("kicker")}
            </p>
            <p className="mt-5 text-sm font-semibold text-accent">{t("secureMad")}</p>
            {/* text-hero is the biggest headline size used anywhere on the
                site (EventDetail, Explorer use it too), so this still reads
                as the page's visual climax without pushing the subtitle and
                search card below the fold the way a larger size did. */}
            <h1 className="mt-4 font-display text-4xl font-extrabold leading-none tracking-tight sm:text-5xl lg:text-hero">
              {t("heroA")} <span className="text-accent">{t("heroB")}</span> {t("heroC")}
            </h1>
            <p className="mt-6 max-w-xl text-base text-stage-muted lg:text-xl">{t("heroSub")}</p>
          </div>

          <form className="mt-10 w-full" onSubmit={submitSearch}>
            {/* The search card used to be a plain white rectangle of three
                bare <select> elements -- functional, but it looked like any
                admin form, not the one thing on the page meant to invite a
                click. A glow ring, icon-prefixed fields with real dividers
                between them, and a floating pill-shaped submit give it the
                weight the rest of the hero already earned. */}
            <div className="relative rounded-panel bg-linear-to-br from-primary via-secondary to-accent p-[1.5px] shadow-pop">
              <div className="flex flex-col divide-y divide-line/10 rounded-[calc(var(--radius-panel)-1.5px)] bg-card text-ink md:flex-row md:divide-x md:divide-y-0">
                <SearchField icon={<Music className="size-4" />} label={t("fieldType")}>
                  <Dropdown
                    value={cat}
                    onChange={setCat}
                    placeholder={t("allUniverses")}
                    width="w-64"
                    triggerClassName="text-sm font-bold"
                    options={[
                      { value: "", label: t("allUniverses") },
                      ...CATS.map((item) => ({ value: item.id, label: categoryLabel(item.id, t) })),
                    ]}
                  />
                </SearchField>
                <SearchField icon={<Calendar className="size-4" />} label={t("fieldPeriod")}>
                  <Dropdown
                    value={quand}
                    onChange={setQuand}
                    placeholder={t("anyTime")}
                    width="w-56"
                    triggerClassName="text-sm font-bold"
                    options={[
                      { value: "", label: t("anyTime") },
                      { value: "weekend", label: t("thisWeekend") },
                      { value: "month", label: t("thisMonth") },
                      { value: "summer", label: t("summer") },
                    ]}
                  />
                </SearchField>
                <SearchField icon={<MapPin className="size-4" />} label={t("fieldCity")}>
                  <Dropdown
                    value={ville}
                    onChange={setVille}
                    placeholder={t("allMorocco")}
                    width="w-56"
                    triggerClassName="text-sm font-bold"
                    options={[{ value: "", label: t("allMorocco") }, ...CITIES.map((city) => ({ value: city, label: city }))]}
                  />
                </SearchField>
                <div className="flex items-center p-2.5 md:ps-0">
                  <Button size="lg" type="submit" className="w-full md:w-auto">
                    {t("find")}
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 font-semibold text-stage-muted">
                <Flame className="size-3.5 text-accent" aria-hidden />
                {t("trends")} :
              </span>
              {TRENDS.map((trend) => (
                <button
                  key={trend.label}
                  type="button"
                  onClick={() => navigate(`/explorer?q=${encodeURIComponent(trend.query)}`)}
                  className="rounded-full border border-stage-fg/20 bg-stage-fg/10 px-3 py-1.5 text-xs font-bold text-stage-fg transition hover:border-accent hover:bg-accent hover:text-accent-fg"
                >
                  {trend.label}
                </button>
              ))}
            </div>
          </form>
        </div>

        {/* Stats, folded into the hero's own footer instead of a separate
            flat band right after it — one less "card after card" beat,
            and the numbers read as proof sitting under the headline rather
            than a standalone section with nothing else going on. */}
        <dl className="relative mx-auto grid w-full max-w-7xl grid-cols-3 gap-4 border-t border-stage-fg/10 px-4 py-6 md:px-8">
          <HeroStat value={live.length} label={t("eventsWord")} />
          <HeroStat value={cityCount} label={t("activeCities")} />
          <HeroStat value={seatsAvailable.toLocaleString(locale === "ar" ? "ar-MA" : "fr-MA")} label={t("seatsAvailable")} />
        </dl>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 md:px-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl font-extrabold">{t("byCat")}</h2>
            <p className="text-muted">{t("byCatSub")}</p>
          </div>
          <Button variant="ghost" className="shrink-0" onClick={() => navigate("/explorer")}>
            {t("seeAll")}
          </Button>
        </div>
        {/* Solid colour tiles instead of identical white cards with a small
            icon chip -- each category gets its own block of colour, so the
            rail reads as five distinct destinations rather than five copies
            of the same card with different text. */}
        <div className="mt-6 grid snap-x snap-mandatory auto-cols-[72%] grid-flow-col gap-3 overflow-x-auto pb-2 sm:auto-cols-[45%] lg:auto-cols-auto lg:grid-flow-row lg:grid-cols-5 lg:overflow-visible lg:pb-0">
          {CATS.map((item) => {
            const count = live.filter((event) => event.category === item.id).length;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(`/explorer?cat=${item.id}`)}
                className={`${item.tone} group rounded-card p-4 text-start shadow-card transition snap-start hover:-translate-y-0.5 hover:shadow-pop`}
              >
                <Icon className="size-6 opacity-90" />
                <p className="mt-4 font-display text-lg font-bold">{categoryLabel(item.id, t)}</p>
                <p className="mt-0.5 text-sm opacity-75">{t("eventsCount").replace("{n}", String(count))}</p>
              </button>
            );
          })}
        </div>
      </section>

      {feature ? (
        // Brume tint instead of the plain paper background every other
        // section sits on — one deliberate break in the rhythm at the
        // page's real centrepiece, instead of white-card, white-card,
        // white-card all the way down.
        <section className="bg-brume/40 py-14">
          <div className="mx-auto max-w-7xl px-4 md:px-8">
            <p className="font-mono text-xs font-bold tracking-widest text-primary">{t("majorKicker")}</p>
            <h2 className="mt-2 font-display text-4xl font-extrabold text-encre md:text-display">{t("majorTitle")}</h2>
            <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
              <EventCard event={feature} variant="feature" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                {side.map((event) => (
                  <EventCard key={event.slug} event={event} variant="compact" />
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* A near-black band for the urgency section -- "happening soon"
          reads as a ticker/alert moment, not another paper-background list,
          and it is the one place besides the hero and the promo band that
          goes dark, so the page now alternates light/tint/dark/light/dark
          instead of staying on paper from the fold down. */}
      <section className="bg-stage py-14 text-stage-fg">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-xs font-bold tracking-widest text-accent">{t("weekendTitle")}</p>
              <h2 className="font-display text-3xl font-extrabold">{t("weekendSub")}</h2>
            </div>
            <Button variant="inverse" onClick={() => navigate("/explorer?quand=month")}>
              {t("allCities")}
            </Button>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {imminent.map((event) => (
              <EventCard key={event.slug} event={event} variant="weekend" />
            ))}
          </div>
          <div className="mt-6 text-center">
            <Button variant="inverse" size="lg" onClick={() => navigate("/explorer")}>
              {t("exploreMore")}
            </Button>
          </div>
        </div>
      </section>

      <section className="border-b border-line/10 bg-brume/30 py-14">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <p className="text-center font-mono text-xs font-bold tracking-widest text-primary">{t("calmKicker")}</p>
          <h2 className="mt-2 text-center font-display text-3xl font-extrabold">{t("calmTitle")}</h2>
          <div className="mx-auto mt-8 grid max-w-5xl gap-8 sm:grid-cols-3 sm:gap-0">
            <Trust icon={<QrCode className="size-5" />} title={t("perkQr")} body={t("perkQrBody")} />
            <Trust icon={<RefreshCcw className="size-5" />} title={t("perkRefund")} body={t("perkRefundBody")} />
            <Trust icon={<Headphones className="size-5" />} title={t("perkLocal")} body={t("perkLocalBody")} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-4 md:px-8">
        {/* Deliberately always dark, to set off the light ticket-preview
            card beside it regardless of app theme. */}
        <div className="grid items-center gap-8 rounded-panel bg-stage px-5 py-8 text-stage-fg md:px-8 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-accent">{t("orgKicker")}</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold md:text-display">{t("orgTitle")}</h2>
            <p className="mt-3 max-w-xl text-stage-muted">{t("orgBody")}</p>
            <div className="mt-6 grid grid-cols-3 gap-3">
              {/* Three invented numbers (+250K / 99.8% / 48H) stood here with
                  nothing behind them. These are real capabilities instead of
                  metrics no one measured. */}
              <Stat value="100%" label={t("statLive")} />
              <Stat value="Stripe" label={t("statPay")} />
              <Stat value="✓" label={t("statResale")} />
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button size="lg" onClick={() => navigate("/organiser")}>
                {t("createFree")}
              </Button>
              <Button variant="inverse" size="lg" onClick={() => navigate("/pro")}>
                {t("demoOrg")}
              </Button>
            </div>
          </div>
          <div className="rounded-card bg-card p-4 text-ink shadow-pop">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-muted">{t("previewKicker")}</p>
              <span className="rounded-full bg-success px-2 py-1 text-xs font-bold text-success-fg">{t("valid")}</span>
            </div>
            <img src="/events/electro.jpg" alt="" className="mt-3 h-36 w-full rounded-control object-cover" />
            <h3 className="mt-3 font-display text-xl font-extrabold">Casablanca Summer Beats</h3>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs text-muted">{t("dates")}</dt>
                <dd className="font-semibold">28 JUIL · 21:00</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t("zoneAccess")}</dt>
                <dd className="font-semibold">VIP · PORTE 4</dd>
              </div>
            </dl>
            <div className="mt-3 flex items-center justify-between border-t border-dashed border-line/20 pt-3">
              <p className="font-mono text-xs">MA-2026-TICK-9082</p>
              <QrMark value="EVENTICK|MA-2026-TICK-9082|preview" className="size-16" />
            </div>
          </div>
        </div>
      </section>
    </Shell>
  );
}

/** One icon-prefixed field inside the hero search card, wrapping a custom
 * Dropdown (see ui/Dropdown.jsx) instead of a native <select> -- a native
 * select's popup list ignores the app's theme entirely and broke the dark
 * card the moment it opened. The chevron lives inside Dropdown's own
 * trigger now, not duplicated here. */
function SearchField({ icon, label, children }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5 px-4 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-brume text-primary">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold text-muted">{label}</span>
        {children}
      </span>
    </div>
  );
}

function HeroStat({ value, label }) {
  // The hero's own stat row — plain numbers under the headline, not a tile,
  // so they read as a caption to the poster rather than another card.
  return (
    <div>
      <dd className="font-display text-2xl font-extrabold tabular-nums md:text-3xl">{value}</dd>
      <dt className="mt-1 text-xs font-semibold text-stage-muted md:text-sm">{label}</dt>
    </div>
  );
}

function Stat({ value, label }) {
  // Rendered inside the always-dark organiser promo band (bg-stage).
  return (
    <div className="rounded-control bg-stage-fg/10 p-3">
      <p className="font-display text-2xl font-extrabold text-accent">{value}</p>
      <p className="text-xs text-stage-muted">{label}</p>
    </div>
  );
}

function Trust({ icon, title, body }) {
  return (
    <article className="flex gap-4 sm:flex-col sm:gap-0 sm:border-s sm:border-line/10 sm:px-8 sm:text-center sm:first:border-s-0 sm:first:ps-0 sm:[&:last-child]:pe-0">
      <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-control bg-card text-primary shadow-card sm:mx-auto">
        {icon}
      </span>
      <div className="sm:mt-3">
        <h3 className="font-display text-lg font-bold">{title}</h3>
        <p className="mt-1 text-sm text-muted">{body}</p>
      </div>
    </article>
  );
}
