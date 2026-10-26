import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, money } from "../../api";
import { useI18n } from "../../i18n";
import { text } from "./copy";

export default function Offers() {
  const { locale } = useI18n();
  const t = text[locale];
  const [events, setEvents] = useState(null);
  const [promos, setPromos] = useState(null);
  const [waitlist, setWaitlist] = useState([]);
  const [code, setCode] = useState("");
  const [kind, setKind] = useState("PERCENT");
  const [value, setValue] = useState(10);
  const [eventSlug, setEventSlug] = useState("");
  const [maxUses, setMaxUses] = useState(100);

  const load = () => {
    api.get("/organiser/events").then((data) => setEvents(data.events));
    api.get("/promo").then((data) => setPromos(data.promos));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!events) return;
    Promise.all(
      events.map((event) =>
        api.get(`/organiser/events/${event.slug}/waitlist`).then((data) => data.entries.map((entry) => ({ ...entry, slug: event.slug }))),
      ),
    ).then((lists) => setWaitlist(lists.flat()));
  }, [events]);

  const eventTitle = useMemo(() => {
    const map = new Map();
    for (const event of events ?? []) map.set(event.id, locale === "ar" ? event.titleAr : event.titleFr);
    return map;
  }, [events, locale]);

  const eventSlugById = useMemo(() => {
    const map = new Map();
    for (const event of events ?? []) map.set(event.id, event.slug);
    return map;
  }, [events]);

  const submit = async (e) => {
    e.preventDefault();
    if (code.trim().length < 3 || value <= 0 || maxUses < 1) return;
    await api.post("/promo", { code: code.trim(), kind, value, eventSlug: eventSlug || undefined, maxUses });
    setCode("");
    load();
    toast.success(t.saved);
  };

  const bump = async (promo) => {
    await api.patch(`/promo/${promo.id}`, { maxUses: promo.maxUses + 50 });
    load();
    toast.success(t.saved);
  };

  const remove = async (promo) => {
    await api.del(`/promo/${promo.id}`);
    load();
    toast.success(t.removed);
  };

  return (
    <div>
      <h1 className="font-display text-4xl font-extrabold">{t.offers}</h1>
      <form className="mt-6 grid gap-2 rounded-xl bg-card p-4 shadow-card md:grid-cols-3" onSubmit={submit}>
        <input className="field h-11 font-mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t.code} required />
        <select className="field h-11" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="PERCENT">{t.percent}</option>
          <option value="AMOUNT">{t.amount}</option>
        </select>
        <input className="field h-11" type="number" min={1} value={value} onChange={(e) => setValue(Number(e.target.value))} />
        <select className="field h-11" value={eventSlug} onChange={(e) => setEventSlug(e.target.value)}>
          <option value="">{t.allDates}</option>
          {(events ?? []).map((event) => (
            <option key={event.slug} value={event.slug}>
              {locale === "ar" ? event.titleAr : event.titleFr}
            </option>
          ))}
        </select>
        <input className="field h-11" type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} placeholder={t.maxUses} />
        <button className="h-11 rounded-full bg-lagon px-4 text-sm font-semibold text-foam" type="submit">
          {t.addPromo}
        </button>
      </form>
      <ul className="mt-4 grid gap-2">
        {(promos ?? []).map((promo) => (
          <li key={promo.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card px-4 py-3 shadow-card">
            <div>
              <p className="font-mono font-bold">{promo.code}</p>
              <p className="text-sm text-muted">
                {promo.kind === "PERCENT" ? `${promo.value}%` : `${money(promo.value)} MAD`} · {promo.uses}/{promo.maxUses} {t.uses}
                {promo.eventId ? ` · ${eventTitle.get(promo.eventId) ?? eventSlugById.get(promo.eventId)}` : ` · ${t.allDates}`}
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" className="h-11 rounded-full bg-paper px-4 text-sm font-semibold" onClick={() => bump(promo)}>
                +50
              </button>
              <button type="button" className="h-11 rounded-full bg-corail px-4 text-sm font-semibold text-foam" onClick={() => remove(promo)}>
                {t.remove}
              </button>
            </div>
          </li>
        ))}
        {promos && promos.length === 0 ? <li className="text-sm text-muted">{t.empty}</li> : null}
      </ul>
      <h2 className="mt-8 font-display text-2xl font-extrabold">{t.waitlist}</h2>
      <ul className="mt-3 grid gap-2">
        {waitlist.length === 0 ? <li className="text-sm text-muted">{t.empty}</li> : null}
        {waitlist.map((item, i) => (
          <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card px-4 py-3 text-sm shadow-card">
            <span>{item.email}</span>
            <span className="text-muted">
              {item.slug} · {item.createdAt.slice(0, 10)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
