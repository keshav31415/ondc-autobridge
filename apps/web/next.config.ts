import type { NextConfig } from "next";
import { resolve } from "node:path";
const config: NextConfig = {
  turbopack: { root: resolve(import.meta.dirname, "../..") },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_ORIGIN ?? "http://127.0.0.1:4100"}/api/:path*`,
      },
    ];
  },
};
export default config;
