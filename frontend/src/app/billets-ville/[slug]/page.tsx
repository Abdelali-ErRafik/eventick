import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cityLandings, cityLanding } from "../../../lib/landing";
import { LandingPage } from "../../_landing/LandingPage";

/**
 * "Billets à Casablanca" — a real, indexable page per city.
 *
 * Replaces relying on `?ville=Casablanca`, which is a client-side filter a
 * crawler sees as the same page as every other filter. This one has its own
 * URL, its own title and description, and a server-rendered list of the
 * actual events — so there is something to index rather than an empty shell.
 *
 * A city only gets a page while it has at least MIN_EVENTS sellable events
 * (see lib/landing.ts). Cities below that 404 rather than existing as thin
 * pages, and start working by themselves once the catalogue grows.
 */

export const revalidate = 300;

/** Pre-render the cities that qualify today; the rest resolve on request. */
export async function generateStaticParams() {
  const landings = await cityLandings();
  return landings.map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const landing = await cityLanding(slug);
  if (!landing) return {};

  const n = landing.events.length;
  return {
    title: `Billets de concerts et événements à ${landing.value}`,
    description:
      `${n} événement${n > 1 ? "s" : ""} à ${landing.value} : concerts, festivals et spectacles. ` +
      `Réservez votre billet en ligne, e-billet immédiat avec QR code.`,
    alternates: { canonical: `/billets-ville/${landing.slug}` },
    openGraph: {
      type: "website",
      title: `Billets de concerts et événements à ${landing.value}`,
      url: `/billets-ville/${landing.slug}`,
    },
  };
}

export default async function CityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const landing = await cityLanding(slug);
  // Below the threshold, or no such city: a 404 is honest, and keeps a thin
  // page out of the index.
  if (!landing) notFound();

  return (
    <LandingPage
      heading={`Billets d'événements à ${landing.value}`}
      intro={
        `Tous les concerts, festivals et spectacles à ${landing.value} actuellement en vente sur Eventick. ` +
        `Paiement sécurisé en dirhams, e-billet immédiat avec QR code vérifié à l'entrée.`
      }
      events={landing.events}
      // The SPA already filters by city; the link hands the visitor straight
      // to that view rather than duplicating the filtering UI here.
      exploreHref={`/explorer?ville=${encodeURIComponent(landing.value)}`}
    />
  );
}
