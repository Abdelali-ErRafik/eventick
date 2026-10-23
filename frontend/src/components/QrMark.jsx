"use client";

import { useEffect, useState } from "react";

export function QrMark({ value, className = "size-36" }) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    let alive = true;
    import("qrcode").then((mod) =>
      mod.default
        .toString(value, {
          type: "svg",
          margin: 1,
          errorCorrectionLevel: "M",
          color: { dark: "#14172F", light: "#FFFFFF" },
        })
        .then((markup) => {
          if (alive) setSvg(markup);
        }),
    );
    return () => {
      alive = false;
    };
  }, [value]);

  if (!svg) {
    return <div className={`${className} animate-pulse rounded-lg bg-brume`} />;
  }

  return <div className={`${className} [&>svg]:h-full [&>svg]:w-full`} dangerouslySetInnerHTML={{ __html: svg }} />;
}
