import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";

export default function Events() {
  const [events, setEvents] = useState(null);

  const load = () => api.get("/organiser/events").then((data) => setEvents(data.events));

  useEffect(() => {
    load();
  }, []);

  const toggleHidden = async (slug, hidden) => {
    await api.patch(`/organiser/events/${slug}/visibility`, { hidden });
    load();
  };

  const remove = async (slug) => {
    await api.del(`/organiser/events/${slug}`);
    load();
  };

  return (
    <div>
      <h1 className="text-3xl">Mes événements</h1>
      <div className="mt-6 grid gap-3">
        {events?.map((event) => (
          <div key={event.slug} className="flex items-center justify-between rounded-xl border border-line/15 p-4">
            <div>
              <Link to={`/evenements/${event.slug}`} className="font-semibold">{event.titleFr}</Link>
              <p className="text-sm text-muted">{event.city}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => toggleHidden(event.slug, true)} className="rounded-full border px-3 py-1.5 text-sm">
                Retirer de la vente
              </button>
              <button type="button" onClick={() => remove(event.slug)} className="rounded-full border border-corail px-3 py-1.5 text-sm text-corail">
                Supprimer
              </button>
            </div>
          </div>
        ))}
        {events && events.length === 0 ? <p className="text-muted">Aucun événement créé pour le moment.</p> : null}
      </div>
    </div>
  );
}
