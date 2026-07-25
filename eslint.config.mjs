import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/lib/**/*.solid.tsx"],
    rules: {
      "@typescript-eslint/no-namespace": "off",
      "react-hooks/refs": "off",
    },
  },
  {
    files: ["src/lib/**/*.preact.tsx"],
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/exhaustive-deps": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["src/lib/**/*.lit.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  globalIgnores([
    "prompts/**",
    "skills/**",
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".open-next/**",
    ".wrangler/**",
  ]),
]);

export default eslintConfig;
