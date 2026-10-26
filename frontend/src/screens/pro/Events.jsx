import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Copy, ExternalLink, Eye, EyeOff, Pencil, Ticket, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { api, money } from "../../api";
import { useI18n } from "../../i18n";
import { CITIES, longDate, totalCapacity, totalRemaining } from "../../utils";
import { useConfirm } from "./ConfirmContext";
import {
  Badge,
  Btn,
  CountChip,
  DataTable,
  EmptyState,
  EntityCell,
  FilterBar,
  IconBtn,
  Modal,
  MoneyCell,
  PageHead,
  StockCell,
  Td,
  Th,
} from "./ui";
import { text } from "./copy";

export default function Events() {
  const { locale } = useI18n();
  const t = text[locale];
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [events, setEvents] = useState(null);
  const [orders, setOrders] = useState(null);
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [visibility, setVisibility] = useState("");
  const [edit, setEdit] = useState(null);
  const [title, setTitle] = useState("");
  const [editCity, setEditCity] = useState("Casablanca");

  const load = () => {
    api.get("/organiser/events").then((data) => setEvents(data.events));
    api.get("/organiser/orders/detailed").then((data) => setOrders(data.orders));
  };

  useEffect(() => {
    load();
  }, []);

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
    setTitle(locale === "ar" ? event.titleAr : event.titleFr);
    setEditCity(event.city);
  };

  const save = async (e) => {
    e.preventDefault();
    await api.patch(`/organiser/events/${edit.slug}`, { titleFr: title, titleAr: title, city: editCity });
    setEdit(null);
    load();
    toast.success(t.saved);
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
            className="inline-flex h-11 items-center rounded-full bg-safran px-4 text-sm font-semibold text-encre transition hover:bg-safran-deep active:scale-[0.97]"
          >
            {t.create}
          </Link>
        }
      />

      <FilterBar
        search={{ value: query, onChange: setQuery, placeholder: t.search }}
        controls={[
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

      <DataTable minWidth={900}>
        <thead>
          <tr>
            <Th className="text-start">{t.events}</Th>
            <Th>{t.issued}</Th>
            <Th>{t.left}</Th>
            <Th>{t.revenue}</Th>
            <Th>{t.colStatus}</Th>
            <Th>
              <span className="sr-only">{t.actions}</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {events && rows.length === 0 ? (
            <tr>
              <td colSpan={6}>
                <EmptyState icon="📅" title={activeCount ? t.noEventsFilter : t.noEventsYet} />
              </td>
            </tr>
          ) : null}
          {rows.map((row) => (
            <tr key={row.event.slug} className="transition hover:bg-brume/40">
              <Td>
                <EntityCell
                  image={row.event.image}
                  title={locale === "ar" ? row.event.titleAr : row.event.titleFr}
                  sub={`${row.event.city} · ${longDate(row.event.start, locale)}`}
                />
              </Td>
              <Td className="text-center">
                <CountChip icon={<Ticket className="size-3" />}>{row.issued}</CountChip>
              </Td>
              <Td className="text-center">
                <StockCell left={row.left} total={row.cap} />
              </Td>
              <Td className="text-center">
                <MoneyCell unit="MAD">{money(row.revenue)}</MoneyCell>
              </Td>
              <Td className="text-center">
                <Badge tone={row.hidden ? "gray" : "green"}>{row.hidden ? t.hidden : t.public}</Badge>
              </Td>
              <Td className="w-px whitespace-nowrap pe-4">
                <div className="flex justify-end gap-1.5">
                  <IconBtn label={t.edit} onClick={() => openEdit(row.event)}>
                    <Pencil className="size-4" />
                  </IconBtn>
                  <IconBtn label={t.duplicate} onClick={() => duplicate(row.event)}>
                    <Copy className="size-4" />
                  </IconBtn>
                  <IconBtn label={t.guests} onClick={() => exportGuests(row.event)}>
                    <Users className="size-4" />
                  </IconBtn>
                  <IconBtn label={row.hidden ? t.restore : t.hide} onClick={() => toggleHidden(row.event.slug, !row.hidden)}>
                    {row.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </IconBtn>
                  {!row.hidden ? (
                    <Link
                      to={`/evenements/${row.event.slug}`}
                      title={t.public}
                      aria-label={t.public}
                      className="inline-flex size-9 items-center justify-center rounded-lg border border-line/15 bg-card text-muted transition hover:-translate-y-px hover:border-lagon hover:bg-brume hover:text-lagon-deep"
                    >
                      <ExternalLink className="size-4" />
                    </Link>
                  ) : null}
                  <IconBtn tone="danger" label={t.remove} onClick={() => removeEvent(row.event)}>
                    <Trash2 className="size-4" />
                  </IconBtn>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </DataTable>

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
          <label className="grid gap-1.5 text-sm font-semibold">
            {t.events}
            <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            {t.allEvents}
            <select className="field" value={editCity} onChange={(e) => setEditCity(e.target.value)}>
              {CITIES.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
        </form>
      </Modal>
    </div>
  );
}
