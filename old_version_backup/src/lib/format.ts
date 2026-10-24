export type Locale = "fr" | "ar";

const MONTHS: Record<Locale, string[]> = {
  fr: ["JAN", "FÉV", "MARS", "AVR", "MAI", "JUIN", "JUIL", "AOÛT", "SEPT", "OCT", "NOV", "DÉC"],
  ar: ["يناير", "فبراير", "مارس", "أبريل", "ماي", "يونيو", "يوليوز", "غشت", "شتنبر", "أكتوبر", "نونبر", "دجنبر"],
};

const MONTHS_LONG: Record<Locale, string[]> = {
  fr: [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
  ],
  ar: [
    "يناير",
    "فبراير",
    "مارس",
    "أبريل",
    "ماي",
    "يونيو",
    "يوليوز",
    "غشت",
    "شتنبر",
    "أكتوبر",
    "نونبر",
    "دجنبر",
  ],
};

const WEEKDAYS: Record<Locale, string[]> = {
  fr: ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"],
  ar: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
};

export function todayKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Casablanca",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function parts(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

export function addDays(key: string, n: number) {
  const { y, m, d } = parts(key);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function dow(key: string) {
  const { y, m, d } = parts(key);
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

export function overlaps(start: string, end: string, from: string, to: string) {
  return start <= to && end >= from;
}

export function daysUntil(start: string, today = todayKey()) {
  const { y, m, d } = parts(start);
  const { y: ty, m: tm, d: td } = parts(today);
  const a = Date.UTC(ty, tm - 1, td);
  const b = Date.UTC(y, m - 1, d);
  return Math.round((b - a) / 86_400_000);
}

export function monthBadge(key: string, locale: Locale) {
  const { m, d } = parts(key);
  return { month: MONTHS[locale][m - 1] ?? "", day: String(d).padStart(2, "0") };
}

export function longDate(key: string, locale: Locale) {
  const { y, m, d } = parts(key);
  const dayName = WEEKDAYS[locale][dow(key)];
  const month = MONTHS_LONG[locale][m - 1];
  if (locale === "ar") return `${dayName} ${d} ${month} ${y}`;
  return `${capitalize(dayName)} ${d} ${month} ${y}`;
}

export function dateRange(start: string, end: string, locale: Locale) {
  if (start === end) return longDate(start, locale);
  const a = parts(start);
  const b = parts(end);
  const ma = MONTHS_LONG[locale][a.m - 1];
  const mb = MONTHS_LONG[locale][b.m - 1];
  if (locale === "ar") {
    if (a.m === b.m) return `${a.d} – ${b.d} ${mb} ${b.y}`;
    return `${a.d} ${ma} – ${b.d} ${mb} ${b.y}`;
  }
  if (a.m === b.m) return `${a.d} – ${b.d} ${mb} ${b.y}`;
  return `${a.d} ${ma} – ${b.d} ${mb} ${b.y}`;
}

export function groupNumber(n: number) {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
}

export function money(n: number, locale: Locale) {
  const value = groupNumber(n);
  return locale === "ar" ? `${value} د.م.` : `${value} MAD`;
}

export function capitalize(value: string) {
  return value.charAt(0).toLocaleUpperCase("fr") + value.slice(1);
}

export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return phone;
  return phone.replace(/\d(?=\d{2})/g, (d, i, s) => {
    const tail = s.slice(i);
    return tail.replace(/\D/g, "").length <= 2 ? d : "•";
  });
}
