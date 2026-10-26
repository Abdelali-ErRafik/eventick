export function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export function minPriceCents(event) {
  return Math.min(...event.tiers.map((tier) => tier.priceCents));
}

export function totalRemaining(event) {
  return event.tiers.reduce((sum, tier) => sum + tier.remaining, 0);
}

export function totalCapacity(event) {
  return event.tiers.reduce((sum, tier) => sum + tier.capacity, 0);
}

export function fillRatio(event) {
  const cap = totalCapacity(event);
  if (!cap) return 0;
  return 1 - totalRemaining(event) / cap;
}

export function monthBadge(isoDate, locale) {
  const date = new Date(isoDate);
  const month = new Intl.DateTimeFormat(locale === "ar" ? "ar-MA" : "fr-FR", { month: "short" })
    .format(date)
    .replace(".", "")
    .toUpperCase();
  const day = new Intl.DateTimeFormat(locale === "ar" ? "ar-MA" : "fr-FR", { day: "2-digit" }).format(date);
  return { month, day };
}

export function groupNumber(n) {
  return new Intl.NumberFormat("fr-FR").format(n);
}

export const CITIES = ["Casablanca", "Rabat", "Marrakech", "Tanger", "Agadir", "Essaouira", "Fès", "Dakhla"];

/** "YYYY-MM-DD" from an ISO datetime, in Morocco's timezone. */
export function dateKey(isoDate) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca" }).format(new Date(isoDate));
}

export function todayKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca" }).format(now);
}

export function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function dow(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function weekendRange(today = todayKey()) {
  const day = dow(today);
  if (day === 6) return { start: addDays(today, -1), end: addDays(today, 1) };
  if (day === 0) return { start: addDays(today, -2), end: today };
  const toFri = (5 - day + 7) % 7;
  const fri = addDays(today, toFri);
  return { start: fri, end: addDays(fri, 2) };
}

export function overlaps(start, end, from, to) {
  return start <= to && end >= from;
}

export const CATEGORIES = ["festivals", "humour", "sport", "nightlife", "culture", "salons"];

/** Single or multi-day human-readable range, e.g. "Jeudi 19 juin 2027" or
 * "19 – 27 juin 2027". Built on Intl so the FR/AR month names are correct
 * without hand-transcribing a 24-entry lookup table. */
export function dateRange(startIso, endIso, locale) {
  const intlLocale = locale === "ar" ? "ar-MA" : "fr-FR";
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (dateKey(startIso) === dateKey(endIso)) {
    return new Intl.DateTimeFormat(intlLocale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(start);
  }
  const day = new Intl.DateTimeFormat(intlLocale, { day: "numeric" });
  const month = new Intl.DateTimeFormat(intlLocale, { month: "long" });
  const year = new Intl.DateTimeFormat(intlLocale, { year: "numeric" });
  if (month.format(start) === month.format(end)) {
    return `${day.format(start)} – ${day.format(end)} ${month.format(end)} ${year.format(end)}`;
  }
  return `${day.format(start)} ${month.format(start)} – ${day.format(end)} ${month.format(end)} ${year.format(end)}`;
}

export function mapsUrl(event) {
  const q = encodeURIComponent(`${event.venueFr}, ${event.address}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export function longDate(isoDate, locale) {
  return dateRange(isoDate, isoDate, locale);
}

export function daysUntil(startIso, today = todayKey()) {
  const start = dateKey(startIso);
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const a = Date.UTC(ty, tm - 1, td);
  const b = Date.UTC(sy, sm - 1, sd);
  return Math.round((b - a) / 86_400_000);
}
