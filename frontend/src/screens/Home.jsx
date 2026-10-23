import { useEffect, useState } from "react";
import { Shell } from "../components/Shell";
import { EventCard } from "../components/EventCard";
import { api } from "../api";
import { useI18n } from "../i18n";

export default function Home() {
  const { t } = useI18n();
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get("/events")
      .then((data) => setEvents(data.events))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <Shell>
      <section className="mx-auto max-w-6xl px-4 py-10">
        <p className="font-mono text-sm tracking-widest text-muted">{t("kicker")}</p>
        <h1 className="mt-4 max-w-2xl text-5xl leading-[1.07] sm:text-6xl">
          {t("heroA")} <span className="text-lagon">{t("heroB")}</span> {t("heroC")}
        </h1>
        <p className="mt-6 max-w-2xl text-muted">{t("heroSub")}</p>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <h2 className="mb-6 text-3xl">{t("weekendTitle")}</h2>
        {error ? <p className="text-corail">{error}</p> : null}
        {!events && !error ? <p className="text-muted">...</p> : null}
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {events?.map((event) => (
            <EventCard key={event.slug} event={event} variant="weekend" />
          ))}
        </div>
      </section>
    </Shell>
  );
}
