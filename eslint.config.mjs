import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Electron main/preload are CommonJS
  { files: ["electron/**", "scripts/**"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "dist/**",
    // PyInstaller build of the flow2api sidecar (vendored Python packages + their JS); never committed
    "dist-sidecar/**",
    // Separate Next.js app (admin + public site) with its own lint config.
    "web/**",
    // local runtime data (DB, browser profiles with Chrome's own JS); never committed
    "data/**",
  ]),
]);

export default eslintConfig;
