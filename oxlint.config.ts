import { defineConfig } from "oxlint";

export default defineConfig({
  env: {
    browser: true,
    builtin: true,
    es2024: true,
    node: true,
  },
  plugins: ["typescript", "unicorn", "react", "nextjs"],
  settings: {
    next: {
      rootDir: ["apps/web"],
    },
    react: {
      version: "19.2.0",
    },
  },
  categories: {
    correctness: "error",
    suspicious: "warn",
  },
  ignorePatterns: ["node_modules", ".turbo", ".next", "dist", "build", "apps/api/drizzle", "apps/web/next-env.d.ts"],
  rules: {
    "react/react-in-jsx-scope": "off",
    "react/rules-of-hooks": "error",
    "unicorn/no-empty-file": "off",
    "eslint/no-underscore-dangle": "off",
    "eslint/no-shadow": "off",
    "eslint/no-useless-constructor": "off",
    "eslint/no-unused-vars": "off",
    "typescript/no-extraneous-class": "off",
  },
});
