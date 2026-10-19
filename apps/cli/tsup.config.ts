import { defineConfig } from "tsup";

/**
 * Single-file CLI bundle: apps/cli + all workspace sources + almost all npm dependencies.
 * Only packages that break when bundled stay external (pino's worker transport).
 * Production runs with NODE_ENV=production so pino-pretty is unused.
 */
export default defineConfig({
  entry: { cli: "src/index.ts" },
  format: ["esm"],
  platform: "node",
  target: "node24",
  outDir: "dist",
  sourcemap: true,
  clean: true,
  splitting: false,
  dts: false,
  noExternal: [/^(?!(?:pino-pretty|thread-stream)(?:$|\/)).*/],
  external: ["pino-pretty", "thread-stream"],
  banner: {
    js: [
      `import { createRequire as __appCreateRequire } from "node:module";`,
      `import { fileURLToPath as __appFileURLToPath } from "node:url";`,
      `import { dirname as __appDirname } from "node:path";`,
      `const require = __appCreateRequire(import.meta.url);`,
      `const __filename = __appFileURLToPath(import.meta.url);`,
      `const __dirname = __appDirname(__filename);`,
    ].join("\n"),
  },
});
