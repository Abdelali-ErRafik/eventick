import { useEffect, useMemo, useState } from "react";
import { Plus, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, money } from "../../api";
import { useI18n } from "../../i18n";
import { useConfirm } from "./ConfirmContext";
import { Badge, Btn, DataTable, EmptyState, IconBtn, Modal, PageHead, PersonCell, SectionTitle, Td, Th } from "./ui";
import { text } from "./copy";

const WAITLIST_TONE = { WAITING: "neutral", OFFERED: "warn", CLAIMED: "success", EXPIRED: "danger" };

function waitlistLabel(t, status) {
  if (status === "OFFERED") return t.wlOffered;
  if (status === "CLAIMED") return t.wlClaimed;
  if (status === "EXPIRED") return t.wlExpired;
  return t.wlWaiting;
}

export default function Offers() {
  const { locale } = useI18n();
  const t = text[locale];
  const confirm = useConfirm();
  const [events, setEvents] = useState(null);
  const [promos, setPromos] = useState(null);
  const [waitlist, setWaitlist] = useState([]);
  const [open, setOpen] = useState(false);
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
        api
          .get(`/organiser/events/${event.slug}/waitlist`)
          .then((data) => data.entries.map((entry) => ({ ...entry, slug: event.slug, title: locale === "ar" ? event.titleAr : event.titleFr }))),
      ),
    ).then((lists) => setWaitlist(lists.flat()));
  }, [events, locale]);

  const eventById = useMemo(() => {
    const map = new Map();
    for (const event of events ?? []) map.set(event.id, locale === "ar" ? event.titleAr : event.titleFr);
    return map;
  }, [events, locale]);

  const submit = async (e) => {
    e.preventDefault();
    if (code.trim().length < 3 || value <= 0 || maxUses < 1) return;
    await api.post("/promo", { code: code.trim(), kind, value, eventSlug: eventSlug || undefined, maxUses });
    setCode("");
    setOpen(false);
    load();
    toast.success(t.saved);
  };

  const bump = async (promo) => {
    await api.patch(`/promo/${promo.id}`, { maxUses: promo.maxUses + 50 });
    load();
    toast.success(t.saved);
  };

  const remove = async (promo) => {
    const ok = await confirm({
      title: t.confirmTitle,
      message: t.confirmDeletePromo,
      tone: "danger",
      confirmLabel: t.remove,
      cancelLabel: t.cancelBtn,
    });
    if (!ok) return;
    await api.del(`/promo/${promo.id}`);
    load();
    toast.success(t.removed);
  };

  return (
    <div>
      <PageHead
        title={t.offers}
        sub={t.offersSub}
        actions={
          <Btn onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            {t.addPromo}
          </Btn>
        }
      />

      <DataTable minWidth={760}>
        <thead>
          <tr>
            <Th className="text-start">{t.code}</Th>
            <Th>{t.kind}</Th>
            <Th>{t.uses}</Th>
            <Th className="text-start">{t.allEvents}</Th>
            <Th>
              <span className="sr-only">{t.actions}</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {promos && promos.length === 0 ? (
            <tr>
              <td colSpan={5}>
                <EmptyState icon="🏷️" title={t.noPromosYet} />
              </td>
            </tr>
          ) : null}
          {(promos ?? []).map((promo) => {
            const exhausted = promo.uses >= promo.maxUses;
            return (
              <tr key={promo.id} className="transition hover:bg-brume/40">
                <Td>
                  <span className="font-mono text-sm font-extrabold">{promo.code}</span>
                </Td>
                <Td className="text-center">
                  <Badge tone="info">{promo.kind === "PERCENT" ? `${promo.value}%` : `${money(promo.value)} MAD`}</Badge>
                </Td>
                <Td className="text-center">
                  <Badge tone={exhausted ? "danger" : "neutral"}>
                    {promo.uses}/{promo.maxUses}
                  </Badge>
                </Td>
                <Td className="text-sm">{promo.eventId ? (eventById.get(promo.eventId) ?? promo.eventId) : t.allDates}</Td>
                <Td className="w-px whitespace-nowrap pe-4">
                  <div className="flex justify-end gap-1.5">
                    <Btn variant="secondary" size="sm" onClick={() => bump(promo)}>
                      +50
                    </Btn>
                    <IconBtn tone="danger" label={t.remove} onClick={() => remove(promo)}>
                      <Trash2 className="size-4" />
                    </IconBtn>
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>

      <SectionTitle>{t.waitlist}</SectionTitle>
      <DataTable minWidth={620}>
        <thead>
          <tr>
            <Th className="text-start">{t.email}</Th>
            <Th className="text-start">{t.events}</Th>
            <Th>{t.wlStatus}</Th>
            <Th>{t.colDate}</Th>
          </tr>
        </thead>
        <tbody>
          {waitlist.length === 0 ? (
            <tr>
              <td colSpan={4}>
                <EmptyState icon="📬" title={t.noWaitlist} />
              </td>
            </tr>
          ) : null}
          {waitlist.map((item, i) => (
            <tr key={`${item.slug}-${item.email}-${i}`} className="transition hover:bg-brume/40">
              <Td>
                <PersonCell name={item.email} />
              </Td>
              <Td className="text-sm">{item.title}</Td>
              <Td className="text-center">
                <Badge tone={WAITLIST_TONE[item.status] ?? "neutral"}>{waitlistLabel(t, item.status)}</Badge>
                {/* An outstanding offer is the only state with a deadline. */}
                {item.status === "OFFERED" && item.claimExpiresAt ? (
                  <span className="mt-0.5 block text-[11px] text-muted">
                    {t.wlExpires} {new Date(item.claimExpiresAt).toLocaleTimeString(locale === "ar" ? "ar-MA" : "fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                ) : null}
              </Td>
              <Td className="text-center text-sm text-muted">{item.createdAt.slice(0, 10)}</Td>
            </tr>
          ))}
        </tbody>
      </DataTable>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t.addPromo}
        icon={<Tags className="size-5" />}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setOpen(false)}>
              {t.close}
            </Btn>
            <Btn type="submit" form="promo-form">
              {t.save}
            </Btn>
          </>
        }
      >
        <form id="promo-form" className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <label className="grid gap-1.5 text-sm font-semibold sm:col-span-2">
            {t.code}
            <input className="field font-mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder="SAFRAN15" required />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            {t.kind}
            <select className="field" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="PERCENT">{t.percent}</option>
              <option value="AMOUNT">{t.amount}</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            {kind === "PERCENT" ? t.percent : t.amount}
            <input className="field" type="number" min={1} value={value} onChange={(e) => setValue(Number(e.target.value))} />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            {t.allEvents}
            <select className="field" value={eventSlug} onChange={(e) => setEventSlug(e.target.value)}>
              <option value="">{t.allDates}</option>
              {(events ?? []).map((event) => (
                <option key={event.slug} value={event.slug}>
                  {locale === "ar" ? event.titleAr : event.titleFr}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            {t.maxUses}
            <input className="field" type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} />
          </label>
        </form>
      </Modal>
    </div>
  );
}
