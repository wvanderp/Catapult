import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import jsdoc from "eslint-plugin-jsdoc";

export default defineConfig([
  globalIgnores(["dist", "coverage"]),
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
      "unicorn/name-replacements": [
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
      "unicorn/no-incorrect-template-string-interpolation": "off",
      "unicorn/no-break-in-nested-loop": "off",
      "unicorn/no-computed-property-existence-check": "off",
      "unicorn/no-declarations-before-early-exit": "off",
      "unicorn/no-top-level-assignment-in-function": "off",
      "unicorn/no-unsafe-string-replacement": "off",
      "unicorn/prefer-await": "off",
      "unicorn/prefer-early-return": "off",
      "unicorn/prefer-logical-operator-over-ternary": "off",
      "unicorn/prefer-minimal-ternary": "off",
      "unicorn/prefer-simple-condition-first": "off",
      "unicorn/prefer-url-href": "off",
      "unicorn/consistent-boolean-name": "off",
      "unicorn/consistent-compound-words": "off",
      "preserve-caught-error": "off",
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
