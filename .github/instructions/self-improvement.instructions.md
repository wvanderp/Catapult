---
applyTo: "**"
---

# SELF-IMPROVEMENT: MANDATORY

This file is a LIVING DOCUMENT. It grows with every session.

## YOUR OBLIGATION

Whenever you discover a useful pattern, gotcha, or hard-learned lesson in this codebase:

1. **STOP** and document it
2. **ADD** a bullet point to "Collected Wisdom" below
3. **BE SPECIFIC**—vague advice helps no one

This is NOT optional. Future sessions depend on accumulated knowledge.

---

## Collected Wisdom
- The monorepo uses required kebab-case package directory names (for example `packages/package-format`), while the global Unicorn filename-case rule permits only camelCase/PascalCase. Node/browser package ESLint overrides should disable that filename rule for `packages/**/*.ts` rather than renaming the required workspace packages.
- During file drops, request every `getAsFileSystemHandle()` synchronously before the first `await`; pair the handle with the `getAsFile()` result so the drop still works when `DataTransfer.files` is empty or item order differs.
