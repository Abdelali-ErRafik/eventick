import type { Metadata } from "next";
import { LocalePage, localeMetadata } from "../../../lib/locale-pages";

/** Every SPA page under /ar/. See lib/locale-pages.tsx for why this is a
 *  concrete directory rather than a [locale] segment. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return localeMetadata("ar", slug);
}

export default function Page() {
  return <LocalePage />;
}
