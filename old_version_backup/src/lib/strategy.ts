import type { CityId } from "@/lib/catalog";
import type { Locale } from "@/lib/format";

export const BRIEF_KEY = "eventick-brief";

export type BriefTier = { name: string; price: number };

export type EventBrief = {
  title: string;
  city: CityId | "";
  date: string;
  capacity: number | null;
  tiers: BriefTier[];
  discountPct: number | null;
  discountFirst: number | null;
};

export type RivalId = "guichet" | "events" | "iticket" | "tadakir" | "ticketma" | "webook";

export type Phase = "mvp" | "next" | "enterprise";

const CITY_KEYS: { id: CityId; keys: string[] }[] = [
  { id: "Casablanca", keys: ["casablanca", "casa", "الدار البيضاء", "دار البيضاء", "كازابلانكا"] },
  { id: "Rabat", keys: ["rabat", "الرباط"] },
  { id: "Marrakech", keys: ["marrakech", "marrakesh", "مراكش"] },
  { id: "Tanger", keys: ["tanger", "tangier", "طنجة"] },
  { id: "Agadir", keys: ["agadir", "أكادير", "اغادير"] },
  { id: "Essaouira", keys: ["essaouira", "الصويرة"] },
  { id: "Fès", keys: ["fes", "fès", "fez", "فاس"] },
  { id: "Dakhla", keys: ["dakhla", "الداخلة"] },
];

const MONTHS: { n: number; keys: string[] }[] = [
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

function fold(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function parseBrief(raw: string, locale: Locale): EventBrief {
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

  const tiers: BriefTier[] = [];
  const tierRe =
    /(VIP|Standard|Gold|Premium|Early|Fosse|Pelouse|Tribune|Normal|ستاندارد|عادي)\s*(?:بسعر|à|a|@|:|=)?\s*(\d[\d\s]{1,6})/gi;
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
    ? locale === "ar"
      ? "مهرجان"
      : "Festival"
    : /مبار|match|derby|sport/.test(flat)
      ? locale === "ar"
        ? "مباراة"
        : "Match"
      : /مسرح|humour|théâtre|theatre|stand-?up/.test(flat)
        ? locale === "ar"
          ? "عرض"
          : "Spectacle"
        : locale === "ar"
          ? "حفل موسيقي"
          : "Concert";
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

export function saveBrief(brief: EventBrief) {
  const tier = brief.tiers[0];
  const payload = {
    title: brief.title,
    city: brief.city,
    price: tier?.price ?? 150,
    stock: brief.capacity ?? 500,
    date: brief.date,
    tierName: tier?.name ?? "Standard",
  };
  sessionStorage.setItem(BRIEF_KEY, JSON.stringify(payload));
}

export function takeBrief(): {
  title: string;
  city: string;
  price: number;
  stock: number;
  date: string;
  tierName: string;
} | null {
  const raw = sessionStorage.getItem(BRIEF_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(BRIEF_KEY);
  try {
    const data = JSON.parse(raw) as {
      title?: string;
      city?: string;
      price?: number;
      stock?: number;
      date?: string;
      tierName?: string;
    };
    if (!data.title) return null;
    return {
      title: data.title,
      city: data.city ?? "",
      price: Number(data.price) || 150,
      stock: Number(data.stock) || 500,
      date: data.date ?? "",
      tierName: data.tierName ?? "Standard",
    };
  } catch {
    return null;
  }
}

export function platformTake(tickets: number, price: number, rate: number) {
  const gmv = Math.round(tickets * price);
  const fee = Math.round((gmv * rate) / 100);
  return { gmv, fee };
}

export type PlanId = "starter" | "pro" | "business";

export function planCost(id: PlanId, gmv: number) {
  if (id === "starter") return Math.round(gmv * 0.05);
  if (id === "pro") return 499 + Math.round(gmv * 0.03);
  return 1999 + Math.round(gmv * 0.02);
}

export const EXAMPLE_BRIEF: Record<Locale, string> = {
  ar: "أنشئ حفلاً موسيقياً بالدار البيضاء يوم 20 دجنبر، بسعة 500 شخص. أريد VIP بسعر 400 درهم وStandard بسعر 150 درهماً، مع خصم 15% لأول 100 تذكرة.",
  fr: "Crée un concert à Casablanca le 20 décembre, jauge 500. VIP à 400 MAD et Standard à 150 MAD, avec 15% sur les 100 premiers billets.",
};

type Copy = {
  kicker: string;
  title: string;
  lede: string;
  systems: { name: string; body: string }[];
  verified: string;
  rivalsTitle: string;
  rivalsLede: string;
  confirmed: string;
  open: string;
  edge: string;
  modulesTitle: string;
  priorityTitle: string;
  phases: Record<Phase, string>;
  moneyTitle: string;
  moneyLede: string;
  tickets: string;
  price: string;
  rate: string;
  gmv: string;
  fee: string;
  caveat: string;
  cheapest: string;
  plans: { id: PlanId; name: string; price: string; who: string }[];
  aiTitle: string;
  aiLede: string;
  draft: string;
  approve: string;
  publish: string;
  empty: string;
  capacity: string;
  discount: string;
  roadmapTitle: string;
  risksTitle: string;
  decided: string;
  pending: string;
  modelTitle: string;
  modelLede: string;
  models: { id: "open" | "controlled" | "hybrid"; name: string; body: string; impact: string }[];
  recommend: string;
  sections: { id: string; label: string }[];
};

export const studyCopy: Record<Locale, Copy> = {
  fr: {
    kicker: "Dossier stratégique · octobre 2026",
    title: "Eventick n'est pas un site de billets. C'est un système d'exploitation des événements.",
    lede: "Trois produits dans une marque : une place de marché pour le public, un SaaS pour l'organisateur, et un outil de porte pour le jour J. Le design ne suffit pas. L'organisateur doit avoir une raison de quitter Guichet, Events.ma ou Webook.",
    systems: [
      { name: "Discover", body: "Trouver une sortie par ville, date, artiste, et payer en dirhams." },
      { name: "Pro", body: "Créer l'événement, suivre les ventes, l'équipe et les reversements." },
      { name: "Gate", body: "Scanner, bloquer le réemploi, tenir une file, même avec un réseau fragile." },
    ],
    verified: "Faits recoupés en octobre 2026. Une case vide n'est pas une absence de fonction.",
    rivalsTitle: "La concurrence n'est pas plate",
    rivalsLede: "Webook tient déjà le football institutionnel. Tadakir, née des stades, entre dans le spectacle. La porte d'entrée reste l'organisateur indépendant.",
    confirmed: "Documenté",
    open: "À tester en achat réel",
    edge: "Avantage visible",
    modulesTitle: "Six modules, pas une page de plus",
    priorityTitle: "Ce qui se construit, et quand",
    phases: { mvp: "MVP", next: "Phase 2", enterprise: "Enterprise" },
    moneyTitle: "Simulateur de commission",
    moneyLede: "Hypothèse de travail, pas une prévision. Changez le volume, le prix et le taux.",
    tickets: "Billets / mois",
    price: "Prix moyen",
    rate: "Commission",
    gmv: "Volume de ventes",
    fee: "Commission Eventick",
    caveat: "Avant frais de paiement, TVA, remboursements, acquisition et support. Les abonnements ne sont pas inclus.",
    cheapest: "Offre la moins chère pour l'organisateur à ce volume",
    plans: [
      { id: "starter", name: "Starter", price: "5% par billet payé", who: "Petits organisateurs" },
      { id: "pro", name: "Pro", price: "499 MAD / mois + 3%", who: "Séries et salles" },
      { id: "business", name: "Business", price: "1 999 MAD / mois + 2% illustratif", who: "Festivals récurrents" },
    ],
    aiTitle: "Eventick AI prépare. L'organisateur publie.",
    aiLede: "Pas un chatbot décoratif. Une instruction devient une fiche : jauge, tarifs, ville, coupon. Rien n'est en ligne sans validation.",
    draft: "Instruction",
    approve: "Préparer la fiche",
    publish: "Ouvrir dans Eventick Pro",
    empty: "Ajoutez une ville, une jauge ou un tarif pour obtenir une fiche utile.",
    capacity: "Jauge",
    discount: "Coupon",
    roadmapTitle: "Cinq temps, pas un big bang",
    risksTitle: "Décisions avant le premier vrai encaissement",
    decided: "Tranché",
    pending: "Ouvert",
    modelTitle: "Le choix qui fige le schéma",
    modelLede: "Ouvert, fermé, ou hybride. Ce choix change l'inscription, les commissions et les virements dès le premier jour.",
    models: [
      {
        id: "open",
        name: "Ouvert",
        body: "N'importe quel organisateur publie seul.",
        impact: "Volume rapide, fraude et remboursements plus lourds, KYC léger à tenir.",
      },
      {
        id: "controlled",
        name: "Contrôlé",
        body: "Eventick contractualise chaque événement.",
        impact: "Marge et confiance plus hautes, vente lente, équipe commerciale obligatoire.",
      },
      {
        id: "hybrid",
        name: "Hybride",
        body: "Self-service sous un plafond, contrat au-delà.",
        impact: "Deux parcours d'onboarding, deux règles de reversement, une revue manuelle au-dessus du seuil.",
      },
    ],
    recommend: "Recommandé",
    sections: [
      { id: "these", label: "Thèse" },
      { id: "rivaux", label: "Rivaux" },
      { id: "modules", label: "Modules" },
      { id: "priorite", label: "Priorité" },
      { id: "argent", label: "Argent" },
      { id: "ia", label: "IA" },
      { id: "route", label: "Route" },
      { id: "risques", label: "Risques" },
      { id: "modele", label: "Modèle" },
    ],
  },
  ar: {
    kicker: "ملف استراتيجي · أكتوبر 2026",
    title: "Eventick ليست موقعاً للتذاكر. هي نظام تشغيل للفعاليات.",
    lede: "ثلاثة منتجات تحت علامة واحدة: سوق للجمهور، وأداة للمنظم، ونظام للبوابة يوم الحدث. التصميم وحده لا يكفي. يجب أن يملك المنظم سبباً لمغادرة Guichet أو Events.ma أو Webook.",
    systems: [
      { name: "Discover", body: "اكتشاف الخروج حسب المدينة والتاريخ والفنان، والدفع بالدرهم." },
      { name: "Pro", body: "إنشاء الفعالية، ومتابعة المبيعات والفريق والمستحقات." },
      { name: "Gate", body: "مسح التذاكر، ومنع إعادة الاستخدام، وإدارة الطابور حتى مع شبكة ضعيفة." },
    ],
    verified: "وقائع روجعت في أكتوبر 2026. غياب المعلومة لا يعني غياب الميزة.",
    rivalsTitle: "المنافسة ليست متساوية",
    rivalsLede: "Webook تمسك بالفعل بكرة القدم المؤسسية. Tadakir وُلدت في الملاعب وتدخل الآن العروض. باب الدخول يبقى المنظم المستقل.",
    confirmed: "موثّق",
    open: "يحتاج شراءً حقيقياً",
    edge: "التميّز الظاهر",
    modulesTitle: "ست وحدات، لا صفحة إضافية",
    priorityTitle: "ماذا يُبنى، ومتى",
    phases: { mvp: "النسخة الأولى", next: "المرحلة الثانية", enterprise: "المؤسسات" },
    moneyTitle: "محاكي العمولة",
    moneyLede: "فرضية عمل وليست توقعاً. غيّر الحجم والسعر والنسبة.",
    tickets: "تذاكر / شهر",
    price: "متوسط السعر",
    rate: "العمولة",
    gmv: "حجم المبيعات",
    fee: "عمولة Eventick",
    caveat: "قبل رسوم الدفع والضريبة والاسترجاع والاستحواذ والدعم. اشتراكات المنظمين غير محسوبة.",
    cheapest: "العرض الأرخص للمنظم عند هذا الحجم",
    plans: [
      { id: "starter", name: "Starter", price: "5% لكل تذكرة مدفوعة", who: "المنظمون الصغار" },
      { id: "pro", name: "Pro", price: "499 د.م. شهرياً + 3%", who: "القاعات والسلاسل" },
      { id: "business", name: "Business", price: "1٬999 د.م. شهرياً + 2% توضيحي", who: "المهرجانات المتكررة" },
    ],
    aiTitle: "Eventick AI يجهّز. والمنظم ينشر.",
    aiLede: "ليست دردشة شكلية. الجملة تصبح بطاقة: السعة، الأسعار، المدينة، والقسيمة. لا شيء يُنشر بلا موافقة.",
    draft: "التعليمات",
    approve: "جهّز البطاقة",
    publish: "افتحها في Eventick Pro",
    empty: "أضف مدينة أو سعة أو سعراً لتحصل على بطاقة مفيدة.",
    capacity: "السعة",
    discount: "القسيمة",
    roadmapTitle: "خمسة أزمنة، لا إطلاق واحد ضخم",
    risksTitle: "قرارات قبل أول تحصيل حقيقي",
    decided: "محسوم",
    pending: "مفتوح",
    modelTitle: "الاختيار الذي يثبّت قاعدة البيانات",
    modelLede: "مفتوح، أو مغلق، أو هجين. هذا الاختيار يغيّر التسجيل والعمولات والتحويلات من اليوم الأول.",
    models: [
      {
        id: "open",
        name: "مفتوح",
        body: "أي منظم ينشر وحده.",
        impact: "حجم أسرع، واحتيال واسترجاع أثقل، ومعرفة عميل يجب أن تبقى خفيفة.",
      },
      {
        id: "controlled",
        name: "مغلق",
        body: "Eventick تتعاقد على كل فعالية.",
        impact: "هامش وثقة أعلى، وبيع أبطأ، وفريق تجاري إلزامي.",
      },
      {
        id: "hybrid",
        name: "هجين",
        body: "تسجيل ذاتي تحت سقف، وعقد فوقه.",
        impact: "مساران للانضمام، وقاعدتان للتحويل، ومراجعة يدوية فوق العتبة.",
      },
    ],
    recommend: "موصى به",
    sections: [
      { id: "these", label: "الأطروحة" },
      { id: "rivaux", label: "المنافسون" },
      { id: "modules", label: "الوحدات" },
      { id: "priorite", label: "الأولوية" },
      { id: "argent", label: "المال" },
      { id: "ia", label: "الذكاء" },
      { id: "route", label: "المسار" },
      { id: "risques", label: "المخاطر" },
      { id: "modele", label: "النموذج" },
    ],
  },
};

export type Rival = {
  id: RivalId;
  name: string;
  sell: boolean;
  ops: boolean;
  status: "confirmed" | "partial";
  edge: Record<Locale, string>;
  note: Record<Locale, string>;
};

export const RIVALS: Rival[] = [
  {
    id: "guichet",
    name: "Guichet",
    sell: true,
    ops: true,
    status: "partial",
    edge: { fr: "Plusieurs métiers", ar: "عدة قطاعات" },
    note: {
      fr: "Concerts, théâtre, sport, plus cinéma, voyage et boutique. Paiement électronique et Wafacash cités publiquement. Le back-office réel n'a pas été parcouru dans cet audit.",
      ar: "حفلات ومسرح ورياضة، إضافة إلى سينما وسفر ومتجر. الدفع الإلكتروني وWafacash مذكوران علناً. لوحة المنظم لم تُختبر في هذا التدقيق.",
    },
  },
  {
    id: "events",
    name: "Events.ma",
    sell: true,
    ops: true,
    status: "partial",
    edge: { fr: "Découverte", ar: "الاكتشاف" },
    note: {
      fr: "Recherche ville / date / artiste, e-billet, espace organisateur. Les 1 280 événements et 182 000 utilisateurs sont des chiffres de l'entreprise, non audités.",
      ar: "بحث بالمدينة والتاريخ والفنان، وتذكرة إلكترونية، ومساحة للمنظم. 1٬280 فعالية و182 ألف مستخدم أرقام تعلنها الشركة ولم تُدقَّق.",
    },
  },
  {
    id: "iticket",
    name: "iTicket",
    sell: true,
    ops: true,
    status: "confirmed",
    edge: { fr: "Réseau international", ar: "شبكة دولية" },
    note: {
      fr: "Marque marocaine rattachée à iTicket Global. L'app Play (juin 2026) promet QR, transfert, wallet, et n'annonce que l'anglais et le français. Éditeur : ITICKET MMC, Bakou. Volume public encore modeste (1K+ installs).",
      ar: "علامة مغربية تابعة لـ iTicket Global. تطبيق بلاي (يونيو 2026) يعد بـ QR والنقل والمحفظة، ويذكر الإنجليزية والفرنسية فقط. الناشر ITICKET MMC في باكو. الحجم المعلن ما زال متواضعاً (أكثر من ألف تثبيت).",
    },
  },
  {
    id: "tadakir",
    name: "Tadakir",
    sell: true,
    ops: true,
    status: "confirmed",
    edge: { fr: "Stades, puis scènes", ar: "الملاعب ثم الخشبات" },
    note: {
      fr: "Plateforme SONARGES. Le 12 octobre 2026 elle élargit officiellement le sport vers le culturel, avec données hébergées au Maroc, CMI et cash, arabe / français / anglais, QR et transfert.",
      ar: "منصة SONARGES. في 12 أكتوبر 2026 توسّعت رسمياً من الرياضة إلى الثقافي، مع استضافة البيانات في المغرب، وCMI والنقد، والعربية والفرنسية والإنجليزية، وQR والنقل.",
    },
  },
  {
    id: "ticketma",
    name: "Ticket.ma",
    sell: true,
    ops: true,
    status: "partial",
    edge: { fr: "Vente multicanale", ar: "بيع متعدد القنوات" },
    note: {
      fr: "Le discours public parle de points de vente, d'analytique organisateur et d'application. Un parcours d'achat comparé reste à faire avant d'en tirer un écart produit.",
      ar: "الخطاب العلني يتحدث عن نقاط بيع وتحليلات للمنظم وتطبيق. ما زال يلزم مسار شراء مقارن قبل استنتاج فجوة منتج.",
    },
  },
  {
    id: "webook",
    name: "Webook",
    sell: true,
    ops: true,
    status: "confirmed",
    edge: { fr: "Exploitation à grande échelle", ar: "تشغيل على نطاق واسع" },
    note: {
      fr: "Référence produit. Revente au Maroc annoncée en septembre 2026, prix libre en MAD. Amical Maroc–Tunisie : près de 1,5 million de connexions et sold-out des 45 000 places à Fès. L'entreprise revendique 40 M+ billets et les droits football (CAF, FRMF) — chiffres d'émetteur.",
      ar: "المرجع المنتجي. إعادة البيع في المغرب أُعلنت في شتنبر 2026 بسعر حر بالدرهم. ودي المغرب–تونس: قرابة 1.5 مليون اتصال ونفاد 45 ألف مقعد في فاس. الشركة تعلن أكثر من 40 مليون تذكرة وحقوق كرة القدم (CAF وFRMF) — أرقام الناشر.",
    },
  },
];

export const MODULES: { name: string; body: Record<Locale, string> }[] = [
  {
    name: "Discover",
    body: {
      fr: "Agenda public, SEO des villes et des artistes, suggestions. C'est la vitrine déjà en ligne dans cette démo.",
      ar: "أجندة عامة، وصفحات مدن وفنانين لمحركات البحث، واقتراحات. هذه الواجهة موجودة في العرض الحالي.",
    },
  },
  {
    name: "Pro",
    body: {
      fr: "Création, tarifs, équipe, ventes, reversements. L'organisateur doit publier une jauge simple sans attendre un commercial.",
      ar: "الإنشاء والأسعار والفريق والمبيعات والمستحقات. يجب أن ينشر المنظم سعة بسيطة دون انتظار مندوب.",
    },
  },
  {
    name: "Seats",
    body: {
      fr: "Plan de salle, zones, maintien du siège pendant le paiement. À ne pas promettre dans le MVP.",
      ar: "مخطط القاعة والمناطق وحجز المقعد أثناء الدفع. لا يُوعد به في النسخة الأولى.",
    },
  },
  {
    name: "Gate",
    body: {
      fr: "Scan, statut serveur, journal d'entrée. Le hors-ligne se limite à un lot signé et une synchro, sans prétendre à zéro doublon si deux portes sont coupées.",
      ar: "مسح وحالة على الخادم وسجل دخول. العمل دون شبكة يقتصر على دفعة موقّعة ومزامنة، دون ادّعاء صفر تكرار إذا انقطعت بوابتان.",
    },
  },
  {
    name: "Wallet",
    body: {
      fr: "Billets du spectateur, PDF, transfert tracé, alertes de changement.",
      ar: "تذاكر المتفرج، وPDF، ونقل متتبَّع، وتنبيهات التغيير.",
    },
  },
  {
    name: "Growth",
    body: {
      fr: "Coupons, liens d'influence, relance des paiements abandonnés. Après les premières ventes réelles.",
      ar: "قسائم وروابط مؤثرين واسترجاع الدفعات المتروكة. بعد أولى المبيعات الحقيقية.",
    },
  },
];

export const FEATURES: { phase: Phase; fr: string; ar: string }[] = [
  { phase: "mvp", fr: "Création d'événements et de tarifs", ar: "إنشاء الفعاليات والأسعار" },
  { phase: "mvp", fr: "Paiement en dirhams", ar: "الدفع بالدرهم" },
  { phase: "mvp", fr: "QR et application de scan", ar: "QR وتطبيق المسح" },
  { phase: "mvp", fr: "Tableau des ventes", ar: "لوحة المبيعات" },
  { phase: "mvp", fr: "Arabe, français, anglais", ar: "العربية والفرنسية والإنجليزية" },
  { phase: "next", fr: "Coupons et affiliés", ar: "قسائم وتسويق بالعمولة" },
  { phase: "next", fr: "Plans de salle", ar: "خرائط المقاعد" },
  { phase: "next", fr: "Apple / Google Wallet", ar: "محفظة Apple وGoogle" },
  { phase: "next", fr: "CRM et WhatsApp", ar: "CRM وواتساب" },
  { phase: "next", fr: "Pages en marque blanche", ar: "صفحات بالعلامة البيضاء" },
  { phase: "enterprise", fr: "QR dynamique et transfert signé", ar: "QR ديناميكي ونقل موقّع" },
  { phase: "enterprise", fr: "File d'attente virtuelle", ar: "طابور انتظار افتراضي" },
  { phase: "enterprise", fr: "Fraude avancée", ar: "كشف احتيال متقدم" },
  { phase: "enterprise", fr: "Abonnements stades", ar: "اشتراكات الملاعب" },
  { phase: "enterprise", fr: "Revente encadrée", ar: "إعادة بيع منظمة" },
];

export const ROADMAP: { when: Record<Locale, string>; title: Record<Locale, string>; body: Record<Locale, string> }[] = [
  {
    when: { fr: "Semaines 1–3", ar: "الأسابيع 1–3" },
    title: { fr: "Vérifier", ar: "التحقق" },
    body: {
      fr: "Dix organisateurs interrogés, trois parcours d'achat concurrents, schéma des réservations.",
      ar: "عشرة منظمين، وثلاثة مسارات شراء منافسة، ومخطط الحجوزات.",
    },
  },
  {
    when: { fr: "Semaines 4–12", ar: "الأسابيع 4–12" },
    title: { fr: "MVP vendable", ar: "نسخة تُباع" },
    body: {
      fr: "Site, Pro, paiement, QR, scanner, rapport simple. Réservation tenue 8 minutes en transaction, pas par un verrou Redis seul.",
      ar: "الموقع، وPro، والدفع، وQR، والماسح، وتقرير بسيط. الحجز يُمسك 8 دقائق بمعاملة، لا بقفل Redis وحده.",
    },
  },
  {
    when: { fr: "Semaines 13–16", ar: "الأسابيع 13–16" },
    title: { fr: "Pilote", ar: "إطلاق تجريبي" },
    body: {
      fr: "5 à 10 organisateurs, vrais billets, remboursement et entrée sous observation.",
      ar: "5 إلى 10 منظمين، وتذاكر حقيقية، واسترجاع ودخول تحت المراقبة.",
    },
  },
  {
    when: { fr: "Mois 5–7", ar: "الشهر 5–7" },
    title: { fr: "Outils", ar: "الأدوات" },
    body: {
      fr: "Sièges, CRM, campagnes, marque blanche. Eventick devient l'outil, plus seulement le canal.",
      ar: "المقاعد وCRM والحملات والعلامة البيضاء. تصير Eventick الأداة لا قناة البيع فقط.",
    },
  },
  {
    when: { fr: "Mois 8–12", ar: "الشهر 8–12" },
    title: { fr: "Contrats lourds", ar: "العقود الكبرى" },
    body: {
      fr: "Files, SLA, portes, fraude. Pas avant d'avoir vingt organisateurs qui reviennent.",
      ar: "الطوابير وSLA والبوابات والاحتيال. ليس قبل عشرين منظماً يعودون.",
    },
  },
];

export const RISKS: Record<Locale, string>[] = [
  { fr: "Qui détient l'argent des billets jusqu'au reversement.", ar: "من يحوز أموال التذاكر حتى التحويل." },
  { fr: "Contrat organisateur, annulation, remboursement.", ar: "عقد المنظم، والإلغاء، والاسترجاع." },
  { fr: "Loi 09-08 et déclaration CNDP.", ar: "القانون 09-08 والتصريح لدى CNDP." },
  { fr: "Paiement marocain : succès banque sans notification immédiate.", ar: "دفع مغربي: نجاح لدى البنك بلا إشعار فوري." },
  { fr: "Un siège ne peut pas être vendu deux fois. Contrainte SQL, pas seulement un cache.", ar: "المقعد لا يُباع مرتين. قيد في SQL لا في الذاكرة المؤقتة فقط." },
  { fr: "Zéro doublon confirmé, émission du billet en moins de 10 secondes après paiement.", ar: "صفر تكرار مؤكد، وإصدار التذكرة في أقل من 10 ثوانٍ بعد الدفع." },
];

export const STACK = ["Next.js", "NestJS", "PostgreSQL", "Redis", "React Native", "Cloudflare"];
