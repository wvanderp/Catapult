import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import jsdoc from "eslint-plugin-jsdoc";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      eslintPluginUnicorn.configs.recommended,
      jsdoc.configs["flat/recommended-typescript"],
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      "unicorn/filename-case": [
        "error",
        {
          cases: {
            camelCase: true,
            pascalCase: true,
          },
        },
      ],
      "unicorn/prevent-abbreviations": [
        "warn",
        {
          replacements: {
            e: {
              event: false,
              error: false,
            },
            props: {
              properties: false,
            },
            db: {
              database: false,
            },
            utils: {
              utilities: false,
            },
          },
        },
      ],
      "unicorn/numeric-separators-style": [
        "error",
        {
          onlyIfContainsSeparator: true,
        },
      ],
      "unicorn/no-null": "off",
      "jsdoc/tag-lines": [
        "error",
        "any",
        {
          startLines: 1,
        }
      ]
    },
  },
]);
