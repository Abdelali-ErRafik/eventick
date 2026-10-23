import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Shell } from "../components/Shell";
import { TicketPass } from "../components/TicketPass";
import { api } from "../api";

export default function TicketDetail() {
  const { ticketId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get(`/tickets/${ticketId}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [ticketId]);

  if (error) return <Shell><p className="p-8 text-corail">{error}</p></Shell>;
  if (!data) return <Shell><p className="p-8 text-muted">...</p></Shell>;

  return (
    <Shell>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <TicketPass ticket={data.ticket} event={data.event} tier={data.tier} eventSlug={data.event.slug} />
        <button type="button" onClick={() => window.print()} className="no-print mt-4 h-11 rounded-full border px-5 text-sm font-semibold">
          Imprimer
        </button>
      </div>
    </Shell>
  );
}
