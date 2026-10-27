import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SearchX, SlidersHorizontal } from "lucide-react";
import { Shell } from "../components/Shell";
import { EventCard } from "../components/EventCard";
import { useCatalog } from "../useCatalog";
import { Badge, Button, Card, Container, EmptyState, ErrorState, LoadingState, Modal } from "../ui";
import { categoryLabel, useI18n } from "../i18n";
import { CATEGORIES, CITIES, addDays, dateKey, minPriceCents, overlaps, todayKey, weekendRange } from "../utils";

const PAGE_SIZE = 6;

export default function Explorer() {
  const { t, tf } = useI18n();
  const [params, setParams] = useSearchParams();
  const { events, loading, error, reload } = useCatalog();
  const [mobileFilters, setMobileFilters] = useState(false);
  const today = todayKey();

  const search = {
    q: params.get("q") ?? "",
    ville: params.get("ville") ?? "",
    cat: params.get("cat") ?? "",
    quand: params.get("quand") ?? "",
    tri: params.get("tri") ?? "popular",
    max: Number(params.get("max") ?? 2500) || 2500,
    page: Math.max(1, Number(params.get("page") ?? 1) || 1),
    vip: params.get("vip") === "1" ? "1" : "",
    instant: params.get("instant") === "1" ? "1" : "",
    seated: params.get("seated") === "1" ? "1" : "",
  };

  const setSearch = (partial) => {
    const next = { ...search, page: 1, ...partial };
    const sp = new URLSearchParams();
    if (next.q) sp.set("q", next.q);
    if (next.ville) sp.set("ville", next.ville);
    if (next.cat) sp.set("cat", next.cat);
    if (next.quand) sp.set("quand", next.quand);
    if (next.tri && next.tri !== "popular") sp.set("tri", next.tri);
    if (next.max && next.max !== 2500) sp.set("max", String(next.max));
    if (next.page && next.page !== 1) sp.set("page", String(next.page));
    if (next.vip) sp.set("vip", "1");
    if (next.instant) sp.set("instant", "1");
    if (next.seated) sp.set("seated", "1");
    setParams(sp);
  };

  const live = useMemo(() => events.filter((event) => dateKey(event.end) >= today), [events, today]);

  const filtered = useMemo(() => {
    const weekend = weekendRange(today);
    const q = search.q.trim().toLowerCase();
    let list = live.filter((event) => {
      if (search.ville && event.city !== search.ville) return false;
      if (search.cat && event.category !== search.cat) return false;
      if (q && !`${event.titleFr} ${event.titleAr} ${event.city} ${event.venueFr} ${event.blurbFr}`.toLowerCase().includes(q)) {
        return false;
      }
      if (minPriceCents(event) / 100 > search.max) return false;
      if (search.vip === "1" && !event.tiers.some((tier) => tier.perks?.includes("lounge") || tier.priceCents >= 70000)) return false;
      if (search.seated === "1" && !event.tiers.some((tier) => tier.numbered)) return false;
      if (search.instant === "1" && !event.instant) return false;
      const start = dateKey(event.start);
      const end = dateKey(event.end);
      if (search.quand === "today" && !overlaps(start, end, today, today)) return false;
      if (search.quand === "tomorrow") {
        const tomorrow = addDays(today, 1);
        if (!overlaps(start, end, tomorrow, tomorrow)) return false;
      }
      if (search.quand === "weekend" && !overlaps(start, end, weekend.start, weekend.end)) return false;
      if (search.quand === "month" && !start.startsWith(today.slice(0, 7)) && !end.startsWith(today.slice(0, 7))) {
        return false;
      }
      if (search.quand === "summer" && !overlaps(start, end, "2027-06-01", "2027-08-31")) return false;
      return true;
    });
    list = [...list].sort((a, b) => compare(a, b, search.tri));
    return list;
  }, [live, search, today]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(search.page, pages);
  const slice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const weekEnd = addDays(today, 7);
  const thisWeek = live.filter((event) => overlaps(dateKey(event.start), dateKey(event.end), today, weekEnd)).length;
  const almost = live.filter((event) => event.tiers.some((tier) => tier.remaining < 200)).length;

  const filters = (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        {/* Hidden in the modal, which supplies its own title. */}
        <h2 className="font-display text-subhead font-bold max-lg:sr-only">{t("filters")}</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSearch({ ville: "", cat: "", quand: "", max: 2500, vip: "", instant: "", seated: "", q: "" })}
        >
          {t("reset")}
        </Button>
      </div>
      <fieldset>
        <legend className="text-sm font-semibold">{t("cityIn")}</legend>
        <div className="mt-2 space-y-1">
          <Radio checked={!search.ville} label={t("allCitiesF")} count={live.length} onChange={() => setSearch({ ville: "" })} />
          {CITIES.map((city) => (
            <Radio
              key={city}
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
              type="button"
              className={`h-11 rounded-full px-3.5 text-sm font-semibold transition ${
                search.quand === id ? "bg-primary text-primary-fg" : "bg-paper text-ink hover:bg-brume"
              }`}
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
          <span className="tabular-nums text-primary">{search.max >= 2500 ? "2 500+" : search.max} </span>
        </span>
        <input
          className="mt-3"
          type="range"
          min={0}
          max={2500}
          step={50}
          value={search.max}
          onChange={(e) => setSearch({ max: Number(e.target.value) })}
        />
        <span className="mt-1 flex justify-between text-xs text-muted">
          <span>{t("free")}</span>
          <span>2 500+</span>
        </span>
      </label>
      <div className="space-y-2 text-sm">
        <Check label={t("eticket")} checked={search.instant === "1"} onChange={(on) => setSearch({ instant: on ? "1" : "" })} />
        <Check label={t("seated")} checked={search.seated === "1"} onChange={(on) => setSearch({ seated: on ? "1" : "" })} />
        <Check label={t("vipAccess")} checked={search.vip === "1"} onChange={(on) => setSearch({ vip: on ? "1" : "" })} />
      </div>
      <div className="rounded-card bg-brume p-3.5 text-sm text-primary">
        <p className="font-bold">{t("guarantee")}</p>
        <p className="mt-0.5 leading-relaxed opacity-90">{t("guaranteeBody")}</p>
      </div>
    </div>
  );

  // Loading, failure and "no matches" are three different things. The old
  // screen rendered the same dashed "no results" box for all of them, so a
  // dead backend read as an over-filtered search.
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

  return (
    <Shell>
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <p className="inline-flex items-center gap-2 rounded-full bg-brume px-3 py-1 text-xs font-bold text-primary">
          <span className="size-2 rounded-full bg-danger" />
          {t("liveKicker")}
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-extrabold text-encre md:text-hero">
              {t("exploreA")} <span className="text-primary">{t("exploreB")}</span>
            </h1>
            <p className="mt-2 max-w-xl text-muted">{t("exploreSub")}</p>
          </div>
          <dl className="grid grid-cols-3 gap-2 rounded-card bg-card p-3 text-center shadow-card">
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
          <aside className="hidden rounded-card border border-line/10 bg-card p-4 shadow-card lg:block">{filters}</aside>
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">{tf("showing", { n: slice.length, total: filtered.length })}</p>
              <div className="flex items-center gap-2">
                <Button variant="secondary" className="lg:hidden" icon={<SlidersHorizontal className="size-4" />} onClick={() => setMobileFilters(true)}>
                  {t("openFilters")}
                </Button>
                <label className="text-sm">
                  <span className="me-2 text-muted">{t("sort")}</span>
                  <select className="field h-11 w-auto" value={search.tri} onChange={(e) => setSearch({ tri: e.target.value, page: search.page })}>
                    <option value="popular">{t("popular")}</option>
                    <option value="date">{t("dateSoon")}</option>
                    <option value="priceAsc">{t("priceAsc")}</option>
                    <option value="priceDesc">{t("priceDesc")}</option>
                  </select>
                </label>
              </div>
            </div>
            {slice.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<SearchX className="size-6" />}
                  title={t("noResults")}
                  body={t("noResultsBody")}
                  action={
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setSearch({ ville: "", cat: "", quand: "", max: 2500, vip: "", instant: "", seated: "", q: "" })
                      }
                    >
                      {t("reset")}
                    </Button>
                  }
                />
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {slice.map((event) => (
                  <EventCard key={event.slug} event={event} />
                ))}
              </div>
            )}
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                type="button"
                className="size-11 rounded-full border border-line/15 disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setSearch({ page: page - 1 })}
              >
                ‹
              </button>
              <span className="text-sm">{tf("pageOf", { p: page, t: pages })}</span>
              <button
                type="button"
                className="size-11 rounded-full bg-primary text-foam disabled:opacity-40"
                disabled={page >= pages}
                onClick={() => setSearch({ page: page + 1 })}
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* Was a bare div with no role, no Escape and no focus handling, so a
          keyboard user tabbed straight through it into the page behind. */}
      <Modal
        open={mobileFilters}
        onClose={() => setMobileFilters(false)}
        title={t("filters")}
        footer={
          <Button full onClick={() => setMobileFilters(false)}>
            {t("apply")}
          </Button>
        }
      >
        {filters}
      </Modal>
    </Shell>
  );
}

function compare(a, b, tri) {
  if (tri === "date") return a.start.localeCompare(b.start);
  if (tri === "priceAsc") return minPriceCents(a) - minPriceCents(b);
  if (tri === "priceDesc") return minPriceCents(b) - minPriceCents(a);
  return b.popularity - a.popularity;
}

function Stat({ value, label, accent = false }) {
  return (
    <div className="px-3">
      <dt className={`font-display text-2xl font-extrabold ${accent ? "text-danger" : "text-primary"}`}>{value}</dt>
      <dd className="text-xs text-muted">{label}</dd>
    </div>
  );
}

function Chip({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${active ? "bg-primary text-foam" : "border border-line/15 bg-card text-ink"}`}
    >
      {children}
    </button>
  );
}

function Radio({ checked, label, count, onChange }) {
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

function Check({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
