import js from "@eslint/js";
import tseslint from "typescript-eslint";
import security from "eslint-plugin-security";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  security.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      "security/detect-object-injection": "warn",
      "security/detect-non-literal-regexp": "error",
      "security/detect-possible-timing-attacks": "warn",
      "security/detect-eval-with-expression": "error",
    },
  },
  {
    // Service worker runs in ServiceWorkerGlobalScope — globals like self, caches, fetch are valid
    files: ["client/public/sw.js"],
    languageOptions: {
      globals: {
        self: "readonly", caches: "readonly", fetch: "readonly",
        Response: "readonly", URL: "readonly", Request: "readonly",
        clients: "readonly", registration: "readonly",
      },
    },
    rules: { "no-undef": "off" },
  },
  {
    // Build scripts use CJS require() legitimately
    files: ["script/**", "scripts/**"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // Test files and storage base use dynamic require() to avoid circular deps
    files: ["tests/**", "server/storage/base.ts"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    ignores: ["node_modules/**", "dist/**", "client/src/components/ui/**", "*.cjs"],
  }
);
