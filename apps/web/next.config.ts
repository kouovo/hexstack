import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep the workspace layout in .next/standalone (apps/web/server.js).
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  // Workspace packages ship TypeScript source; Next must compile them.
  // The browser only needs @app/rpc's client + router *types*; server-side code is never bundled.
  transpilePackages: ["@app/env", "@app/rpc"],
};

export default nextConfig;
