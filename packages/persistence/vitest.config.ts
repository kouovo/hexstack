import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Each integration suite boots its own PGlite (WASM) instance and applies the real migrations.
    hookTimeout: 30_000,
    testTimeout: 15_000,
  },
});
