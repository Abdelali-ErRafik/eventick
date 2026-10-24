import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Shell } from "@/components/shell";
import { CATEGORIES, CITIES, COVERS, type CategoryId, type CityId, type EventItem } from "@/lib/catalog";
import { money } from "@/lib/format";
import { categoryLabel, useI18n } from "@/lib/i18n";
import { freshSpend, useStore } from "@/lib/store";
import { parseBrief, takeBrief, EXAMPLE_BRIEF } from "@/lib/strategy";
import { proSearch } from "@/lib/pro";
import { slugify, uid } from "@/lib/utils";

export const Route = createFileRoute("/organiser")({
  component: OrganiserPage,
});

function OrganiserPage() {
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const addEvent = useStore((state) => state.addEvent);
  const custom = useStore((state) => state.customEvents);
  const orders = useStore((state) => state.orders);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<CategoryId>("festivals");
  const [city, setCity] = useState<CityId>("Casablanca");
  const [venue, setVenue] = useState("");
  const [address, setAddress] = useState("");
  const [start, setStart] = useState("2026-12-20");
  const [end, setEnd] = useState("2026-12-20");
  const [time, setTime] = useState("21:00");
  const [about, setAbout] = useState("");
  const [tierName, setTierName] = useState("Billet standard");
  const [price, setPrice] = useState(250);
  const [stock, setStock] = useState(500);
  const [cover, setCover] = useState(COVERS[0]);
  const [vipOn, setVipOn] = useState(false);
  const [vipName, setVipName] = useState("VIP");
  const [vipPrice, setVipPrice] = useState(400);
  const [vipStock, setVipStock] = useState(80);
  const [earlyPct, setEarlyPct] = useState(0);
  const [earlyCount, setEarlyCount] = useState(0);
  const [instruction, setInstruction] = useState("");

  useEffect(() => {
    const brief = takeBrief();
    if (!brief) return;
    setTitle(brief.title);
    if (CITIES.includes(brief.city as CityId)) setCity(brief.city as CityId);
    setPrice(brief.price);
    setStock(brief.stock);
    setTierName(brief.tierName);
    if (brief.date) {
      setStart(brief.date);
      setEnd(brief.date);
    }
  }, []);

  const applyInstruction = () => {
    const brief = parseBrief(instruction || EXAMPLE_BRIEF[locale], locale);
    if (brief.title) setTitle(brief.title);
    if (brief.city && CITIES.includes(brief.city)) setCity(brief.city);
    if (brief.date) {
      setStart(brief.date);
      setEnd(brief.date);
    }
    if (brief.capacity) setStock(brief.capacity);
    const [first, second] = brief.tiers;
    if (first) {
      setTierName(first.name);
      setPrice(first.price);
    }
    if (second) {
      setVipOn(true);
      setVipName(second.name);
      setVipPrice(second.price);
    }
    setEarlyPct(brief.discountPct ?? 0);
    setEarlyCount(brief.discountFirst ?? 0);
    if (!instruction) setInstruction(EXAMPLE_BRIEF[locale]);
  };

  const publish = () => {
    if (title.trim().length < 3 || venue.trim().length < 2 || price < 0 || stock < 1) return;
    const slug = `${slugify(title)}-${uid("x").slice(-4).toLowerCase()}`;
    const baseName = tierName.trim() || "Billet";
    const earlyN = earlyPct > 0 && earlyCount > 0 ? Math.min(earlyCount, Math.max(stock - 1, 0)) : 0;
    const tiers: EventItem["tiers"] = [];
    if (earlyN > 0) {
      tiers.push({
        id: "early",
        nameFr: `${baseName} early`,
        nameAr: `${baseName} مبكر`,
        blurbFr: `−${earlyPct} % sur les premiers billets.`,
        blurbAr: `خصم ${earlyPct}% على التذاكر الأولى.`,
        price: Math.max(0, Math.round(price * (1 - earlyPct / 100))),
        capacity: earlyN,
        remaining: earlyN,
        perks: ["qr"],
        zoneFr: "Accès général",
        zoneAr: "ولوج عام",
        gateFr: "Entrée",
        gateAr: "المدخل",
      });
    }
    tiers.push({
      id: "std",
      nameFr: baseName,
      nameAr: baseName,
      blurbFr: "E-billet nominatif, QR à l'entrée.",
      blurbAr: "تذكرة اسمية ورمز عند الدخول.",
      price,
      capacity: stock - earlyN,
      remaining: stock - earlyN,
      perks: ["qr"],
      zoneFr: "Accès général",
      zoneAr: "ولوج عام",
      gateFr: "Entrée",
      gateAr: "المدخل",
    });
    if (vipOn && vipStock > 0 && vipPrice >= 0) {
      tiers.push({
        id: "vip",
        nameFr: vipName.trim() || "VIP",
        nameAr: vipName.trim() || "VIP",
        blurbFr: "Accès prioritaire.",
        blurbAr: "دخول بأولوية.",
        price: vipPrice,
        capacity: vipStock,
        remaining: vipStock,
        perks: ["qr", "lounge"],
        zoneFr: "Carré",
        zoneAr: "المربع",
        gateFr: "Entrée",
        gateAr: "المدخل",
      });
    }
    const event: EventItem = {
      slug,
      titleFr: title.trim(),
      titleAr: title.trim(),
      category,
      city,
      venueFr: venue.trim(),
      venueAr: venue.trim(),
      address: address.trim() || `${venue}, ${city}`,
      start,
      end: end < start ? start : end,
      doors: time,
      time,
      image: cover,
      blurbFr: about.trim() || title.trim(),
      blurbAr: about.trim() || title.trim(),
      aboutFr: about.trim() || title.trim(),
      aboutAr: about.trim() || title.trim(),
      popularity: 60,
      instant: true,
      ageFr: "Selon l'organisateur.",
      ageAr: "حسب المنظم.",
      tiers,
    };
    addEvent(event);
    toast.success(t("published"));
    void navigate({ to: "/evenements/$slug", params: { slug } });
  };

  return (
    <Shell>
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <p className="text-sm font-semibold text-lagon">{t("proPage")}</p>
        <h1 className="mt-1 font-display text-4xl font-extrabold">{t("orgTitle")}</h1>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to="/pro" search={proSearch("orders")} className="inline-flex h-12 items-center rounded-full bg-encre px-5 text-sm font-semibold text-foam">
            {locale === "ar" ? "المنصة" : "Espace Pro"}
          </Link>
          <p className="max-w-xl self-center text-sm text-muted">{t("proLead")}</p>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted">{t("payout")}</p>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <form
            className="rounded-xl border border-line/10 bg-card p-4 shadow-card md:p-6"
            onSubmit={(event) => {
              event.preventDefault();
              publish();
            }}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold">{t("formTitle")}</h2>
              <button
                type="button"
                className="text-sm font-semibold text-lagon"
                onClick={() => {
                  setTitle("Soirée Safran — Rooftop Casa");
                  setVenue("Rooftop Anfa");
                  setAddress("Boulevard d'Anfa, Casablanca");
                  setAbout("Une nuit soul et gnawa face à l'Atlantique. Jauge courte, e-billet nominatif.");
                  setPrice(280);
                  setStock(320);
                  setCover("/events/jazz.jpg");
                }}
              >
                {t("fillDemo")}
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-sm md:col-span-2">
                {t("briefLabel")}
                <textarea
                  className="field field-area mt-1"
                  value={instruction}
                  placeholder={t("briefHint")}
                  onChange={(event) => setInstruction(event.target.value)}
                />
              </label>
              <button type="button" className="h-11 rounded-full bg-lagon px-4 text-sm font-semibold text-foam md:col-span-2" onClick={applyInstruction}>
                {t("briefApply")}
              </button>
              <label className="text-sm md:col-span-2">
                {t("eventName")}
                <input className="field mt-1" value={title} onChange={(event) => setTitle(event.target.value)} required />
              </label>
              <label className="text-sm">
                {t("category")}
                <select className="field mt-1" value={category} onChange={(event) => setCategory(event.target.value as CategoryId)}>
                  {CATEGORIES.map((id) => (
                    <option key={id} value={id}>
                      {categoryLabel(id, t)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                {t("city")}
                <select className="field mt-1" value={city} onChange={(event) => setCity(event.target.value as CityId)}>
                  {CITIES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                {t("venueLabel")}
                <input className="field mt-1" value={venue} onChange={(event) => setVenue(event.target.value)} required />
              </label>
              <label className="text-sm">
                {t("address")}
                <input className="field mt-1" value={address} onChange={(event) => setAddress(event.target.value)} />
              </label>
              <label className="text-sm">
                {t("date")}
                <input className="field mt-1" type="date" value={start} onChange={(event) => setStart(event.target.value)} required />
              </label>
              <label className="text-sm">
                {t("endDate")}
                <input className="field mt-1" type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
              </label>
              <label className="text-sm">
                {t("time")}
                <input className="field mt-1" type="time" value={time} onChange={(event) => setTime(event.target.value)} />
              </label>
              <label className="text-sm">
                {t("price")}
                <input className="field mt-1" type="number" min={0} value={price} onChange={(event) => setPrice(Number(event.target.value))} />
              </label>
              <label className="text-sm">
                {t("tierName")}
                <input className="field mt-1" value={tierName} onChange={(event) => setTierName(event.target.value)} />
              </label>
              <label className="text-sm">
                {t("stock")}
                <input className="field mt-1" type="number" min={1} value={stock} onChange={(event) => setStock(Number(event.target.value))} />
              </label>
              <label className="text-sm">
                {t("earlyPct")}
                <input className="field mt-1" type="number" min={0} max={90} value={earlyPct} onChange={(event) => setEarlyPct(Number(event.target.value))} />
              </label>
              <label className="text-sm">
                {t("earlyCount")}
                <input className="field mt-1" type="number" min={0} value={earlyCount} onChange={(event) => setEarlyCount(Number(event.target.value))} />
              </label>
              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input type="checkbox" checked={vipOn} onChange={(event) => setVipOn(event.target.checked)} />
                {t("vipOn")}
              </label>
              {vipOn ? (
                <>
                  <label className="text-sm">
                    VIP
                    <input className="field mt-1" value={vipName} onChange={(event) => setVipName(event.target.value)} />
                  </label>
                  <label className="text-sm">
                    {t("price")}
                    <input className="field mt-1" type="number" min={0} value={vipPrice} onChange={(event) => setVipPrice(Number(event.target.value))} />
                  </label>
                  <label className="text-sm">
                    {t("stock")}
                    <input className="field mt-1" type="number" min={1} value={vipStock} onChange={(event) => setVipStock(Number(event.target.value))} />
                  </label>
                </>
              ) : null}
              <label className="text-sm md:col-span-2">
                {t("about")}
                <textarea className="field field-area mt-1" value={about} onChange={(event) => setAbout(event.target.value)} />
              </label>
            </div>
            <p className="mt-4 text-sm font-semibold">{t("cover")}</p>
            <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {COVERS.map((src) => (
                <button key={src} type="button" className={`overflow-hidden rounded-lg border-2 ${cover === src ? "border-lagon" : "border-transparent"}`} onClick={() => setCover(src)}>
                  <img src={src} alt="" className="h-16 w-full object-cover" />
                </button>
              ))}
            </div>
            <button className="mt-5 h-12 w-full rounded-full bg-safran text-sm font-semibold text-encre">{t("publish")}</button>
          </form>
          <section>
            <h2 className="font-display text-2xl font-bold">{t("myEvents")}</h2>
            {custom.length === 0 ? <p className="mt-3 text-muted">{t("noOrg")}</p> : null}
            <div className="mt-4 space-y-3">
              {custom.map((event) => {
                const soldTickets = orders.flatMap((order) => order.tickets).filter((ticket) => ticket.eventSlug === event.slug);
                const revenue = soldTickets.reduce((sum, ticket) => sum + ticket.price, 0);
                return (
                  <article key={event.slug} className="rounded-xl border border-line/10 bg-card p-4 shadow-card">
                    <div className="flex gap-3">
                      <img src={event.image} alt="" className="size-16 rounded-lg object-cover" />
                      <div>
                        <Link to="/evenements/$slug" params={{ slug: event.slug }} className="font-display text-lg font-bold">
                          {event.titleFr}
                        </Link>
                        <p className="text-sm text-muted">
                          {event.city} · {event.start}
                        </p>
                        <p className="text-sm">
                          {t("soldCount")} {soldTickets.length} · {t("revenue")} {money(revenue, locale)}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            <p className="mt-4 text-xs text-muted">
              {t("spend")} démo globale {money(freshSpend(orders), locale)}
            </p>
          </section>
        </div>
      </div>
    </Shell>
  );
}
