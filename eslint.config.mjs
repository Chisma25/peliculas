import { FlatCompat } from "@eslint/eslintrc";
import { defineConfig, globalIgnores } from "eslint/config";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const compatibility = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url))
});

export default defineConfig([
  ...compatibility.extends("next/core-web-vitals", "next/typescript"),
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts"
  ])
]);
