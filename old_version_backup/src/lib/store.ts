import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EventItem } from "@/lib/catalog";
import { tierLeft } from "@/lib/catalog";
import type { Locale } from "@/lib/format";
import type { RoleId } from "@/lib/pro";
import { uid } from "@/lib/utils";

export type TicketStatus = "valid" | "used" | "transferred" | "cancelled";

export type Ticket = {
  id: string;
  ref: string;
  orderId: string;
  eventSlug: string;
  titleFr: string;
  titleAr: string;
  category: EventItem["category"];
  city: string;
  venueFr: string;
  venueAr: string;
  address: string;
  start: string;
  end: string;
  time: string;
  image: string;
  tierId: string;
  tierFr: string;
  tierAr: string;
  zoneFr: string;
  zoneAr: string;
  gateFr: string;
  gateAr: string;
  seatRow?: number;
  seatNum?: number;
  holder: string;
  price: number;
  status: TicketStatus;
};

export type Order = {
  id: string;
  createdAt: string;
  email: string;
  phone: string;
  holder: string;
  tickets: Ticket[];
  subtotal: number;
  fees: number;
  discount?: number;
  promoCode?: string;
  total: number;
  authCode: string;
  brand: string;
  last4: string;
  bank: string;
};

export type PayCard = {
  id: string;
  brand: "visa" | "mastercard";
  bank: string;
  last4: string;
  holder: string;
  exp: string;
  isDefault: boolean;
};

export type Profile = {
  name: string;
  email: string;
  phone: string;
  cin: string;
  vip: boolean;
};

export type Cart = {
  slug: string;
  lines: { tierId: string; qty: number }[];
  holdUntil?: string;
};

export type ScanLog = {
  id: string;
  at: string;
  ref: string;
  result: "ok" | "used" | "missing" | "moved" | "cancelled";
  holder: string;
};

export type EventPatch = {
  titleFr?: string;
  titleAr?: string;
  city?: EventItem["city"];
  start?: string;
  end?: string;
  venueFr?: string;
  venueAr?: string;
  tierPrice?: number;
  tierStock?: number;
};

export type Member = {
  id: string;
  name: string;
  role: RoleId;
  phone: string;
};

export type Promo = {
  id: string;
  code: string;
  kind: "percent" | "amount";
  value: number;
  eventSlug: string;
  maxUses: number;
  uses: number;
};

export type WaitEntry = {
  id: string;
  slug: string;
  email: string;
  at: string;
};

export type Activity = {
  id: string;
  at: string;
  kind: "order" | "cancel" | "scan" | "wait";
  text: string;
};

export function quotePromo(promos: Promo[] | undefined, code: string, slug: string, subtotal: number) {
  const needle = code.trim().toLowerCase();
  if (!needle || subtotal <= 0) return null;
  const promo = (promos ?? []).find(
    (item) => item.code.toLowerCase() === needle && item.uses < item.maxUses && (item.eventSlug === "" || item.eventSlug === slug),
  );
  if (!promo || promo.value <= 0) return null;
  const raw = promo.kind === "percent" ? Math.round((subtotal * Math.min(promo.value, 100)) / 100) : promo.value;
  const discount = Math.min(subtotal, Math.max(0, raw));
  if (discount <= 0) return null;
  return { promo, discount };
}

function pushActivity(current: Activity[] | undefined, kind: Activity["kind"], text: string): Activity[] {
  return [{ id: uid("AC"), at: new Date().toISOString(), kind, text }, ...(current ?? [])].slice(0, 50);
}

export function applyEventPatch(event: EventItem, patch: EventPatch): EventItem {
  const tiers = event.tiers.map((tier, index) => {
    if (index !== 0) return tier;
    return {
      ...tier,
      price: patch.tierPrice ?? tier.price,
      capacity: patch.tierStock ?? tier.capacity,
      remaining: patch.tierStock ?? tier.remaining,
    };
  });
  return {
    ...event,
    titleFr: patch.titleFr ?? event.titleFr,
    titleAr: patch.titleAr ?? event.titleAr,
    city: patch.city ?? event.city,
    start: patch.start ?? event.start,
    end: patch.end ?? event.end,
    venueFr: patch.venueFr ?? event.venueFr,
    venueAr: patch.venueAr ?? event.venueAr,
    tiers,
  };
}

type CheckoutInput = {
  event: EventItem;
  lines: { tierId: string; qty: number }[];
  holder: string;
  email: string;
  phone: string;
  brand: string;
  last4: string;
  bank: string;
  promoCode?: string;
};

type Data = {
  locale: Locale;
  browseCity: string;
  profile: Profile;
  cards: PayCard[];
  orders: Order[];
  saved: string[];
  cart: Cart | null;
  sold: Record<string, number>;
  customEvents: EventItem[];
  newsletter: string[];
  plan: "starter" | "pro" | "business";
  scans: ScanLog[];
  role: RoleId;
  team: Member[];
  hiddenSlugs: string[];
  patches: Record<string, EventPatch>;
  promos: Promo[];
  waitlist: WaitEntry[];
  activity: Activity[];
};

type Store = Data & {
  hydrated: boolean;
  setHydrated: () => void;
  setLocale: (locale: Locale) => void;
  setBrowseCity: (city: string) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  toggleSaved: (slug: string) => void;
  setCart: (cart: Cart | null) => void;
  placeOrder: (input: CheckoutInput) => Order | null;
  transferTicket: (ticketId: string, holder: string) => void;
  setTicketStatus: (ticketId: string, status: TicketStatus) => void;
  addCard: (card: Omit<PayCard, "id" | "isDefault"> & { isDefault?: boolean }) => void;
  removeCard: (id: string) => void;
  addEvent: (event: EventItem) => void;
  setPlan: (plan: Data["plan"]) => void;
  logScan: (entry: Omit<ScanLog, "id" | "at">) => void;
  setRole: (role: RoleId) => void;
  addMember: (member: Omit<Member, "id">) => void;
  updateMember: (id: string, patch: Partial<Omit<Member, "id">>) => void;
  removeMember: (id: string) => boolean;
  updateEvent: (slug: string, patch: EventPatch) => void;
  removeEvent: (slug: string) => void;
  setEventHidden: (slug: string, hidden: boolean) => void;
  cancelOrder: (orderId: string) => void;
  removeOrder: (orderId: string) => void;
  addPromo: (promo: Omit<Promo, "id" | "uses">) => void;
  updatePromo: (id: string, patch: Partial<Omit<Promo, "id" | "uses">>) => void;
  removePromo: (id: string) => void;
  joinWaitlist: (slug: string, email: string) => boolean;
  subscribe: (email: string) => void;
  resetDemo: () => void;
};

function ticket(partial: Omit<Ticket, "status"> & { status?: TicketStatus }): Ticket {
  return { status: "valid", ...partial };
}

function seedOrders(): Order[] {
  const oasis = ticket({
    id: "seed-t-oasis",
    ref: "ET-2026-0AS125",
    orderId: "seed-oasis",
    eventSlug: "oasis-2026",
    titleFr: "Oasis Festival 2026 : Into the Wild",
    titleAr: "مهرجان الواحة 2026",
    category: "festivals",
    city: "Marrakech",
    venueFr: "The Source Resort",
    venueAr: "منتجع ذا سورس",
    address: "Route de l'Ourika, Marrakech",
    start: "2026-10-23",
    end: "2026-10-25",
    time: "18:00",
    image: "/events/oasis.jpg",
    tierId: "week",
    tierFr: "Pass 3 jours",
    tierAr: "تذكرة 3 أيام",
    zoneFr: "Site général",
    zoneAr: "الموقع العام",
    gateFr: "Entrée principale",
    gateAr: "المدخل الرئيسي",
    holder: "Youssef El Amrani",
    price: 1250,
  });
  const derby = ticket({
    id: "seed-t-derby",
    ref: "ET-2026-DRB442",
    orderId: "seed-derby",
    eventSlug: "derby-casa",
    titleFr: "Grand Derby Casablancais 2026",
    titleAr: "ديربي الدار البيضاء الكبير 2026",
    category: "sport",
    city: "Casablanca",
    venueFr: "Complexe Mohammed V",
    venueAr: "مركب محمد الخامس",
    address: "Rue Al Azhar, Casablanca",
    start: "2026-11-08",
    end: "2026-11-08",
    time: "19:00",
    image: "/events/derby.jpg",
    tierId: "honneur",
    tierFr: "Tribune Honneur",
    tierAr: "مدرج الشرف",
    zoneFr: "Tribune Honneur",
    zoneAr: "مدرج الشرف",
    gateFr: "Porte 4",
    gateAr: "الباب 4",
    seatRow: 12,
    seatNum: 8,
    holder: "Youssef El Amrani",
    price: 250,
  });
  const comedy = ticket({
    id: "seed-t-comedy",
    ref: "ET-2026-CMD218",
    orderId: "seed-comedy",
    eventSlug: "comedy-casa",
    titleFr: "Casablanca Comedy Club : Grand Gala Darija",
    titleAr: "نادي كوميديا الدار البيضاء",
    category: "humour",
    city: "Casablanca",
    venueFr: "Megarama Casablanca",
    venueAr: "ميغاراما الدار البيضاء",
    address: "Boulevard de la Corniche, Casablanca",
    start: "2026-10-25",
    end: "2026-10-25",
    time: "21:00",
    image: "/events/comedy.jpg",
    tierId: "std",
    tierFr: "Fauteuil standard",
    tierAr: "مقعد عادي",
    zoneFr: "Fauteuil",
    zoneAr: "مقعد",
    gateFr: "Hall principal",
    gateAr: "البهو الرئيسي",
    seatRow: 14,
    seatNum: 6,
    holder: "Youssef El Amrani",
    price: 180,
  });
  const gnaoua = ticket({
    id: "seed-t-gnaoua",
    ref: "ET-2025-091823",
    orderId: "seed-gnaoua",
    eventSlug: "gnaoua-2025",
    titleFr: "Festival Gnaoua et Musiques du Monde",
    titleAr: "مهرجان كناوة وموسيقى العالم",
    category: "festivals",
    city: "Essaouira",
    venueFr: "Place Moulay Hassan",
    venueAr: "ساحة مولاي الحسن",
    address: "Essaouira",
    start: "2025-06-28",
    end: "2025-06-28",
    time: "18:30",
    image: "/events/gnaoua.jpg",
    tierId: "pass",
    tierFr: "Pass festival",
    tierAr: "تذكرة المهرجان",
    zoneFr: "Carré assis",
    zoneAr: "المربع الجالس",
    gateFr: "Porte océan",
    gateAr: "باب المحيط",
    holder: "Youssef El Amrani",
    price: 850,
    status: "used",
  });
  const jad = ticket({
    id: "seed-t-jad",
    ref: "ET-2024-004122",
    orderId: "seed-jad",
    eventSlug: "jad-2024",
    titleFr: "Jad — D'ailleurs, tournée Maroc",
    titleAr: "جاد — من مكان آخر، جولة المغرب",
    category: "humour",
    city: "Rabat",
    venueFr: "Théâtre National Mohammed V",
    venueAr: "المسرح الوطني محمد الخامس",
    address: "Rabat",
    start: "2024-12-14",
    end: "2024-12-14",
    time: "20:30",
    image: "/events/theatre.jpg",
    tierId: "or",
    tierFr: "Catégorie 1",
    tierAr: "الفئة 1",
    zoneFr: "Orchestre",
    zoneAr: "الأوركسترا",
    gateFr: "Parvis",
    gateAr: "الساحة",
    seatRow: 4,
    seatNum: 11,
    holder: "Youssef El Amrani",
    price: 700,
    status: "used",
  });
  const friendly = ticket({
    id: "seed-t-friendly",
    ref: "ET-2024-001209",
    orderId: "seed-friendly",
    eventSlug: "friendly-2024",
    titleFr: "Maroc vs Angola — match amical",
    titleAr: "المغرب ضد أنغولا — مباراة ودية",
    category: "sport",
    city: "Agadir",
    venueFr: "Grand Stade d'Agadir",
    venueAr: "الملعب الكبير لأكادير",
    address: "Agadir",
    start: "2024-03-22",
    end: "2024-03-22",
    time: "20:00",
    image: "/events/derby.jpg",
    tierId: "honneur",
    tierFr: "Tribune",
    tierAr: "مدرج",
    zoneFr: "Latérale",
    zoneAr: "جانبي",
    gateFr: "Porte 7",
    gateAr: "الباب 7",
    holder: "Youssef El Amrani",
    price: 250,
    status: "used",
  });

  const order = (
    id: string,
    createdAt: string,
    item: Ticket,
    authCode: string,
    last4: string,
    bank: string,
  ): Order => ({
    id,
    createdAt,
    email: "youssef.elamrani@mail.ma",
    phone: "+212 6 61 20 18 42",
    holder: "Youssef El Amrani",
    tickets: [item],
    subtotal: item.price,
    fees: 0,
    total: item.price,
    authCode,
    brand: "visa",
    last4,
    bank,
  });

  return [
    order("seed-oasis", "2026-10-18T14:22:00+01:00", oasis, "AUTH-8827391", "4092", "Attijariwafa Bank"),
    order("seed-comedy", "2026-10-12T11:05:00+01:00", comedy, "AUTH-7711204", "4092", "Attijariwafa Bank"),
    order("seed-derby", "2026-09-30T19:41:00+01:00", derby, "AUTH-6609188", "8821", "Banque Populaire"),
    order("seed-gnaoua", "2025-05-02T10:12:00+01:00", gnaoua, "AUTH-2291002", "4092", "Attijariwafa Bank"),
    order("seed-jad", "2024-11-20T16:02:00+01:00", jad, "AUTH-1188330", "4092", "Attijariwafa Bank"),
    order("seed-friendly", "2024-03-01T09:18:00+01:00", friendly, "AUTH-1002441", "8821", "Banque Populaire"),
  ];
}

function seedData(): Data {
  return {
    locale: "fr",
    browseCity: "",
    profile: {
      name: "Youssef El Amrani",
      email: "youssef.elamrani@mail.ma",
      phone: "+212 6 61 20 18 42",
      cin: "BE849221",
      vip: true,
    },
    cards: [
      {
        id: "card-awb",
        brand: "visa",
        bank: "Attijariwafa Bank",
        last4: "4092",
        holder: "YOUSSEF EL AMRANI",
        exp: "09/28",
        isDefault: true,
      },
      {
        id: "card-bp",
        brand: "mastercard",
        bank: "Banque Populaire",
        last4: "8821",
        holder: "YOUSSEF EL AMRANI",
        exp: "04/27",
        isDefault: false,
      },
    ],
    orders: seedOrders(),
    saved: ["jazzablanca-2026", "mawazine-2027", "sacrees-fes-2026"],
    cart: null,
    sold: {},
    customEvents: [],
    newsletter: [],
    plan: "starter",
    scans: [],
    role: "owner",
    team: [
      { id: "m-youssef", name: "Youssef El Amrani", role: "owner", phone: "+212 6 61 20 18 42" },
      { id: "m-sara", name: "Sara Bennani", role: "gate", phone: "+212 6 12 44 90 18" },
      { id: "m-amine", name: "Amine Cherkaoui", role: "finance", phone: "+212 6 70 11 33 90" },
      { id: "m-leila", name: "Leila Tazi", role: "events", phone: "+212 6 22 18 40 07" },
      { id: "m-omar", name: "Omar Idrissi", role: "sales", phone: "+212 6 33 90 14 55" },
      { id: "m-nadia", name: "Nadia Berrada", role: "admin", phone: "+212 6 44 21 08 73" },
    ],
    hiddenSlugs: [],
    patches: {},
    promos: [
      { id: "promo-safran", code: "SAFRAN15", kind: "percent", value: 15, eventSlug: "", maxUses: 200, uses: 12 },
      { id: "promo-casa", code: "CASA50", kind: "amount", value: 50, eventSlug: "oasis-2026", maxUses: 40, uses: 3 },
    ],
    waitlist: [{ id: "w-sara", slug: "mawazine-2027", email: "sara.bennani@mail.ma", at: "2026-10-18T09:12:00+01:00" }],
    activity: [{ id: "a-wait", at: "2026-10-18T09:12:00+01:00", kind: "wait", text: "sara.bennani@mail.ma · mawazine-2027" }],
  };
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...seedData(),
      hydrated: false,
      setHydrated: () => set({ hydrated: true }),
      setLocale: (locale) => set({ locale }),
      setBrowseCity: (browseCity) => set({ browseCity }),
      updateProfile: (patch) => set({ profile: { ...get().profile, ...patch } }),
      toggleSaved: (slug) =>
        set({
          saved: get().saved.includes(slug) ? get().saved.filter((item) => item !== slug) : [...get().saved, slug],
        }),
      setCart: (cart) =>
        set({
          cart: cart
            ? { ...cart, holdUntil: new Date(Date.now() + 8 * 60 * 1000).toISOString() }
            : null,
        }),
      placeOrder: (input) => {
        const current = get().cart;
        if (current?.holdUntil && Date.parse(current.holdUntil) < Date.now()) {
          set({ cart: null });
          return null;
        }
        const sold = { ...get().sold };
        for (const line of input.lines) {
          const tier = input.event.tiers.find((item) => item.id === line.tierId);
          if (!tier || line.qty < 1 || line.qty > tierLeft(input.event, tier, sold)) return null;
        }
        const orderId = uid("CMD");
        const tickets: Ticket[] = [];
        let subtotal = 0;
        for (const line of input.lines) {
          const tier = input.event.tiers.find((item) => item.id === line.tierId);
          if (!tier || line.qty < 1) continue;
          const key = `${input.event.slug}:${tier.id}`;
          let cursor = sold[key] ?? 0;
          for (let i = 0; i < line.qty; i++) {
            cursor += 1;
            const row = tier.numbered ? Math.ceil(cursor / 12) : undefined;
            const num = tier.numbered ? ((cursor - 1) % 12) + 1 : undefined;
            tickets.push({
              id: uid("TK"),
              ref: `ET-2026-${uid("R").slice(-6)}`,
              orderId,
              eventSlug: input.event.slug,
              titleFr: input.event.titleFr,
              titleAr: input.event.titleAr,
              category: input.event.category,
              city: input.event.city,
              venueFr: input.event.venueFr,
              venueAr: input.event.venueAr,
              address: input.event.address,
              start: input.event.start,
              end: input.event.end,
              time: input.event.time,
              image: input.event.image,
              tierId: tier.id,
              tierFr: tier.nameFr,
              tierAr: tier.nameAr,
              zoneFr: tier.zoneFr,
              zoneAr: tier.zoneAr,
              gateFr: tier.gateFr,
              gateAr: tier.gateAr,
              seatRow: row,
              seatNum: num,
              holder: input.holder,
              price: tier.price,
              status: "valid",
            });
            subtotal += tier.price;
          }
          sold[key] = cursor;
        }
        const quoted = input.promoCode ? quotePromo(get().promos, input.promoCode, input.event.slug, subtotal) : null;
        if (input.promoCode?.trim() && !quoted) return null;
        const discount = quoted?.discount ?? 0;
        const promos = quoted
          ? (get().promos ?? []).map((item) => (item.id === quoted.promo.id ? { ...item, uses: item.uses + 1 } : item))
          : get().promos;
        const order: Order = {
          id: orderId,
          createdAt: new Date().toISOString(),
          email: input.email,
          phone: input.phone,
          holder: input.holder,
          tickets,
          subtotal,
          fees: 0,
          discount,
          promoCode: quoted?.promo.code,
          total: subtotal - discount,
          authCode: `AUTH-${Math.floor(1000000 + Math.random() * 9000000)}`,
          brand: input.brand,
          last4: input.last4,
          bank: input.bank,
        };
        set({
          orders: [order, ...get().orders],
          sold,
          cart: null,
          promos,
          activity: pushActivity(get().activity, "order", `${orderId} · ${input.holder}`),
        });
        return order;
      },
      transferTicket: (ticketId, holder) =>
        set({
          orders: get().orders.map((order) => ({
            ...order,
            tickets: order.tickets.map((item) =>
              item.id === ticketId ? { ...item, status: "transferred", holder } : item,
            ),
          })),
        }),
      setTicketStatus: (ticketId, status) =>
        set({
          orders: get().orders.map((order) => ({
            ...order,
            tickets: order.tickets.map((item) => (item.id === ticketId ? { ...item, status } : item)),
          })),
        }),
      addCard: (card) =>
        set({
          cards: [
            ...get().cards.map((item) => ({ ...item, isDefault: card.isDefault ? false : item.isDefault })),
            { ...card, id: uid("CARD"), isDefault: card.isDefault ?? get().cards.length === 0 },
          ],
        }),
      removeCard: (id) => set({ cards: get().cards.filter((card) => card.id !== id) }),
      addEvent: (event) => set({ customEvents: [event, ...get().customEvents] }),
      setPlan: (plan) => set({ plan }),
      logScan: (entry) =>
        set({
          scans: [{ ...entry, id: uid("SC"), at: new Date().toISOString() }, ...(get().scans ?? [])].slice(0, 40),
          activity: pushActivity(get().activity, "scan", `${entry.result} · ${entry.ref}`),
        }),
      setRole: (role) => set({ role }),
      addMember: (member) => set({ team: [...(get().team ?? []), { ...member, id: uid("MB") }] }),
      updateMember: (id, patch) =>
        set({ team: (get().team ?? []).map((member) => (member.id === id ? { ...member, ...patch } : member)) }),
      removeMember: (id) => {
        const team = get().team ?? [];
        const target = team.find((member) => member.id === id);
        if (!target) return false;
        const owners = team.filter((member) => member.role === "owner");
        if (target.role === "owner" && owners.length < 2) return false;
        set({ team: team.filter((member) => member.id !== id) });
        return true;
      },
      updateEvent: (slug, patch) => {
        if (get().customEvents.some((event) => event.slug === slug)) {
          set({
            customEvents: get().customEvents.map((event) => (event.slug === slug ? applyEventPatch(event, patch) : event)),
          });
          return;
        }
        const patches = get().patches ?? {};
        set({ patches: { ...patches, [slug]: { ...patches[slug], ...patch } } });
      },
      removeEvent: (slug) => set({ customEvents: get().customEvents.filter((event) => event.slug !== slug) }),
      setEventHidden: (slug, hidden) => {
        const hiddenSlugs = get().hiddenSlugs ?? [];
        set({
          hiddenSlugs: hidden ? [...new Set([...hiddenSlugs, slug])] : hiddenSlugs.filter((item) => item !== slug),
        });
      },
      cancelOrder: (orderId) => {
        const order = get().orders.find((item) => item.id === orderId);
        if (!order) return;
        const sold = { ...get().sold };
        for (const item of order.tickets) {
          if (item.status === "cancelled") continue;
          const key = `${item.eventSlug}:${item.tierId}`;
          sold[key] = Math.max(0, (sold[key] ?? 0) - 1);
        }
        set({
          sold,
          orders: get().orders.map((item) =>
            item.id === orderId
              ? { ...item, tickets: item.tickets.map((ticketItem) => ({ ...ticketItem, status: "cancelled" as const })) }
              : item,
          ),
          activity: pushActivity(get().activity, "cancel", orderId),
        });
      },
      removeOrder: (orderId) => set({ orders: get().orders.filter((item) => item.id !== orderId) }),
      addPromo: (promo) =>
        set({
          promos: [{ ...promo, id: uid("PR"), uses: 0, code: promo.code.trim().toUpperCase() }, ...(get().promos ?? [])],
        }),
      updatePromo: (id, patch) =>
        set({
          promos: (get().promos ?? []).map((item) =>
            item.id === id ? { ...item, ...patch, code: patch.code ? patch.code.trim().toUpperCase() : item.code } : item,
          ),
        }),
      removePromo: (id) => set({ promos: (get().promos ?? []).filter((item) => item.id !== id) }),
      joinWaitlist: (slug, email) => {
        const clean = email.trim().toLowerCase();
        if (!clean.includes("@") || clean.startsWith("@") || clean.endsWith("@")) return false;
        const waitlist = get().waitlist ?? [];
        if (waitlist.some((item) => item.slug === slug && item.email === clean)) return false;
        set({
          waitlist: [{ id: uid("WL"), slug, email: clean, at: new Date().toISOString() }, ...waitlist],
          activity: pushActivity(get().activity, "wait", `${clean} · ${slug}`),
        });
        return true;
      },
      subscribe: (email) =>
        set({
          newsletter: get().newsletter.includes(email) ? get().newsletter : [...get().newsletter, email],
        }),
      resetDemo: () => set({ ...seedData(), hydrated: true }),
    }),
    {
      name: "eventick-v1",
      skipHydration: true,
      partialize: (state) => {
        const { hydrated: _hydrated, setHydrated: _a, setLocale: _b, ...rest } = state;
        void _hydrated;
        void _a;
        void _b;
        return rest;
      },
    },
  ),
);

export function allTickets(orders: Order[]) {
  return orders.flatMap((order) => order.tickets.map((ticketItem) => ({ ticket: ticketItem, order })));
}

export const BASE_POINTS = 1420;
export const BASE_SPEND = 4850;
export const BASE_LIVED = 18;

export function freshSpend(orders: Order[]) {
  return orders.filter((order) => !order.id.startsWith("seed-")).reduce((sum, order) => sum + order.total, 0);
}
