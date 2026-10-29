import type { MetadataRoute } from "next";
import { PRIVATE_PATHS, siteUrl } from "../lib/catalog-server";

/**
 * robots.txt — which, until this file existed, was not served at all.
 *
 * `/robots.txt` returned HTTP 200 with `content-type: text/html` and the
 * SPA's React shell as its body: the optional catch-all at
 * app/[[...slug]]/page.tsx answers every path, including that one. A crawler
 * asking for the exclusion rules was handed a web page, so in practice there
 * were no rules, and the entire app surface was crawlable.
 *
 * The urgent part of that is not ranking. `/billet-offert/:token` is how a
 * gift ticket is claimed, and the token is the credential — it sits in the
 * URL path. Those URLs being open to crawlers is a privacy problem, which is
 * why this is the first thing fixed rather than the last.
 *
 * A Disallow does not de-index anything already indexed, and it stops the
 * crawl that would be needed to SEE a noindex. If Search Console ever shows
 * one of these paths indexed, it needs a removal request or a noindex, not
 * just this file.
 */
export default function robots(): MetadataRoute.Robots {
  const site = siteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
