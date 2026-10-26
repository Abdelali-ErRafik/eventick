import { useEffect, useState } from "react";
import { api } from "./api";

/** Fetches the published catalog once and shares it across any component
 * that calls this hook in the same render tree pass. The backend already
 * does the merging/patching/hiding that the old client-side useCatalog did
 * against localStorage, so this is just a fetch + lookup helper now. */
export function useCatalog() {
  const [events, setEvents] = useState(null);

  useEffect(() => {
    let alive = true;
    api
      .get("/events")
      .then((data) => {
        if (alive) setEvents(data.events);
      })
      .catch(() => {
        if (alive) setEvents([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const bySlug = (slug) => events?.find((event) => event.slug === slug);

  return { events: events ?? [], bySlug };
}

export function eventTitle(event, locale) {
  return locale === "ar" ? event.titleAr : event.titleFr;
}

export function eventVenue(event, locale) {
  return locale === "ar" ? event.venueAr : event.venueFr;
}

export function eventBlurb(event, locale) {
  return locale === "ar" ? event.blurbAr : event.blurbFr;
}
