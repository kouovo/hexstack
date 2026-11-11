import { defineConfig } from "tsup";

/** Bundles everything except packages that break when bundled (pino's worker transport). */
export default defineConfig({
  entry: ["src/index.ts"],
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
