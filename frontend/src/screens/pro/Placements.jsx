import { useCallback, useEffect, useState } from "react";
import { LayoutGrid, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, money } from "../../api";
import { useI18n } from "../../i18n";
import { useConfirm } from "./ConfirmContext";
import { Badge, Btn, DataTable, EmptyState, IconBtn, Modal, MoneyCell, PageHead, StockCell, Td, Th } from "./ui";
import { text } from "./copy";

const BLANK = {
  nameFr: "",
  nameAr: "",
  zoneFr: "",
  zoneAr: "",
  gateFr: "",
  gateAr: "",
  priceCents: 10000,
  capacity: 100,
  numbered: false,
  seatsPerRow: 12,
};

/**
 * Placements — the seating zones of an event.
 *
 * Tiers used to be fixed at creation, so a wrong price or a missing zone
 * meant deleting the event. This edits them in place, with the guards that
 * protect anyone already holding a ticket: capacity never drops below what's
 * sold, and a tier with sales can't be deleted.
 */
export default function Placements() {
  const { locale } = useI18n();
  const t = text[locale];
  const confirm = useConfirm();
  const [events, setEvents] = useState([]);
  const [slug, setSlug] = useState("");
  const [tiers, setTiers] = useState(null);
  const [editing, setEditing] = useState(null); // tier object, or "new"
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get("/organiser/events")
      .then((data) => {
        setEvents(data.events);
        if (data.events.length) setSlug((current) => current || data.events[0].slug);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    if (!slug) return;
    api
      .get(`/organiser/events/${slug}/tiers`)
      .then((data) => setTiers(data.tiers))
      .catch((err) => toast.error(err.message));
  }, [slug]);

  useEffect(() => {
    setTiers(null);
    load();
  }, [load]);

  const openNew = () => {
    setForm(BLANK);
    setEditing("new");
  };

  const openEdit = (tier) => {
    setForm({
      nameFr: tier.nameFr,
      nameAr: tier.nameAr,
      zoneFr: tier.zoneFr,
      zoneAr: tier.zoneAr,
      gateFr: tier.gateFr,
      gateAr: tier.gateAr,
      priceCents: tier.priceCents,
      capacity: tier.capacity,
      numbered: tier.numbered,
      seatsPerRow: tier.seatsPerRow ?? 12,
    });
    setEditing(tier);
  };

  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (editing === "new") {
        await api.post(`/organiser/events/${slug}/tiers`, { ...form, blurbFr: form.nameFr, blurbAr: form.nameAr });
      } else {
        await api.patch(`/organiser/tiers/${editing.id}`, form);
      }
      setEditing(null);
      load();
      toast.success(t.saved);
    } catch (err) {
      // The server refuses a capacity below what's sold; show its number.
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (tier) => {
    const ok = await confirm({
      title: t.confirmTitle,
      message: `${t.remove} — ${locale === "ar" ? tier.nameAr : tier.nameFr}`,
      tone: "danger",
      confirmLabel: t.remove,
      cancelLabel: t.cancelBtn,
    });
    if (!ok) return;
    try {
      await api.del(`/organiser/tiers/${tier.id}`);
      load();
      toast.success(t.removed);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const field = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div>
      <PageHead
        title={t.placements}
        sub={t.placementsSub}
        actions={
          <>
            <select
              className="h-11 rounded-xl border border-line/20 bg-card px-3 text-sm outline-none focus:border-primary"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            >
              <option value="">{t.pickEvent}</option>
              {events.map((event) => (
                <option key={event.slug} value={event.slug}>
                  {locale === "ar" ? event.titleAr : event.titleFr}
                </option>
              ))}
            </select>
            <Btn onClick={openNew} disabled={!slug}>
              <Plus className="size-4" />
              {t.addZone}
            </Btn>
          </>
        }
      />

      {!slug ? (
        <EmptyState icon="🎫" title={t.selectEventFirst} />
      ) : (
        <DataTable minWidth={900}>
          <thead>
            <tr>
              <Th className="text-start">{t.zone}</Th>
              <Th>{t.price}</Th>
              <Th>{t.capacityCol}</Th>
              <Th>{t.soldCol}</Th>
              <Th>{t.seating}</Th>
              <Th>
                <span className="sr-only">{t.actions}</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {tiers && tiers.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState icon="🎪" title={t.noTiers} />
                </td>
              </tr>
            ) : null}
            {(tiers ?? []).map((tier) => (
              <tr key={tier.id} className="transition hover:bg-brume/40">
                <Td>
                  <p className="text-sm font-bold">{locale === "ar" ? tier.nameAr : tier.nameFr}</p>
                  <p className="text-xs text-muted">
                    {locale === "ar" ? tier.zoneAr : tier.zoneFr} · {t.gateCol} {locale === "ar" ? tier.gateAr : tier.gateFr}
                  </p>
                </Td>
                <Td className="text-center">
                  <MoneyCell unit="MAD">{money(tier.priceCents)}</MoneyCell>
                </Td>
                <Td className="text-center">
                  <StockCell left={tier.remaining} total={tier.capacity} />
                </Td>
                <Td className="text-center tabular-nums">{tier.sold}</Td>
                <Td className="text-center">
                  {tier.numbered ? (
                    <Badge tone="info">
                      {t.numbered} · {tier.seatsPerRow ?? 12}/{t.seatsPerRow.toLowerCase()}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">{t.freeSeating}</Badge>
                  )}
                </Td>
                <Td className="w-px whitespace-nowrap pe-4">
                  <div className="flex justify-end gap-1.5">
                    <IconBtn label={t.edit} onClick={() => openEdit(tier)}>
                      <Pencil className="size-4" />
                    </IconBtn>
                    <IconBtn tone="danger" label={t.remove} onClick={() => remove(tier)} disabled={tier.sold > 0}>
                      <Trash2 className="size-4" />
                    </IconBtn>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        wide
        title={editing === "new" ? t.addZone : t.editZone}
        icon={<LayoutGrid className="size-5" />}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setEditing(null)}>
              {t.close}
            </Btn>
            <Btn type="submit" form="tier-form" disabled={busy}>
              {t.save}
            </Btn>
          </>
        }
      >
        <form id="tier-form" className="grid gap-4 sm:grid-cols-2" onSubmit={save}>
          <label className="grid gap-1.5 text-sm font-semibold">
            {t.zoneName} (FR)
            <input className="field" value={form.nameFr} onChange={(e) => field("nameFr", e.target.value)} required minLength={1} />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            {t.zoneName} (AR)
            <input className="field" dir="rtl" value={form.nameAr} onChange={(e) => field("nameAr", e.target.value)} required minLength={1} />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            {t.zone} (FR)
            <input className="field" value={form.zoneFr} onChange={(e) => field("zoneFr", e.target.value)} required />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            {t.zone} (AR)
            <input className="field" dir="rtl" value={form.zoneAr} onChange={(e) => field("zoneAr", e.target.value)} required />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            {t.gateCol} (FR)
            <input className="field" value={form.gateFr} onChange={(e) => field("gateFr", e.target.value)} required />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            {t.gateCol} (AR)
            <input className="field" dir="rtl" value={form.gateAr} onChange={(e) => field("gateAr", e.target.value)} required />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            {t.price} (MAD)
            <input
              className="field"
              type="number"
              min={0}
              step="0.01"
              value={form.priceCents / 100}
              onChange={(e) => field("priceCents", Math.round(Number(e.target.value) * 100))}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            {t.capacityCol}
            <input className="field" type="number" min={1} value={form.capacity} onChange={(e) => field("capacity", Number(e.target.value))} />
            {editing && editing !== "new" && editing.sold > 0 ? (
              <span className="text-xs font-medium text-muted">{t.capacityLocked.replace("{n}", String(editing.sold))}</span>
            ) : null}
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
            <input type="checkbox" checked={form.numbered} onChange={(e) => field("numbered", e.target.checked)} />
            {t.numbered}
          </label>
          {form.numbered ? (
            <label className="grid gap-1.5 text-sm font-semibold">
              {t.seatsPerRow}
              <input
                className="field"
                type="number"
                min={1}
                max={100}
                value={form.seatsPerRow}
                onChange={(e) => field("seatsPerRow", Number(e.target.value))}
              />
            </label>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
