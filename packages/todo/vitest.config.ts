import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration suites boot their own PGlite (WASM) instance and apply the real migrations.
    hookTimeout: 30_000,
    testTimeout: 15_000,
  },
});
