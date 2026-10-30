import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { categoryLandings, categoryLanding, CATEGORY_LABEL_FR } from "../../../lib/landing";
import { LandingPage } from "../../_landing/LandingPage";

/**
 * "Festivals de musique au Maroc" — a real, indexable page per category.
 *
 * Same reasoning as the city pages: `?cat=festivals` is a client-side
 * filter, indistinguishable to a crawler from any other filter on the same
 * URL. A category gets its own page only while it has at least MIN_EVENTS
 * sellable events, so none of these is a near-empty shell.
 */

export const revalidate = 300;

export async function generateStaticParams() {
  const landings = await categoryLandings();
  return landings.map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const landing = await categoryLanding(slug);
  if (!landing) return {};

  const label = CATEGORY_LABEL_FR[landing.value] ?? landing.value;
  const n = landing.events.length;
  return {
    title: `${label} au Maroc — billets en vente`,
    description:
      `${n} date${n > 1 ? "s" : ""} en vente dans la catégorie ${label.toLowerCase()} au Maroc. ` +
      `Réservez en ligne, e-billet immédiat avec QR code.`,
    alternates: { canonical: `/billets-categorie/${landing.slug}` },
    openGraph: {
      type: "website",
      title: `${label} au Maroc — billets en vente`,
      url: `/billets-categorie/${landing.slug}`,
    },
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const landing = await categoryLanding(slug);
  if (!landing) notFound();

  const label = CATEGORY_LABEL_FR[landing.value] ?? landing.value;
  return (
    <LandingPage
      heading={`${label} au Maroc`}
      intro={
        `Toutes les dates de la catégorie ${label.toLowerCase()} actuellement en vente au Maroc. ` +
        `Paiement sécurisé en dirhams, e-billet immédiat avec QR code vérifié à l'entrée.`
      }
      events={landing.events}
      exploreHref={`/explorer?cat=${encodeURIComponent(landing.value)}`}
    />
  );
}
