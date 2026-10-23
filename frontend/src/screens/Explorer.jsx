import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Shell } from "../components/Shell";
import { EventCard } from "../components/EventCard";
import { api } from "../api";
import { categoryLabel, useI18n } from "../i18n";

const CATEGORIES = ["festivals", "humour", "sport", "nightlife", "culture", "salons"];

export default function Explorer() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [events, setEvents] = useState(null);

  useEffect(() => {
    api.get("/events").then((data) => setEvents(data.events));
  }, []);

  const q = params.get("q") ?? "";
  const cat = params.get("cat") ?? "";

  const visible = useMemo(() => {
    if (!events) return [];
    const needle = q.trim().toLowerCase();
    return events.filter((event) => {
      const matchesCat = !cat || event.category === cat;
      const matchesQuery =
        !needle ||
        `${event.titleFr} ${event.titleAr} ${event.city} ${event.venueFr}`.toLowerCase().includes(needle);
      return matchesCat && matchesQuery;
    });
  }, [events, q, cat]);

  return (
    <Shell>
      <section className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-4xl">{t("explore")}</h1>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setParams((p) => { p.delete("cat"); return p; })}
            className={`rounded-full border px-4 py-2 text-sm ${!cat ? "border-lagon bg-brume text-lagon" : ""}`}
          >
            {t("allUniverses")}
          </button>
          {CATEGORIES.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setParams((p) => { p.set("cat", id); return p; })}
              className={`rounded-full border px-4 py-2 text-sm ${cat === id ? "border-lagon bg-brume text-lagon" : ""}`}
            >
              {categoryLabel(id, t)}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={q}
          onChange={(e) => setParams((p) => { p.set("q", e.target.value); return p; })}
          placeholder={t("searchPh")}
          className="mt-4 w-full max-w-md rounded-lg border border-line/15 px-4 py-3"
        />

        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((event) => (
            <EventCard key={event.slug} event={event} />
          ))}
        </div>
      </section>
    </Shell>
  );
}
