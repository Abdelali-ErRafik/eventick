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
  const text = raw.trim();
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
  const tierRe = /(VIP|Standard|Gold|Premium|Early|Fosse|Pelouse|Tribune|Normal|ستاندارد|عادي)\s*(?:بسعر|à|a|@|:|=)?\s*(\d[\d\s]{1,6})/gi;
  for (const match of text.matchAll(tierRe)) {
    const price = Number(match[2].replace(/\s/g, ""));
    if (price > 0 && price < 20000) tiers.push({ name: match[1], price });
  }

  const discountPct = Number(text.match(/(\d{1,2})\s*%/)?.[1] ?? "") || null;
  const firstMatch =
    text.match(/(?:أول|الاول|premiers?|premières?)\s*(\d[\d\s]{0,5})/i) ??
    text.match(/(\d[\d\s]{0,5})\s*(?:premiers billets|premières places|تذكرة)/i);
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

export const EXAMPLE_BRIEF = {
  ar: "أنشئ حفلاً موسيقياً بالدار البيضاء يوم 20 دجنبر، بسعة 500 شخص. أريد VIP بسعر 400 درهم وStandard بسعر 150 درهماً، مع خصم 15% لأول 100 تذكرة.",
  fr: "Crée un concert à Casablanca le 20 décembre, jauge 500. VIP à 400 MAD et Standard à 150 MAD, avec 15% sur les 100 premiers billets.",
};
