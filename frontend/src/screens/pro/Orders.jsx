import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Banknote, Check, Download, ExternalLink, Trash2, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api, money } from "../../api";
import { useI18n } from "../../i18n";
import { longDate } from "../../utils";
import { useConfirm } from "./ConfirmContext";
import {
  Badge,
  Btn,
  DataTable,
  EmptyState,
  EntityCell,
  FilterBar,
  IconBtn,
  MoneyCell,
  PageHead,
  Pager,
  PersonCell,
  Td,
  Th,
} from "./ui";
import { text } from "./copy";

const PAGE_SIZE_DEFAULT = 20;

export default function Orders() {
  const { locale } = useI18n();
  const t = text[locale];
  const confirm = useConfirm();
  const [orders, setOrders] = useState(null);
  const [query, setQuery] = useState("");
  const [eventSlug, setEventSlug] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE_DEFAULT);

  const load = () => api.get("/organiser/orders/detailed").then((data) => setOrders(data.orders));

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [query, eventSlug, status, limit]);

  const events = useMemo(() => {
    const map = new Map();
    for (const order of orders ?? []) {
      for (const ticket of order.tickets) map.set(ticket.event.slug, locale === "ar" ? ticket.event.titleAr : ticket.event.titleFr);
    }
    return [...map.entries()];
  }, [orders, locale]);

  // One row per ticket — closer to what an organiser scans for than per-order.
  const allRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = [];
    for (const order of orders ?? []) {
      for (const ticket of order.tickets) {
        if (eventSlug && ticket.event.slug !== eventSlug) continue;
        if (status && ticket.status !== status) continue;
        if (needle && !`${order.holderName} ${order.email} ${order.id} ${ticket.ref} ${ticket.event.titleFr} ${ticket.event.titleAr}`.toLowerCase().includes(needle))
          continue;
        rows.push({ order, ticket });
      }
    }
    return rows;
  }, [orders, query, eventSlug, status]);

  const pages = Math.max(1, Math.ceil(allRows.length / limit));
  const rows = allRows.slice((page - 1) * limit, page * limit);

  const label = (value) =>
    value === "VALID" ? t.valid : value === "USED" ? t.used : value === "CANCELLED" ? t.cancelled : t.transferred;
  const tone = (value) => (value === "USED" ? "blue" : value === "CANCELLED" ? "red" : value === "TRANSFERRED" ? "amber" : "green");

  const cancelOrder = async (order) => {
    const ok = await confirm({
      title: t.confirmTitle,
      message: t.confirmCancelOrder,
      tone: "warn",
      confirmLabel: t.cancelOrder,
      cancelLabel: t.cancelBtn,
    });
    if (!ok) return;
    await api.post(`/organiser/orders/${order.id}/cancel`, {});
    load();
    toast.success(t.cancelled);
  };

  const removeOrder = async (order) => {
    const ok = await confirm({
      title: t.confirmTitle,
      message: t.confirmDeleteOrder,
      tone: "danger",
      confirmLabel: t.remove,
      cancelLabel: t.cancelBtn,
    });
    if (!ok) return;
    await api.del(`/organiser/orders/${order.id}`);
    load();
    toast.success(t.removed);
  };

  const refundOrder = async (order) => {
    const outstanding = order.totalCents - (order.refundedCents ?? 0);
    const ok = await confirm({
      title: t.refundTitle,
      message: `${t.confirmRefund} ${t.refundOutstanding.replace("{n}", money(outstanding))}`,
      tone: "warn",
      confirmLabel: t.refund,
      cancelLabel: t.cancelBtn,
    });
    if (!ok) return;
    try {
      await api.post(`/organiser/orders/${order.id}/refund`, {});
      load();
      toast.success(t.refundDone);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggleAdmit = async (ticket) => {
    const next = ticket.status === "USED" ? "VALID" : "USED";
    await api.patch(`/organiser/tickets/${ticket.id}/status`, { status: next });
    load();
    toast.success(next === "USED" ? t.admitted : t.undone);
  };

  const exportCsv = () => {
    const lines = [["order", "ref", "event", "holder", "email", "status", "price"]];
    for (const { order, ticket } of allRows) {
      lines.push([order.id, ticket.ref, ticket.event.titleFr, order.holderName, order.email, ticket.status, String(ticket.priceCents / 100)]);
    }
    const csv = lines.map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "eventick-reservations.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const activeCount = [query, eventSlug, status].filter(Boolean).length;

  return (
    <div>
      <PageHead title={t.orders} sub={orders ? t.ordersSub.replace("{n}", String(allRows.length)) : undefined} />

      <FilterBar
        search={{ value: query, onChange: setQuery, placeholder: t.search }}
        controls={[
          {
            key: "event",
            label: t.allEvents,
            value: eventSlug,
            onChange: (e) => setEventSlug(e.target.value),
            style: { width: 200 },
            options: [{ value: "", label: t.allEvents }, ...events.map(([slug, title]) => ({ value: slug, label: title }))],
          },
          {
            key: "status",
            label: t.colStatus,
            value: status,
            onChange: (e) => setStatus(e.target.value),
            style: { width: 160 },
            options: [
              { value: "", label: t.allStatus },
              { value: "VALID", label: t.valid },
              { value: "USED", label: t.used },
              { value: "TRANSFERRED", label: t.transferred },
              { value: "CANCELLED", label: t.cancelled },
            ],
          },
        ]}
        activeCount={activeCount}
        resetLabel={t.reset}
        onReset={() => {
          setQuery("");
          setEventSlug("");
          setStatus("");
        }}
        actions={
          <Btn variant="secondary" size="sm" disabled={allRows.length === 0} onClick={exportCsv}>
            <Download className="size-4" />
            {t.export}
          </Btn>
        }
      />

      <DataTable minWidth={980}>
        <thead>
          <tr>
            <Th className="text-start">{t.search}</Th>
            <Th className="text-start">{t.events}</Th>
            <Th>{t.ref}</Th>
            <Th>{t.gross}</Th>
            <Th>{t.colStatus}</Th>
            <Th>
              <span className="sr-only">{t.actions}</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {orders && rows.length === 0 ? (
            <tr>
              <td colSpan={6}>
                <EmptyState icon="🧾" title={activeCount ? t.noOrdersFilter : t.noOrdersYet} />
              </td>
            </tr>
          ) : null}
          {rows.map(({ order, ticket }) => (
            <tr key={ticket.id} className="transition hover:bg-brume/40">
              <Td>
                <PersonCell name={order.holderName} sub={order.email} />
              </Td>
              <Td>
                <EntityCell
                  image={ticket.event.image}
                  title={locale === "ar" ? ticket.event.titleAr : ticket.event.titleFr}
                  sub={`${longDate(ticket.event.start, locale)} · ${locale === "ar" ? ticket.tierNameAr : ticket.tierNameFr}`}
                />
              </Td>
              <Td className="text-center">
                <span className="font-mono text-xs font-bold text-lagon">{ticket.ref}</span>
              </Td>
              <Td className="text-center">
                <MoneyCell unit="MAD">{money(ticket.priceCents)}</MoneyCell>
              </Td>
              <Td className="text-center">
                <Badge tone={tone(ticket.status)}>{label(ticket.status)}</Badge>
              </Td>
              <Td className="w-px whitespace-nowrap pe-4">
                <div className="flex justify-end gap-1.5">
                  {ticket.status === "VALID" || ticket.status === "USED" ? (
                    <IconBtn label={ticket.status === "USED" ? t.undo : t.admit} onClick={() => toggleAdmit(ticket)}>
                      {ticket.status === "USED" ? <Undo2 className="size-4" /> : <Check className="size-4" />}
                    </IconBtn>
                  ) : null}
                  <Link
                    to={`/billet/${ticket.id}`}
                    title={t.open}
                    aria-label={t.open}
                    className="inline-flex size-9 items-center justify-center rounded-lg border border-line/15 bg-card text-muted transition hover:-translate-y-px hover:border-lagon hover:bg-brume hover:text-lagon-deep"
                  >
                    <ExternalLink className="size-4" />
                  </Link>
                  {order.status === "PAID" ? (
                    <IconBtn label={t.refund} onClick={() => refundOrder(order)}>
                      <Banknote className="size-4" />
                    </IconBtn>
                  ) : null}
                  <IconBtn label={t.cancelOrder} onClick={() => cancelOrder(order)}>
                    <XCircle className="size-4" />
                  </IconBtn>
                  <IconBtn tone="danger" label={t.remove} onClick={() => removeOrder(order)}>
                    <Trash2 className="size-4" />
                  </IconBtn>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </DataTable>

      <Pager
        page={page}
        pages={pages}
        onPage={setPage}
        limit={limit}
        onLimit={setLimit}
        labels={{ rows: t.rows, prev: t.prev, next: t.next }}
      />
    </div>
  );
}
