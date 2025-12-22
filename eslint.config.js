import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import eslintPluginUnicorn from 'eslint-plugin-unicorn';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      eslintPluginUnicorn.configs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      "unicorn/filename-case": [
        "error",
        {
          "cases": {
            "camelCase": true,
            "pascalCase": true,
          }
        }
      ],
      "unicorn/prevent-abbreviations": [
        "warn",
        {
          "replacements": {
            "e": {
              "event": false,
              "error": false
            },
            "props": {
              "properties": false
            },
            "db": {
              "database": false
            },
            "utils": {
              "utilities": false
            }
          }
        }
      ]
    },
  }
])
