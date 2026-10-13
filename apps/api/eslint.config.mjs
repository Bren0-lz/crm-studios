import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ["src/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  { ignores: ["dist/**"] },
);
