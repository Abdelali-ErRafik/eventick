import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CalendarPlus, LayoutDashboard, Sparkles, Ticket, Upload, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "../components/Shell";
import { Protected } from "../components/Protected";
import { api, money, uploadImage } from "../api";
import { categoryLabel, useI18n } from "../i18n";
import { CATEGORIES, CITIES } from "../utils";
import { parseBrief, EXAMPLE_BRIEF } from "../strategy";
import { Button, Card, CheckOption, Container, DateField, Dropdown, EmptyState, Field, Input, Notice, SectionHeader, Stat, Textarea, TimeField, triggerControlClass } from "../ui";

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

/** How many recent events the side column shows before deferring to /pro. */
const SIDEBAR_LIMIT = 4;

/**
 * One labelled group of fields.
 *
 * The form was a single undifferentiated run of fifteen inputs, so there was
 * no answer to "where am I" and no way to skim it. Four named groups turn it
 * into something you can scan and come back to.
 */
function FormSection({ title, hint, children }) {
  return (
    <section className="mt-4 rounded-card border border-line/10 bg-card p-4 shadow-card md:p-6">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {hint ? <p className="mt-0.5 text-sm text-muted">{hint}</p> : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  );
}

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

  // Summed across every event, not just the few shown below, so the figure
  // does not silently disagree with the list it sits above.
  const totals = (myOrders ?? []).reduce(
    (acc, order) => ({ sold: acc.sold + order.ticketCount, revenue: acc.revenue + order.totalCents }),
    { sold: 0, revenue: 0 },
  );

  return (
    <Shell>
      {/* Same dark stage band as the other pages that open on a statement —
          Confirmation, BecomeOrganiser, EventDetail's header. */}
      <section className="bg-stage py-10 text-stage-fg md:py-12">
        <Container className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary">{t("proPage")}</p>
            <h1 className="mt-1 max-w-2xl font-display text-3xl font-extrabold md:text-4xl">{t("orgTitle")}</h1>
            <p className="mt-3 max-w-xl text-sm text-stage-muted">{t("proLead")}</p>
          </div>
          <Link
            to="/pro"
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-stage-fg/15 px-5 text-sm font-semibold text-stage-fg backdrop-blur-sm transition hover:bg-stage-fg/25"
          >
            <LayoutDashboard className="size-4" />
            {locale === "ar" ? "المنصة" : "Espace Pro"}
            <ArrowRight className="size-4 rtl:rotate-180" />
          </Link>
        </Container>
      </section>

      <Container className="py-8">
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <form onSubmit={publish}>
            {/*
              The AI brief, as a shortcut rather than the form's first field.
              It used to sit inside the form above "Nom de l'événement",
              which read as a required step — people filled it in because it
              was first, not because they wanted it. It is an accelerator,
              so it gets its own card, visually before the form rather than
              part of it.
            */}
            <Card className="border-primary/25 bg-brume/40">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-display text-base font-bold">
                    <Sparkles className="size-4 text-primary" />
                    {t("briefShortcut")}
                  </p>
                  <p className="mt-0.5 text-sm text-muted">{t("briefShortcutHint")}</p>
                </div>
                <button type="button" className="shrink-0 text-sm font-semibold text-primary hover:underline" onClick={fillDemo}>
                  {t("fillDemo")}
                </button>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Textarea
                  aria-label={t("briefLabel")}
                  className="min-h-20 flex-1"
                  value={instruction}
                  placeholder={t("briefHint")}
                  onChange={(e) => setInstruction(e.target.value)}
                />
                <Button type="button" variant="secondary" className="shrink-0 self-start" onClick={applyInstruction}>
                  {t("briefApply")}
                </Button>
              </div>
            </Card>

            <FormSection title={t("secBasics")} hint={t("secBasicsHint")}>
              <Field label={t("eventName")} required className="md:col-span-2">
                {({ id, describedBy, invalid, required }) => (
                  <Input
                    id={id}
                    describedBy={describedBy}
                    invalid={invalid}
                    required={required}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                )}
              </Field>
              {/* Dropdown, not the native <select>: the browser's popup list
                  renders with OS chrome and ignores the theme, which on this
                  dark form meant a white list with a blue highlight the
                  moment it opened. */}
              <Field label={t("category")}>
                {({ id, describedBy, invalid }) => (
                  <Dropdown
                    label={t("category")}
                    value={category}
                    onChange={setCategory}
                    options={CATEGORIES.map((value) => ({ value, label: categoryLabel(value, t) }))}
                    triggerClassName={triggerControlClass({ invalid })}
                    describedBy={describedBy}
                    id={id}
                  />
                )}
              </Field>
              <Field label={t("city")}>
                {({ id, describedBy, invalid }) => (
                  <Dropdown
                    label={t("city")}
                    value={city}
                    onChange={setCity}
                    options={CITIES.map((value) => ({ value, label: value }))}
                    triggerClassName={triggerControlClass({ invalid })}
                    describedBy={describedBy}
                    id={id}
                  />
                )}
              </Field>
            </FormSection>

            <FormSection title={t("secWhen")} hint={t("secWhenHint")}>
              <Field label={t("venueLabel")} required>
                {({ id, describedBy, invalid, required }) => (
                  <Input
                    id={id}
                    describedBy={describedBy}
                    invalid={invalid}
                    required={required}
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t("address")}>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    describedBy={describedBy}
                    invalid={invalid}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t("date")} required>
                {({ id, describedBy, invalid, required }) => (
                  <DateField
                    id={id}
                    describedBy={describedBy}
                    invalid={invalid}
                    required={required}
                    locale={locale}
                    value={start}
                    onChange={(next) => {
                      setStart(next);
                      // A one-night date is the normal case, and an end that
                      // now precedes the start would be rejected on publish.
                      if (!end || end < next) setEnd(next);
                    }}
                  />
                )}
              </Field>
              <Field label={t("endDate")}>
                {({ id, describedBy, invalid }) => (
                  <DateField
                    id={id}
                    describedBy={describedBy}
                    invalid={invalid}
                    locale={locale}
                    value={end}
                    // Publish already clamps `end < start` up to the start
                    // date; stopping it here means the form never shows a
                    // range it is about to silently rewrite.
                    min={start}
                    onChange={setEnd}
                  />
                )}
              </Field>
              <Field label={t("time")}>
                {({ id, describedBy, invalid }) => (
                  <TimeField id={id} describedBy={describedBy} invalid={invalid} value={time} onChange={setTime} />
                )}
              </Field>
            </FormSection>

            <FormSection title={t("secTickets")} hint={t("secTicketsHint")}>
              <Field label={t("price")}>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    describedBy={describedBy}
                    invalid={invalid}
                    type="number"
                    min={0}
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                  />
                )}
              </Field>
              <Field label={t("tierName")}>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    describedBy={describedBy}
                    invalid={invalid}
                    value={tierName}
                    onChange={(e) => setTierName(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t("stock")}>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    describedBy={describedBy}
                    invalid={invalid}
                    type="number"
                    min={1}
                    value={stock}
                    onChange={(e) => setStock(Number(e.target.value))}
                  />
                )}
              </Field>
              <Field label={t("earlyPct")}>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    describedBy={describedBy}
                    invalid={invalid}
                    type="number"
                    min={0}
                    max={90}
                    value={earlyPct}
                    onChange={(e) => setEarlyPct(Number(e.target.value))}
                  />
                )}
              </Field>
              <Field label={t("earlyCount")}>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    describedBy={describedBy}
                    invalid={invalid}
                    type="number"
                    min={0}
                    value={earlyCount}
                    onChange={(e) => setEarlyCount(Number(e.target.value))}
                  />
                )}
              </Field>
              {/* The one input the form-kit rollout missed: a bare
                  <input type="checkbox"> with the browser's default box,
                  next to fields that all use the shared controls. */}
              <div className="md:col-span-2">
                <CheckOption label={t("vipOn")} checked={vipOn} onChange={setVipOn} />
              </div>
              {vipOn ? (
                <>
                  <Field label="VIP">
                    {({ id, describedBy, invalid }) => (
                      <Input
                        id={id}
                        describedBy={describedBy}
                        invalid={invalid}
                        value={vipName}
                        onChange={(e) => setVipName(e.target.value)}
                      />
                    )}
                  </Field>
                  <Field label={t("price")}>
                    {({ id, describedBy, invalid }) => (
                      <Input
                        id={id}
                        describedBy={describedBy}
                        invalid={invalid}
                        type="number"
                        min={0}
                        value={vipPrice}
                        onChange={(e) => setVipPrice(Number(e.target.value))}
                      />
                    )}
                  </Field>
                  <Field label={t("stock")}>
                    {({ id, describedBy, invalid }) => (
                      <Input
                        id={id}
                        describedBy={describedBy}
                        invalid={invalid}
                        type="number"
                        min={1}
                        value={vipStock}
                        onChange={(e) => setVipStock(Number(e.target.value))}
                      />
                    )}
                  </Field>
                </>
              ) : null}
            </FormSection>

            <FormSection title={t("secMedia")} hint={t("secMediaHint")}>
              <Field label={t("about")} className="md:col-span-2">
                {({ id, describedBy, invalid }) => (
                  <Textarea id={id} describedBy={describedBy} invalid={invalid} value={about} onChange={(e) => setAbout(e.target.value)} />
                )}
              </Field>

              <div className="md:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-ink">{t("cover")}</p>
                  <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-line/20 px-3 text-sm font-semibold transition hover:border-primary hover:bg-brume hover:text-primary">
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
                    <button
                      key={src}
                      type="button"
                      aria-pressed={cover === src}
                      className={`overflow-hidden rounded-control border-2 transition ${
                        cover === src ? "border-primary" : "border-transparent hover:border-line/30"
                      }`}
                      onClick={() => setCover(src)}
                    >
                      <img src={src} alt="" className="h-16 w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            </FormSection>

            {error ? (
              <Notice tone="danger" className="mt-4">
                {error}
              </Notice>
            ) : null}

            {/* Sticky on desktop: the form is tall enough that the publish
                button was always a scroll away from whatever you had just
                filled in. */}
            <div className="sticky bottom-0 z-10 mt-4 border-t border-line/10 bg-paper/95 py-4 backdrop-blur">
              <Button type="submit" size="lg" full loading={busy}>
                {t("publish")}
              </Button>
            </div>
          </form>
          {/*
            Sticky, and capped at SIDEBAR_LIMIT. This column used to render
            every event the organiser has — 17 of them in the screenshot,
            thirteen reading "Billets émis 0 · Recettes démo 0,00 MAD". A
            list that long beside a form is not a reference, it is noise:
            the useful thing while publishing is "what did I already put on,
            and is anything selling". So: the most recent few, with the
            totals summarised above them and the full list one click away.
          */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <SectionHeader
              title={t("myEvents")}
              sub={myEvents ? t("orgEventsCount").replace("{n}", String(myEvents.length)) : undefined}
              action={
                <Link to="/pro/events" className="shrink-0 text-sm font-semibold text-primary hover:underline">
                  {t("orgSeeAll")}
                </Link>
              }
            />

            {myEvents && myEvents.length > 0 ? (
              <div className="mb-3 grid grid-cols-2 gap-3">
                <Stat label={t("orgSold")} value={String(totals.sold)} icon={<Ticket className="size-4" />} />
                <Stat
                  label={t("orgRevenue")}
                  value={`${money(totals.revenue)} MAD`}
                  tone="accent"
                  icon={<Wallet className="size-4" />}
                />
              </div>
            ) : null}

            {myEvents && myEvents.length === 0 ? (
              <EmptyState icon={<CalendarPlus className="size-6" />} title={t("orgNoneTitle")} body={t("orgNoneBody")} />
            ) : (
              <div className="space-y-2.5">
                {(myEvents ?? []).slice(0, SIDEBAR_LIMIT).map((event) => {
                  const eventOrders = ordersByEvent[event.slug] ?? [];
                  const soldCount = eventOrders.reduce((sum, order) => sum + order.ticketCount, 0);
                  const revenue = eventOrders.reduce((sum, order) => sum + order.totalCents, 0);
                  return (
                    <Link
                      key={event.slug}
                      to={`/evenements/${event.slug}`}
                      className="flex items-center gap-3 rounded-card border border-line/10 bg-card p-3 shadow-card transition hover:border-primary/30"
                    >
                      <img src={event.image} alt="" className="size-12 shrink-0 rounded-control object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{locale === "ar" ? event.titleAr : event.titleFr}</p>
                        <p className="truncate text-xs text-muted">{event.city}</p>
                      </div>
                      {/* Only shown once something has actually sold. Printing
                          "0 · 0,00 MAD" on every unsold date was the bulk of
                          what made this column unreadable. */}
                      {soldCount > 0 ? (
                        <p className="shrink-0 text-end">
                          <span className="block text-sm font-bold tabular-nums">{money(revenue)}</span>
                          <span className="block text-[11px] text-muted">
                            {soldCount} {t("orgSold")}
                          </span>
                        </p>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            )}
          </aside>
        </div>
      </Container>
    </Shell>
  );
}

export default function Organiser() {
  return (
    <Protected permission="events.manage">
      <OrganiserInner />
    </Protected>
  );
}
