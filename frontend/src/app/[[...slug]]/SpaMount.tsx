"use client";

import dynamic from "next/dynamic";

const ClientApp = dynamic(() => import("../ClientApp"), {
  ssr: false,
  loading: () => <div className="p-8 text-center text-muted">...</div>,
});

export default function SpaMount() {
  return <ClientApp />;
}
