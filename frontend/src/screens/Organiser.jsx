import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "../components/Shell";
import { Protected } from "../components/Protected";
import { api, money, uploadImage } from "../api";
import { categoryLabel, useI18n } from "../i18n";
import { CATEGORIES, CITIES } from "../utils";
import { parseBrief, EXAMPLE_BRIEF } from "../strategy";

const COVERS = [
  "/events/mawazine.jpg",
  "/events/gnaoua.jpg",
  "/events/oasis.jpg",
  "/events/marathon.jpg",
  "/events/comedy.jpg",
  "/events/orchestra.jpg",
  "/events/derby.jpg",
  "/events/gitex.jpg",
  "/events/electro.jpg",
  "/events/theatre.jpg",
  "/events/jazz.jpg",
  "/events/sacred.jpg",
];

function slugify(value) {
  return (
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 48) || "evenement"
  );
}

function uid() {
  return Math.floor(Math.random() * 36 ** 6).toString(36).toUpperCase().padStart(4, "0");
}

function OrganiserInner() {
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("festivals");
  const [city, setCity] = useState("Casablanca");
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
  const [uploading, setUploading] = useState(false);
  const [vipOn, setVipOn] = useState(false);
  const [vipName, setVipName] = useState("VIP");
  const [vipPrice, setVipPrice] = useState(400);
  const [vipStock, setVipStock] = useState(80);
  const [earlyPct, setEarlyPct] = useState(0);
  const [earlyCount, setEarlyCount] = useState(0);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [myEvents, setMyEvents] = useState(null);
  const [myOrders, setMyOrders] = useState(null);

  useEffect(() => {
    api.get("/organiser/events").then((data) => setMyEvents(data.events));
    api.get("/organiser/orders").then((data) => setMyOrders(data.orders));
  }, []);

  // Pro/Events' "Dupliquer" hands the source event off this way (no separate
  // duplicate endpoint — this form is the one real place an event is built).
  useEffect(() => {
    const raw = sessionStorage.getItem("eventick-duplicate");
    if (!raw) return;
    sessionStorage.removeItem("eventick-duplicate");
    try {
      const data = JSON.parse(raw);
      if (data.titleFr) setTitle(data.titleFr);
      if (data.city) setCity(data.city);
      if (data.venue) setVenue(data.venue);
      if (data.about) setAbout(data.about);
      if (data.price) setPrice(data.price);
      if (data.stock) setStock(data.stock);
      if (data.cover) setCover(data.cover);
    } catch {
      // ignore malformed handoff
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

  const uploadCover = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      setCover(await uploadImage(file));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const fillDemo = () => {
    setTitle("Soirée Safran — Rooftop Casa");
    setVenue("Rooftop Anfa");
    setAddress("Boulevard d'Anfa, Casablanca");
    setAbout("Une nuit soul et gnawa face à l'Atlantique. Jauge courte, e-billet nominatif.");
    setPrice(280);
    setStock(320);
    setCover("/events/jazz.jpg");
  };

  const publish = async (e) => {
    e.preventDefault();
    if (title.trim().length < 3 || venue.trim().length < 2 || price < 0 || stock < 1) {
      setError(t("errName"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const slug = `${slugify(title)}-${uid().toLowerCase()}`;
      const baseName = tierName.trim() || "Billet";
      const earlyN = earlyPct > 0 && earlyCount > 0 ? Math.min(earlyCount, Math.max(stock - 1, 0)) : 0;
      const tiers = [];
      if (earlyN > 0) {
        tiers.push({
          nameFr: `${baseName} early`,
          nameAr: `${baseName} مبكر`,
          blurbFr: `−${earlyPct} % sur les premiers billets.`,
          blurbAr: `خصم ${earlyPct}% على التذاكر الأولى.`,
          priceCents: Math.max(0, Math.round(price * (1 - earlyPct / 100) * 100)),
          capacity: earlyN,
          zoneFr: "Accès général",
          zoneAr: "ولوج عام",
          gateFr: "Entrée",
          gateAr: "المدخل",
        });
      }
      tiers.push({
        nameFr: baseName,
        nameAr: baseName,
        blurbFr: "E-billet nominatif, QR à l'entrée.",
        blurbAr: "تذكرة اسمية ورمز عند الدخول.",
        priceCents: Math.round(price * 100),
        capacity: stock - earlyN,
        zoneFr: "Accès général",
        zoneAr: "ولوج عام",
        gateFr: "Entrée",
        gateAr: "المدخل",
      });
      if (vipOn && vipStock > 0 && vipPrice >= 0) {
        tiers.push({
          nameFr: vipName.trim() || "VIP",
          nameAr: vipName.trim() || "VIP",
          blurbFr: "Accès prioritaire.",
          blurbAr: "دخول بأولوية.",
          priceCents: Math.round(vipPrice * 100),
          capacity: vipStock,
          perks: ["qr", "lounge"],
          zoneFr: "Carré",
          zoneAr: "المربع",
          gateFr: "Entrée",
          gateAr: "المدخل",
        });
      }
      const endDate = end < start ? start : end;
      const { event } = await api.post("/organiser/events", {
        slug,
        titleFr: title.trim(),
        titleAr: title.trim(),
        category,
        city,
        venueFr: venue.trim(),
        venueAr: venue.trim(),
        address: address.trim() || `${venue}, ${city}`,
        start: `${start}T${time}:00`,
        end: `${endDate}T23:59:00`,
        doors: `${start}T${time}:00`,
        image: cover,
        blurbFr: about.trim() || title.trim(),
        blurbAr: about.trim() || title.trim(),
        aboutFr: about.trim() || title.trim(),
        aboutAr: about.trim() || title.trim(),
        ageFr: "Selon l'organisateur.",
        ageAr: "حسب المنظم.",
        tiers,
      });
      toast.success(t("published"));
      navigate(`/evenements/${event.slug}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const ordersByEvent = (myOrders ?? []).reduce((acc, order) => {
    (acc[order.eventSlug] ??= []).push(order);
    return acc;
  }, {});

  return (
    <Shell>
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <p className="text-sm font-semibold text-primary">{t("proPage")}</p>
        <h1 className="mt-1 font-display text-4xl font-extrabold">{t("orgTitle")}</h1>
        <div className="mt-4 flex flex-wrap gap-3">
          {/* A deliberately dark pill regardless of app theme, same as the
              --et-stage surfaces elsewhere. */}
          <Link to="/pro" className="inline-flex h-12 items-center rounded-full bg-stage px-5 text-sm font-semibold text-stage-fg">
            {locale === "ar" ? "المنصة" : "Espace Pro"}
          </Link>
          <p className="max-w-xl self-center text-sm text-muted">{t("proLead")}</p>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted">{t("payout")}</p>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <form className="rounded-card border border-line/10 bg-card p-4 shadow-card md:p-6" onSubmit={publish}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold">{t("formTitle")}</h2>
              <button type="button" className="text-sm font-semibold text-primary" onClick={fillDemo}>
                {t("fillDemo")}
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-sm md:col-span-2">
                {t("briefLabel")}
                <textarea className="field field-area mt-1" value={instruction} placeholder={t("briefHint")} onChange={(e) => setInstruction(e.target.value)} />
              </label>
              <button type="button" className="h-11 rounded-full bg-action px-4 text-sm font-semibold text-action-fg md:col-span-2" onClick={applyInstruction}>
                {t("briefApply")}
              </button>
              <label className="text-sm md:col-span-2">
                {t("eventName")}
                <input className="field mt-1" value={title} onChange={(e) => setTitle(e.target.value)} required />
              </label>
              <label className="text-sm">
                {t("category")}
                <select className="field mt-1" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((id) => (
                    <option key={id} value={id}>
                      {categoryLabel(id, t)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                {t("city")}
                <select className="field mt-1" value={city} onChange={(e) => setCity(e.target.value)}>
                  {CITIES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                {t("venueLabel")}
                <input className="field mt-1" value={venue} onChange={(e) => setVenue(e.target.value)} required />
              </label>
              <label className="text-sm">
                {t("address")}
                <input className="field mt-1" value={address} onChange={(e) => setAddress(e.target.value)} />
              </label>
              <label className="text-sm">
                {t("date")}
                <input className="field mt-1" type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
              </label>
              <label className="text-sm">
                {t("endDate")}
                <input className="field mt-1" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </label>
              <label className="text-sm">
                {t("time")}
                <input className="field mt-1" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </label>
              <label className="text-sm">
                {t("price")}
                <input className="field mt-1" type="number" min={0} value={price} onChange={(e) => setPrice(Number(e.target.value))} />
              </label>
              <label className="text-sm">
                {t("tierName")}
                <input className="field mt-1" value={tierName} onChange={(e) => setTierName(e.target.value)} />
              </label>
              <label className="text-sm">
                {t("stock")}
                <input className="field mt-1" type="number" min={1} value={stock} onChange={(e) => setStock(Number(e.target.value))} />
              </label>
              <label className="text-sm">
                {t("earlyPct")}
                <input className="field mt-1" type="number" min={0} max={90} value={earlyPct} onChange={(e) => setEarlyPct(Number(e.target.value))} />
              </label>
              <label className="text-sm">
                {t("earlyCount")}
                <input className="field mt-1" type="number" min={0} value={earlyCount} onChange={(e) => setEarlyCount(Number(e.target.value))} />
              </label>
              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input type="checkbox" checked={vipOn} onChange={(e) => setVipOn(e.target.checked)} />
                {t("vipOn")}
              </label>
              {vipOn ? (
                <>
                  <label className="text-sm">
                    VIP
                    <input className="field mt-1" value={vipName} onChange={(e) => setVipName(e.target.value)} />
                  </label>
                  <label className="text-sm">
                    {t("price")}
                    <input className="field mt-1" type="number" min={0} value={vipPrice} onChange={(e) => setVipPrice(Number(e.target.value))} />
                  </label>
                  <label className="text-sm">
                    {t("stock")}
                    <input className="field mt-1" type="number" min={1} value={vipStock} onChange={(e) => setVipStock(Number(e.target.value))} />
                  </label>
                </>
              ) : null}
              <label className="text-sm md:col-span-2">
                {t("about")}
                <textarea className="field field-area mt-1" value={about} onChange={(e) => setAbout(e.target.value)} />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">{t("cover")}</p>
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-line/20 px-3 text-sm font-semibold hover:border-primary hover:bg-brume hover:text-primary">
                <Upload className="size-4" />
                {uploading ? t("posterUploading") : t("posterUpload")}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={uploading}
                  onChange={uploadCover}
                />
              </label>
            </div>
            <p className="mt-1 text-xs text-muted">{t("posterHint")}</p>
            <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {/* An uploaded poster appears first, already selected. */}
              {!COVERS.includes(cover) ? (
                <span className="overflow-hidden rounded-control border-2 border-primary">
                  <img src={cover} alt="" className="h-16 w-full object-cover" />
                </span>
              ) : null}
              {COVERS.map((src) => (
                <button key={src} type="button" className={`overflow-hidden rounded-control border-2 ${cover === src ? "border-primary" : "border-transparent"}`} onClick={() => setCover(src)}>
                  <img src={src} alt="" className="h-16 w-full object-cover" />
                </button>
              ))}
            </div>
            {error ? <p className="mt-4 rounded-control bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p> : null}
            <button type="submit" disabled={busy} className="mt-5 h-12 w-full rounded-full bg-primary text-sm font-semibold text-primary-fg transition hover:bg-primary-hover disabled:opacity-50">
              {busy ? "..." : t("publish")}
            </button>
          </form>
          <section>
            <h2 className="font-display text-2xl font-bold">{t("myEvents")}</h2>
            {myEvents && myEvents.length === 0 ? <p className="mt-3 text-muted">{t("noOrg")}</p> : null}
            <div className="mt-4 space-y-3">
              {myEvents?.map((event) => {
                const eventOrders = ordersByEvent[event.slug] ?? [];
                const soldCount = eventOrders.reduce((sum, order) => sum + order.ticketCount, 0);
                const revenue = eventOrders.reduce((sum, order) => sum + order.totalCents, 0);
                return (
                  <article key={event.slug} className="rounded-card border border-line/10 bg-card p-4 shadow-card">
                    <div className="flex gap-3">
                      <img src={event.image} alt="" className="size-16 rounded-control object-cover" />
                      <div>
                        <Link to={`/evenements/${event.slug}`} className="font-display text-lg font-bold">
                          {locale === "ar" ? event.titleAr : event.titleFr}
                        </Link>
                        <p className="text-sm text-muted">{event.city}</p>
                        <p className="text-sm">
                          {t("soldCount")} {soldCount} · {t("revenue")} {money(revenue)} MAD
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </Shell>
  );
}

export default function Organiser() {
  return (
    <Protected roles={["ORGANISER", "ADMIN"]}>
      <OrganiserInner />
    </Protected>
  );
}
