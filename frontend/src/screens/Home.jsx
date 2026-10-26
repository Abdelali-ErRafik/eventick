import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Headphones, Music, QrCode, RefreshCcw, Theater, Trophy, Utensils, MoonStar } from "lucide-react";
import { QrMark } from "../components/QrMark";
import { Shell } from "../components/Shell";
import { EventCard } from "../components/EventCard";
import { useCatalog } from "../useCatalog";
import { categoryLabel, useI18n } from "../i18n";
import { CITIES, addDays, dateKey, todayKey } from "../utils";

const CATS = [
  { id: "festivals", icon: Music },
  { id: "humour", icon: Theater },
  { id: "sport", icon: Trophy },
  { id: "nightlife", icon: MoonStar },
  { id: "culture", icon: Utensils },
];

const TRENDS = [
  { label: "#Mawazine2027", query: "Mawazine" },
  { label: "#Gnaoua", query: "Gnaoua" },
  { label: "#DerbyCasa", query: "Derby" },
  { label: "#OasisFest", query: "Oasis" },
];

export default function Home() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { events } = useCatalog();
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

  return (
    <Shell overlay>
      <section className="relative -mt-16 overflow-hidden bg-encre pt-16 text-foam">
        <img src="/events/mawazine.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-b from-encre/80 via-encre/88 to-encre" />
        <div className="relative mx-auto max-w-7xl px-4 pb-12 pt-14 md:px-8 lg:pt-20">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full bg-foam/10 px-3 py-1 text-xs font-semibold">
              <span className="size-2 rounded-full bg-safran" />
              {t("kicker")}
            </p>
            <p className="mt-4 text-sm font-semibold text-safran">{t("secureMad")}</p>
            <h1 className="mt-3 font-display text-4xl font-extrabold leading-none tracking-tight md:text-hero">
              {t("heroA")} <span className="text-safran">{t("heroB")}</span> {t("heroC")}
            </h1>
            <p className="mt-4 max-w-xl text-base text-mist lg:text-lg">{t("heroSub")}</p>
          </div>
          <form className="mt-8" onSubmit={submitSearch}>
            <div className="grid gap-2 rounded-2xl bg-card p-3 text-ink shadow-pop md:grid-cols-[1fr_1fr_1fr_auto]">
              <label className="block px-2">
                <span className="text-xs font-semibold text-muted">{t("fieldType")}</span>
                <select className="field mt-1 h-11" value={cat} onChange={(e) => setCat(e.target.value)}>
                  <option value="">{t("allUniverses")}</option>
                  {CATS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {categoryLabel(item.id, t)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block px-2">
                <span className="text-xs font-semibold text-muted">{t("fieldPeriod")}</span>
                <select className="field mt-1 h-11" value={quand} onChange={(e) => setQuand(e.target.value)}>
                  <option value="">{t("anyTime")}</option>
                  <option value="weekend">{t("thisWeekend")}</option>
                  <option value="month">{t("thisMonth")}</option>
                  <option value="summer">{t("summer")}</option>
                </select>
              </label>
              <label className="block px-2">
                <span className="text-xs font-semibold text-muted">{t("fieldCity")}</span>
                <select className="field mt-1 h-11" value={ville} onChange={(e) => setVille(e.target.value)}>
                  <option value="">{t("allMorocco")}</option>
                  {CITIES.map((city) => (
                    <option key={city}>{city}</option>
                  ))}
                </select>
              </label>
              <button className="h-12 self-end rounded-full bg-safran px-5 text-sm font-semibold text-encre" type="submit">
                {t("find")}
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-mist">{t("trends")} :</span>
              {TRENDS.map((trend) => (
                <button
                  key={trend.label}
                  type="button"
                  onClick={() => navigate(`/explorer?q=${encodeURIComponent(trend.query)}`)}
                  className="rounded-full border border-foam/20 bg-foam/10 px-3 py-1.5 text-xs font-bold text-foam transition hover:border-safran hover:text-safran"
                >
                  {trend.label}
                </button>
              ))}
            </div>
          </form>
        </div>
      </section>

      <section aria-label={t("trends")} className="border-b border-line/10 bg-card">
        <dl className="mx-auto grid max-w-7xl grid-cols-3 gap-2 px-4 py-6 text-center md:px-8">
          <div>
            <dd className="font-display text-2xl font-extrabold text-encre tabular-nums md:text-3xl">{live.length}</dd>
            <dt className="mt-1 text-xs font-semibold text-muted md:text-sm">{t("eventsWord")}</dt>
          </div>
          <div>
            <dd className="font-display text-2xl font-extrabold text-encre tabular-nums md:text-3xl">{cityCount}</dd>
            <dt className="mt-1 text-xs font-semibold text-muted md:text-sm">{t("activeCities")}</dt>
          </div>
          <div>
            <dd className="font-display text-2xl font-extrabold text-encre tabular-nums md:text-3xl">+250K</dd>
            <dt className="mt-1 text-xs font-semibold text-muted md:text-sm">{t("statAudience")}</dt>
          </div>
        </dl>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 md:px-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl font-extrabold">{t("byCat")}</h2>
            <p className="text-muted">{t("byCatSub")}</p>
          </div>
          <button type="button" onClick={() => navigate("/explorer")} className="shrink-0 text-sm font-semibold text-lagon">
            {t("seeAll")}
          </button>
        </div>
        <div className="mt-6 grid snap-x snap-mandatory auto-cols-[72%] grid-flow-col gap-3 overflow-x-auto pb-2 sm:auto-cols-[45%] lg:auto-cols-auto lg:grid-flow-row lg:grid-cols-5 lg:overflow-visible lg:pb-0">
          {CATS.map((item) => {
            const count = live.filter((event) => event.category === item.id).length;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(`/explorer?cat=${item.id}`)}
                className="rounded-xl border border-line/10 bg-card p-4 text-start shadow-card transition snap-start hover:border-lagon/40 hover:shadow-pop"
              >
                <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-brume text-lagon">
                  <Icon className="size-5" />
                </span>
                <p className="mt-3 font-display text-lg font-bold">{categoryLabel(item.id, t)}</p>
                <p className="text-sm text-muted">{t("eventsCount").replace("{n}", String(count))}</p>
              </button>
            );
          })}
        </div>
      </section>

      {feature ? (
        <section className="mx-auto max-w-7xl px-4 pb-4 pt-4 md:px-8">
          <p className="font-mono text-xs font-bold tracking-widest text-lagon">{t("majorKicker")}</p>
          <h2 className="mt-2 font-display text-3xl font-extrabold text-encre md:text-display">{t("majorTitle")}</h2>
          <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
            <EventCard event={feature} variant="feature" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              {side.map((event) => (
                <EventCard key={event.slug} event={event} variant="compact" />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="mx-auto max-w-7xl px-4 py-12 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-xs font-bold tracking-widest text-corail">{t("weekendTitle")}</p>
            <h2 className="font-display text-3xl font-extrabold">{t("weekendSub")}</h2>
          </div>
          <button type="button" onClick={() => navigate("/explorer?quand=month")} className="text-sm font-semibold text-lagon">
            {t("allCities")}
          </button>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {imminent.map((event) => (
            <EventCard key={event.slug} event={event} variant="weekend" />
          ))}
        </div>
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => navigate("/explorer")}
            className="inline-flex h-12 items-center rounded-full border border-line/15 px-5 text-sm font-semibold"
          >
            {t("exploreMore")}
          </button>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-14 md:px-8">
        <p className="text-center font-mono text-xs font-bold tracking-widest text-lagon">{t("calmKicker")}</p>
        <h2 className="mt-2 text-center font-display text-3xl font-extrabold">{t("calmTitle")}</h2>
        <div className="mx-auto mt-8 grid max-w-5xl gap-8 sm:grid-cols-3 sm:gap-0">
          <Trust icon={<QrCode className="size-5" />} title={t("perkQr")} body={t("perkQrBody")} />
          <Trust icon={<RefreshCcw className="size-5" />} title={t("perkRefund")} body={t("perkRefundBody")} />
          <Trust icon={<Headphones className="size-5" />} title={t("perkLocal")} body={t("perkLocalBody")} />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-4 md:px-8">
        <div className="grid items-center gap-8 rounded-2xl bg-encre px-5 py-8 text-foam md:px-8 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-safran">{t("orgKicker")}</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold md:text-display">{t("orgTitle")}</h2>
            <p className="mt-3 max-w-xl text-mist">{t("orgBody")}</p>
            <div className="mt-6 grid grid-cols-3 gap-3">
              <Stat value="+250K" label={t("statAudience")} />
              <Stat value="99.8%" label={t("statSat")} />
              <Stat value="48H" label={t("statPayout")} />
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate("/organiser")}
                className="inline-flex h-12 items-center rounded-full bg-safran px-5 text-sm font-semibold text-encre"
              >
                {t("createFree")}
              </button>
              <button
                type="button"
                onClick={() => navigate("/pro")}
                className="inline-flex h-12 items-center rounded-full border border-foam/20 px-5 text-sm font-semibold"
              >
                {t("demoOrg")}
              </button>
            </div>
          </div>
          <div className="rounded-xl bg-card p-4 text-ink shadow-pop">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-muted">{t("previewKicker")}</p>
              <span className="rounded-full bg-lagon px-2 py-1 text-xs font-bold text-foam">{t("valid")}</span>
            </div>
            <img src="/events/electro.jpg" alt="" className="mt-3 h-36 w-full rounded-lg object-cover" />
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

function Stat({ value, label }) {
  return (
    <div className="rounded-xl bg-foam/10 p-3">
      <p className="font-display text-2xl font-extrabold text-safran">{value}</p>
      <p className="text-xs text-mist">{label}</p>
    </div>
  );
}

function Trust({ icon, title, body }) {
  return (
    <article className="flex gap-4 sm:flex-col sm:gap-0 sm:border-s sm:border-line/10 sm:px-8 sm:text-center sm:first:border-s-0 sm:first:ps-0 sm:[&:last-child]:pe-0">
      <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brume text-lagon sm:mx-auto">
        {icon}
      </span>
      <div className="sm:mt-3">
        <h3 className="font-display text-lg font-bold">{title}</h3>
        <p className="mt-1 text-sm text-muted">{body}</p>
      </div>
    </article>
  );
}
