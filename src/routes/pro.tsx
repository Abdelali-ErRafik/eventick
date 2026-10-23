import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { CITIES, capacityOf, remainingOf, type CityId } from "@/lib/catalog";
import { longDate, money, todayKey } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { isProSection, proSearch, canOpen, ROLES, isRole, type ProSection, type RoleId } from "@/lib/pro";
import { planCost, type PlanId } from "@/lib/strategy";
import { useStore, type Order, type Ticket, type TicketStatus } from "@/lib/store";
import { useCatalog } from "@/lib/use-catalog";
import { cn, uid } from "@/lib/utils";

export const Route = createFileRoute("/pro")({
  validateSearch: (search: Record<string, unknown>) => ({
    section: typeof search.section === "string" && isProSection(search.section) ? search.section : "overview",
  }),
  component: ProPage,
});

const text = {
  fr: {
    brand: "Espace organisateur",
    overview: "Pilotage",
    events: "Événements",
    orders: "Réservations",
    gate: "Porte",
    finance: "Finance",
    team: "Équipe",
    offers: "Offres",
    market: "Retour au marché",
    study: "Étude",
    create: "Nouvelle date",
    lead: "Un seul compte d'appareil relie la vente, les billets, l'entrée et le reversement. Paiement simulé, aucun débit.",
    loop: ["Vente sur le marché", "Réservation", "Contrôle à la porte", "Reversement"],
    gmv: "Encaissé",
    tickets: "Billets émis",
    inside: "Entrées",
    upcoming: "Dates à venir",
    recent: "Dernières commandes",
    open: "Ouvrir",
    staff: "Équipe de cette démo",
    roles: ["Administration", "Porte", "Finance"],
    names: ["Youssef El Amrani", "Sara Bennani", "Amine Cherkaoui"],
    left: "restant",
    issued: "émis",
    cap: "jauge",
    public: "Page publique",
    desk: "Voir les billets",
    empty: "Aucune ligne.",
    search: "Nom, e-mail ou référence",
    allEvents: "Tous les événements",
    allStatus: "Tous les statuts",
    valid: "Valide",
    used: "Entré",
    transferred: "Transféré",
    export: "Exporter CSV",
    admit: "Valider l'entrée",
    undo: "Annuler l'entrée",
    admitted: "Entrée enregistrée.",
    undone: "Entrée annulée.",
    missing: "Aucun billet avec cette référence.",
    already: "Ce billet est déjà entré.",
    moved: "Ce billet a été transféré.",
    scan: "Référence du billet",
    check: "Contrôler",
    gateLead: "La porte lit les billets de cet appareil. Deux téléphones hors ligne ne se parlent pas encore.",
    waiting: "En attente d'un scan.",
    fee: "Commission Eventick",
    net: "Net organisateur",
    payout: "Reversement illustratif sous 48 h. Pas un virement bancaire.",
    account: "Compte démo · Attijariwafa Bank · MA64 **** 0192",
    plan: "Offre",
    perEvent: "Par événement",
    gross: "Brut",
    acting: "Rôle actif",
    roleName: {
      owner: "Propriétaire",
      admin: "Admin",
      events: "Événements",
      sales: "Ventes",
      gate: "Porte",
      finance: "Finance",
    },
    denied: "Ce rôle n'ouvre pas cette section.",
    edit: "Modifier",
    save: "Enregistrer",
    remove: "Supprimer",
    hide: "Retirer de la vente",
    restore: "Remettre en vente",
    hidden: "Hors vente",
    cancelOrder: "Annuler",
    cancelled: "Annulée",
    memberName: "Nom",
    memberPhone: "Téléphone",
    addMember: "Ajouter",
    saved: "Enregistré.",
    removed: "Supprimé.",
    lastOwner: "Il faut au moins un propriétaire.",
    close: "Fermer",
    activity: "Journal",
    duplicate: "Dupliquer",
    guests: "Participants",
    code: "Code",
    kind: "Type",
    percent: "Pourcentage",
    amount: "Montant MAD",
    uses: "Utilisations",
    allDates: "Toutes les dates",
    waitlist: "Liste d'attente",
    maxUses: "Plafond",
  },
  ar: {
    brand: "مساحة المنظم",
    overview: "القيادة",
    events: "الفعاليات",
    orders: "الحجوزات",
    gate: "البوابة",
    finance: "المالية",
    team: "الفريق",
    offers: "العروض",
    market: "العودة إلى السوق",
    study: "الدراسة",
    create: "موعد جديد",
    lead: "حساب هذا الجهاز يربط البيع والتذاكر والدخول والتحويل. الدفع محاكى ولا يوجد خصم حقيقي.",
    loop: ["البيع في السوق", "الحجز", "المراقبة عند البوابة", "التحويل"],
    gmv: "المحصّل",
    tickets: "التذاكر الصادرة",
    inside: "الدخول",
    upcoming: "المواعيد القادمة",
    recent: "آخر الطلبات",
    open: "فتح",
    staff: "فريق هذا العرض",
    roles: ["الإدارة", "البوابة", "المالية"],
    names: ["يوسف العمراني", "سارة بناني", "أمين الشرقاوي"],
    left: "متبقٍ",
    issued: "صادرة",
    cap: "السعة",
    public: "الصفحة العامة",
    desk: "عرض التذاكر",
    empty: "لا صفوف.",
    search: "الاسم أو البريد أو المرجع",
    allEvents: "كل الفعاليات",
    allStatus: "كل الحالات",
    valid: "صالحة",
    used: "دخل",
    transferred: "مُنقلة",
    export: "تصدير CSV",
    admit: "تأكيد الدخول",
    undo: "إلغاء الدخول",
    admitted: "سُجّل الدخول.",
    undone: "أُلغي الدخول.",
    missing: "لا تذكرة بهذا المرجع.",
    already: "هذه التذكرة دخلت من قبل.",
    moved: "هذه التذكرة نُقلت.",
    scan: "مرجع التذكرة",
    check: "راقب",
    gateLead: "البوابة تقرأ تذاكر هذا الجهاز. هاتفان بلا شبكة لا يتزامنان بعد.",
    waiting: "في انتظار المسح.",
    fee: "عمولة Eventick",
    net: "صافي المنظم",
    payout: "تحويل توضيحي خلال 48 ساعة. ليس تحويلاً بنكياً.",
    account: "حساب تجريبي · التجاري وفا بنك · MA64 **** 0192",
    plan: "العرض",
    perEvent: "حسب الفعالية",
    gross: "الإجمالي",
    acting: "الدور النشط",
    roleName: {
      owner: "المالك",
      admin: "مدير",
      events: "الفعاليات",
      sales: "المبيعات",
      gate: "البوابة",
      finance: "المالية",
    },
    denied: "هذا الدور لا يفتح هذا القسم.",
    edit: "تعديل",
    save: "حفظ",
    remove: "حذف",
    hide: "إيقاف البيع",
    restore: "إعادة البيع",
    hidden: "متوقفة",
    cancelOrder: "إلغاء",
    cancelled: "ملغاة",
    memberName: "الاسم",
    memberPhone: "الهاتف",
    addMember: "إضافة",
    saved: "حُفظ.",
    removed: "حُذف.",
    lastOwner: "يجب أن يبقى مالك واحد على الأقل.",
    close: "إغلاق",
    activity: "السجل",
    duplicate: "نسخ",
    guests: "الحضور",
    code: "الرمز",
    kind: "النوع",
    percent: "نسبة",
    amount: "مبلغ بالدرهم",
    uses: "الاستعمالات",
    allDates: "كل المواعيد",
    waitlist: "قائمة الانتظار",
    maxUses: "السقف",
  },
} as const;

type Copy = (typeof text)["fr"] | (typeof text)["ar"];

function ProPage() {
  const { locale } = useI18n();
  const t = text[locale];
  const section = Route.useSearch().section;
  const orders = useStore((state) => state.orders);
  const plan = useStore((state) => state.plan) ?? "starter";
  const role = useStore((state) => state.role) ?? "owner";
  const setRole = useStore((state) => state.setRole);
  const tickets = orders.flatMap((order) => order.tickets).filter((ticket) => ticket.status !== "cancelled");
  const gmv = orders
    .filter((order) => order.tickets.some((ticket) => ticket.status !== "cancelled"))
    .reduce((sum, order) => sum + order.total, 0);
  const nav = (
    [
      { id: "overview", label: t.overview },
      { id: "events", label: t.events },
      { id: "orders", label: t.orders },
      { id: "gate", label: t.gate },
      { id: "finance", label: t.finance },
      { id: "team", label: t.team },
      { id: "offers", label: t.offers },
    ] as const
  ).filter((item) => canOpen(role, item.id));

  return (
    <div className="min-h-screen bg-paper text-ink lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="bg-encre text-foam lg:min-h-screen">
        <div className="flex items-center justify-between px-4 py-4">
          <Link to="/" className="font-display text-xl font-extrabold">
            Eventick<span className="text-safran">.ma</span>
          </Link>
          <span className="rounded-full bg-safran px-2 py-1 text-xs font-bold text-encre">Pro</span>
        </div>
        <p className="px-4 text-xs text-mist">{t.brand}</p>
        <label className="mt-3 block px-4 text-xs text-mist">
          {t.acting}
          <select
            className="mt-1 h-11 w-full rounded-lg bg-foam px-2 text-sm font-semibold text-encre"
            value={role}
            onChange={(event) => {
              if (isRole(event.target.value)) setRole(event.target.value);
            }}
          >
            {ROLES.map((item) => (
              <option key={item} value={item}>
                {t.roleName[item]}
              </option>
            ))}
          </select>
        </label>
        <nav className="mt-4 flex gap-1 overflow-x-auto px-3 pb-4 lg:grid">
          {nav.map((item) => (
            <Link
              key={item.id}
              to="/pro"
              search={proSearch(item.id)}
              className={cn(
                "shrink-0 rounded-full px-3 py-2 text-sm font-semibold lg:rounded-lg",
                section === item.id ? "bg-safran text-encre" : "text-foam hover:bg-foam/10",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden gap-2 px-4 pb-6 text-sm lg:grid">
          <Link to="/" className="text-mist">
            {t.market}
          </Link>
        </div>
      </aside>
      <main className="px-4 py-6 md:px-8">
        {!canOpen(role, section) ? <p className="rounded-xl bg-card p-6 font-semibold">{t.denied}</p> : null}
        {canOpen(role, section) && section === "overview" ? <Overview t={t} gmv={gmv} tickets={tickets} locale={locale} /> : null}
        {canOpen(role, section) && section === "events" ? <Events t={t} locale={locale} /> : null}
        {canOpen(role, section) && section === "orders" ? <Orders t={t} locale={locale} /> : null}
        {canOpen(role, section) && section === "gate" ? <Gate t={t} locale={locale} /> : null}
        {canOpen(role, section) && section === "finance" ? <Finance t={t} gmv={gmv} plan={plan} locale={locale} role={role} /> : null}
        {canOpen(role, section) && section === "team" ? <Team t={t} /> : null}
        {canOpen(role, section) && section === "offers" ? <Offers t={t} locale={locale} /> : null}
      </main>
    </div>
  );
}

function Overview({
  t,
  gmv,
  tickets,
  locale,
}: {
  t: Copy;
  gmv: number;
  tickets: Ticket[];
  locale: "fr" | "ar";
}) {
  const orders = useStore((state) => state.orders);
  const { events } = useCatalog();
  const today = todayKey();
  const upcoming = events.filter((event) => event.end >= today).slice(0, 4);
  const recent = orders.slice(0, 4);
  const inside = tickets.filter((ticket) => ticket.status === "used").length;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-extrabold">{t.overview}</h1>
          <p className="mt-2 max-w-2xl text-muted">{t.lead}</p>
        </div>
        <Link to="/organiser" className="inline-flex h-11 items-center rounded-full bg-safran px-4 text-sm font-semibold text-encre">
          {t.create}
        </Link>
      </div>
      <ol className="mt-6 grid gap-2 sm:grid-cols-4">
        {t.loop.map((step, index) => (
          <li key={step} className="rounded-xl bg-card px-3 py-3 text-sm shadow-card">
            <span className="font-mono text-xs font-bold text-lagon">0{index + 1}</span>
            <p className="font-semibold">{step}</p>
          </li>
        ))}
      </ol>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat label={t.gmv} value={money(gmv, locale)} />
        <Stat label={t.tickets} value={String(tickets.length)} />
        <Stat label={t.inside} value={`${inside}/${tickets.length}`} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-line/10 bg-card p-4 shadow-card">
          <h2 className="font-display text-xl font-extrabold">{t.upcoming}</h2>
          <ul className="mt-3 grid gap-3">
            {upcoming.map((event) => (
              <li key={event.slug} className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{locale === "ar" ? event.titleAr : event.titleFr}</p>
                  <p className="text-sm text-muted">
                    {event.city} · {longDate(event.start, locale)}
                  </p>
                </div>
                <Link to="/evenements/$slug" params={{ slug: event.slug }} className="text-sm font-semibold text-lagon">
                  {t.public}
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-line/10 bg-card p-4 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-extrabold">{t.recent}</h2>
            <Link to="/pro" search={proSearch("orders")} className="text-sm font-semibold text-lagon">
              {t.open}
            </Link>
          </div>
          <ul className="mt-3 grid gap-3">
            {recent.map((order) => (
              <OrderLine key={order.id} order={order} locale={locale} />
            ))}
          </ul>
        </section>
      </div>
      <section className="mt-4 rounded-xl border border-line/10 bg-card p-4 shadow-card">
        <h2 className="font-display text-xl font-extrabold">{t.staff}</h2>
        <TeamList t={t} />
      </section>
      <ActivityList t={t} />
    </div>
  );
}

function Events({ t, locale }: { t: Copy; locale: "fr" | "ar" }) {
  const orders = useStore((state) => state.orders);
  const customEvents = useStore((state) => state.customEvents);
  const updateEvent = useStore((state) => state.updateEvent);
  const removeEvent = useStore((state) => state.removeEvent);
  const setEventHidden = useStore((state) => state.setEventHidden);
  const addEvent = useStore((state) => state.addEvent);
  const { all, hiddenSlugs, sold } = useCatalog();
  const [edit, setEdit] = useState("");
  const [title, setTitle] = useState("");
  const [city, setCity] = useState<CityId>("Casablanca");
  const [start, setStart] = useState("");
  const [price, setPrice] = useState(0);
  const [stock, setStock] = useState(0);
  const rows = useMemo(() => {
    return all
      .map((event) => {
        const issued = orders.flatMap((order) => order.tickets).filter((ticket) => ticket.eventSlug === event.slug);
        return {
          event,
          issued: issued.length,
          revenue: issued.reduce((sum, ticket) => sum + ticket.price, 0),
          left: remainingOf(event, sold),
          cap: capacityOf(event),
          custom: customEvents.some((item) => item.slug === event.slug),
          hidden: hiddenSlugs.includes(event.slug),
        };
      })
      .sort((a, b) => b.issued - a.issued || a.event.start.localeCompare(b.event.start));
  }, [all, orders, sold, customEvents, hiddenSlugs]);

  const openEdit = (slug: string) => {
    const event = all.find((item) => item.slug === slug);
    if (!event) return;
    setEdit(slug);
    setTitle(locale === "ar" ? event.titleAr : event.titleFr);
    setCity(event.city);
    setStart(event.start);
    setPrice(event.tiers[0]?.price ?? 0);
    setStock(event.tiers[0]?.capacity ?? 0);
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-4xl font-extrabold">{t.events}</h1>
        <Link to="/organiser" className="inline-flex h-11 items-center rounded-full bg-safran px-4 text-sm font-semibold text-encre">
          {t.create}
        </Link>
      </div>
      {edit ? (
        <form
          className="mt-4 grid gap-2 rounded-xl bg-card p-4 shadow-card md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            updateEvent(edit, { titleFr: title, titleAr: title, city, start, end: start, tierPrice: price, tierStock: stock });
            setEdit("");
            toast.success(t.saved);
          }}
        >
          <input className="field h-11 md:col-span-2" value={title} onChange={(event) => setTitle(event.target.value)} required />
          <select className="field h-11" value={city} onChange={(event) => setCity(event.target.value as CityId)}>
            {CITIES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <input className="field h-11" type="date" value={start} onChange={(event) => setStart(event.target.value)} required />
          <input className="field h-11" type="number" min={0} value={price} onChange={(event) => setPrice(Number(event.target.value))} />
          <input className="field h-11" type="number" min={1} value={stock} onChange={(event) => setStock(Number(event.target.value))} />
          <div className="flex gap-2 md:col-span-2">
            <button className="h-11 rounded-full bg-lagon px-4 text-sm font-semibold text-foam" type="submit">
              {t.save}
            </button>
            <button className="h-11 rounded-full bg-paper px-4 text-sm font-semibold" type="button" onClick={() => setEdit("")}>
              {t.close}
            </button>
          </div>
        </form>
      ) : null}
      <div className="mt-6 grid gap-3">
        {rows.map((row) => (
          <article key={row.event.slug} className="flex flex-wrap items-center gap-3 rounded-xl border border-line/10 bg-card p-3 shadow-card">
            <img src={row.event.image} alt="" className="size-16 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-extrabold">{locale === "ar" ? row.event.titleAr : row.event.titleFr}</h2>
              <p className="text-sm text-muted">
                {row.event.city} · {longDate(row.event.start, locale)}
                {row.hidden ? ` · ${t.hidden}` : ""}
              </p>
              <p className="text-sm">
                {row.issued} {t.issued} · {row.left} {t.left} / {row.cap} {t.cap} · {money(row.revenue, locale)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm font-semibold">
              <button type="button" className="h-11 rounded-full bg-paper px-3" onClick={() => openEdit(row.event.slug)}>
                {t.edit}
              </button>
              <button
                type="button"
                className="h-11 rounded-full bg-paper px-3"
                onClick={() => {
                  const copy = row.event;
                  addEvent({
                    ...copy,
                    slug: `${copy.slug}-${uid("x").slice(-4).toLowerCase()}`,
                    titleFr: `${copy.titleFr} · copie`,
                    titleAr: `${copy.titleAr} · نسخة`,
                    popularity: 40,
                  });
                  toast.success(t.saved);
                }}
              >
                {t.duplicate}
              </button>
              <button
                type="button"
                className="h-11 rounded-full bg-paper px-3"
                onClick={() => {
                  const lines = [["ref", "holder", "email", "status", "tier", "price"]];
                  for (const order of orders) {
                    for (const ticket of order.tickets) {
                      if (ticket.eventSlug !== row.event.slug) continue;
                      lines.push([ticket.ref, ticket.holder, order.email, ticket.status, ticket.tierFr, String(ticket.price)]);
                    }
                  }
                  const csv = lines.map((line) => line.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
                  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = `${row.event.slug}-participants.csv`;
                  link.click();
                  URL.revokeObjectURL(url);
                }}
              >
                {t.guests}
              </button>
              {row.custom ? (
                <button
                  type="button"
                  className="h-11 rounded-full bg-corail px-3 text-foam"
                  onClick={() => {
                    removeEvent(row.event.slug);
                    toast.success(t.removed);
                  }}
                >
                  {t.remove}
                </button>
              ) : (
                <button
                  type="button"
                  className="h-11 rounded-full bg-encre px-3 text-foam"
                  onClick={() => setEventHidden(row.event.slug, !row.hidden)}
                >
                  {row.hidden ? t.restore : t.hide}
                </button>
              )}
              {!row.hidden ? (
                <Link to="/evenements/$slug" params={{ slug: row.event.slug }} className="inline-flex h-11 items-center text-lagon">
                  {t.public}
                </Link>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Orders({ t, locale }: { t: Copy; locale: "fr" | "ar" }) {
  const orders = useStore((state) => state.orders);
  const setTicketStatus = useStore((state) => state.setTicketStatus);
  const cancelOrder = useStore((state) => state.cancelOrder);
  const removeOrder = useStore((state) => state.removeOrder);
  const [query, setQuery] = useState("");
  const [eventSlug, setEventSlug] = useState("");
  const [status, setStatus] = useState<TicketStatus | "">("");
  const events = useMemo(() => {
    const map = new Map<string, string>();
    for (const order of orders) {
      for (const ticket of order.tickets) map.set(ticket.eventSlug, locale === "ar" ? ticket.titleAr : ticket.titleFr);
    }
    return [...map.entries()];
  }, [orders, locale]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orders
      .map((order) => ({
        order,
        tickets: order.tickets.filter((ticket) => {
          if (eventSlug && ticket.eventSlug !== eventSlug) return false;
          if (status && ticket.status !== status) return false;
          if (!needle) return true;
          return `${order.holder} ${order.email} ${order.id} ${ticket.ref} ${ticket.titleFr} ${ticket.titleAr}`.toLowerCase().includes(needle);
        }),
      }))
      .filter((row) => row.tickets.length > 0);
  }, [orders, query, eventSlug, status]);

  const label = (value: TicketStatus) =>
    value === "valid" ? t.valid : value === "used" ? t.used : value === "cancelled" ? t.cancelled : t.transferred;

  const exportCsv = () => {
    const lines = [["order", "ref", "event", "holder", "email", "status", "price"]];
    for (const row of visible) {
      for (const ticket of row.tickets) {
        lines.push([row.order.id, ticket.ref, ticket.titleFr, row.order.holder, row.order.email, ticket.status, String(ticket.price)]);
      }
    }
    const csv = lines.map((line) => line.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "eventick-reservations.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h1 className="font-display text-4xl font-extrabold">{t.orders}</h1>
      <div className="mt-6 grid gap-2 md:grid-cols-[1fr_1fr_auto_auto]">
        <input className="field h-11" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} />
        <select className="field h-11" value={eventSlug} onChange={(event) => setEventSlug(event.target.value)}>
          <option value="">{t.allEvents}</option>
          {events.map(([slug, title]) => (
            <option key={slug} value={slug}>
              {title}
            </option>
          ))}
        </select>
        <select className="field h-11" value={status} onChange={(event) => setStatus(event.target.value as TicketStatus | "")}>
          <option value="">{t.allStatus}</option>
          <option value="valid">{t.valid}</option>
          <option value="used">{t.used}</option>
          <option value="transferred">{t.transferred}</option>
          <option value="cancelled">{t.cancelled}</option>
        </select>
        <button type="button" className="h-11 rounded-full bg-paper px-4 text-sm font-semibold" onClick={exportCsv}>
          {t.export}
        </button>
      </div>
      <div className="mt-4 grid gap-3">
        {visible.length === 0 ? <p className="rounded-xl bg-card p-6 text-muted">{t.empty}</p> : null}
        {visible.map(({ order, tickets }) => (
          <article key={order.id} className="rounded-xl border border-line/10 bg-card p-4 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs font-bold text-lagon">{order.id}</p>
                <h2 className="font-display text-xl font-extrabold">{order.holder}</h2>
                <p className="text-sm text-muted">
                  {order.email} · {order.phone}
                </p>
              </div>
              <p className="font-display text-xl font-extrabold">{money(tickets.reduce((sum, ticket) => sum + ticket.price, 0), locale)}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="h-11 rounded-full bg-paper px-4 text-sm font-semibold"
                onClick={() => {
                  cancelOrder(order.id);
                  toast.success(t.cancelled);
                }}
              >
                {t.cancelOrder}
              </button>
              <button
                type="button"
                className="h-11 rounded-full bg-corail px-4 text-sm font-semibold text-foam"
                onClick={() => {
                  removeOrder(order.id);
                  toast.success(t.removed);
                }}
              >
                {t.remove}
              </button>
            </div>
            <ul className="mt-3 grid gap-2">
              {tickets.map((ticket) => (
                <li key={ticket.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-paper px-3 py-3">
                  <div>
                    <p className="font-semibold">{locale === "ar" ? ticket.titleAr : ticket.titleFr}</p>
                    <p className="text-sm text-muted">
                      {longDate(ticket.start, locale)} · {locale === "ar" ? ticket.tierAr : ticket.tierFr}
                    </p>
                    <p className="font-mono text-xs">{ticket.ref}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full px-2 py-1 text-xs font-bold", ticket.status === "used" ? "bg-encre text-foam" : "bg-brume text-lagon")}>
                      {label(ticket.status)}
                    </span>
                    <Link to="/billet/$ticketId" params={{ ticketId: ticket.id }} className="text-sm font-semibold text-lagon">
                      {t.open}
                    </Link>
                    {ticket.status === "valid" || ticket.status === "used" ? (
                      <button
                        type="button"
                        className="h-11 rounded-full bg-lagon px-4 text-sm font-semibold text-foam"
                        onClick={() => {
                          const next = ticket.status === "used" ? "valid" : "used";
                          setTicketStatus(ticket.id, next);
                          toast.success(next === "used" ? t.admitted : t.undone);
                        }}
                      >
                        {ticket.status === "used" ? t.undo : t.admit}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}

function Gate({ t, locale }: { t: Copy; locale: "fr" | "ar" }) {
  const orders = useStore((state) => state.orders);
  const scans = useStore((state) => state.scans) ?? [];
  const setTicketStatus = useStore((state) => state.setTicketStatus);
  const logScan = useStore((state) => state.logScan);
  const [scan, setScan] = useState("");
  const [result, setResult] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const ref = scan.trim().toLowerCase();
    const ticket = orders.flatMap((order) => order.tickets).find((item) => item.ref.toLowerCase() === ref);
    if (!ticket) {
      logScan({ ref: scan.trim(), result: "missing", holder: "" });
      setResult(t.missing);
      toast.error(t.missing);
      return;
    }
    if (ticket.status === "used") {
      logScan({ ref: ticket.ref, result: "used", holder: ticket.holder });
      setResult(`${ticket.ref} · ${t.already}`);
      toast.error(t.already);
      return;
    }
    if (ticket.status === "cancelled") {
      logScan({ ref: ticket.ref, result: "cancelled", holder: ticket.holder });
      setResult(`${ticket.ref} · ${t.cancelled}`);
      toast.error(t.cancelled);
      return;
    }
    if (ticket.status === "transferred") {
      logScan({ ref: ticket.ref, result: "moved", holder: ticket.holder });
      setResult(`${ticket.ref} · ${t.moved}`);
      toast.error(t.moved);
      return;
    }
    setTicketStatus(ticket.id, "used");
    logScan({ ref: ticket.ref, result: "ok", holder: ticket.holder });
    const title = locale === "ar" ? ticket.titleAr : ticket.titleFr;
    setResult(`${ticket.holder} · ${title} · ${ticket.ref}`);
    setScan("");
    toast.success(t.admitted);
  };

  const recent = scans.slice(0, 8);

  return (
    <div>
      <h1 className="font-display text-4xl font-extrabold">{t.gate}</h1>
      <p className="mt-2 max-w-2xl text-muted">{t.gateLead}</p>
      <form className="mt-6 grid gap-2 rounded-xl bg-encre p-4 text-foam sm:grid-cols-[1fr_auto]" onSubmit={submit} method="post">
        <label>
          <span className="text-xs font-semibold text-mist">{t.scan}</span>
          <input className="field mt-1 h-14 bg-foam font-mono text-lg text-encre" value={scan} onChange={(event) => setScan(event.target.value)} placeholder="ET-2026-0AS125" />
        </label>
        <button className="h-14 self-end rounded-full bg-safran px-6 text-sm font-semibold text-encre" type="submit">
          {t.check}
        </button>
      </form>
      <p className="mt-4 rounded-xl bg-card p-4 font-semibold shadow-card">{result || t.waiting}</p>
      <ul className="mt-4 grid gap-2">
        {recent.map((scan) => (
          <li key={scan.id} className="flex items-center justify-between rounded-lg bg-card px-3 py-3 text-sm">
            <span>
              {scan.at.slice(11, 16)} · {scan.result} · {scan.holder || "—"}
            </span>
            <span className="font-mono text-xs">{scan.ref}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Finance({
  t,
  gmv,
  plan,
  locale,
  role,
}: {
  t: Copy;
  gmv: number;
  plan: PlanId;
  locale: "fr" | "ar";
  role: RoleId;
}) {
  const setPlan = useStore((state) => state.setPlan);
  const orders = useStore((state) => state.orders);
  const fee = planCost(plan, gmv);
  const byEvent = new Map<string, { title: string; gross: number }>();
  for (const order of orders) {
    for (const ticket of order.tickets) {
      const title = locale === "ar" ? ticket.titleAr : ticket.titleFr;
      const current = byEvent.get(ticket.eventSlug) ?? { title, gross: 0 };
      current.gross += ticket.price;
      byEvent.set(ticket.eventSlug, current);
    }
  }
  const plans: { id: PlanId; label: string }[] = [
    { id: "starter", label: "Starter · 5%" },
    { id: "pro", label: "Pro · 499 + 3%" },
    { id: "business", label: "Business · 1 999 + 2%" },
  ];

  return (
    <div>
      <h1 className="font-display text-4xl font-extrabold">{t.finance}</h1>
      <p className="mt-2 max-w-2xl text-muted">{t.payout}</p>
      <p className="mt-2 font-mono text-sm text-lagon">{t.account}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label={t.gross} value={money(gmv, locale)} />
        <Stat label={t.fee} value={money(fee, locale)} />
        <Stat label={t.net} value={money(gmv - fee, locale)} />
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {plans.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (role === "owner" || role === "admin") setPlan(item.id);
            }}
            disabled={role !== "owner" && role !== "admin"}
            className={cn("h-11 rounded-full px-4 text-sm font-semibold", plan === item.id ? "bg-encre text-foam" : "bg-card")}
          >
            {t.plan} {item.label}
          </button>
        ))}
      </div>
      <h2 className="mt-8 font-display text-2xl font-extrabold">{t.perEvent}</h2>
      <ul className="mt-3 grid gap-2">
        {[...byEvent.values()].map((row) => (
          <li key={row.title} className="flex items-center justify-between rounded-xl bg-card px-4 py-3 shadow-card">
            <span className="font-semibold">{row.title}</span>
            <span>{money(row.gross, locale)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActivityList({ t }: { t: Copy }) {
  const activity = useStore((state) => state.activity) ?? [];
  return (
    <section className="mt-4 rounded-xl border border-line/10 bg-card p-4 shadow-card">
      <h2 className="font-display text-xl font-extrabold">{t.activity}</h2>
      <ul className="mt-3 grid gap-2">
        {activity.slice(0, 8).map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {item.at.slice(0, 16).replace("T", " ")} · {item.kind}
            </span>
            <span className="text-muted">{item.text}</span>
          </li>
        ))}
        {activity.length === 0 ? <li className="text-sm text-muted">{t.empty}</li> : null}
      </ul>
    </section>
  );
}

function Offers({ t, locale }: { t: Copy; locale: "fr" | "ar" }) {
  const promos = useStore((state) => state.promos) ?? [];
  const waitlist = useStore((state) => state.waitlist) ?? [];
  const addPromo = useStore((state) => state.addPromo);
  const updatePromo = useStore((state) => state.updatePromo);
  const removePromo = useStore((state) => state.removePromo);
  const { all } = useCatalog();
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState(10);
  const [eventSlug, setEventSlug] = useState("");
  const [maxUses, setMaxUses] = useState(100);

  return (
    <div>
      <h1 className="font-display text-4xl font-extrabold">{t.offers}</h1>
      <form
        className="mt-6 grid gap-2 rounded-xl bg-card p-4 shadow-card md:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (code.trim().length < 3 || value <= 0 || maxUses < 1) return;
          addPromo({ code, kind, value, eventSlug, maxUses });
          setCode("");
          toast.success(t.saved);
        }}
      >
        <input className="field h-11 font-mono" value={code} onChange={(event) => setCode(event.target.value)} placeholder={t.code} required />
        <select className="field h-11" value={kind} onChange={(event) => setKind(event.target.value as "percent" | "amount")}>
          <option value="percent">{t.percent}</option>
          <option value="amount">{t.amount}</option>
        </select>
        <input className="field h-11" type="number" min={1} value={value} onChange={(event) => setValue(Number(event.target.value))} />
        <select className="field h-11" value={eventSlug} onChange={(event) => setEventSlug(event.target.value)}>
          <option value="">{t.allDates}</option>
          {all.map((event) => (
            <option key={event.slug} value={event.slug}>
              {locale === "ar" ? event.titleAr : event.titleFr}
            </option>
          ))}
        </select>
        <input className="field h-11" type="number" min={1} value={maxUses} onChange={(event) => setMaxUses(Number(event.target.value))} placeholder={t.maxUses} />
        <button className="h-11 rounded-full bg-lagon px-4 text-sm font-semibold text-foam" type="submit">
          {t.addMember}
        </button>
      </form>
      <ul className="mt-4 grid gap-2">
        {promos.map((promo) => (
          <li key={promo.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card px-4 py-3 shadow-card">
            <div>
              <p className="font-mono font-bold">{promo.code}</p>
              <p className="text-sm text-muted">
                {promo.kind === "percent" ? `${promo.value}%` : money(promo.value, locale)} · {promo.uses}/{promo.maxUses} {t.uses}
                {promo.eventSlug ? ` · ${promo.eventSlug}` : ` · ${t.allDates}`}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="h-11 rounded-full bg-paper px-4 text-sm font-semibold"
                onClick={() => {
                  const next = promo.maxUses + 50;
                  updatePromo(promo.id, { maxUses: next });
                  toast.success(t.saved);
                }}
              >
                +50
              </button>
              <button
                type="button"
                className="h-11 rounded-full bg-corail px-4 text-sm font-semibold text-foam"
                onClick={() => {
                  removePromo(promo.id);
                  toast.success(t.removed);
                }}
              >
                {t.remove}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <h2 className="mt-8 font-display text-2xl font-extrabold">{t.waitlist}</h2>
      <ul className="mt-3 grid gap-2">
        {waitlist.length === 0 ? <li className="text-sm text-muted">{t.empty}</li> : null}
        {waitlist.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card px-4 py-3 text-sm shadow-card">
            <span>{item.email}</span>
            <span className="text-muted">
              {item.slug} · {item.at.slice(0, 10)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TeamList({ t }: { t: Copy }) {
  const team = useStore((state) => state.team) ?? [];
  return (
    <ul className="mt-3 grid gap-2 sm:grid-cols-3">
      {team.map((member) => (
        <li key={member.id} className="rounded-lg bg-paper px-3 py-3">
          <p className="font-semibold">{member.name}</p>
          <p className="text-sm text-muted">
            {t.roleName[member.role]} · {member.phone}
          </p>
        </li>
      ))}
    </ul>
  );
}

function Team({ t }: { t: Copy }) {
  const team = useStore((state) => state.team) ?? [];
  const addMember = useStore((state) => state.addMember);
  const updateMember = useStore((state) => state.updateMember);
  const removeMember = useStore((state) => state.removeMember);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<RoleId>("gate");
  const [edit, setEdit] = useState("");

  return (
    <div>
      <h1 className="font-display text-4xl font-extrabold">{t.team}</h1>
      <form
        className="mt-6 grid gap-2 rounded-xl bg-card p-4 shadow-card md:grid-cols-[1fr_1fr_auto_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim().length < 2) return;
          addMember({ name: name.trim(), phone: phone.trim(), role });
          setName("");
          setPhone("");
          toast.success(t.saved);
        }}
      >
        <input className="field h-11" value={name} onChange={(event) => setName(event.target.value)} placeholder={t.memberName} required />
        <input className="field h-11" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder={t.memberPhone} />
        <select className="field h-11" value={role} onChange={(event) => isRole(event.target.value) && setRole(event.target.value)}>
          {ROLES.map((item) => (
            <option key={item} value={item}>
              {t.roleName[item]}
            </option>
          ))}
        </select>
        <button className="h-11 rounded-full bg-lagon px-4 text-sm font-semibold text-foam" type="submit">
          {t.addMember}
        </button>
      </form>
      <ul className="mt-4 grid gap-2">
        {team.map((member) => (
          <li key={member.id} className="rounded-xl bg-card p-3 shadow-card">
            {edit === member.id ? (
              <form
                className="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  const nextRole = String(data.get("role"));
                  if (!isRole(nextRole)) return;
                  updateMember(member.id, {
                    name: String(data.get("name") || member.name),
                    phone: String(data.get("phone") || ""),
                    role: nextRole,
                  });
                  setEdit("");
                  toast.success(t.saved);
                }}
              >
                <input className="field h-11" name="name" defaultValue={member.name} required />
                <input className="field h-11" name="phone" defaultValue={member.phone} />
                <select className="field h-11" name="role" defaultValue={member.role}>
                  {ROLES.map((item) => (
                    <option key={item} value={item}>
                      {t.roleName[item]}
                    </option>
                  ))}
                </select>
                <button className="h-11 rounded-full bg-lagon px-4 text-sm font-semibold text-foam" type="submit">
                  {t.save}
                </button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{member.name}</p>
                  <p className="text-sm text-muted">
                    {t.roleName[member.role]} · {member.phone}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="h-11 rounded-full bg-paper px-4 text-sm font-semibold" onClick={() => setEdit(member.id)}>
                    {t.edit}
                  </button>
                  <button
                    type="button"
                    className="h-11 rounded-full bg-corail px-4 text-sm font-semibold text-foam"
                    onClick={() => {
                      const ok = removeMember(member.id);
                      toast[ok ? "success" : "error"](ok ? t.removed : t.lastOwner);
                    }}
                  >
                    {t.remove}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function OrderLine({ order, locale }: { order: Order; locale: "fr" | "ar" }) {
  const ticket = order.tickets[0];
  return (
    <li className="flex items-center justify-between gap-3">
      <div>
        <p className="font-semibold">{order.holder}</p>
        <p className="text-sm text-muted">{ticket ? (locale === "ar" ? ticket.titleAr : ticket.titleFr) : order.id}</p>
      </div>
      <span className="text-sm font-semibold">{money(order.total, locale)}</span>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line/10 bg-card p-4 shadow-card">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold">{value}</p>
    </div>
  );
}
