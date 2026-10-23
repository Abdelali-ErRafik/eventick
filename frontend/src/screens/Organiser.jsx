import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shell } from "../components/Shell";
import { Protected } from "../components/Protected";
import { api } from "../api";

function OrganiserInner() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    slug: "",
    titleFr: "",
    titleAr: "",
    category: "festivals",
    city: "Casablanca",
    venueFr: "",
    venueAr: "",
    address: "",
    start: "",
    end: "",
    doors: "",
    image: "/events/comedy.jpg",
    blurbFr: "",
    blurbAr: "",
    aboutFr: "",
    aboutAr: "",
    ageFr: "Tout public.",
    ageAr: "لجميع الأعمار.",
    tierNameFr: "Billet standard",
    tierNameAr: "تذكرة عادية",
    priceCents: 10000,
    capacity: 100,
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { event } = await api.post("/organiser/events", {
        slug: form.slug,
        titleFr: form.titleFr,
        titleAr: form.titleAr,
        category: form.category,
        city: form.city,
        venueFr: form.venueFr,
        venueAr: form.venueAr,
        address: form.address,
        start: form.start,
        end: form.end,
        doors: form.doors,
        image: form.image,
        blurbFr: form.blurbFr,
        blurbAr: form.blurbAr,
        aboutFr: form.aboutFr,
        aboutAr: form.aboutAr,
        ageFr: form.ageFr,
        ageAr: form.ageAr,
        tiers: [
          {
            nameFr: form.tierNameFr,
            nameAr: form.tierNameAr,
            blurbFr: "",
            blurbAr: "",
            priceCents: Number(form.priceCents),
            capacity: Number(form.capacity),
            zoneFr: "Salle",
            zoneAr: "القاعة",
            gateFr: "Entrée principale",
            gateAr: "المدخل الرئيسي",
          },
        ],
      });
      navigate(`/evenements/${event.slug}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-3xl">Créer un événement</h1>
        {error ? <p className="mt-3 rounded-lg bg-corail/10 px-4 py-3 text-sm text-corail">{error}</p> : null}
        <form onSubmit={submit} className="mt-6 grid gap-4">
          <Field label="Identifiant (slug)" value={form.slug} onChange={set("slug")} />
          <Field label="Titre (FR)" value={form.titleFr} onChange={set("titleFr")} />
          <Field label="Titre (AR)" value={form.titleAr} onChange={set("titleAr")} dir="rtl" />
          <Field label="Ville" value={form.city} onChange={set("city")} />
          <Field label="Lieu (FR)" value={form.venueFr} onChange={set("venueFr")} />
          <Field label="Lieu (AR)" value={form.venueAr} onChange={set("venueAr")} dir="rtl" />
          <Field label="Adresse" value={form.address} onChange={set("address")} />
          <Field label="Date de début" type="datetime-local" value={form.start} onChange={set("start")} />
          <Field label="Date de fin" type="datetime-local" value={form.end} onChange={set("end")} />
          <Field label="Ouverture des portes" type="datetime-local" value={form.doors} onChange={set("doors")} />
          <Field label="Résumé (FR)" value={form.blurbFr} onChange={set("blurbFr")} />
          <Field label="Résumé (AR)" value={form.blurbAr} onChange={set("blurbAr")} dir="rtl" />
          <Field label="Description (FR)" value={form.aboutFr} onChange={set("aboutFr")} />
          <Field label="Description (AR)" value={form.aboutAr} onChange={set("aboutAr")} dir="rtl" />
          <Field label="Nom du billet" value={form.tierNameFr} onChange={set("tierNameFr")} />
          <Field label="Prix (centimes MAD)" type="number" value={form.priceCents} onChange={set("priceCents")} />
          <Field label="Capacité" type="number" value={form.capacity} onChange={set("capacity")} />
          <button type="submit" disabled={busy} className="h-12 rounded-full bg-safran font-semibold text-encre disabled:opacity-50">
            {busy ? "..." : "Publier l'événement"}
          </button>
        </form>
      </div>
    </Shell>
  );
}

function Field({ label, value, onChange, type = "text", dir }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      {label}
      <input
        type={type}
        value={value}
        onChange={onChange}
        dir={dir}
        className="h-12 rounded-lg border border-line/15 px-4 font-normal"
      />
    </label>
  );
}

export default function Organiser() {
  return (
    <Protected roles={["ORGANISER", "ADMIN"]}>
      <OrganiserInner />
    </Protected>
  );
}
