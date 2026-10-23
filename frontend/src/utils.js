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
