import type { Metadata } from "next";
import { LocaleEventPage, localeEventMetadata } from "../../../../lib/locale-pages";

/** An event page in fr — title and description from that locale's columns. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return localeEventMetadata("fr", slug);
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <LocaleEventPage slug={slug} />;
}
