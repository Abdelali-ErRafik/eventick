import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Copy, ExternalLink, Eye, EyeOff, Mail, Pencil, Ticket, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { api, money } from "../../api";
import { useI18n } from "../../i18n";
import { CITIES, longDate, totalCapacity, totalRemaining } from "../../utils";
import { useConfirm } from "./ConfirmContext";
import { useOrganisers } from "./useOrganisers";
import { Badge, Btn, EmptyState, FilterBar, IconBtn, Modal, PageHead } from "./ui";
import { text } from "./copy";
import { Field, Input, Select, Textarea } from "../../ui";

export default function Events() {
  const { locale } = useI18n();
  const t = text[locale];
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { maySeeAllOrganisers, organisers } = useOrganisers();
  const [events, setEvents] = useState(null);
  const [orders, setOrders] = useState(null);
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [visibility, setVisibility] = useState("");
  const [organiserId, setOrganiserId] = useState("");
  const [edit, setEdit] = useState(null);
  const [titleFr, setTitleFr] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [editCity, setEditCity] = useState("Casablanca");
  const [contact, setContact] = useState(null);
  const [audience, setAudience] = useState(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  // The ?organiserId= suffix is only ever meaningful for an admin -- the
  // backend ignores it for anyone else (see requestedOrganiserId in
  // organiser.ts), so appending it unconditionally here is safe either way.
  const suffix = organiserId ? `?organiserId=${organiserId}` : "";

  const load = () => {
    api.get(`/organiser/events${suffix}`).then((data) => setEvents(data.events));
    api.get(`/organiser/orders/detailed${suffix}`).then((data) => setOrders(data.orders));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organiserId]);

  const rows = useMemo(() => {
    if (!events || !orders) return [];
    const needle = query.trim().toLowerCase();
    return events
      .map((event) => {
        const tickets = orders
          .flatMap((order) => order.tickets)
          .filter((ticket) => ticket.event.slug === event.slug && ticket.status !== "CANCELLED");
        return {
          event,
          issued: tickets.length,
          revenue: tickets.reduce((sum, ticket) => sum + ticket.priceCents, 0),
          left: totalRemaining(event),
          cap: totalCapacity(event),
          hidden: event.status === "HIDDEN",
        };
      })
      .filter((row) => {
        if (city && row.event.city !== city) return false;
        if (visibility === "live" && row.hidden) return false;
        if (visibility === "hidden" && !row.hidden) return false;
        if (!needle) return true;
        return `${row.event.titleFr} ${row.event.titleAr} ${row.event.city}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => b.issued - a.issued || a.event.start.localeCompare(b.event.start));
  }, [events, orders, query, city, visibility]);

  const cities = useMemo(() => [...new Set((events ?? []).map((event) => event.city))].sort(), [events]);

  const openEdit = (event) => {
    setEdit(event);
    // Both titles, each in its own field. Loading only the current locale's
    // and writing it to both overwrote the Arabic title with French text the
    // moment an organiser edited the city.
    setTitleFr(event.titleFr);
    setTitleAr(event.titleAr);
    setEditCity(event.city);
  };

  const save = async (e) => {
    e.preventDefault();
    await api.patch(`/organiser/events/${edit.slug}`, { titleFr, titleAr, city: editCity });
    setEdit(null);
    load();
    toast.success(t.saved);
  };

  const openContact = async (event) => {
    setContact(event);
    setSubject("");
    setMessage("");
    setAudience(null);
    const data = await api.get(`/organiser/events/${event.slug}/audience`);
    setAudience(data.count);
  };

  const sendBroadcast = async (e) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    try {
      const res = await api.post(`/organiser/events/${contact.slug}/broadcast`, { subject, message });
      // `sent` can be 0 while `recipients` is not, when no mail provider is
      // configured — say so rather than claiming a successful send.
      if (res.sent > 0) toast.success(t.sentOk.replace("{n}", String(res.sent)));
      else toast.warning(t.sentNone);
      setContact(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  const toggleHidden = async (slug, hidden) => {
    await api.patch(`/organiser/events/${slug}/visibility`, { hidden });
    load();
    toast.success(t.saved);
  };

  const removeEvent = async (event) => {
    const ok = await confirm({
      title: t.confirmTitle,
      message: t.confirmDeleteEvent,
      tone: "danger",
      confirmLabel: t.remove,
      cancelLabel: t.cancelBtn,
    });
    if (!ok) return;
    await api.del(`/organiser/events/${event.slug}`);
    load();
    toast.success(t.removed);
  };

  const duplicate = (event) => {
    // No duplicate endpoint — prefill the organiser form, same effect as the
    // old client-side copy-with-new-slug.
    sessionStorage.setItem(
      "eventick-duplicate",
      JSON.stringify({
        titleFr: `${event.titleFr} · copie`,
        titleAr: `${event.titleAr} · نسخة`,
        city: event.city,
        venue: event.venueFr,
        about: event.aboutFr,
        price: (event.tiers[0]?.priceCents ?? 0) / 100,
        stock: event.tiers[0]?.capacity ?? 0,
        cover: event.image,
      }),
    );
    navigate("/organiser");
  };

  const exportGuests = (event) => {
    const lines = [["ref", "holder", "status", "tier", "price"]];
    for (const order of orders) {
      for (const ticket of order.tickets) {
        if (ticket.event.slug !== event.slug) continue;
        lines.push([ticket.ref, ticket.holderName, ticket.status, locale === "ar" ? ticket.tierNameAr : ticket.tierNameFr, String(ticket.priceCents / 100)]);
      }
    }
    const csv = lines.map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${event.slug}-participants.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const activeCount = [query, city, visibility].filter(Boolean).length;

  return (
    <div>
      <PageHead
        title={t.events}
        sub={events ? t.eventsSub.replace("{n}", String(events.length)) : undefined}
        actions={
          <Link
            to="/organiser"
            className="inline-flex h-11 items-center rounded-full bg-action px-4 text-sm font-semibold text-action-fg transition hover:bg-action-hover active:scale-[0.97]"
          >
            {t.create}
          </Link>
        }
      />

      {/* The organiser-scope control only exists for an admin -- an
          organiser's FilterBar is unchanged. Kept out of activeCount/reset
          deliberately: it's a viewing scope, not a content filter, so
          clearing filters shouldn't also silently kick an admin back to
          "all organisers". */}
      <FilterBar
        search={{ value: query, onChange: setQuery, placeholder: t.search }}
        controls={[
          ...(maySeeAllOrganisers
            ? [
                {
                  key: "organiser",
                  label: t.allOrganisers,
                  value: organiserId,
                  onChange: (e) => setOrganiserId(e.target.value),
                  style: { width: 200 },
                  options: [
                    { value: "", label: t.allOrganisers },
                    ...organisers.map((o) => ({ value: o.id, label: o.name })),
                  ],
                },
              ]
            : []),
          {
            key: "city",
            label: t.allEvents,
            value: city,
            onChange: (e) => setCity(e.target.value),
            style: { width: 170 },
            options: [{ value: "", label: t.allEvents }, ...cities.map((name) => ({ value: name, label: name }))],
          },
          {
            key: "visibility",
            label: t.allStatus2,
            value: visibility,
            onChange: (e) => setVisibility(e.target.value),
            style: { width: 160 },
            options: [
              { value: "", label: t.allStatus2 },
              { value: "live", label: t.public },
              { value: "hidden", label: t.hidden },
            ],
          },
        ]}
        activeCount={activeCount}
        resetLabel={t.reset}
        onReset={() => {
          setQuery("");
          setCity("");
          setVisibility("");
        }}
      />

      {events && rows.length === 0 ? (
        <EmptyState icon="📅" title={activeCount ? t.noEventsFilter : t.noEventsYet} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <EventRow
              key={row.event.slug}
              row={row}
              locale={locale}
              t={t}
              onEdit={() => openEdit(row.event)}
              onDuplicate={() => duplicate(row.event)}
              onGuests={() => exportGuests(row.event)}
              onContact={() => openContact(row.event)}
              onToggleHidden={() => toggleHidden(row.event.slug, !row.hidden)}
              onRemove={() => removeEvent(row.event)}
            />
          ))}
        </div>
      )}

      <Modal
        open={Boolean(edit)}
        onClose={() => setEdit(null)}
        title={t.edit}
        sub={edit ? edit.slug : undefined}
        icon={<Pencil className="size-5" />}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setEdit(null)}>
              {t.close}
            </Btn>
            <Btn type="submit" form="event-edit">
              {t.save}
            </Btn>
          </>
        }
      >
        <form id="event-edit" className="grid gap-4" onSubmit={save}>
          <Field label={t.titleFrLabel} required>
            {({ id, describedBy, invalid, required }) => (
              <Input
                id={id}
                describedBy={describedBy}
                invalid={invalid}
                required={required}
                value={titleFr}
                onChange={(e) => setTitleFr(e.target.value)}
                minLength={3}
              />
            )}
          </Field>
          <Field label={t.titleArLabel} required>
            {({ id, describedBy, invalid, required }) => (
              <Input
                id={id}
                describedBy={describedBy}
                invalid={invalid}
                required={required}
                dir="rtl"
                value={titleAr}
                onChange={(e) => setTitleAr(e.target.value)}
                minLength={3}
              />
            )}
          </Field>
          <Field label={t.cityLabel}>
            {({ id, describedBy, invalid }) => (
              <Select id={id} describedBy={describedBy} invalid={invalid} value={editCity} onChange={(e) => setEditCity(e.target.value)}>
                {CITIES.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </Select>
            )}
          </Field>
        </form>
      </Modal>

      <Modal
        open={Boolean(contact)}
        onClose={() => setContact(null)}
        wide
        title={t.contact}
        sub={
          contact
            ? audience === null
              ? locale === "ar"
                ? contact.titleAr
                : contact.titleFr
              : t.contactSub.replace("{n}", String(audience))
            : undefined
        }
        icon={<Mail className="size-5" />}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setContact(null)}>
              {t.close}
            </Btn>
            <Btn type="submit" form="broadcast-form" disabled={sending || audience === 0}>
              {sending ? t.sending : t.send}
            </Btn>
          </>
        }
      >
        {audience === 0 ? (
          <EmptyState icon="📭" title={t.contactNone} />
        ) : (
          <form id="broadcast-form" className="grid gap-4" onSubmit={sendBroadcast}>
            <Field label={t.subject} required>
              {({ id, describedBy, invalid, required }) => (
                <Input
                  id={id}
                  describedBy={describedBy}
                  invalid={invalid}
                  required={required}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  minLength={3}
                  maxLength={150}
                />
              )}
            </Field>
            <Field label={t.message} required>
              {({ id, describedBy, invalid }) => (
                <Textarea
                  id={id}
                  describedBy={describedBy}
                  invalid={invalid}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  minLength={10}
                  maxLength={5000}
                  required
                />
              )}
            </Field>
          </form>
        )}
      </Modal>
    </div>
  );
}

/**
 * One event, in the organiser's own list.
 *
 * Rebuilt from a table row whose five actions were squeezed into a single
 * "w-px whitespace-nowrap" cell, same issue as Orders and Placements had.
 * The poster, issued/remaining/revenue stats and visibility badge sit in
 * their own rows here, and the jauge bar reuses Placements' colour logic
 * (success/accent/danger by remaining ratio) instead of StockCell's tight
 * table-cell layout.
 */
function EventRow({ row, locale, t, onEdit, onDuplicate, onGuests, onContact, onToggleHidden, onRemove }) {
  const { event, issued, revenue, left, cap, hidden } = row;
  const ratio = cap > 0 ? left / cap : 0;
  const tone = ratio <= 0 ? "out" : ratio < 0.2 ? "low" : "ok";
  const barColor = { ok: "bg-success", low: "bg-accent", out: "bg-danger/40" }[tone];
  const textColor = { ok: "text-success", low: "text-accent", out: "text-danger" }[tone];

  return (
    <article className="flex flex-col gap-4 rounded-card border border-line/10 bg-card p-5 shadow-card">
      <div className="flex items-start gap-3">
        <img src={event.image} alt="" className="size-14 shrink-0 rounded-control object-cover" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-subhead font-bold">{locale === "ar" ? event.titleAr : event.titleFr}</h3>
          <p className="mt-0.5 truncate text-xs text-muted">
            {event.city} · {longDate(event.start, locale)}
          </p>
        </div>
        <Badge tone={hidden ? "neutral" : "success"}>{hidden ? t.hidden : t.public}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">{t.issued}</p>
          <p className="mt-0.5 flex items-center gap-1.5 font-display text-heading font-bold tabular-nums">
            <Ticket className="size-4 text-muted" aria-hidden />
            {issued}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">{t.revenue}</p>
          <p className="mt-0.5 font-display text-heading font-bold tabular-nums">
            {money(revenue)} <span className="text-xs font-semibold text-muted">MAD</span>
          </p>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">{t.left}</p>
          <p className="text-sm font-bold tabular-nums">
            <span className={textColor}>{left}</span>
            <span className="text-muted">/{cap}</span>
          </p>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-sunken"
          role="progressbar"
          aria-valuenow={cap > 0 ? Math.round((1 - ratio) * 100) : 0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t.left}
        >
          <div className={`h-full rounded-full transition-[width] ${barColor}`} style={{ width: `${Math.round((1 - ratio) * 100)}%` }} />
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-1.5 border-t border-line/10 pt-3.5">
        <IconBtn label={t.edit} onClick={onEdit}>
          <Pencil className="size-4" />
        </IconBtn>
        <IconBtn label={t.duplicate} onClick={onDuplicate}>
          <Copy className="size-4" />
        </IconBtn>
        <IconBtn label={t.guests} onClick={onGuests}>
          <Users className="size-4" />
        </IconBtn>
        <IconBtn label={t.contact} onClick={onContact}>
          <Mail className="size-4" />
        </IconBtn>
        <IconBtn label={hidden ? t.restore : t.hide} onClick={onToggleHidden}>
          {hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        </IconBtn>
        {!hidden ? (
          <Link
            to={`/evenements/${event.slug}`}
            title={t.public}
            aria-label={t.public}
            className="inline-flex size-9 items-center justify-center rounded-control border border-line/15 bg-card text-muted transition hover:-translate-y-px hover:border-primary hover:bg-brume hover:text-primary"
          >
            <ExternalLink className="size-4" />
          </Link>
        ) : null}
        <IconBtn tone="danger" label={t.remove} onClick={onRemove}>
          <Trash2 className="size-4" />
        </IconBtn>
      </div>
    </article>
  );
}
