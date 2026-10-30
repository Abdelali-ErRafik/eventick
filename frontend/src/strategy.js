// Free-text "brief" parser for the organiser form's instruction box. This is
// plain keyword/regex matching — city names, month names, "VIP à 400 MAD"
// patterns — NOT an AI/LLM call, despite the UI framing it as "describe your
// event". Ported as-is from the original src/lib/strategy.ts; the behavior
// should stay honest about what it actually does.

const CITY_KEYS = [
  { id: "Casablanca", keys: ["casablanca", "casa", "الدار البيضاء", "دار البيضاء", "كازابلانكا"] },
  { id: "Rabat", keys: ["rabat", "الرباط"] },
  { id: "Marrakech", keys: ["marrakech", "marrakesh", "مراكش"] },
  { id: "Tanger", keys: ["tanger", "tangier", "طنجة"] },
  { id: "Agadir", keys: ["agadir", "أكادير", "اغادير"] },
  { id: "Essaouira", keys: ["essaouira", "الصويرة"] },
  { id: "Fès", keys: ["fes", "fès", "fez", "فاس"] },
  { id: "Dakhla", keys: ["dakhla", "الداخلة"] },
];

const MONTHS = [
  { n: 1, keys: ["janvier", "january", "يناير"] },
  { n: 2, keys: ["fevrier", "février", "february", "فبراير"] },
  { n: 3, keys: ["mars", "march", "مارس"] },
  { n: 4, keys: ["avril", "april", "أبريل", "ابريل"] },
  { n: 5, keys: ["mai", "may", "ماي", "مايو"] },
  { n: 6, keys: ["juin", "june", "يونيو", "يونيو"] },
  { n: 7, keys: ["juillet", "july", "يوليوز", "يوليو"] },
  { n: 8, keys: ["aout", "août", "august", "غشت", "أغسطس"] },
  { n: 9, keys: ["septembre", "september", "شتنبر", "سبتمبر"] },
  { n: 10, keys: ["octobre", "october", "أكتوبر"] },
  { n: 11, keys: ["novembre", "november", "نونبر", "نوفمبر"] },
  { n: 12, keys: ["decembre", "décembre", "december", "دجنبر", "ديسمبر"] },
];

function fold(value) {
  return value.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

export function parseBrief(raw, locale) {
  // Defensive: this is fed from a text box OR from a per-locale example, and
  // a missing example used to reach here as undefined and throw. A brief that
  // says nothing should yield no fields, not a runtime error on a form the
  // organiser has already half filled in.
  const text = typeof raw === "string" ? raw.trim() : "";
  const flat = fold(text);
  const city = CITY_KEYS.find((item) => item.keys.some((key) => flat.includes(fold(key))))?.id ?? "";

  let month = 0;
  let day = 0;
  for (const item of MONTHS) {
    const hit = item.keys.find((key) => flat.includes(fold(key)));
    if (!hit) continue;
    month = item.n;
    const idx = flat.indexOf(fold(hit));
    const before = flat.slice(Math.max(0, idx - 8), idx);
    const match = before.match(/(\d{1,2})\s*$/);
    if (match) day = Number(match[1]);
    break;
  }
  const isoDay = day >= 1 && day <= 31 ? day : 20;
  const year = month === 0 ? 2026 : month >= 10 ? 2026 : 2027;
  const date = month ? `${year}-${String(month).padStart(2, "0")}-${String(isoDay).padStart(2, "0")}` : "";

  const capMatch =
    text.match(/(?:سعة|jauge|capacité|capacite|capacity)\s*:?\s*(\d[\d\s]{0,6})/i) ??
    text.match(/(\d[\d\s]{0,6})\s*(?:شخص|أشخاص|personnes|personne|places|place)/i);
  const capacity = capMatch ? Number(capMatch[1].replace(/\s/g, "")) : null;

  const tiers = [];
  // `at` for English, alongside `à`/`a` (French) and `بسعر` (Arabic). Without
  // it an English brief parsed no tiers at all, which is the whole point of
  // the box.
  const tierRe = /(VIP|Standard|Gold|Premium|Early|Fosse|Pelouse|Tribune|Normal|ستاندارد|عادي)\s*(?:بسعر|at|à|a|@|:|=)?\s*(\d[\d\s]{1,6})/gi;
  for (const match of text.matchAll(tierRe)) {
    const price = Number(match[2].replace(/\s/g, ""));
    if (price > 0 && price < 20000) tiers.push({ name: match[1], price });
  }

  const discountPct = Number(text.match(/(\d{1,2})\s*%/)?.[1] ?? "") || null;
  const firstMatch =
    text.match(/(?:أول|الاول|premiers?|premières?|first)\s*(\d[\d\s]{0,5})/i) ??
    text.match(/(\d[\d\s]{0,5})\s*(?:premiers billets|premières places|first tickets|تذكرة)/i);
  const discountFirst = firstMatch ? Number(firstMatch[1].replace(/\s/g, "")) : null;

  const kind = /مهرجان|festival/.test(flat)
    ? locale === "ar" ? "مهرجان" : "Festival"
    : /مبار|match|derby|sport/.test(flat)
      ? locale === "ar" ? "مباراة" : "Match"
      : /مسرح|humour|théâtre|theatre|stand-?up/.test(flat)
        ? locale === "ar" ? "عرض" : "Spectacle"
        : locale === "ar" ? "حفل موسيقي" : "Concert";
  const title = city ? `${kind} · ${city}` : kind;

  return {
    title,
    city,
    date,
    capacity: capacity && capacity < 500000 ? capacity : null,
    tiers,
    discountPct: discountPct && discountPct <= 90 ? discountPct : null,
    discountFirst: discountFirst && discountFirst < 100000 ? discountFirst : null,
  };
}

// planCost() lived here: it priced the three commission plans in the browser
// for the Finance screen, from rates hardcoded twice over. It is gone because
// the commission is now the server's — recorded on each order at settlement
// from the plan an admin assigned, at rates held in the `plans` table. Keeping
// a second copy of those rates here would guarantee they eventually disagreed
// with the figure actually charged.

/*
 * One example per locale — all three of them.
 *
 * `en` was missing while the site has shipped French, English and Arabic, so
 * `EXAMPLE_BRIEF[locale]` was undefined in English and the button threw
 * "Cannot read properties of undefined (reading 'trim')" on the first click.
 * The parser itself already understood English (MONTHS carries january…
 * december, CITY_KEYS carries marrakesh/tangier/fez) — only the sample
 * sentence was absent, so the feature looked unbuilt when it was one string
 * short.
 *
 * Read through exampleBrief() below rather than indexed directly: a fourth
 * locale added here one day must not be able to crash the form.
 */
export const EXAMPLE_BRIEF = {
  ar: "أنشئ حفلاً موسيقياً بالدار البيضاء يوم 20 دجنبر، بسعة 500 شخص. أريد VIP بسعر 400 درهم وStandard بسعر 150 درهماً، مع خصم 15% لأول 100 تذكرة.",
  fr: "Crée un concert à Casablanca le 20 décembre, jauge 500. VIP à 400 MAD et Standard à 150 MAD, avec 15% sur les 100 premiers billets.",
  en: "Create a concert in Casablanca on 20 december, capacity 500. VIP at 400 MAD and Standard at 150 MAD, with 15% off the first 100 tickets.",
};

/** The example for a locale, falling back to French rather than to nothing. */
export function exampleBrief(locale) {
  return EXAMPLE_BRIEF[locale] ?? EXAMPLE_BRIEF.fr;
}
