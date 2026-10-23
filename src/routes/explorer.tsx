import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { EventCard } from "@/components/event-card";
import { Shell } from "@/components/shell";
import { CATEGORIES, CITIES, minPrice, tierLeft, type EventItem } from "@/lib/catalog";
import { addDays, overlaps, todayKey, weekendRange } from "@/lib/format";
import { categoryLabel, useI18n } from "@/lib/i18n";
import { explorerSearch, type ExplorerSearch } from "@/lib/search";
import { useStore } from "@/lib/store";
import { useCatalog } from "@/lib/use-catalog";

export const Route = createFileRoute("/explorer")({
  validateSearch: (search: Record<string, unknown>): ExplorerSearch => ({
    q: typeof search.q === "string" ? search.q : "",
    ville: typeof search.ville === "string" ? search.ville : "",
    cat: typeof search.cat === "string" ? search.cat : "",
    quand: typeof search.quand === "string" ? search.quand : "",
    tri: typeof search.tri === "string" ? search.tri : "popular",
    max: Number(search.max ?? 2500) || 2500,
    page: Math.max(1, Number(search.page ?? 1) || 1),
    vip: search.vip === "1" ? "1" : "",
    instant: search.instant === "1" ? "1" : "",
    seated: search.seated === "1" ? "1" : "",
  }),
  component: ExplorerPage,
});

const PAGE_SIZE = 6;

function ExplorerPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { t, tf } = useI18n();
  const { events, sold } = useCatalog();
  const [mobileFilters, setMobileFilters] = useState(false);
  const today = todayKey();

  const setSearch = (partial: Partial<ExplorerSearch>) => {
    void navigate({
      to: "/explorer",
      search: explorerSearch({ ...search, page: 1, ...partial }),
    });
  };

  const live = useMemo(() => events.filter((event) => event.end >= today), [events, today]);

  const filtered = useMemo(() => {
    const weekend = weekendRange(today);
    const q = search.q.trim().toLowerCase();
    let list = live.filter((event) => {
      if (search.ville && event.city !== search.ville) return false;
      if (search.cat && event.category !== search.cat) return false;
      if (q && !`${event.titleFr} ${event.titleAr} ${event.city} ${event.venueFr} ${event.blurbFr}`.toLowerCase().includes(q)) {
        return false;
      }
      if (minPrice(event) > search.max) return false;
      if (search.vip === "1" && !event.tiers.some((tier) => tier.perks.includes("lounge") || tier.price >= 700)) return false;
      if (search.seated === "1" && !event.tiers.some((tier) => tier.numbered)) return false;
      if (search.instant === "1" && !event.instant) return false;
      if (search.quand === "today" && !overlaps(event.start, event.end, today, today)) return false;
      if (search.quand === "tomorrow") {
        const tomorrow = addDays(today, 1);
        if (!overlaps(event.start, event.end, tomorrow, tomorrow)) return false;
      }
      if (search.quand === "weekend" && !overlaps(event.start, event.end, weekend.start, weekend.end)) return false;
      if (search.quand === "month" && !event.start.startsWith(today.slice(0, 7)) && !event.end.startsWith(today.slice(0, 7))) {
        return false;
      }
      if (search.quand === "summer" && !overlaps(event.start, event.end, "2027-06-01", "2027-08-31")) return false;
      return true;
    });
    list = [...list].sort((a, b) => compare(a, b, search.tri));
    return list;
  }, [live, search, today]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(search.page, pages);
  const slice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const weekEnd = addDays(today, 7);
  const thisWeek = live.filter((event) => overlaps(event.start, event.end, today, weekEnd)).length;
  const almost = live.filter((event) => event.tiers.some((tier) => tierLeft(event, tier, sold) < 200)).length;

  const filters = (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">{t("filters")}</h2>
        <button className="text-xs font-bold text-lagon" onClick={() => setSearch({ ville: "", cat: "", quand: "", max: 2500, vip: "", instant: "", seated: "", q: "" })}>
          {t("reset")}
        </button>
      </div>
      <fieldset>
        <legend className="text-sm font-semibold">{t("cityIn")}</legend>
        <div className="mt-2 space-y-1">
          <Radio name="ville" checked={!search.ville} label={t("allCitiesF")} count={live.length} onChange={() => setSearch({ ville: "" })} />
          {CITIES.map((city) => (
            <Radio
              key={city}
              name="ville"
              checked={search.ville === city}
              label={city}
              count={live.filter((event) => event.city === city).length}
              onChange={() => setSearch({ ville: city })}
            />
          ))}
        </div>
      </fieldset>
      <div>
        <p className="text-sm font-semibold">{t("when")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {[
            ["today", t("today")],
            ["tomorrow", t("tomorrow")],
            ["weekend", t("thisWeekend")],
            ["month", t("thisMonth")],
          ].map(([id, label]) => (
            <button
              key={id}
              className={`rounded-full px-3 py-2 text-sm ${search.quand === id ? "bg-lagon text-foam" : "bg-paper text-ink"}`}
              onClick={() => setSearch({ quand: search.quand === id ? "" : id })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="flex justify-between text-sm font-semibold">
          {t("maxPrice")}
          <span className="tabular-nums text-lagon">{search.max >= 2500 ? "2 500+" : search.max} </span>
        </span>
        <input
          className="mt-3"
          type="range"
          min={0}
          max={2500}
          step={50}
          value={search.max}
          onChange={(event) => setSearch({ max: Number(event.target.value) })}
        />
        <span className="mt-1 flex justify-between text-xs text-muted">
          <span>{t("free")}</span>
          <span>2 500+</span>
        </span>
      </label>
      <div className="space-y-2 text-sm">
        <Check label={t("eticket")} checked={search.instant === "1"} onChange={(on) => setSearch({ instant: on ? "1" : "" })} />
        <Check label={t("seated")} checked={search.seated === "1"} onChange={(on) => setSearch({ seated: on ? "1" : "" })} />
        <Check label={t("vipAccess")} checked={search.vip === "1"} onChange={(on) => setSearch({ vip: on ? "1" : "" })} />
      </div>
      <div className="rounded-xl bg-brume p-3 text-sm text-lagon-deep">
        <p className="font-bold">{t("guarantee")}</p>
        <p>{t("guaranteeBody")}</p>
      </div>
    </div>
  );

  return (
    <Shell>
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <p className="inline-flex items-center gap-2 rounded-full bg-brume px-3 py-1 text-xs font-bold text-lagon-deep">
          <span className="size-2 rounded-full bg-corail" />
          {t("liveKicker")}
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-extrabold text-encre md:text-hero">
              {t("exploreA")} <span className="text-lagon">{t("exploreB")}</span>
            </h1>
            <p className="mt-2 max-w-xl text-muted">{t("exploreSub")}</p>
          </div>
          <dl className="grid grid-cols-3 gap-2 rounded-xl bg-card p-3 text-center shadow-card">
            <Stat value={String(live.length)} label={t("eventsWord")} />
            <Stat value={String(new Set(live.map((event) => event.city)).size)} label={t("activeCities")} />
            <Stat value={String(almost)} label={t("almost")} accent />
          </dl>
        </div>
        <p className="mt-2 text-sm text-muted">
          {t("thisWeek")} · {thisWeek}
        </p>
        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          <Chip active={!search.cat} onClick={() => setSearch({ cat: "" })}>
            {t("allGenres")}
          </Chip>
          {CATEGORIES.map((id) => (
            <Chip key={id} active={search.cat === id} onClick={() => setSearch({ cat: search.cat === id ? "" : id })}>
              {categoryLabel(id, t)}
            </Chip>
          ))}
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[16rem_1fr]">
          <aside className="hidden rounded-xl border border-line/10 bg-card p-4 shadow-card lg:block">{filters}</aside>
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">{tf("showing", { n: slice.length, total: filtered.length })}</p>
              <div className="flex items-center gap-2">
                <button className="h-11 rounded-full bg-card px-4 text-sm font-semibold lg:hidden" onClick={() => setMobileFilters(true)}>
                  {t("openFilters")}
                </button>
                <label className="text-sm">
                  <span className="me-2 text-muted">{t("sort")}</span>
                  <select className="field h-11 w-auto" value={search.tri} onChange={(event) => setSearch({ tri: event.target.value, page: search.page })}>
                    <option value="popular">{t("popular")}</option>
                    <option value="date">{t("dateSoon")}</option>
                    <option value="priceAsc">{t("priceAsc")}</option>
                    <option value="priceDesc">{t("priceDesc")}</option>
                  </select>
                </label>
              </div>
            </div>
            {slice.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line/20 bg-card p-8 text-center">
                <p className="font-display text-2xl font-bold">{t("noResults")}</p>
                <p className="mt-2 text-muted">{t("noResultsBody")}</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {slice.map((event) => (
                  <EventCard key={event.slug} event={event} />
                ))}
              </div>
            )}
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                className="size-11 rounded-full border border-line/15"
                disabled={page <= 1}
                onClick={() => setSearch({ page: page - 1 })}
              >
                ‹
              </button>
              <span className="text-sm">{tf("pageOf", { p: page, t: pages })}</span>
              <button
                className="size-11 rounded-full bg-lagon text-foam"
                disabled={page >= pages}
                onClick={() => setSearch({ page: page + 1 })}
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </div>
      {mobileFilters ? (
        <div className="fixed inset-0 z-50 bg-encre/60 lg:hidden" onClick={() => setMobileFilters(false)}>
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-auto rounded-t-2xl bg-card p-4" onClick={(event) => event.stopPropagation()}>
            {filters}
            <button className="mt-4 h-12 w-full rounded-full bg-lagon font-semibold text-foam" onClick={() => setMobileFilters(false)}>
              {t("apply")}
            </button>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}

function compare(a: EventItem, b: EventItem, tri: string) {
  if (tri === "date") return a.start.localeCompare(b.start);
  if (tri === "priceAsc") return minPrice(a) - minPrice(b);
  if (tri === "priceDesc") return minPrice(b) - minPrice(a);
  return b.popularity - a.popularity;
}

function Stat({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="px-3">
      <dt className={`font-display text-2xl font-extrabold ${accent ? "text-corail" : "text-lagon"}`}>{value}</dt>
      <dd className="text-xs text-muted">{label}</dd>
    </div>
  );
}

function Chip({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${active ? "bg-lagon text-foam" : "border border-line/15 bg-card text-ink"}`}
    >
      {children}
    </button>
  );
}

function Radio({
  checked,
  label,
  count,
  onChange,
}: {
  name: string;
  checked: boolean;
  label: string;
  count: number;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 py-1 text-sm">
      <span className="flex items-center gap-2">
        <input type="radio" checked={checked} onChange={onChange} />
        {label}
      </span>
      <span className="text-muted tabular-nums">{count}</span>
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
