import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execSync } from "node:child_process";
import packageJson from "./package.json";

/**
 * Get the current git commit hash (short form)
 *
 * @returns The short commit hash or empty string if not in a git repository
 */
function getGitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "";
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: "/Catapult/",
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    tailwindcss(),
  ],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(packageJson.version),
    "import.meta.env.VITE_APP_COMMIT": JSON.stringify(getGitCommit()),
  },
});
