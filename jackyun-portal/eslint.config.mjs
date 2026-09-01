import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "**/* 2.*",
      "public/**/*.bak",
      "companion-extension/hosted-sources/**",
    ],
  },
  {
    files: ["src/lib/ai-tools.ts"],
    rules: {
      // Tool payloads cross a JSON boundary and intentionally support provider-
      // specific shapes. Runtime validation is authoritative in this adapter.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

export default eslintConfig;
