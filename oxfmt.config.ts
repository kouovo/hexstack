import { defineConfig } from "oxfmt";

export default defineConfig({
  useTabs: false,
  tabWidth: 2,
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 140,
  sortImports: true,
  sortPackageJson: true,
  ignorePatterns: ["apps/api/drizzle/**", "apps/web/next-env.d.ts"],
  overrides: [
    {
      files: ["*.md", "*.json", "*.jsonc", "*.yml", "*.yaml"],
      options: {
        useTabs: false,
      },
    },
  ],
});
