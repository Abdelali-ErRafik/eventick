import SpaMount from "./SpaMount";
import { siteJsonLd } from "../../lib/jsonld";

export default function CatchAll() {
  return (
    <>
      {/* WebSite + Organization only: factual, and claims nothing about any
          individual event. Event markup lives on the event route, gated on
          whether that event is really bookable. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd()) }} />
      <SpaMount />
    </>
  );
}
