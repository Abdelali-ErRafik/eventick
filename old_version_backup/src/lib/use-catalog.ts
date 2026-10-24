import { useMemo } from "react";
import { EVENTS, type EventItem } from "@/lib/catalog";
import { applyEventPatch, useStore } from "@/lib/store";

export function useCatalog() {
  const customEvents = useStore((state) => state.customEvents);
  const sold = useStore((state) => state.sold);
  const hiddenSlugs = useStore((state) => state.hiddenSlugs) ?? [];
  const patches = useStore((state) => state.patches) ?? {};
  const all = useMemo(
    () => [...customEvents, ...EVENTS].map((event) => (patches[event.slug] ? applyEventPatch(event, patches[event.slug]) : event)),
    [customEvents, patches],
  );
  const events = useMemo(() => all.filter((event) => !hiddenSlugs.includes(event.slug)), [all, hiddenSlugs]);
  const bySlug = (slug: string) => events.find((event) => event.slug === slug);
  return { events, all, hiddenSlugs, sold, bySlug };
}

export function eventTitle(event: EventItem, locale: "fr" | "ar") {
  return locale === "ar" ? event.titleAr : event.titleFr;
}

export function eventVenue(event: EventItem, locale: "fr" | "ar") {
  return locale === "ar" ? event.venueAr : event.venueFr;
}

export function eventBlurb(event: EventItem, locale: "fr" | "ar") {
  return locale === "ar" ? event.blurbAr : event.blurbFr;
}
