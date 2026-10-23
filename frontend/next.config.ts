import type { NextConfig } from "next";
import { dirname } from "path";
import { fileURLToPath } from "url";

const nextConfig: NextConfig = {
  pageExtensions: ["tsx", "ts"],
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    const backend = process.env.BACKEND_URL ?? "http://localhost:4100";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
