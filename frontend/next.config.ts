import type { NextConfig } from "next";
import { dirname } from "path";
import { fileURLToPath } from "url";

const nextConfig: NextConfig = {
  pageExtensions: ["tsx", "ts"],
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  // The socket connects straight to the backend rather than through a rewrite:
  // Next's rewrites proxy HTTP, not WebSocket upgrades.
  env: { NEXT_PUBLIC_REALTIME_URL: process.env.BACKEND_URL ?? "http://localhost:4100" },
  async rewrites() {
    const backend = process.env.BACKEND_URL ?? "http://localhost:4100";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
